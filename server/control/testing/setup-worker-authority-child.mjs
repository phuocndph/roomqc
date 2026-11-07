// Exact-owned diagnostic subprocess. No operational debug hook or owner token.
import assert from 'node:assert/strict';
import pg from 'pg';
import {SetupWorkerStore} from '../setup-worker-store.mjs';
import {SetupWorker,createSetupReconciler} from '../workers/setup-worker.mjs';
import {SetupRecoveryGateway} from '../setup-recovery.mjs';

assert.equal(typeof process.send,'function','OWNED_IPC_REQUIRED');
const send=value=>new Promise(resolve=>process.send(value,()=>resolve()));
let worker,pool,release;
process.on('message',message=>{if(message?.type==='release'){const resume=release;release=undefined;resume?.()}});
async function hold(phase){
  const resumed=new Promise(resolve=>{assert.equal(release,undefined);release=resolve});
  await send({type:'barrier',phase});await resumed;
}
process.once('message',async input=>{
  try{
    assert.match(input.run,/^[a-f0-9]{12}$/);
    const url=new URL(input.databaseUrl);
    assert.equal(url.hostname,'db');assert.equal(url.pathname,'/roomqc_setup_'+input.run);
    assert.equal(decodeURIComponent(url.username),'setup_native_'+input.run);
    assert.ok([2500,22000].includes(input.leaseMs));
    assert.ok([undefined,'after_claim','before_settle'].includes(input.pause));
    pool=new pg.Pool({connectionString:url.href,max:2,statement_timeout:5000,lock_timeout:3000,
      application_name:'roomqc-owned-worker-'+input.run});
    const actual=new SetupWorkerStore(pool,{bindings:input.bindings,leaseMs:input.leaseMs,retryBaseMs:100});
    const gateway=new SetupRecoveryGateway({allowLocal:true,inventory:new Map([[input.cluster.id,input.cluster]])},input.cluster,
      {expected:input.expected,loadCredential:async()=>({publishableKey:input.publishableKey,token:input.token})});
    worker=new SetupWorker({concurrency:1,requestTimeoutMs:12000,shutdownTimeoutMs:1000,
      store:{readiness:()=>actual.readiness(),claim:async()=>{
        const claim=await actual.claim();
        if(claim){await send({type:'claimed',attempt:claim.attempt});if(input.pause==='after_claim')await hold('after_claim')}
        return claim;
      },settle:async(claim,result)=>{
        if(input.pause==='before_settle')await hold('before_settle');
        const settled=await actual.settle(claim,result);
        await send({type:'settled',...settled});return settled;
      }},
      reconcile:createSetupReconciler([[input.cluster.id,gateway]]),
      onEvent:event=>{void send({type:'worker_event',event:Object.fromEntries(['type','attempt','settled','state','code']
        .filter(key=>event[key]!==undefined).map(key=>[key,event[key]]))})}});
    await worker.tick();assert.equal(worker.status().lastErrorCode,null,'OWNED_WORKER_DEPENDENCY_FAILED');
    await worker.shutdown();await pool.end();await send({type:'done'});process.disconnect();
  }catch(error){
    await send({type:'failed',code:/^[A-Z_0-9]+$/.test(error?.code??'')?error.code:'OWNED_WORKER_CHILD_FAILED'});
    try{await worker?.shutdown();await pool?.end()}catch{}
    process.exitCode=1;process.disconnect();
  }
});
