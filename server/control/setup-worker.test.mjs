import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SetupWorker,createSetupReconciler} from './workers/setup-worker.mjs';

function fixture(){
  const workspace={id:randomUUID(),owner_id:randomUUID(),cluster_id:'cluster-a',routing_version:1,api_url:'https://cluster.invalid'};
  const dispatch={id:randomUUID(),workspace_id:workspace.id,owner_id:workspace.owner_id,cluster_id:workspace.cluster_id,
    routing_version:1,payload_sha256:'a'.repeat(64)};
  const claim={id:randomUUID(),token:randomUUID(),attempt:1,workspace,dispatch};
  const receipt={dispatch_id:dispatch.id,workspace_id:workspace.id,owner_id:workspace.owner_id,routing_version:1,
    payload_sha256:dispatch.payload_sha256,state:'committed',success:true,tenant_id:randomUUID(),hotel_id:randomUUID()};
  return {claim,receipt,gateway:close=>({binding:{clusterId:workspace.cluster_id,url:workspace.api_url},close}),signal:new AbortController().signal};
}
test('setup reconciler closes only the persisted dispatch, validates proof and drops provider extras',async()=>{
  const f=fixture();let calls=0;
  const gateway=f.gateway(async(w,d)=>{calls++;assert.equal(w,f.claim.workspace);assert.equal(d,f.claim.dispatch);return {...f.receipt,privateProviderBody:'discard'}});
  const targets=new Map([['cluster-a',gateway]]),reconcile=createSetupReconciler(targets);targets.clear();
  const result=await reconcile(f.claim,{signal:f.signal});assert.equal(result.outcome,'terminal');assert.deepEqual(result.receipt,f.receipt);
  assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('discard'));assert.equal(gateway.provision,undefined);
});
test('setup reconciler treats busy as retry only for matching identity and rejects wrong terminal proof',async()=>{
  const f=fixture();let value={...f.receipt,state:'busy'};
  const reconcile=createSetupReconciler([['cluster-a',f.gateway(async()=>value)]]);
  assert.deepEqual(await reconcile(f.claim,{signal:f.signal}),{outcome:'retry',code:'SETUP_BUSY'});
  for(const patch of [{workspace_id:randomUUID()},{owner_id:randomUUID()},{dispatch_id:randomUUID()},
    {routing_version:2},{payload_sha256:'b'.repeat(64)}]){
    value={...f.receipt,state:'busy',...patch};assert.deepEqual(await reconcile(f.claim,{signal:f.signal}),{outcome:'review',code:'RECOVERY_RECEIPT_INVALID'});
    value={...f.receipt,...patch};assert.deepEqual(await reconcile(f.claim,{signal:f.signal}),{outcome:'review',code:'RECOVERY_RECEIPT_INVALID'});
  }
});
test('setup reconciler has no fallback destination and logs no raw credential or network errors',async()=>{
  const f=fixture();let calls=0;const reconcile=createSetupReconciler([['cluster-a',f.gateway(async()=>{calls++;throw Error('private DSN and token')})]]);
  for(const patch of [{cluster_id:'cluster-b'},{api_url:'https://wrong.invalid'}]){
    assert.equal((await reconcile({...f.claim,workspace:{...f.claim.workspace,...patch}},{signal:f.signal})).outcome,'review');
  }
  assert.equal(calls,0);assert.deepEqual(await reconcile(f.claim,{signal:f.signal}),{outcome:'retry',code:'RECOVERY_UNAVAILABLE'});
  const denied=createSetupReconciler([['cluster-a',f.gateway(async()=>{throw Object.assign(Error('private'),{code:'RECOVERY_CREDENTIAL_DENIED'})})]]);
  assert.deepEqual(await denied(f.claim,{signal:f.signal}),{outcome:'review',code:'RECOVERY_CREDENTIAL_DENIED'});
});
test('setup worker bounds claims and concurrency and skips overlapping ticks',async()=>{
  const f=fixture(),claims=[{...f.claim,id:randomUUID()},f.claim];let release,active=0,peak=0,settles=0;
  const barrier=new Promise(r=>release=r),store={readiness:async()=>{},claim:async()=>claims.pop()??null,settle:async()=>{settles++;return {settled:true,state:'succeeded'}}};
  const worker=new SetupWorker({store,concurrency:2,reconcile:async()=>{active++;peak=Math.max(active,peak);await barrier;active--;return {outcome:'terminal',receipt:f.receipt}}});
  const pending=worker.tick();await new Promise(r=>setTimeout(r,0));assert.equal((await worker.tick()).reason,'ALREADY_RUNNING');
  assert.equal(peak,2);release();await pending;assert.equal(settles,2);assert.equal(worker.status().ready,true);await worker.shutdown();
});
test('setup worker bounds an ignored abort, settles once and ignores the late response',async()=>{
  const f=fixture(),results=[];let claims=0;
  const store={readiness:async()=>{},claim:async()=>{claims++;return f.claim},settle:async(c,r)=>{results.push(r);return {settled:true,state:'retry'}}};
  const worker=new SetupWorker({store,concurrency:1,requestTimeoutMs:20,reconcile:async()=>{
    await new Promise(r=>setTimeout(r,70));return {outcome:'terminal',receipt:f.receipt}}});
  await worker.tick();assert.deepEqual(results,[{outcome:'retry',code:'SETUP_TIMEOUT'}]);
  await new Promise(r=>setTimeout(r,90));assert.equal(results.length,1);assert.equal(claims,1);await worker.shutdown();
});
test('setup worker stops claiming during shutdown and aborts in-flight requests',async()=>{
  const f=fixture();let entered,seenSignal;const started=new Promise(r=>entered=r),results=[];
  const store={readiness:async()=>{},claim:async()=>f.claim,settle:async(c,r)=>{results.push(r);return {settled:true,state:'retry'}}};
  const worker=new SetupWorker({store,concurrency:1,reconcile:async(c,{signal})=>{seenSignal=signal;entered();return new Promise(()=>{})}});
  const running=worker.tick();await started;assert.deepEqual(await worker.shutdown(),{timedOut:false});await running;
  assert.equal(seenSignal.aborted,true);assert.deepEqual(results,[{outcome:'retry',code:'SETUP_INTERRUPTED'}]);
  assert.equal((await worker.tick()).reason,'STOPPING');assert.equal(worker.status().ready,false);
});
test('setup worker readiness failures, exhausted jobs and sink failures produce only bounded events',async()=>{
  const f=fixture();let fail=true,claims=0;const events=[];
  const store={readiness:async()=>{if(fail)throw Error('secret DSN')},claim:async()=>{claims++;return {id:f.claim.id,exhausted:true,code:'SETUP_ATTEMPTS_EXHAUSTED'}},
    settle:async()=>{throw Error('Exhausted must not settle')}};
  const worker=new SetupWorker({store,concurrency:1,reconcile:async()=>{throw Error('Must not call')},onEvent:e=>{events.push(e);throw Error('sink')}});
  await worker.tick();assert.equal(worker.status().ready,false);assert.equal(claims,0);fail=false;await worker.tick();
  assert.equal(worker.status().ready,true);assert.equal(events[1].type,'setup_recovery_review');assert.ok(!JSON.stringify(events).includes('secret'));await worker.shutdown();
});
