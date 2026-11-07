import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request as httpRequest} from 'node:http';
import {createRequestGate} from './request-gate.mjs';
import {createControlServer} from './app.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
const until=async(predicate)=>{const deadline=Date.now()+3000;while(!predicate()){
  assert.ok(Date.now()<deadline,'Timed out waiting for the owned HTTP handler');await new Promise(resolve=>setTimeout(resolve,5));
}};
test('request budget validates bounds and caps active work, queue memory and wait time',async()=>{
  for(const config of [{maxActive:0},{maxQueued:-1},{maxQueued:1025},{queueTimeoutMs:0},{maxActive:1.5}])assert.throws(()=>createRequestGate(config));
  const gate=createRequestGate({maxActive:1,maxQueued:1,queueTimeoutMs:25}),release=await gate.acquire();
  const waiting=gate.acquire();assert.equal(gate.snapshot().queued,1);
  await assert.rejects(gate.acquire(),{code:'CONTROL_OVERLOADED'});
  await assert.rejects(waiting,{code:'CONTROL_OVERLOADED'});
  assert.equal(gate.snapshot().active,1);assert.equal(gate.snapshot().queued,0);
  release();release();assert.equal(gate.snapshot().active,0);
  const recovered=await gate.acquire();assert.equal(gate.snapshot().active,1);recovered();
});
test('queued cancellation, FIFO handoff and draining never leak or overcommit a slot',async()=>{
  const gate=createRequestGate({maxActive:1,maxQueued:3,queueTimeoutMs:1000}),first=await gate.acquire(),cancel=new AbortController();
  const aborted=gate.acquire({signal:cancel.signal}),second=gate.acquire(),third=gate.acquire();
  cancel.abort();await assert.rejects(aborted,{code:'CONTROL_REQUEST_CANCELLED'});
  first();const next=await second;assert.equal(gate.snapshot().active,1);assert.equal(gate.snapshot().queued,1);
  gate.close();await assert.rejects(third,{code:'CONTROL_OVERLOADED'});await assert.rejects(gate.acquire(),{code:'CONTROL_OVERLOADED'});
  next();assert.equal(gate.snapshot().active,0);assert.equal(gate.snapshot().queued,0);
});
test('active cancellation cannot free a slot before the real handler settles',async()=>{
  const gate=createRequestGate({maxActive:1,maxQueued:0}),controller=new AbortController(),release=await gate.acquire({signal:controller.signal});
  controller.abort();assert.equal(gate.snapshot().active,1);await assert.rejects(gate.acquire(),{code:'CONTROL_OVERLOADED'});
  release();assert.equal(gate.snapshot().active,0);
});
test('real HTTP overload/queue timeout occurs before store effects, livez stays responsive, and recovery drains FIFO',async()=>{
  const barrier=deferred(),entered=deferred(),calls=[];
  const lifecycle={draining:false},config={publicOrigin:'http://localhost:8082',requestBudget:{maxActive:1,maxQueued:1,queueTimeoutMs:50}};
  const store={workspace:async slug=>{calls.push(slug);entered.resolve();if(slug==='first')await barrier.promise;
    return{id:'fixture-id',slug,display_name:'Fixture',cluster_id:'cluster-a',api_url:'https://fixture.invalid',status:'active',routing_version:1}}};
  const server=createControlServer({config,store,gateway:{},lifecycle});server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port+'/api/control';
  try{
    const first=fetch(base+'/workspaces/first/bootstrap');await entered.promise;
    const queued=fetch(base+'/workspaces/queued/bootstrap');
    const timed=await queued;assert.equal(timed.status,503);assert.equal((await timed.json()).error,'CONTROL_OVERLOADED');assert.equal(timed.headers.get('retry-after'),'1');
    assert.deepEqual(calls,['first']);assert.equal((await fetch(base+'/livez')).status,200);
    barrier.resolve();assert.equal((await first).status,200);assert.equal((await fetch(base+'/workspaces/recovered/bootstrap')).status,200);
    assert.deepEqual(calls,['first','recovered']);assert.equal(lifecycle.requestCapacity().requests.active,0);
  }finally{barrier.resolve();lifecycle.stopAdmission();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('readiness has its own bounded lane, and draining rejects queued work without a store call',async()=>{
  const barrier=deferred(),entered=deferred(),readyBarrier=deferred(),readyEntered=deferred(),calls=[];
  const lifecycle={draining:false},config={requestBudget:{maxActive:1,maxQueued:1,queueTimeoutMs:1000}};
  const store={workspace:async slug=>{calls.push(slug);entered.resolve();await barrier.promise;throw new Error('Owned unavailable');},
    readiness:async()=>{readyEntered.resolve();await readyBarrier.promise;return{status:'ready'}}};
  const server=createControlServer({config,store,gateway:{},lifecycle});server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port+'/api/control';
  try{
    const first=fetch(base+'/workspaces/first/bootstrap');await entered.promise;
    const ready=fetch(base+'/readyz');await readyEntered.promise;
    assert.equal((await fetch(base+'/readyz')).status,503);assert.equal((await fetch(base+'/livez')).status,200);
    const queued=fetch(base+'/workspaces/queued/bootstrap');
    // The request event is authoritative; wait until the queue is actually populated.
    await until(()=>lifecycle.requestCapacity().requests.queued===1);
    lifecycle.draining=true;lifecycle.stopAdmission();
    assert.equal((await queued).status,503);assert.deepEqual(calls,['first']);
    barrier.resolve();readyBarrier.resolve();await first;await ready;
    assert.equal(lifecycle.requestCapacity().requests.active,0);assert.equal(lifecycle.requestCapacity().readiness.active,0);
  }finally{barrier.resolve();readyBarrier.resolve();lifecycle.stopAdmission();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

test('real HTTP disconnect keeps active work counted; a queued disconnect never enters the store',async()=>{
  const barrier=deferred(),entered=deferred(),calls=[],lifecycle={draining:false};
  const store={workspace:async slug=>{calls.push(slug);entered.resolve();if(slug==='active')await barrier.promise;
    return{id:'owned',slug,status:'active',cluster_id:'cluster-a',api_url:'https://fixture.invalid'}}};
  const server=createControlServer({config:{requestBudget:{maxActive:1,maxQueued:1,queueTimeoutMs:1000}},store,gateway:{},lifecycle});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port+'/api/control';
  const start=slug=>{const req=httpRequest(base+'/workspaces/'+slug+'/bootstrap');req.on('error',()=>{});req.end();return req};
  let active,queued;
  try{
    active=start('active');await entered.promise;
    queued=start('cancelled');await until(()=>lifecycle.requestCapacity().requests.queued===1);
    const close=new Promise(resolve=>queued.once('close',resolve));queued.destroy();await close;await until(()=>lifecycle.requestCapacity().requests.queued===0);
    const disconnected=new Promise(resolve=>active.once('close',resolve));active.destroy();await disconnected;
    assert.equal(lifecycle.requestCapacity().requests.active,1);assert.deepEqual(calls,['active']);
    const waiting=fetch(base+'/workspaces/next/bootstrap');await until(()=>lifecycle.requestCapacity().requests.queued===1);
    const refused=await fetch(base+'/workspaces/overflow/bootstrap');assert.equal(refused.status,503);
    assert.equal((await refused.json()).error,'CONTROL_OVERLOADED');assert.deepEqual(calls,['active']);
    barrier.resolve();assert.equal((await waiting).status,200);await until(()=>lifecycle.requestCapacity().requests.active===0);
    assert.deepEqual(calls,['active','next']);
  }finally{active?.destroy();queued?.destroy();barrier.resolve();lifecycle.stopAdmission();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
