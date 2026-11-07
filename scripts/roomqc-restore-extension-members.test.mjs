import test from 'node:test';
import assert from 'node:assert/strict';
import { planExtensionMemberRestore } from './roomqc-restore-extension-members.mjs';
const member = {kind:'extension_function',name:'graphql_public.graphql',
  signature:'graphql_public.graphql(text,text,jsonb,jsonb)',extension:'pg_graphql',
  extension_version:'1.5.11',owner:'supabase_admin',
  definition:'CREATE OR REPLACE FUNCTION graphql_public.graphql(query text) RETURNS jsonb LANGUAGE sql AS $$ SELECT null::jsonb $$'};
const schemas=['graphql','graphql_public'].map(name=>({kind:'schema',name,owner:'supabase_admin',privileges:[
  {grantee:'supabase_admin',grantor:'supabase_admin',privilege:'CREATE',grantable:false},
  {grantee:'supabase_admin',grantor:'supabase_admin',privilege:'USAGE',grantable:false},
  {grantee:'postgres',grantor:'supabase_admin',privilege:'USAGE',grantable:true},
  {grantee:'anon',grantor:'supabase_admin',privilege:'USAGE',grantable:false},
]}));
const expected=[member,...schemas];
const toc = `; archive
24; 2615 16613 SCHEMA - graphql_public supabase_admin
5; 3079 16689 EXTENSION - pg_graphql 
9747; 0 0 COMMENT - EXTENSION pg_graphql 
10901; 0 0 ACL graphql_public FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb) supabase_admin
5958; 3466 16619 EVENT TRIGGER - issue_pg_graphql_access supabase_admin
`;
test('all archive items including GraphQL ACLs are retained in their original order',()=>{
  const plan=planExtensionMemberRestore(toc,expected);
  assert.equal(plan.archiveItems,5);assert.equal(plan.members,1);
  assert.match(plan.prefix,/EXTENSION - pg_graphql/);assert.doesNotMatch(plan.prefix,/ACL graphql_public/);
  assert.match(plan.remaining,/ACL graphql_public FUNCTION graphql/);
  assert.match(plan.bootstrap,/ALTER EXTENSION pg_graphql ADD FUNCTION/);
  assert.match(plan.bootstrap,/IS DISTINCT FROM '1.5.11'/);
  assert.match(plan.bootstrap,/Unexpected pre-existing GraphQL wrapper/);
  assert.match(plan.bootstrap,/GRANT USAGE ON SCHEMA "graphql" TO "postgres" WITH GRANT OPTION/);
  assert.match(plan.bootstrap,/GRANT USAGE ON SCHEMA "graphql_public" TO "anon";/);
});
test('archives without omitted extension functions retain normal atomic pg_restore',()=>{
  assert.equal(planExtensionMemberRestore(toc,[]),null);
});
for(const [name,mutation]of [
  ['unknown extension',row=>({...row,extension:'unknown'})],
  ['unknown signature',row=>({...row,signature:'graphql_public.graphql(text)'})],
  ['unexpected owner',row=>({...row,owner:'postgres'})],
  ['invalid version',row=>({...row,extension_version:"1.5.11';SELECT 1;--"})],
  ['unsupported function',row=>({...row,name:'graphql_public.other'})]
])test(name+' is rejected before restoration',()=>assert.throws(()=>planExtensionMemberRestore(toc,[mutation(member),...schemas])));
test('missing or duplicated extension entry cannot generate a partial restore',()=>{
  assert.throws(()=>planExtensionMemberRestore(toc.replace(/^5;.*\n/m,''),expected));
  assert.throws(()=>planExtensionMemberRestore(toc+'6; 3079 16690 EXTENSION - pg_graphql \n',expected));
});
test('a separately dumped wrapper cannot be duplicated by bootstrap',()=>{
  assert.throws(()=>planExtensionMemberRestore(toc+'50; 1255 16691 FUNCTION graphql_public graphql(text) supabase_admin\n',expected));
});
test('missing permission metadata and unsupported grantors cannot weaken schema grants',()=>{
  assert.throws(()=>planExtensionMemberRestore(toc,[member]));
  const changed=structuredClone(expected);changed[1].privileges[0].grantor='postgres';
  assert.throws(()=>planExtensionMemberRestore(toc,changed));
});
