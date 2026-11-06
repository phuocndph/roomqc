// Exact-owned native diagnostic subprocess. Secrets arrive only over private IPC.
import assert from 'node:assert/strict';
import pg from 'pg';
import {startControl} from '../server.mjs';
import {registryConfiguration} from '../registry.mjs';
import {ReleaseApprovalTrust} from '../release-approval.mjs';
import {ReleaseValidationCatalog} from '../release-validation.mjs';
import {SetupWorkerStore} from '../setup-worker-store.mjs';
import {SetupWorker,createSetupReconciler} from '../workers/setup-worker.mjs';
import {SetupRecoveryGateway} from '../setup-recovery.mjs';

assert.equal(typeof process.send,'function','OWNED_IPC_REQUIRED');
let runtime,pool,worker,initialized=false;
const send=value=>new Promise(resolve=>process.send(value,()=>resolve()));
const hold=async phase=>{await send({type:'barrier',phase});await new Promise(()=>{})};
const close=async()=>{await worker?.shutdown();await runtime?.shutdown();await pool?.end()};
process.once('message',async input=>{
  try{
    assert.equal(initialized,false);initialized=true;assert.match(input.run,/^[a-f0-9]{12}$/);
    const database=new URL(input.databaseUrl);
    assert.equal(database.hostname,'db');assert.equal(database.pathname,'/roomqc_api_'+input.run);
    assert.ok(['api','worker'].includes(input.mode));
    if(input.mode==='api'){
      assert.ok([1,3].includes(input.poolMax??3),'OWNED_API_POOL_SIZE');
      const config={databaseUrl:input.databaseUrl,emailKey:input.emailKey,clusters:[input.cluster],poolMax:input.poolMax??3,
        publicOrigin:'http://localhost:8082',host:'127.0.0.1',port:0,allowLocal:true,
        supportClusterId:input.cluster.id,signupEnabled:true,setupDispatchEnabled:true,shutdownTimeoutMs:1000,
        releaseValidation:new ReleaseValidationCatalog(input.releaseCatalog,{trust:new ReleaseApprovalTrust(input.trust,{maximumValidityMs:86400000})}),
        ...registryConfiguration({ROOMQC_CONTROL_INVENTORY:JSON.stringify(input.inventory)},[input.cluster],true)};
      runtime=await startControl(config);await runtime.store.readiness();
      await send({type:'ready',port:runtime.server.address().port});
      process.once('message',async message=>{if(message?.type==='stop'){await close();await send({type:'stopped'});process.disconnect()}});
    }else{
      pool=new pg.Pool({connectionString:input.databaseUrl,max:2,statement_timeout:5000,lock_timeout:3000});
      const actual=new SetupWorkerStore(pool,{bindings:input.bindings,leaseMs:22000,retryBaseMs:100});
      const gateway=new SetupRecoveryGateway({allowLocal:true,inventory:new Map([[input.recoveryCluster.id,input.recoveryCluster]])},input.recoveryCluster,
        {expected:input.recoveryExpected,loadCredential:async()=>({publishableKey:input.publishableKey,token:input.recoveryToken})});
      const reconcile=createSetupReconciler([[input.recoveryCluster.id,gateway]]);
      worker=new SetupWorker({concurrency:1,requestTimeoutMs:5000,shutdownTimeoutMs:6000,
        onEvent:event=>process.send({type:'worker_event',event:Object.fromEntries(['type','attempt','settled','state','code']
          .filter(key=>event[key]!==undefined).map(key=>[key,event[key]]))}),
        store:{readiness:()=>actual.readiness(),claim:async()=>{
          const claim=await actual.claim();if(claim&&input.pause==='after_claim')await hold('after_claim');return claim;
        },settle:async(...args)=>{const result=await actual.settle(...args);
          if(result?.settled&&input.pause==='after_settle')await hold('after_settle');return result}},
        reconcile:async(...args)=>{const result=await reconcile(...args);
          if(result.outcome==='terminal'&&input.pause==='after_close')await hold('after_close');return result}});
      await worker.tick();assert.equal(worker.status().lastErrorCode,null,'NATIVE_WORKER_DEPENDENCY_FAILED');
      await close();await send({type:'done'});process.disconnect();
    }
  }catch(error){
    await send({type:'failed',code:/^[A-Z_0-9]+$/.test(error?.code??'')?error.code:'OWNED_NATIVE_CHILD_FAILED'});
    try{await close()}catch{}process.exitCode=1;process.disconnect();
  }
});
