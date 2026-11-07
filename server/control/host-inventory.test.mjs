import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {hostInventoryArguments,readHostInventory,validateHostInventory} from './host-inventory.mjs';

const token='publishable-test-key',secret='service-private-marker',vapid='vapid-public-key';
const valid={version:1,credentials:[{ref:'cred-a',serviceKey:secret,publishableKey:token,vapidPublicKey:vapid}],inventory:[{
  id:'cluster-b',hostId:'vps-b',hostName:'VPS B',region:'sg',providerLabel:'Contabo',environment:'production',backendKind:'self_hosted',
  credentialRef:'cred-a',url:'https://cluster-b.example.invalid',internalUrl:'https://cluster-b.internal.invalid',approvedAddresses:['1.1.1.1'],frontendReady:false}]};

test('host inventory validates server-owned entries and returns a redacted operator projection',()=>{
  const result=validateHostInventory(valid);assert.equal(result.hostCount,1);assert.equal(result.candidateCount,1);assert.equal(result.hosts[0].id,'vps-b');
  assert.equal(result.candidates[0].credentialConfigured,true);assert.equal(result.candidates[0].preflightReady,false);
  assert.equal(result.secretsExposed,false);assert.equal(JSON.stringify(result).includes(secret),false);
  const ready=structuredClone(valid);ready.inventory[0].preflight={capturedAt:new Date().toISOString(),deploymentAllowed:true,diskFreePercent:42,dockerServerVersion:'29.1.3'};
  assert.equal(validateHostInventory(ready).candidates[0].preflightReady,true);
});
test('host inventory accepts local only behind explicit development flag and rejects unsafe inputs',()=>{
  const local=structuredClone(valid);local.inventory[0].environment='local';local.inventory[0].url='http://127.0.0.1:54321';local.inventory[0].internalUrl=null;
  assert.throws(()=>validateHostInventory(local),{code:'HOST_INVENTORY_INVALID'});
  assert.equal(validateHostInventory(local,{allowLocal:true}).candidateCount,1);
  const nonLocalLoopback=structuredClone(local);nonLocalLoopback.inventory[0].environment='staging';nonLocalLoopback.inventory[0].approvedAddresses=['127.0.0.1'];
  assert.throws(()=>validateHostInventory(nonLocalLoopback,{allowLocal:true}),{code:'HOST_INVENTORY_INVALID'});
  for(const changed of [
    {...valid,inventory:[{...valid.inventory[0],url:'http://203.0.113.10'}]},
    {...valid,inventory:[{...valid.inventory[0],hostId:'../escape'}]},
    {...valid,inventory:[{...valid.inventory[0],approvedAddresses:['127.0.0.1']}]},
    {...valid,inventory:[{...valid.inventory[0],preflight:{capturedAt:'invalid',deploymentAllowed:true,diskFreePercent:42}}]},
    {...valid,credentials:[{...valid.credentials[0],publishableKey:secret}]},
  ])assert.throws(()=>validateHostInventory(changed),{code:'HOST_INVENTORY_INVALID'});
});
test('host inventory requires candidate-compatible cluster IDs and exact CLI arguments',async()=>{
  const tooLong=structuredClone(valid);tooLong.inventory[0].id='a'.repeat(41);assert.throws(()=>validateHostInventory(tooLong),{code:'HOST_INVENTORY_NO_CANDIDATES'});
  const absolute=resolve(tmpdir(),'private','inventory.json');
  assert.deepEqual(hostInventoryArguments(['--inventory-file',absolute]),{inventoryFile:absolute});
  assert.deepEqual(hostInventoryArguments(['--help']),{help:true});
  for(const args of [[],['--inventory-file','relative.json'],['--inventory-file','a','extra']])assert.throws(()=>hostInventoryArguments(args),{code:'HOST_INVENTORY_ARGUMENTS_INVALID'});
  const root=await mkdtemp(join(tmpdir(),'roomqc-host-inventory-')),file=join(root,'inventory.json');
  try{await writeFile(file,JSON.stringify(valid),{mode:0o600});assert.equal((await readHostInventory(file)).candidateCount,1)}finally{await rm(root,{recursive:true,force:true})}
});
