// Read-only structural review of an owned catalog snapshot. It is not a SQL
// interpreter, row-set equivalence proof, permission grant or migration generator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const identifier=/^[a-z_][a-z0-9_]*$/;
const operations=['SELECT','INSERT','UPDATE','DELETE'];
const sha=value=>createHash('sha256').update(value.replaceAll('\r\n','\n')).digest('hex');
const sorted=values=>[...values].sort();
const all=(operator,operands)=>operands.length?{operator,operands}:{constant:operator==='AND'};

function validate({policies,roles,memberships,membershipSemantics,warnings}){
  for(const group of [policies,roles,memberships,warnings])assert.ok(Array.isArray(group),'Missing catalog array');
  assert.equal(membershipSemantics,'pg_has_role(USAGE)','Effective inherited roles must be observed, not guessed');
  const roleNames=new Set(),policyIds=new Set(),membershipIds=new Set();
  for(const role of roles){
    assert.ok(identifier.test(role.name)&&!roleNames.has(role.name),'Invalid or duplicate role');
    for(const flag of ['inherit','bypassRls','superuser'])assert.equal(typeof role[flag],'boolean');
    roleNames.add(role.name);
  }
  for(const row of memberships){
    assert.ok(roleNames.has(row.member)&&roleNames.has(row.role)&&row.member!==row.role,'Unknown membership endpoint');
    const id=row.member+':'+row.role;assert.ok(!membershipIds.has(id),'Duplicate effective membership');membershipIds.add(id);
  }
  for(const policy of policies){
    assert.ok(identifier.test(policy.schema)&&identifier.test(policy.table),'Invalid relation');
    assert.ok(typeof policy.name==='string'&&policy.name.length>0&&policy.name.length<=512,'Invalid policy name');
    assert.ok(['PERMISSIVE','RESTRICTIVE'].includes(policy.permissive),'Unknown policy combination type');
    assert.ok([...operations,'ALL'].includes(policy.operation),'Unknown policy operation');
    assert.ok(Array.isArray(policy.roles)&&policy.roles.length>0&&new Set(policy.roles).size===policy.roles.length);
    assert.ok(policy.roles.every(role=>role==='public'||roleNames.has(role)),'Unknown policy role');
    for(const field of ['using','check'])assert.ok(policy[field]===null||typeof policy[field]==='string','Missing predicate field');
    const id=policy.schema+'.'+policy.table+':'+policy.name;
    assert.ok(!policyIds.has(id),'Duplicate policy identity');policyIds.add(id);
  }
}

function predicate(policy,field){
  // WITH CHECK omitted inherits USING, including restrictive UPDATE/ALL policy.
  const fallback=field==='check'&&policy.check===null;
  const expression=fallback?policy.using:policy[field];
  return {policy:policy.name,sourceField:fallback?'using':field,
    omittedCheckUsesUsing:fallback,implicitTrue:expression===null,
    predicateSha256:expression===null?null:sha(expression)};
}
function formula(policies,field){
  const permissive=policies.filter(p=>p.permissive==='PERMISSIVE');
  const restrictive=policies.filter(p=>p.permissive==='RESTRICTIVE');
  // A restrictive policy never creates an allowed set by itself.
  return all('AND',[all('OR',permissive.map(p=>predicate(p,field))),
    all('AND',restrictive.map(p=>predicate(p,field)))]);
}

export function buildPolicySemanticsReview(input){
  validate(input);
  const {policies,roles,memberships,warnings}=input;
  const roleMap=new Map(roles.map(role=>[role.name,role])),seen=new Set(),groups=[];
  for(const warning of warnings){
    assert.equal(warning.name,'multiple_permissive_policies','Wrong advisor category');
    const {schema,name:table}=warning.metadata??{};
    assert.ok(identifier.test(schema??'')&&identifier.test(table??''),'Missing warning relation');
    const prefix='multiple_permissive_policies_'+schema+'_'+table+'_';
    assert.ok(typeof warning.cacheKey==='string'&&warning.cacheKey.startsWith(prefix),'Warning identity mismatch');
    const suffix=warning.cacheKey.slice(prefix.length),boundary=suffix.lastIndexOf('_');
    const role=suffix.slice(0,boundary),operation=suffix.slice(boundary+1);
    assert.ok(boundary>0&&roleMap.has(role)&&operations.includes(operation),'Unknown warning role/action');
    assert.ok(!seen.has(warning.cacheKey),'Duplicate advisor warning');seen.add(warning.cacheKey);
    // These are already transitive USAGE observations from pg_has_role. Do not
    // apply a naive inheritance closure: per-membership INHERIT can differ.
    const effective=new Set([role,...memberships.filter(m=>m.member===role).map(m=>m.role)]);
    const applicable=policies.filter(p=>p.schema===schema&&p.table===table
      &&(p.operation===operation||p.operation==='ALL')
      &&p.roles.some(r=>r==='public'||effective.has(r))).sort((a,b)=>a.name.localeCompare(b.name,'en'));
    const permissive=applicable.filter(p=>p.permissive==='PERMISSIVE');
    const restrictive=applicable.filter(p=>p.permissive==='RESTRICTIVE');
    assert.ok(permissive.length>=2,'Advisor warning not reproduced by current catalog: '+warning.cacheKey);
    groups.push({id:warning.cacheKey,schema,table,role,operation,
      bypassesRls:roleMap.get(role).superuser||roleMap.get(role).bypassRls,
      inheritedUsageRoles:sorted([...effective].filter(r=>r!==role)),
      permissivePolicies:permissive.map(p=>p.name),restrictivePolicies:restrictive.map(p=>p.name),
      allOperationPolicies:applicable.filter(p=>p.operation==='ALL').map(p=>p.name),
      publicRolePolicies:applicable.filter(p=>p.roles.includes('public')).map(p=>p.name),
      rowVisibility:operation==='INSERT'?null:formula(applicable,'using'),
      newRowCheck:['INSERT','UPDATE'].includes(operation)?formula(applicable,'check'):null,
      hotelAndTenantScopeReviewCandidate:operation==='SELECT'
        &&applicable.some(p=>(p.using??'').includes('user_has_hotel_access'))
        &&applicable.some(p=>(p.using??'').includes('tenant_id')&&!(p.using??'').includes('user_has_hotel_access')),
      disposition:'requires_allowed_row_and_runtime_review'});
  }
  groups.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  return {contract:'roomqc.policy-semantics-review.v1',
    counts:{policies:policies.length,roles:roles.length,effectiveMemberships:memberships.length,
      advisorWarnings:warnings.length,matchedWarnings:groups.length,
      tables:new Set(groups.map(g=>g.schema+'.'+g.table)).size,
      warningRoles:new Set(groups.map(g=>g.role)).size,
      hotelAndTenantScopeCandidates:groups.filter(g=>g.hotelAndTenantScopeReviewCandidate).length},
    groups,limitations:{readOnlySnapshotAnalysis:true,sqlPredicateEvaluation:false,
      tableAndColumnGrantsVerified:false,rlsOwnerAndForceModeVerified:false,
      additionalSelectPoliciesAndReturningRequirementsVerified:false,
      effectiveDefinerOrTriggerRoleVerified:false,liveActorGuardsVerified:false,
      runtimeAllowedRowsVerified:false,semanticEquivalenceProven:false,
      automaticMigrationAllowed:false,allSafe:false}};
}
