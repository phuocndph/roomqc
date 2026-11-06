import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setupRotationMain,startSetupRotation} from './workers/setup-rotation-runtime.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function fixture(){
 const host=new EventEmitter(),rows=[],errors=[];
 Object.assign(host,{stdout:{write:s=>rows.push(JSON.parse(s))},stderr:{write:s=>errors.push(JSON.parse(s))},exit:()=>assert.fail('unexpected forced exit')});
 return {host,rows,errors,args:['--config-file',join(tmpdir(),'owned-rotation-policy.json'),'--allow-local']};
}
const runtime=shutdown=>({rotator:{policy:{instanceId:'owned-rotation'}},result:{action:'idle'},shutdown});
const noListeners=host=>{assert.equal(host.listenerCount('SIGTERM'),0);assert.equal(host.listenerCount('SIGINT'),0)};

test('startup signal is latched before start resolves; repeated signals drain once and remove handlers',async()=>{
 const f=fixture(),started=deferred();let signal,drains=0;
 const running=setupRotationMain(f.args,{}, {host:f.host,start:async(_args,options)=>{
  signal=options.signal;assert.equal(f.host.listenerCount('SIGTERM'),1);return started.promise;
 }});
 f.host.emit('SIGTERM');f.host.emit('SIGINT');assert.equal(signal.aborted,true);
 started.resolve(runtime(async()=>{drains++}));await running;
 assert.equal(drains,1);assert.equal(f.host.exitCode,0);assert.deepEqual(f.rows.map(r=>r.type),['setup_rotation_stopping','setup_rotation_stopped']);
 assert.deepEqual(f.errors,[]);noListeners(f.host);
});

test('genuine startup error racing with SIGTERM remains a failure with sanitized output',async()=>{
 const f=fixture(),started=deferred();
 const running=setupRotationMain(f.args,{}, {host:f.host,start:()=>started.promise});
 f.host.emit('SIGTERM');started.reject(Object.assign(new Error('private-dsn'),{code:'SETUP_ROTATION_CONFIG_CHANGED'}));await running;
 assert.equal(f.host.exitCode,1);assert.deepEqual(f.errors,[{type:'setup_rotation_unavailable',code:'SETUP_ROTATION_CONFIG_CHANGED'}]);
 assert.ok(!JSON.stringify(f).includes('private-dsn'));noListeners(f.host);
});

test('explicit startup cancellation exits cleanly; pre-aborted start cannot read configuration',async()=>{
 const f=fixture(),started=deferred();
 const running=setupRotationMain(f.args,{}, {host:f.host,start:()=>started.promise});
 f.host.emit('SIGINT');started.reject(Object.assign(new Error('stopped'),{code:'SETUP_ROTATION_STOPPED'}));await running;
 assert.equal(f.host.exitCode,0);assert.deepEqual(f.errors,[]);noListeners(f.host);
 const cancel=new AbortController();cancel.abort();
 await assert.rejects(()=>startSetupRotation({configFile:'unreadable'},{signal:cancel.signal}),{code:'SETUP_ROTATION_STOPPED'});
});

test('once and rejected startup remove only their own signal listeners',async()=>{
 for(const failure of [false,true]){
  const f=fixture(),existing=()=>{};f.host.on('SIGTERM',existing);let drains=0;
  await setupRotationMain([...f.args,'--once'],{}, {host:f.host,start:async()=>{
   if(failure)throw new Error('private-config');return runtime(async()=>{drains++});
  }});
  assert.equal(f.host.listenerCount('SIGTERM'),1);assert.equal(f.host.listeners('SIGTERM')[0],existing);
  assert.equal(f.host.listenerCount('SIGINT'),0);assert.equal(f.host.exitCode,failure?1:0);assert.equal(drains,failure?0:1);
 }
});

test('daemon signal after startup waits for in-flight drain and reports shutdown failure',async()=>{
 for(const failure of [false,true]){
  const f=fixture(),drained=deferred();let calls=0;
  await setupRotationMain(f.args,{}, {host:f.host,start:async()=>runtime(async()=>{calls++;await drained.promise;if(failure)throw Error('private')})});
  f.host.emit('SIGTERM');await Promise.resolve();assert.equal(calls,1);assert.equal(f.host.exitCode,undefined);
  drained.resolve();await new Promise(r=>setImmediate(r));
  assert.equal(f.host.exitCode,failure?1:0);noListeners(f.host);
 }
});
