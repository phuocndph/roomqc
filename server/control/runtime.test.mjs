import test from 'node:test';
import assert from 'node:assert/strict';
import { startControl } from './server.mjs';
import { ControlError } from './store.mjs';

test('liveness survives database failures; readiness and legacy health alias fail closed',async()=>{
  let ready=false,closed=0;
  const config={host:'127.0.0.1',port:0,publicOrigin:'http://localhost:8082'};
  const store={readiness:async()=>{if(!ready)throw new ControlError(503,'CONTROL_SCHEMA_PENDING','Pending');return{status:'ready'}},close:async()=>{closed++}};
  const runtime=await startControl(config,{store,gateway:{}});
  const base=`http://127.0.0.1:${runtime.server.address().port}/api/control`;
  try {
    assert.equal((await fetch(base+'/livez')).status,200);
    for(const path of ['/readyz','/healthz']) {
      const response=await fetch(base+path);assert.equal(response.status,503);
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    ready=true;
    assert.deepEqual(await(await fetch(base+'/readyz')).json(),{status:'ready'});
    runtime.lifecycle.draining=true;
    assert.equal((await fetch(base+'/readyz')).status,503);
    assert.equal((await fetch(base+'/livez')).status,200);
  }finally{await Promise.all([runtime.shutdown(),runtime.shutdown()])}
  assert.equal(closed,1);
});

test('graceful shutdown waits for an accepted request before closing the database',async()=>{
  let release,entered,dbClosed=false;
  const gate=new Promise(resolve=>{release=resolve});
  const started=new Promise(resolve=>{entered=resolve});
  const store={readiness:async()=>{entered();await gate;assert.equal(dbClosed,false);return{status:'ready'}},close:async()=>{dbClosed=true}};
  const runtime=await startControl({host:'127.0.0.1',port:0,shutdownTimeoutMs:1000},{store,gateway:{}});
  const request=fetch(`http://127.0.0.1:${runtime.server.address().port}/api/control/readyz`);
  await started;
  const stopped=runtime.shutdown();assert.equal(runtime.lifecycle.draining,true);assert.equal(dbClosed,false);
  release();assert.equal((await request).status,200);
  assert.deepEqual(await stopped,{timedOut:false});assert.equal(dbClosed,true);
});

test('a stalled request cannot hold shutdown past its deadline',async()=>{
  let enter,release,closed=false;
  const entered=new Promise(resolve=>{enter=resolve}),gate=new Promise(resolve=>{release=resolve});
  const runtime=await startControl({host:'127.0.0.1',port:0,shutdownTimeoutMs:100},{
    store:{readiness:async()=>{enter();await gate;return{status:'ready'}},close:async()=>{closed=true}},gateway:{},
  });
  const request=fetch(`http://127.0.0.1:${runtime.server.address().port}/api/control/readyz`).catch(error=>error);
  await entered;
  const started=performance.now();const result=await runtime.shutdown();
  assert.equal(result.timedOut,true);assert.equal(closed,true);assert.ok(performance.now()-started<1500);
  assert.ok(await request instanceof Error);release();
});
