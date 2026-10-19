import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {HealthWorker} from './workers/health-worker.mjs';
import {fixtureTarget} from './test-fixtures.mjs';

function fixture(extra={}){
  const calls=[],store={readiness:async()=>calls.push('ready'),expireStale:async()=>calls.push('sweep'),
    assertTarget:async target=>calls.push('target:'+target.clusterId),record:async id=>{calls.push('record:'+id);return {accepted:true}}};
  const worker=new HealthWorker({store,targets:[fixtureTarget('cluster-a')],probe:async()=>({auth:false,rest:false,storage:false,realtime:false,functions:false}),
    sourceFor:()=>({collect:async()=>({fixture:true})}),...extra});return {worker,store,calls};
}
test('health worker sweeps before collection, writes outside network work and exposes a safe fresh heartbeat',async()=>{
  let now=1000;const {worker,calls}=fixture({clock:()=>now});
  assert.equal(worker.status().ready,false);await worker.tick();
  assert.deepEqual(calls,['ready','sweep','target:cluster-a','record:cluster-a']);assert.equal(worker.status().ready,true);
  assert.equal(worker.status().heartbeatAt,1000);now+=120000;assert.equal(worker.status().ready,false);
  await worker.shutdown();assert.equal(worker.status().alive,false);
});
test('hanging source is bounded, cannot overlap a cycle or skip stale sweep and shuts down without leaking raw dependency errors',async()=>{
  const {worker,calls}=fixture({targetTimeoutMs:30,sourceFor:()=>({collect:()=>new Promise(()=>{})})});
  const running=worker.tick();assert.deepEqual(await worker.tick(),{skipped:true,reason:'ALREADY_RUNNING'});
  await running;assert.ok(calls.includes('sweep'));assert.equal(calls.some(c=>c.startsWith('record:')),false);
  assert.equal(worker.status().lastErrorCode,'HEALTH_TARGET_TIMEOUT');assert.equal(worker.status().ready,false);
  await worker.tick();assert.equal(calls.filter(c=>c==='sweep').length,2);await worker.shutdown();
});
test('one target failure does not prevent another target or sweep; fanout is bounded and DB failure makes readiness false',async()=>{
  let active=0,max=0;const {worker,store,calls}=fixture({targets:[fixtureTarget('cluster-a'),fixtureTarget('cluster-b'),fixtureTarget('cluster-c')],concurrency:2,
    sourceFor:target=>({collect:async()=>{active++;max=Math.max(max,active);await delay(10);active--;if(target.clusterId==='cluster-a')throw new Error('private database password');return {}}})});
  await worker.tick();assert.equal(max,2);assert.equal(worker.status().targetsSucceeded,2);assert.equal(worker.status().targetsFailed,1);
  assert.equal(worker.status().lastErrorCode,'HEALTH_DEPENDENCY_FAILED');assert.ok(!JSON.stringify(worker.status()).includes('password'));
  store.readiness=async()=>{throw new Error('DSN')};await worker.tick();assert.equal(worker.status().sweepSucceeded,false);
  assert.equal(calls.filter(c=>c==='sweep').length,1);await worker.shutdown();
});
test('worker shutdown cancels a pending source and the scheduler cannot start another cycle afterwards',async()=>{
  const {worker,calls}=fixture({intervalMs:100,targetTimeoutMs:10000,sourceFor:()=>({collect:()=>new Promise(()=>{})})});
  worker.start();await delay(10);assert.equal(worker.status().active,true);
  assert.equal((await worker.shutdown()).timedOut,false);await delay(120);
  assert.equal(calls.filter(c=>c==='sweep').length,1);assert.equal(worker.status().ready,false);
  assert.deepEqual(await worker.tick(),{skipped:true,reason:'STOPPING'});
});
test('worker requires real probe implementation, unique inventory targets and bounded budgets',()=>{
  for(const extra of [{probe:undefined},{targets:[]},{targets:[fixtureTarget('cluster-a'),fixtureTarget('cluster-a')]},
    {concurrency:0},{concurrency:5},{targetTimeoutMs:30000},{intervalMs:60000}])assert.throws(()=>fixture(extra),{code:'INVALID_HEALTH_WORKER'});
});
