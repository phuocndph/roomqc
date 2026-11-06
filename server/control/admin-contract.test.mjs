import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {clusterCommand,requireCapability,publicCluster} from './admin.mjs';
import {pageOptions,backupView,hostView} from './admin-read.mjs';
import {commandResultLookup,commandReceipt,clusterCommandOperations} from './command-results.mjs';
import {supportSnapshot} from './store.mjs';
import {deploymentView} from './deployment-journal.mjs';

test('deployment history contract exposes only durable public receipts and has no HTTP execution operation',async()=>{
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8'));
  const route=contract.paths['/admin/deployments'];
  assert.deepEqual(Object.keys(route),['get']);assert.equal(route.get['x-capability'],'platform-read');
  assert.equal(route.get['x-strict-query-parameters'],true);
  assert.deepEqual(route.get.parameters.map(p=>p.name),['limit','cursor','clusterId','state']);
  assert.deepEqual(Object.keys(deploymentView({phase_index:0})).sort(),Object.keys(contract.components.schemas.Deployment.properties).sort());
  assert.equal(contract.components.schemas.Deployment.additionalProperties,false);
});

const actor={id:randomUUID(),clusterId:'authority'},config={supportClusterId:'authority'};
const input={operation:'update_policy',expectedVersion:1,reason:'Verify server policy',payload:{tenantLimit:10,thresholds:{cpuBlockPercent:90}}};
test('admin command identity is canonical and binds target, version, reason and strict server-owned payload',()=>{
  const key=randomUUID(),a=clusterCommand(input,key,'cluster-a');
  const reordered={payload:{thresholds:{cpuBlockPercent:90},tenantLimit:10},reason:input.reason+' ',expectedVersion:1,operation:input.operation};
  assert.equal(clusterCommand(reordered,key,'cluster-a').payloadHash,a.payloadHash);
  for(const changed of [{...input,expectedVersion:2},{...input,reason:'Another valid reason'},
    {...input,payload:{...input.payload,tenantLimit:11}}])assert.notEqual(clusterCommand(changed,key,'cluster-a').payloadHash,a.payloadHash);
  assert.notEqual(clusterCommand(input,key,'cluster-b').payloadHash,a.payloadHash);
  for(const changed of [{...input,role:'super_admin'},{...input,expectedVersion:0},{...input,reason:'  a  '},{...input,payload:{tenantLimit:10,url:'http://metadata.invalid'}},
    {...input,operation:'drop_database'},{...input,payload:[]},{...input,payload:{tenantLimit:1.5}}]){
    assert.throws(()=>clusterCommand(changed,key,'cluster-a'),{code:changed.payload?.tenantLimit===1.5?'INVALID_POLICY':'INVALID_COMMAND'});
  }
  assert.throws(()=>clusterCommand(input,'invalid','cluster-a'),{code:'INVALID_COMMAND'});
  assert.throws(()=>clusterCommand({...input,payload:{tenantLimit:10,reopenMode:'automatic'}},key,'cluster-a'),{code:'AUTOMATIC_REOPEN_DISABLED'});
});
test('capabilities require a verified actor from the configured authority; pagination rejects unknown or duplicated filters',()=>{
  for(const capability of ['platform-read','infra-operate','support-reconcile'])requireCapability(actor,capability,config);
  for(const invalid of [null,{id:actor.id,clusterId:'client-chosen'}, {id:'invalid',clusterId:'authority'}]){
    assert.throws(()=>requireCapability(invalid,'platform-read',config),{code:'ADMIN_PERMISSION_REQUIRED'});
  }
  assert.throws(()=>requireCapability(actor,'arbitrary-operation',config),{code:'ADMIN_PERMISSION_REQUIRED'});
  for(const query of ['limit=0','limit=101','limit=1.5','limit=5&limit=6','unexpected=yes','cursor=invalid!']){
    assert.throws(()=>pageOptions(new URLSearchParams(query),'workspaces'),{code:'INVALID_PAGE'});
  }
});
test('backup metadata exposes only display identifiers and digests, never object locations or arbitrary stored extras',()=>{
  const at='2026-10-29T00:00:00Z',row={id:randomUUID(),cluster_id:null,scope:'directory',backup_id:'backup-1',manifest_hash:'a'.repeat(64),
    verification_state:'verified',completed_at:new Date(at),restore_test_at:null,created_at:new Date(at),signed_url:'private-marker'};
  const safe=backupView(row);assert.equal(safe.backupId,'backup-1');assert.equal(safe.restoreTestAt,null);assert.equal(safe.createdAt,new Date(at).toISOString());
  assert.equal(JSON.stringify(safe).includes('private-marker'),false);
  for(const value of ['https://store.invalid/private?signature=private-marker','/private/backup','bucket/private','x'.repeat(121)]){
    const redacted=backupView({...row,backup_id:value,manifest_hash:'private-marker'});
    assert.equal(redacted.backupId,null);assert.equal(redacted.manifestHash,null);
  }
});
test('host and candidate contracts are strict public projections with bounded inventory pages',async()=>{
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8'));
  const safe=hostView({id:'host-a',name:'Host\n A',region:null,provider_label:'P'.repeat(300),environment:'local',status:'active',row_version:'1',
    created_at:new Date('2026-10-30T00:00:00Z'),cluster:null,ssh_password:'private-marker'},config);
  assert.equal(safe.name,'Host  A');assert.equal(safe.providerLabel.length,200);assert.equal(safe.rowVersion,1);
  assert.equal(JSON.stringify(safe).includes('private-marker'),false);
  assert.deepEqual(Object.keys(safe).sort(),Object.keys(contract.components.schemas.Host.properties).sort());
  const hostConfig={inventory:new Map([['cluster-a',{hostId:'host-a',preflight:{capturedAt:new Date().toISOString(),deploymentAllowed:true,diskFreePercent:42,dockerServerVersion:'29.1.3'}}]])};
  const observed=hostView({id:'host-a',name:'Host A',region:null,provider_label:null,environment:'production',status:'active',row_version:'1',
    created_at:new Date('2026-10-30T00:00:00Z'),cluster:{inventory_ref:'cluster-a'}},hostConfig);
  assert.equal(observed.preflightReady,true);assert.equal(observed.preflight.diskFreePercent,42);assert.equal(observed.preflight.dockerServerVersion,'29.1.3');
  assert.equal(JSON.stringify(observed).includes('hostId'),false);
  for(const path of ['/admin/hosts','/admin/cluster-candidates']){
    const route=contract.paths[path].get;assert.equal(route['x-capability'],'platform-read');assert.equal(route['x-strict-query-parameters'],true);
    assert.deepEqual(route.security,[{Bearer:[]}]);assert.equal(route['x-implementation'],'implemented-local');
  }
  assert.equal(contract.components.schemas.ClusterCandidate.additionalProperties,false);
  assert.equal(Object.hasOwn(contract.components.schemas.ClusterCandidate.properties,'url'),false);
});
test('backup contract declares a strict read with filter-wide total and nullable verification/restore evidence',async()=>{
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8'));
  const get=contract.paths['/admin/backups'].get;
  assert.equal(get['x-implementation'],'implemented-local');assert.equal(get['x-capability'],'platform-read');
  assert.equal(get['x-strict-query-parameters'],true);
  assert.deepEqual(get.parameters.map(p=>p.name),['limit','cursor','clusterId','scope','verificationState']);
  assert.deepEqual(contract.components.schemas.BackupPage.required,['items','nextCursor','total','asOf']);
  assert.deepEqual(contract.components.schemas.Backup.properties.backupId.type,['string','null']);
  const safe=backupView({id:randomUUID(),cluster_id:null,scope:'directory',backup_id:null,manifest_hash:null,
    verification_state:'pending',completed_at:null,restore_test_at:null,created_at:new Date()});
  assert.deepEqual(Object.keys(safe).sort(),Object.keys(contract.components.schemas.Backup.properties).sort());
});
test('command result lookup requires one bounded operation, target and exact original UUID key',()=>{
  const key='ABCDEF01-2345-6789-ABCD-EF0123456789';
  for(const operation of [...clusterCommandOperations,'register_cluster']){
    assert.deepEqual(commandResultLookup('cluster-a',new URLSearchParams({operation}),key),{targetId:'cluster-a',operation,key});
  }
  for(const query of ['', 'operation=', 'operation=unknown', 'operation=close_admission&operation=close_admission',
    'operation=close_admission&unexpected=yes', 'operation=close_admission&actorId='+actor.id, 'operation= close_admission']){
    assert.throws(()=>commandResultLookup('cluster-a',new URLSearchParams(query),key),{code:'INVALID_COMMAND_LOOKUP'});
  }
  for(const invalid of [undefined,null,[],[key],'invalid',' '+key,key+' ',key+','+key]){
    assert.throws(()=>commandResultLookup('cluster-a',new URLSearchParams('operation=close_admission'),invalid),{code:'INVALID_COMMAND_LOOKUP'});
  }
  for(const target of [undefined,null,[], 'A', 'cluster/a', 'a'.repeat(41)]){
    assert.throws(()=>commandResultLookup(target,new URLSearchParams('operation=close_admission'),key),{code:'INVALID_COMMAND_LOOKUP'});
  }
});
test('command receipt projection rejects incomplete or inconsistent success and strips nested stored extras',()=>{
  const now=new Date().toISOString(),cluster=publicCluster({id:'cluster-a',status:'active',row_version:2,validation_state:'valid',
    host_id:'host-a',backend_kind:'self_hosted',release_id:null,tenant_limit:10,allocated_count:1,policy_version:1,source_generation:1,
    health_observed_at:now,received_at:now,health_valid_until:now,metric_status:'unknown',normalized_values:{
      cpuUsedPercent:null,memoryAvailableBytes:0,memoryTotalBytes:10,dataDiskFreeBytes:1,dataDiskTotalBytes:10,
      dataDiskInodeFreePercent:50,dbConnectionsUsed:1,dbConnectionBudget:5}},config);
  const row={id:randomUUID(),status:'succeeded',finished_at:now,result:{status:'succeeded',targetVersion:2,result:cluster}};
  const clean=commandReceipt(row,'cluster-a');assert.equal(clean.commandId,row.id);assert.deepEqual(clean.result,cluster);
  const dirty=structuredClone(row);dirty.result.reason='private-marker';dirty.result.result.credentialRef='private-marker';
  dirty.result.result.admission.body={secret:'private-marker'};dirty.result.result.health.metrics.raw='private-marker';
  dirty.result.result.health.dataDisks=[{id:'database',freeBytes:1,totalBytes:10,inodeFreePercent:50,device:'private-marker',mountpoint:'private-marker'}];
  const safe=commandReceipt(dirty,'cluster-a');assert.equal(JSON.stringify(safe).includes('private-marker'),false);
  assert.deepEqual(safe.result.health.dataDisks,[{id:'database',freeBytes:1,totalBytes:10,inodeFreePercent:50}]);
  const invalid=[null,{...row,status:'started'},{...row,status:'failed'},{...row,finished_at:null},{...row,finished_at:'invalid'},
    {...row,id:'invalid'}, {...row,result:null}, {...row,result:{...row.result,status:'failed'}},
    {...row,result:{...row.result,targetVersion:'2'}}, {...row,result:{...row.result,result:{...cluster,id:'cluster-b'}}},
    {...row,result:{...row.result,result:{...cluster,rowVersion:3}}}, {...row,result:{...row.result,result:{...cluster,health:{}}}}];
  for(const bad of invalid)assert.throws(()=>commandReceipt(bad,'cluster-a'),{code:'COMMAND_RESULT_UNAVAILABLE'});
  const legacy=structuredClone(row);delete legacy.result.result.health.schemaVersion;delete legacy.result.result.health.measurementScope;
  delete legacy.result.result.health.dataDisks;assert.deepEqual(commandReceipt(legacy,'cluster-a'),clean);
});
test('OpenAPI references and operations are unique, admin routes require bearer capability and declared commands parse',async()=>{
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8')),ids=new Set();
  function inspect(value){
    if(!value||typeof value!=='object')return;
    if(value.$ref){assert.ok(value.$ref.startsWith('#/'));let target=contract;for(const key of value.$ref.slice(2).split('/'))target=target?.[key];assert.ok(target,value.$ref)}
    for(const nested of Object.values(value))inspect(nested);
  }
  inspect(contract);
  for(const [path,verbs] of Object.entries(contract.paths))for(const operation of Object.values(verbs)){
    if(!operation.operationId)continue;
    assert.equal(ids.has(operation.operationId),false);ids.add(operation.operationId);
    if(path.startsWith('/admin/')){assert.deepEqual(operation.security,[{Bearer:[]}]);assert.ok(operation['x-capability'])}
  }
  for(const operation of contract.components.schemas.Command.properties.operation.enum){
    const payload=operation==='update_policy'?{tenantLimit:10}:operation==='bind_telemetry_target'?{targetFingerprint:'a'.repeat(64)}:operation==='queue_deployment'?{specId:randomUUID(),executionSha256:'a'.repeat(64)}:{};
    assert.equal(clusterCommand({...input,operation,payload},randomUUID(),'cluster-a').operation,operation);
  }
  const parameters=contract.paths['/admin/workspaces/{id}'].get.parameters.map(p=>p.name);
  assert.ok(parameters.includes('limit')&&parameters.includes('cursor'));
  const lookup=contract.paths['/admin/clusters/{id}/command-result'].get;
  assert.equal(lookup['x-capability'],'platform-read');assert.equal(lookup['x-implementation'],'implemented-local');
  assert.equal(lookup['x-strict-query-parameters'],true);
  assert.deepEqual(lookup.parameters.map(p=>[p.name,p.in,p.required]),[['id','path',true],['operation','query',true],['Idempotency-Key','header',true]]);
  assert.deepEqual(lookup.parameters.find(p=>p.name==='operation').schema.enum,[...clusterCommandOperations,'register_cluster']);
  assert.equal(lookup.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/CommandResult');
  assert.ok(lookup.responses['404']&&lookup.responses['409']);
});

test('multi-mount health DTO matches declared safe fields, labels scope and preserves stale values without leaking device or path',async()=>{
  const now=Date.now(),row={id:'fixture',row_version:1,health_observed_at:new Date(now-121000).toISOString(),
    health_valid_until:new Date(now-1000).toISOString(),metric_status:'healthy',source_generation:3,reason_codes:[],
    evaluator_state:{sampleSchemaVersion:2,measurementScope:'docker-desktop-vm',dataDisks:[{id:'storage',freeBytes:10,totalBytes:100,
      inodeFreePercent:80,mountpoint:'/private/volume',device:'/dev/private',credentialRef:'private-ref'}]}};
  const health=publicCluster(row,config,{now}).health;
  assert.equal(health.status,'unknown');assert.ok(health.reasonCodes.includes('METRICS_STALE'));
  assert.equal(health.schemaVersion,2);assert.equal(health.measurementScope,'docker-desktop-vm');
  assert.deepEqual(health.dataDisks,[{id:'storage',freeBytes:10,totalBytes:100,inodeFreePercent:80}]);
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8'));
  for(const key of Object.keys(health))assert.ok(Object.hasOwn(contract.components.schemas.Health.properties,key),key);
  for(const key of Object.keys(health.dataDisks[0]))assert.ok(Object.hasOwn(contract.components.schemas.DataDisk.properties,key),key);
  const legacy=publicCluster({...row,evaluator_state:{}},config,{now}).health;
  assert.equal(legacy.schemaVersion,1);assert.equal(legacy.dataDisks,null);assert.equal(legacy.measurementScope,null);
});

test('legacy support contract declares the original-key result lookup and a separate strict snake_case historical snapshot',async()=>{
  const contract=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8'));
  const post=contract.paths['/support/reconcile'].post,get=contract.paths['/support/reconcile-result'].get;
  for(const operation of [post,get]){
    assert.equal(operation['x-implementation'],'implemented-local');assert.equal(operation['x-capability'],'support-reconcile');
    assert.deepEqual(operation.security,[{Bearer:[]}]);
    const key=operation.parameters.find(p=>p.name==='Idempotency-Key');assert.equal(key.in,'header');assert.equal(key.required,true);assert.equal(key.schema.format,'uuid');
    assert.equal(operation.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/SupportReconcileResult');
    for(const code of ['400','401','403','409','503'])assert.ok(operation.responses[code]);
  }
  assert.equal(get['x-strict-query-parameters'],true);assert.equal(get.requestBody,undefined);
  assert.deepEqual(get.parameters.filter(p=>p.in==='query').map(p=>[p.name,p.required,p.schema.format]),[['workspaceId',true,'uuid']]);
  assert.match(get.responses['404'].description,/unknown.*not proof/i);
  const schema=contract.components.schemas.SupportWorkspaceSnapshot;
  assert.deepEqual(Object.keys(schema.properties),Object.keys(supportSnapshot({})));
  assert.deepEqual(schema.required,Object.keys(schema.properties));assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.status.const,'active');assert.equal(contract.components.schemas.SupportReconcile.additionalProperties,false);
  assert.equal(contract.components.schemas.SupportReconcileResult.additionalProperties,false);
  assert.equal(contract.components.schemas.SupportReconcileResult.properties.success.const,true);
});
