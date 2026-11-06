import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createMetricsResponseRelay} from './testing/metrics-response-relay.mjs';

async function fixture(t,options={}){
  const bytes=Buffer.from('{"wire":"unchanged","nested":[1,2,3]}\n');let calls=0;
  const upstream=http.createServer((req,res)=>{calls++;res.writeHead(options.upstreamStatus??200,{'content-type':'application/json'});res.end(bytes)});
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const token=randomBytes(32).toString('hex');
  const relay=await createMetricsResponseRelay({token,metricsPort:0,controlPort:0,holdMs:1000,armMs:1500,...options,
    fetchImpl:(url,init)=>{assert.match(url,/^http:\/\/managed-prometheus:9090\/api\/v1\/query\?/);
      return fetch('http://127.0.0.1:'+upstream.address().port+new URL(url).pathname+new URL(url).search,init)}});
  t.after(async()=>{await relay.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve))});
  const control=async(path,body,authorization='Bearer '+token)=>{
    const response=await fetch('http://127.0.0.1:'+relay.controlPort+path,{method:body===undefined?'GET':'POST',
      headers:{authorization,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,value:await response.json()};
  };
  const status=async()=>(await control('/status')).value;
  const arm=async()=>{const current=await status();return (await control('/arm',{epoch:current.epoch,generation:current.generation})).value};
  const release=value=>control('/release',{epoch:value.epoch,generation:value.generation});
  const query=async()=>{const response=await fetch('http://127.0.0.1:'+relay.metricsPort+'/api/v1/query?query=fixture');
    return {status:response.status,bytes:Buffer.from(await response.arrayBuffer())}};
  const held=async()=>{const end=Date.now()+800;while(Date.now()<end){const value=await status();if(value.phase==='held')return value;await delay(5)}throw new Error('HELD_NOT_OBSERVED')};
  return {relay,bytes,control,status,arm,release,query,held,token,calls:()=>calls};
}
test('metrics relay is loopback and fixed-upstream, forwards exact status and bytes without exposing its control token',async t=>{
  const f=await fixture(t),result=await f.query();assert.equal(result.status,200);assert.deepEqual(result.bytes,f.bytes);
  assert.equal(f.calls(),1);assert.equal((await f.control('/status',undefined,'Bearer '+'0'.repeat(64))).status,403);
  assert.equal((await f.control('/unknown')).status,404);
  assert.equal(JSON.stringify(await f.status()).includes(f.token),false);
  const bad=await fetch('http://127.0.0.1:'+f.relay.metricsPort+'/api/v1/labels');assert.equal(bad.status,404);assert.equal(f.calls(),1);
  assert.equal((await f.release(await f.status())).status,200,'idle release must be safe');
});
test('metrics response gate holds only one authentic response and releases identical bytes with generation checks',async t=>{
  const f=await fixture(t),armed=await f.arm();let finished=false;
  const pending=f.query().then(value=>{finished=true;return value});const held=await f.held();
  assert.equal(held.generation,armed.generation);assert.equal(held.upstreamStatus,200);assert.equal(held.byteLength,f.bytes.length);
  assert.equal(held.sha256,createHash('sha256').update(f.bytes).digest('hex'));assert.equal(finished,false);
  assert.deepEqual((await f.query()).bytes,f.bytes,'concurrent queries are not all held');
  assert.equal((await f.control('/arm',{epoch:held.epoch,generation:held.generation})).status,409);
  assert.equal((await f.release({...held,generation:held.generation-1})).status,409);assert.equal((await f.status()).phase,'held');
  assert.equal((await f.release(held)).status,200);assert.deepEqual((await pending).bytes,f.bytes);
  assert.equal((await f.status()).releaseReason,'operator');assert.equal((await f.release(held)).status,200);
});
test('old generation or worker epoch cannot release a later held response',async t=>{
  const f=await fixture(t),first=await f.arm();await f.release(first);await f.arm();const pending=f.query();const second=await f.held();
  assert.equal((await f.release(first)).status,409);
  assert.equal((await f.release({...second,epoch:randomBytes(16).toString('hex')})).status,409);
  assert.equal((await f.status()).phase,'held');await f.release(second);assert.deepEqual((await pending).bytes,f.bytes);
});
test('held and unclaimed gates automatically release within bounded real time',async t=>{
  const f=await fixture(t,{holdMs:40,armMs:60});await f.arm();const pending=f.query();await f.held();
  assert.deepEqual((await pending).bytes,f.bytes);assert.equal((await f.status()).releaseReason,'hold_timeout');
  await f.arm();await delay(90);assert.equal((await f.status()).releaseReason,'arm_timeout');
});
test('non-success upstream responses are forwarded but never count as an observed held success',async t=>{
  const f=await fixture(t,{upstreamStatus:503});await f.arm();const response=await f.query();
  assert.equal(response.status,503);assert.deepEqual(response.bytes,f.bytes);assert.equal((await f.status()).phase,'armed');
});
test('client disconnect releases its own held gate and shutdown is bounded and idempotent',async t=>{
  const f=await fixture(t);await f.arm();const aborted=new AbortController();
  const pending=fetch('http://127.0.0.1:'+f.relay.metricsPort+'/api/v1/query?query=fixture',{signal:aborted.signal}).catch(()=>null);
  await f.held();aborted.abort();await pending;
  const end=Date.now()+500;while((await f.status()).phase==='held'&&Date.now()<end)await delay(5);
  assert.equal((await f.status()).releaseReason,'client_closed');
  await f.arm();const stopped=f.query().catch(()=>null);await f.held();await f.relay.close();await f.relay.close();await stopped;
});
test('relay rejects unbounded configuration and unexpected control bodies',async t=>{
  await assert.rejects(createMetricsResponseRelay({token:'x'}),{code:'METRICS_RELAY_CONFIG_INVALID'});
  await assert.rejects(createMetricsResponseRelay({token:'0'.repeat(64),holdMs:6001}),{code:'METRICS_RELAY_CONFIG_INVALID'});
  const f=await fixture(t),view=await f.status();
  assert.equal((await f.control('/arm',{epoch:view.epoch,generation:view.generation,url:'http://other.invalid'})).status,400);
  assert.equal((await f.control('/arm',{epoch:view.epoch,generation:view.generation,payload:'x'.repeat(1100)})).status,400);
  assert.equal((await f.status()).phase,'idle');
});
