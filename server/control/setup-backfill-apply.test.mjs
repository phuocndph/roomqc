import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupBackfillCommandKey,SetupBackfillApplier} from './setup-backfill-apply.mjs';

test('setup backfill apply command keys bind a persisted batch and workspace without depending on mutable results',()=>{
  const batch=randomUUID(),workspace=randomUUID(),key=setupBackfillCommandKey(batch,workspace);
  assert.equal(key,setupBackfillCommandKey(batch.toUpperCase(),workspace.toUpperCase()));
  assert.notEqual(key,setupBackfillCommandKey(randomUUID(),workspace));assert.notEqual(key,setupBackfillCommandKey(batch,randomUUID()));
  assert.match(key,/^[a-f0-9-]{14}8[a-f0-9-]+$/);
  assert.throws(()=>setupBackfillCommandKey('bad',workspace),{code:'INVALID_SETUP_BACKFILL_APPLY'});
});

test('setup backfill apply rejects malformed or out-of-scope commands before SQL or remote access',async()=>{
  let calls=0;const pool={connect(){calls++},query(){calls++}},binding={clusterId:'cluster-a',approvalId:randomUUID(),epoch:1,envelopeDigest:'a'.repeat(64),credentialRef:'cluster-a'};
  const store=new SetupBackfillApplier(pool,{expected:{systemIdentifier:'1',databaseOid:'2',databaseName:'owned',role:'owned'},bindings:[{...binding,privateInput:'not-journal-data'}],gateways:[]});
  assert.deepEqual(store.bindings.get('cluster-a'),binding);
  const command={key:randomUUID(),reportSha256:'b'.repeat(64),item:{workspaceId:randomUUID(),clusterId:'cluster-a',routingVersion:1,snapshotSha256:'c'.repeat(64),group:'dispatch_pending'}};
  for(const input of [{...command,key:'invalid'},{...command,reportSha256:'bad'},{...command,item:{...command.item,clusterId:'cluster-b'}},
    {...command,item:{...command.item,routingVersion:0}},{...command,item:{...command.item,group:'activate-anyway'}}])
    await assert.rejects(()=>store.apply(input),{code:'INVALID_SETUP_BACKFILL_APPLY'});
  assert.equal(calls,0);
});
