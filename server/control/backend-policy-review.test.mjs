import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPolicySemanticsReview} from '../../scripts/control-backend-policy-review.mjs';

const role=name=>({name,inherit:true,bypassRls:false,superuser:false});
const policy=(name,overrides={})=>({schema:'public',table:'records',name,permissive:'PERMISSIVE',
  roles:['authenticated'],operation:'SELECT',using:'tenant_id = current_tenant()',check:null,...overrides});
const warning=(role='authenticated',operation='SELECT')=>({name:'multiple_permissive_policies',
  metadata:{schema:'public',name:'records'},cacheKey:'multiple_permissive_policies_public_records_'+role+'_'+operation});
const input=()=>({policies:[policy('tenant'),policy('owner',{operation:'ALL',using:'is_owner()',check:'is_owner()'})],
  roles:[role('authenticated'),role('anon'),role('member_group')],memberships:[],
  membershipSemantics:'pg_has_role(USAGE)',warnings:[warning()]});
const hash=value=>createHash('sha256').update(value).digest('hex');

test('policy review expands ALL/PUBLIC/effective inherited roles and rejects unknown membership provenance',()=>{
  const v=input();v.policies[0].roles=['public'];v.policies[1].roles=['member_group'];
  v.memberships=[{member:'authenticated',role:'member_group'}];
  const g=buildPolicySemanticsReview(v).groups[0];
  assert.deepEqual(g.permissivePolicies,['owner','tenant']);
  assert.deepEqual(g.allOperationPolicies,['owner']);assert.deepEqual(g.publicRolePolicies,['tenant']);
  assert.deepEqual(g.inheritedUsageRoles,['member_group']);
  assert.throws(()=>buildPolicySemanticsReview({...v,membershipSemantics:'MEMBER'}));
  assert.throws(()=>buildPolicySemanticsReview({...v,memberships:[{member:'authenticated',role:'missing'}]}));
});
test('policy review preserves permissive OR and restrictive AND without granting access from restrictive policy',()=>{
  const v=input();v.policies.push(policy('server-only',{permissive:'RESTRICTIVE',operation:'ALL',using:'key <> secret',check:'key <> secret'}));
  const g=buildPolicySemanticsReview(v).groups[0];
  assert.equal(g.rowVisibility.operator,'AND');assert.equal(g.rowVisibility.operands[0].operator,'OR');
  assert.equal(g.rowVisibility.operands[0].operands.length,2);assert.equal(g.rowVisibility.operands[1].operator,'AND');
  assert.deepEqual(g.restrictivePolicies,['server-only']);assert.equal(g.newRowCheck,null);
  v.policies[0].permissive='RESTRICTIVE';
  assert.throws(()=>buildPolicySemanticsReview(v),/not reproduced/);
});
test('policy review models UPDATE omitted WITH CHECK using USING, and INSERT has no old-row predicate',()=>{
  const v=input();v.warnings=[warning('authenticated','UPDATE')];
  v.policies[0].operation='UPDATE';
  const g=buildPolicySemanticsReview(v).groups[0],check=g.newRowCheck.operands[0].operands.find(p=>p.policy==='tenant');
  assert.equal(check.sourceField,'using');assert.equal(check.omittedCheckUsesUsing,true);
  assert.equal(check.predicateSha256,hash(v.policies[0].using));assert.ok(g.rowVisibility);
  v.warnings=[warning('authenticated','INSERT')];v.policies[0].operation='INSERT';
  Object.assign(v.policies[0],{using:null,check:null});
  const inserted=buildPolicySemanticsReview(v).groups[0];
  assert.equal(inserted.rowVisibility,null);
  assert.equal(inserted.newRowCheck.operands[0].operands.find(p=>p.policy==='tenant').implicitTrue,true);
});
test('policy review fails closed on string coercion, duplicate identities, stale warning or unknown action',()=>{
  for(const value of [true,false,'permissive',null]){
    const v=input();v.policies[0].permissive=value;assert.throws(()=>buildPolicySemanticsReview(v));
  }
  const duplicate=input();duplicate.policies.push({...duplicate.policies[0]});assert.throws(()=>buildPolicySemanticsReview(duplicate));
  const repeated=input();repeated.warnings.push({...repeated.warnings[0]});assert.throws(()=>buildPolicySemanticsReview(repeated));
  const stale=input();stale.policies.pop();assert.throws(()=>buildPolicySemanticsReview(stale),/not reproduced/);
  const bad=input();bad.warnings=[warning('missing','TRUNCATE')];assert.throws(()=>buildPolicySemanticsReview(bad));
});
test('policy review hashes predicates, marks bypass roles, and never equates inventory with authorization',()=>{
  const v=input();v.roles[0].bypassRls=true;v.policies[0].using='never-export-sensitive-literal';
  const result=buildPolicySemanticsReview(v),text=JSON.stringify(result);
  assert.equal(result.groups[0].bypassesRls,true);assert.ok(!text.includes('never-export-sensitive-literal'));
  assert.equal(result.counts.matchedWarnings,1);assert.equal(result.limitations.allSafe,false);
  for(const k of ['tableAndColumnGrantsVerified','runtimeAllowedRowsVerified','semanticEquivalenceProven','automaticMigrationAllowed'])
    assert.equal(result.limitations[k],false);
});
test('policy review flags mixed hotel and tenant scope for investigation, not automatic removal',()=>{
  const v=input();v.policies[1].using='user_has_hotel_access(auth.uid(),hotel_id)';
  const result=buildPolicySemanticsReview(v);
  assert.equal(result.counts.hotelAndTenantScopeCandidates,1);
  assert.equal(result.groups[0].disposition,'requires_allowed_row_and_runtime_review');
  assert.equal(result.limitations.semanticEquivalenceProven,false);
});
