import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {restoredRotationEvents,rotationJournalProgram} from './roomqc-restored-rotation-worker.mjs';
test('restored daemon evidence rejects a review failure, mixed identity, or non-JSON output',()=>{
 const event={type:'setup_rotation_cycle',instanceId:'recovery-test',action:'idle'};
 assert.equal(restoredRotationEvents(JSON.stringify(event),'recovery-test').length,1);
 for(const logs of [JSON.stringify({...event,action:'review',code:'SETUP_ROTATION_DEPENDENCY_FAILED'}),
  JSON.stringify({...event,instanceId:'source-production'}),'not JSON']){
  assert.throws(()=>restoredRotationEvents(logs,'recovery-test'));
 }
});
test('restart evidence accepts an interrupted cycle only between the shutdown signal and drain receipt',()=>{
 const event=(type,action)=>JSON.stringify({type,instanceId:'recovery-test',...(action?{action}:{})});
 const stopping=event('setup_rotation_cycle','stopping');
 const valid=[event('setup_rotation_cycle','idle'),event('setup_rotation_stopping'),stopping,
  event('setup_rotation_stopped'),event('setup_rotation_cycle','idle')].join('\n');
 assert.equal(restoredRotationEvents(valid,'recovery-test').length,5);
 assert.throws(()=>restoredRotationEvents(stopping,'recovery-test'));
 assert.throws(()=>restoredRotationEvents(event('setup_rotation_stopped'),'recovery-test'));
});
test('restored journal reader compiles without interpreting an injected instance identifier',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','--check'],{
  input:rotationJournalProgram('recovery-quote"\nnot code'),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);
});
