import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAccessCatalog,accessCatalogSql} from '../../scripts/control-backend-access-audit.mjs';
const fixture=()=>({checkedAt:'2026-10-19T00:00:00Z',noPolicyTables:[{schema:'private',name:'server_only',rls:true,
  privileges:[{role:'authenticated',schemaUsage:true,table:false,column:false}]}],functions:[{schema:'public',name:'guarded_read',
  identity:'guarded_read(uuid)',definer:true,config:['search_path=""'],source:'SECRET_BODY select * from private.server_only',
  execute:[{role:'authenticated',allowed:true,schemaUsage:true},{role:'anon',allowed:false,schemaUsage:true}]}],views:[],policies:[],foreignKeys:[]});
test('access catalog discovers review candidates but never infers safe from no direct grants or absent dependency',()=>{
  const input=fixture(),summary=summarizeAccessCatalog(input);
  assert.equal(summary.directPrivileges.length,0);assert.equal(summary.transitiveReachabilityProven,false);assert.equal(summary.allSafe,false);
  assert.deepEqual(summary.tableCandidates[0].directFunctionCandidates[0].browserRoles,['authenticated']);
  assert.ok(!JSON.stringify(summary).includes('SECRET_BODY'));
  input.functions=[];assert.equal(summarizeAccessCatalog(input).allSafe,false);
});
test('access catalog checks column grants independently of schema usage and keeps risky views visible',()=>{
  const input=fixture();input.noPolicyTables[0].privileges=[{role:'anon',schemaUsage:false,table:false,column:true}];
  input.views=[{schema:'public',name:'server_view',dependencies:[{schema:'private',name:'server_only'}],options:[],
    privileges:[{role:'authenticated',column:true,table:false}]}];
  const summary=summarizeAccessCatalog(input);assert.deepEqual(summary.directPrivileges,[{table:'private.server_only',role:'anon'}]);
  assert.deepEqual(summary.tableCandidates[0].directViewCandidates,[{name:'public.server_view',browserRoles:['authenticated'],options:[]}]);
});
test('incomplete catalog or malformed records cannot become a zero-findings report',()=>{
  for(const input of [null,{}, {...fixture(),functions:null},{...fixture(),noPolicyTables:[{schema:'private',name:'server_only',rls:false}]}]){
    assert.throws(()=>summarizeAccessCatalog(input));
  }
});
const foreignKey=()=>({schema:'public',table:'payments',name:'payments_quote_fk',referencedSchema:'private',
  referencedTable:'server_only',sourceIsTarget:false,referencedIsTarget:true,deleteAction:'n',updateAction:'a',
  sourcePrivileges:[{role:'authenticated',schemaUsage:true,insert:true,update:true,delete:true}],
  referencedPrivileges:[{role:'authenticated',schemaUsage:true,update:false,delete:false}]});
test('expanded inventory includes foreign keys on either side and triggers owned by other schemas',()=>{
  assert.match(accessCatalogSql,/TRIGGER,MAINTAIN/);
  assert.match(accessCatalogSql,/k\.conrelid IN \(SELECT oid FROM audit_targets\) OR k\.confrelid IN \(SELECT oid FROM audit_targets\)/);
  assert.match(accessCatalogSql,/n\.nspname IN \('public','private'\) OR fn\.nspname IN \('public','private'\)/);
  const input=fixture();input.targetForeignKeys=[foreignKey()];input.authorityRoles=[{name:'service_role',superuser:false,bypassRls:true,inherit:true}];
  input.triggers=[{schema:'auth',table:'users',name:'auth_profile',enabled:'O',eventMask:5,functionSchema:'public',
    functionIdentity:input.functions[0].identity,privileges:[]}];
  const summary=summarizeAccessCatalog(input);assert.equal(summary.contractVersion,3);
  assert.equal(summary.counts.targetForeignKeys,1);assert.equal(summary.counts.externalSchemaTriggers,1);
  assert.equal(summary.targetForeignKeys[0].deleteAction,'n');assert.equal(summary.authorityRoles[0].bypassRls,true);
  assert.equal(summary.targetForeignKeys[0].status,'requires_parent_row_policy_and_runtime_review');
  assert.equal(summary.inventoryLimitations.foreignKeyEffectsProven,false);assert.equal(summary.allSafe,false);
});
test('legacy inventories explicitly lack expanded FK and role proof rather than implying zero findings',()=>{
  const summary=summarizeAccessCatalog(fixture());assert.equal(summary.counts.targetForeignKeys,null);
  assert.equal(summary.targetForeignKeys,null);assert.equal(summary.inventoryLimitations.missingTargetForeignKeys,true);
  assert.equal(summary.inventoryLimitations.missingAuthorityRoles,true);
});
test('invalid FK action, duplicate constraints and malformed authority data fail closed',()=>{
  for(const targetForeignKeys of [[{...foreignKey(),deleteAction:'x'}],[foreignKey(),foreignKey()],
    [{...foreignKey(),sourceIsTarget:false,referencedIsTarget:false}],null]){
    assert.throws(()=>summarizeAccessCatalog({...fixture(),targetForeignKeys}));
  }
  assert.throws(()=>summarizeAccessCatalog({...fixture(),authorityRoles:[{name:'anon',superuser:'false'}]}));
});
