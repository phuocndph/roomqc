import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccessCandidateGraph} from '../../scripts/control-backend-access-graph.mjs';

const fn=(schema,name,source,options={})=>({schema,name,identity:(schema==='private'?'private.':'')+name+'()',source,
  definer:true,returnType:'jsonb',config:['search_path=""'],dependencies:[],execute:[],...options});
const caller={role:'authenticated',allowed:true,schemaUsage:true};
const table=(schema='private',name='server_only')=>({schema,name});
const fixture=()=>({noPolicyTables:[table()],functions:[
  fn('public','entry','SELECT private.helper()', {execute:[caller]}),
  fn('private','helper','SELECT * FROM private.server_only')],views:[],policies:[],triggers:[]});
const entries=result=>result.tableCandidates[0].entries;

test('candidate graph follows a wrapper into a private helper without treating helper grants as the boundary',()=>{
  const graph=buildAccessCandidateGraph(fixture()),entry=entries(graph).find(e=>e.entry.name==='public.entry');
  assert.deepEqual(entry.entry.browserRoles,['authenticated']);
  assert.deepEqual(entry.path,['function:public:entry()','function:private:private.helper()','relation:private.server_only']);
  assert.equal(entry.status,'requires_semantic_and_runtime_review');
  assert.equal(graph.limitations.transitiveReachabilityProven,false);
});

test('candidate graph distinguishes qualified schemas while retaining ambiguity for unqualified names',()=>{
  const input=fixture();input.noPolicyTables.push(table('public'));
  let graph=buildAccessCandidateGraph(input);
  assert.equal(graph.tableCandidates[1].entries.length,0);
  input.functions[1].source='SELECT * FROM "server_only"';graph=buildAccessCandidateGraph(input);
  assert.ok(graph.tableCandidates.every(t=>t.entries.length>0));
});

test('catalog dependencies are retained for parsed SQL bodies whose prosrc does not contain a call',()=>{
  const input=fixture();input.functions[0].source='';input.functions[0].dependencies=[
    {kind:'function',schema:'private',name:'helper',identity:'private.helper()'}];
  const entry=entries(buildAccessCandidateGraph(input))[0];
  assert.deepEqual(entry.evidence[0],['catalog_dependency']);
});

test('view to function to table paths preserve view grant/owner-mode review requirements',()=>{
  const input=fixture();input.functions[0].execute=[];
  input.views=[{schema:'public',name:'read_view',kind:'v',options:[],dependencies:[],definition:'',
    functionDependencies:[{schema:'private',name:'helper',identity:'private.helper()'}],
    privileges:[{role:'authenticated',schemaUsage:true,table:true,column:true}]}];
  const entry=entries(buildAccessCandidateGraph(input)).find(e=>e.entry.kind==='view');
  assert.equal(entry.entry.schemaUsageVerified,true);assert.deepEqual(entry.entry.options,[]);
  assert.deepEqual(entry.path,['relation:public.read_view','function:private:private.helper()','relation:private.server_only']);
});

test('policy expression paths are candidates only: effective table grants and row semantics are not inferred',()=>{
  const input=fixture();input.functions[0].execute=[];
  input.policies=[{schema:'public',table:'records',name:'read records',roles:['public'],operation:'SELECT',
    using:'private.helper() IS NOT NULL',check:null}];
  const graph=buildAccessCandidateGraph(input),entry=entries(graph).find(e=>e.entry.kind==='policy');
  assert.deepEqual(entry.entry.browserRoles,['anon','authenticated']);
  assert.equal(entry.entry.entryRequiresBaseTableGrants,true);assert.equal(graph.limitations.policyBaseTableGrantsNotProven,true);
});

test('trigger paths do not rely on EXECUTE grants and distinguish event grants and enabled modes',()=>{
  const input=fixture();input.functions[0].execute=[];
  const trigger={schema:'public',table:'records',name:'on_insert',enabled:'O',eventMask:5,
    functionSchema:'private',functionIdentity:'private.helper()',privileges:[
      {role:'authenticated',schemaUsage:true,insert:true,update:false,delete:false,truncate:false}]};
  input.triggers=[trigger];
  let graph=buildAccessCandidateGraph(input),entry=entries(graph).find(e=>e.entry.kind==='trigger');
  assert.deepEqual(entry.entry.events,['insert']);assert.equal(entry.entry.entryRequiresRowPolicyReview,true);
  assert.deepEqual(entry.path,['trigger:public.records:on_insert','function:private:private.helper()','relation:private.server_only']);
  for(const enabled of ['D','R']){trigger.enabled=enabled;assert.equal(entries(buildAccessCandidateGraph(input)).length,0);}
  trigger.enabled='A';trigger.eventMask=17;assert.equal(entries(buildAccessCandidateGraph(input)).length,0);
  trigger.privileges[0].update=true;assert.equal(entries(buildAccessCandidateGraph(input)).length,1);
});

test('overload name matching remains conservative, cycles terminate and shortest candidate paths are stable',()=>{
  const input=fixture();input.functions[1].source+='; SELECT public.entry()';
  input.functions.push(fn('private','helper','SELECT * FROM private.server_only',{identity:'private.helper(uuid)'}));
  const first=buildAccessCandidateGraph(input),second=buildAccessCandidateGraph(input);
  assert.equal(entries(first).length,1);assert.deepEqual(first,second);
  assert.ok(first.counts.edges>=5);assert.equal(entries(first)[0].path.length,3);
});

test('EXECUTE on a trigger function is not mistaken for a directly callable browser RPC',()=>{
  const input=fixture();input.functions[0].returnType='trigger';
  assert.equal(entries(buildAccessCandidateGraph(input)).length,0);
  input.functions[0].returnType='event_trigger';
  assert.equal(entries(buildAccessCandidateGraph(input)).length,0);
  delete input.functions[0].returnType;
  assert.equal(buildAccessCandidateGraph(input).limitations.missingFunctionReturnTypes,true);
});

test('graph redacts bodies, configs and literals; unresolved dynamic SQL can never produce an all-safe result',()=>{
  const input=fixture();input.functions[1].source="EXECUTE 'PRIVATE_SECRET_BODY';";
  input.functions[1].config.push('example_secret=PRIVATE_CONFIG_VALUE');
  input.functions[0].dependencies.push({kind:'function',schema:'private',name:'not_captured',identity:'private.not_captured()'});
  const graph=buildAccessCandidateGraph(input),json=JSON.stringify(graph);
  assert.ok(!json.includes('PRIVATE_SECRET_BODY'));assert.ok(!json.includes('PRIVATE_CONFIG_VALUE'));
  assert.equal(graph.dynamicSqlCandidates.length,1);assert.ok(graph.dynamicSqlCandidates[0].entries.length>0);
  assert.ok(graph.unresolvedDependencies.length>0);assert.equal(graph.limitations.dynamicSqlNotResolved,true);
  assert.equal(graph.limitations.allSafe,false);assert.equal(graph.limitations.apiExposedSchemasVerified,false);
});

test('legacy snapshots explicitly retain missing dependency/trigger coverage rather than appearing complete',()=>{
  const input=fixture();delete input.triggers;delete input.functions[0].dependencies;
  input.views=[{schema:'public',name:'legacy_view',dependencies:[],privileges:[],definition:''}];
  const graph=buildAccessCandidateGraph(input);
  for(const field of ['missingFunctionCatalogDependencies','missingViewFunctionDependencies','missingTriggerInventory']){
    assert.equal(graph.limitations[field],true);
  }
  assert.equal(graph.limitations.allSafe,false);
});

test('empty or malformed graphs never become a zero-risk verdict',()=>{
  for(const input of [null,{}, {...fixture(),triggers:{}},{...fixture(),functions:[{schema:'public',name:'broken'}]}]){
    assert.throws(()=>buildAccessCandidateGraph(input));
  }
  const graph=buildAccessCandidateGraph({noPolicyTables:[],functions:[],views:[],policies:[],triggers:[]});
  assert.equal(graph.limitations.allSafe,false);assert.equal(graph.limitations.transitiveReachabilityProven,false);
});
