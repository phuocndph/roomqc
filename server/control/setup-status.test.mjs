import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {ControlError} from './errors.mjs';
import {setupStatusView,workspaceSetupStatus} from './setup-status.mjs';
import {createControlServer} from './app.mjs';

function fixture(){
  const user={id:randomUUID(),session_id:randomUUID(),email:'owner@example.invalid',email_confirmed_at:'2026-10-28'};
  const workspace={id:randomUUID(),slug:'hotel-demo',email_hash:'expected-owner',cluster_id:'cluster-a',routing_version:1,
    owner_id:null,tenant_id:null,hotel_id:null,status:'reserved',updated_at:'2026-10-28T00:00:00Z',checked_at:'2026-10-28T00:00:00Z',setup_job:null};
  const f={user,workspace,binding:null,reads:0,authReads:0,bindingReads:0};
  f.store={hashEmail:email=>email===user.email?'expected-owner':'foreign',workspace:async()=>structuredClone(f.workspace),
    setupStatusSnapshot:async()=>{f.reads++;return structuredClone(f.workspace)}};
  f.gateway={user:async()=>{f.authReads++;return structuredClone(f.user)},binding:async()=>{f.bindingReads++;return f.binding}};
  f.run=(token='owner-token',params=new URLSearchParams())=>workspaceSetupStatus(f.store,f.gateway,'hotel-demo',token,randomUUID(),params);
  f.activate=()=>{Object.assign(workspace,{status:'active',owner_id:user.id,tenant_id:randomUUID(),hotel_id:randomUUID()});
    f.binding={workspace_id:workspace.id,owner_id:user.id,tenant_id:workspace.tenant_id,hotel_id:workspace.hotel_id}};
  return f;
}
test('setup status is owner-private and ready only for a clean reservation; no secret diagnostics or credentials',async()=>{
  const f=fixture();f.workspace.last_error_code='private-database-password';const result=await f.run();
  assert.equal(result.step,'ready_to_setup');assert.equal(result.nextAction,'continue_setup');assert.equal(result.routingVersion,1);
  assert.equal(result.retryAfter,null);assert.equal(result.lastErrorCode,null);assert.equal(f.reads,2);assert.equal(f.authReads,2);
  for(const text of ['expected-owner','private-database-password','owner@example.invalid','owner-token'])assert.ok(!JSON.stringify(result).includes(text));
});
test('missing token or query injection never reads workspace or contacts a cluster',async()=>{
  const f=fixture();f.store.workspace=()=>{throw new Error('unexpected private read')};
  await assert.rejects(()=>f.run(''),{code:'LOGIN_REQUIRED'});
  for(const query of ['ownerId=foreign','tenantId=foreign','clusterId=foreign','retry=true','cursor=x&cursor=y'])
    await assert.rejects(()=>f.run('owner-token',new URLSearchParams(query)),{code:'INVALID_SETUP_STATUS'});
  assert.equal(f.authReads,0);assert.equal(f.bindingReads,0);
});
test('another email, another owner and malformed verified actors cannot read receipt or jobs',async()=>{
  for(const mutate of [f=>f.user.email='foreign@example.invalid',f=>f.workspace.owner_id=randomUUID(),
    f=>f.user.session_id='invalid',f=>f.user.email_confirmed_at=null,f=>f.user.id='invalid']){
    const f=fixture();const email=f.user.email;f.store.hashEmail=value=>value===email?'expected-owner':'foreign';mutate(f);
    await assert.rejects(()=>f.run(),{code:'OWNER_MISMATCH'});assert.equal(f.reads,0);assert.equal(f.bindingReads,0);
  }
});
test('active requires a matching immutable receipt; a missing or conflicting receipt never opens the workspace',async()=>{
  const f=fixture();f.activate();assert.equal((await f.run()).step,'active');
  f.binding=null;assert.equal((await f.run()).step,'needs_review');
  f.binding={workspace_id:randomUUID(),owner_id:f.user.id,tenant_id:f.workspace.tenant_id,hotel_id:f.workspace.hotel_id};
  assert.equal((await f.run()).lastErrorCode,'RECEIPT_CONFLICT');
});
test('lost response and missing legacy job stay unknown; verified remote commit is never called ready before activation',async()=>{
  const f=fixture();f.workspace.status='provisioning';f.workspace.owner_id=f.user.id;
  assert.deepEqual([...(Object.values(await f.run()).filter(x=>x==='needs_review'||x==='contact_support'))],['needs_review','contact_support']);
  f.binding={workspace_id:f.workspace.id,owner_id:f.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()};
  const result=await f.run();assert.equal(result.step,'retry');assert.equal(result.nextAction,'wait');assert.equal(result.lastErrorCode,'DIRECTORY_ACTIVATION_PENDING');
});
test('cluster outage produces safe retry, never ready/active, and does not leak remote error text',async()=>{
  const f=fixture();f.gateway.binding=async()=>{throw new Error('private provider url and secret')};
  const result=await f.run();assert.equal(result.nextAction,'wait');assert.equal(result.retryAfter,5);
  assert.equal(result.lastErrorCode,'CLUSTER_UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('durable jobs control next action and bounded retry; a stale routing version requires review',()=>{
  const f=fixture(),w={...f.workspace,status:'provisioning',owner_id:f.user.id};
  for(const state of ['queued','leased','retry']){
    w.setup_job={state,routingVersion:1,nextAttemptAt:'2026-10-28T01:00:00Z',leaseUntil:'2026-10-28T01:00:00Z'};
    const result=setupStatusView(w,{status:'missing'},randomUUID());assert.equal(result.nextAction,'wait');assert.equal(result.retryAfter,60);
  }
  for(const closureVerified of [undefined,null,false,'true',1]){
    w.setup_job={state:'waiting_owner',routingVersion:1,closureVerified};
    const result=setupStatusView(w,{status:'missing'},randomUUID());assert.equal(result.step,'needs_review');assert.equal(result.nextAction,'contact_support');
  }
  w.setup_job={state:'waiting_owner',routingVersion:1,closureVerified:true};assert.equal(setupStatusView(w,{status:'missing'},randomUUID()).nextAction,'continue_setup');
  for(const state of ['needs_review','cancelled','succeeded']){w.setup_job={state,routingVersion:1};assert.equal(setupStatusView(w,{status:'missing'},randomUUID()).step,'needs_review')}
  w.setup_job={state:'waiting_owner',routingVersion:2};assert.equal(setupStatusView(w,{status:'missing'},randomUUID()).lastErrorCode,'SETUP_MAPPING_CHANGED');
});
test('mapping, owner, job and activation races while fetching a receipt do not release stale setup permission',async()=>{
  for(const change of [f=>f.workspace.routing_version++,f=>f.workspace.owner_id=randomUUID(),f=>f.workspace.status='reserved',
    f=>f.workspace.setup_job={id:randomUUID(),state:'leased',routingVersion:1},
    f=>{f.workspace.setup_job.closureVerified=false}]){
    const f=fixture();f.workspace.status='provisioning';f.workspace.owner_id=f.user.id;
    f.workspace.setup_job={id:randomUUID(),state:'waiting_owner',routingVersion:1,closureVerified:true};
    f.gateway.binding=async()=>{change(f);return null};
    await assert.rejects(()=>f.run(),{code:'SETUP_STATUS_CHANGED'});
  }
});
test('revoked or replaced session during receipt read is rejected before returning private status',async()=>{
  const f=fixture();f.gateway.user=async()=>{if(++f.authReads===2)throw new ControlError(403,'SESSION_REVOKED','Phiên không còn hiệu lực.');return f.user};
  await assert.rejects(()=>f.run(),{code:'SESSION_REVOKED'});
  const g=fixture();g.gateway.user=async()=>({...g.user,session_id:++g.authReads===2?randomUUID():g.user.session_id});
  await assert.rejects(()=>g.run(),{code:'LOGIN_REQUIRED'});
});
test('HTTP setup-status is GET-only, no-store, bearer protected, and never provisions, activates or audits',async()=>{
  const f=fixture();for(const name of ['activate','beginProvision','recordFailure','audit'])f.store[name]=()=>{throw new Error('unexpected mutation')};
  f.gateway.provision=()=>{throw new Error('unexpected provisioning')};
  const server=createControlServer({config:{allowLocal:true,publicOrigin:'http://localhost:8082'},store:f.store,gateway:f.gateway});
  server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/control/workspaces/hotel-demo/setup-status';
  try{
    assert.equal((await fetch(url)).status,401);
    const response=await fetch(url,{headers:{Authorization:'Bearer owner-token'}}),body=await response.json();
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(body.step,'ready_to_setup');
    assert.equal(body.requestId,response.headers.get('x-request-id'));
    assert.equal((await fetch(url+'?ownerId=forged',{headers:{Authorization:'Bearer owner-token'}})).status,400);
    assert.equal((await fetch(url,{method:'POST',headers:{Authorization:'Bearer owner-token',Origin:'http://localhost:8082','Content-Type':'application/json'},body:'{}'})).status,405);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
