import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {provisionWorkspace,recoverSetupReceipt} from './provisioning.mjs';
import {dispatchMatches} from './setup-dispatch.mjs';

function fixture(){
  const workspace={id:randomUUID(),slug:'replay-fixture',cluster_id:'cluster-a',routing_version:1,
    owner_id:randomUUID(),tenant_id:randomUUID(),hotel_id:randomUUID(),status:'active'};
  const receipt={workspace_id:workspace.id,owner_id:workspace.owner_id,tenant_id:workspace.tenant_id,hotel_id:workspace.hotel_id};
  const dispatch={id:randomUUID(),workspace_id:workspace.id,cluster_id:workspace.cluster_id,owner_id:workspace.owner_id,
    routing_version:workspace.routing_version,payload_sha256:'a'.repeat(64),terminal_state:'committed',
    tenant_id:workspace.tenant_id,hotel_id:workspace.hotel_id};
  let remoteCloses=0,settles=0;
  const store={setup:{current:async()=>dispatch,settle:async(w,d,result)=>{
    assert.equal(dispatchMatches(w,d,result),true);settles++;return {workspace,state:'committed',idempotent:true};
  }}};
  const gateway={binding:async()=>receipt,closeSetupDispatch:async()=>{remoteCloses++;return {state:'busy'};}};
  return {workspace,receipt,dispatch,store,gateway,counts:()=>({remoteCloses,settles})};
}

test('simultaneous retries of a committed registration reuse its durable receipt without taking the remote close lock',async()=>{
  const f=fixture();
  const results=await Promise.all(Array.from({length:20},()=>provisionWorkspace(f.store,f.gateway,f.workspace,
    {id:f.workspace.owner_id},{},randomUUID(),false)));
  assert.ok(results.every(r=>r.status===200&&r.body.idempotent&&r.body.tenant_id===f.workspace.tenant_id&&r.body.hotel_id===f.workspace.hotel_id));
  assert.deepEqual(f.counts(),{remoteCloses:0,settles:20});
});

test('a committed directory receipt still rejects a changed remote binding',async()=>{
  const f=fixture();
  await assert.rejects(()=>recoverSetupReceipt(f.store,f.gateway,f.workspace,{...f.receipt,tenant_id:randomUUID()},randomUUID()),{code:'BINDING_CONFLICT'});
  assert.deepEqual(f.counts(),{remoteCloses:0,settles:0});
  f.workspace.status='provisioning';f.workspace.tenant_id=null;f.workspace.hotel_id=null;
  await assert.rejects(()=>recoverSetupReceipt(f.store,f.gateway,f.workspace,{...f.receipt,hotel_id:randomUUID()},randomUUID()),{code:'PROVISIONING_RESULT_UNKNOWN'});
  assert.deepEqual(f.counts(),{remoteCloses:0,settles:0});
});

test('an unsettled dispatch still requires a committed remote receipt and cannot accept busy as success',async()=>{
  const f=fixture();f.dispatch.terminal_state=null;
  await assert.rejects(()=>recoverSetupReceipt(f.store,f.gateway,f.workspace,f.receipt,randomUUID()),{code:'PROVISIONING_RESULT_UNKNOWN'});
  assert.deepEqual(f.counts(),{remoteCloses:1,settles:0});
  f.gateway.closeSetupDispatch=async()=>({dispatch_id:f.dispatch.id,workspace_id:f.workspace.id,owner_id:f.workspace.owner_id,
    routing_version:1,payload_sha256:f.dispatch.payload_sha256,state:'committed',success:true,tenant_id:f.workspace.tenant_id,hotel_id:f.workspace.hotel_id});
  assert.equal(await recoverSetupReceipt(f.store,f.gateway,f.workspace,f.receipt,randomUUID()),f.workspace);
  assert.equal(f.counts().settles,1);
});
