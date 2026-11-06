import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {workspaceRecheckCommand,workspaceRecheckLookup,workspaceRecheckReceipt} from './setup-recheck.mjs';

test('workspace recheck parser preserves exact intent and rejects extra body/query fields',()=>{
  const target=randomUUID(),key=randomUUID(),body={expectedVersion:1,expectedSnapshotSha256:'a'.repeat(64),reason:'  Inspect registration  '};
  const value=workspaceRecheckCommand(target.toUpperCase(),body,key.toUpperCase());
  assert.equal(value.target,target);assert.equal(value.key,key);assert.equal(value.reason,'Inspect registration');
  assert.equal(value.payloadHash,workspaceRecheckCommand(target,{...body,reason:value.reason},key).payloadHash);
  for(const bad of [{...body,ownerId:randomUUID()},{...body,expectedVersion:0},{...body,reason:'bad'},{...body,expectedSnapshotSha256:'A'.repeat(64)},null])
    assert.throws(()=>workspaceRecheckCommand(target,bad,key),{code:'INVALID_WORKSPACE_RECHECK'});
  assert.deepEqual(workspaceRecheckLookup(target,key),{target,key});
  assert.throws(()=>workspaceRecheckLookup(target,key,new URLSearchParams('key='+key)),{code:'INVALID_WORKSPACE_RECHECK'});
});
test('workspace recheck receipt filters private data and refuses unproven outcomes',()=>{
  const value={commandId:randomUUID(),requestKey:randomUUID(),status:'succeeded',workspaceId:randomUUID(),clusterId:'cluster-a',routingVersion:1,
    outcome:'queued',reasonCode:'SETUP_RECHECK_QUEUED',jobId:randomUUID(),recordedAt:new Date().toISOString(),secret:'private-marker'};
  assert.equal(JSON.stringify(workspaceRecheckReceipt(value)).includes('private-marker'),false);
  for(const bad of [{...value,status:'started'},{...value,outcome:'success'},{...value,jobId:'bad'},{...value,requestKey:null},{...value,reasonCode:'private error'}])
    assert.throws(()=>workspaceRecheckReceipt(bad),{code:'WORKSPACE_RECHECK_RESULT_UNAVAILABLE'});
});
