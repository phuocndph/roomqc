import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {clusterCommand,requireCapability} from './admin.mjs';
import {pageOptions} from './admin-read.mjs';

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
    const payload=operation==='update_policy'?{tenantLimit:10}:{};
    assert.equal(clusterCommand({...input,operation,payload},randomUUID(),'cluster-a').operation,operation);
  }
  const parameters=contract.paths['/admin/workspaces/{id}'].get.parameters.map(p=>p.name);
  assert.ok(parameters.includes('limit')&&parameters.includes('cursor'));
});
