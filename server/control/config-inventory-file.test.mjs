import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadRuntimeConfig} from './config.mjs';

const base={NODE_ENV:'development',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_PUBLIC_URL:'http://localhost:8082',
  ROOMQC_CONTROL_DATABASE_URL:'postgresql://control:pass@127.0.0.1:5432/control',ROOMQC_CONTROL_EMAIL_HASH_KEY:'x'.repeat(40),
  ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'cluster-a',url:'http://localhost:54321',publishableKey:'pk',serviceKey:'secret',vapidPublicKey:'vapid',maxWorkspaces:10}]),
  ROOMQC_RESOURCE_ENVIRONMENT:'local'};
const document={version:1,inventory:[{id:'cluster-a',hostId:'host-a',hostName:'Host A',environment:'local',backendKind:'self_hosted',credentialRef:'cred-a',url:'http://localhost:54321',approvedAddresses:['127.0.0.1']}],credentials:[{ref:'cred-a',publishableKey:'pk',serviceKey:'secret',vapidPublicKey:'vapid'}]};

test('runtime config loads a private inventory document and keeps credentials server-side',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-config-inventory-')),file=join(root,'inventory.json');
  try{
    await writeFile(file,JSON.stringify(document),{mode:0o600});
    const config=await loadRuntimeConfig({...base,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{...JSON.parse(base.ROOMQC_CONTROL_CLUSTERS)[0],publishableKey:'pk',serviceKey:'secret'}]),ROOMQC_CONTROL_INVENTORY_FILE:file});
    assert.equal(config.inventory.get('cluster-a').hostId,'host-a');assert.equal(config.credentials.get('cred-a').serviceKey,'secret');
  }finally{await rm(root,{recursive:true,force:true})}
});

test('runtime config rejects inline inventory mixed with the private document',async()=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-config-inventory-')),file=join(root,'inventory.json');
  try{
    await writeFile(file,JSON.stringify(document),{mode:0o600});
    await assert.rejects(()=>loadRuntimeConfig({...base,ROOMQC_CONTROL_INVENTORY_FILE:file,ROOMQC_CONTROL_INVENTORY:'[]'}),{code:'CONTROL_INVENTORY_FILE_INVALID'});
  }finally{await rm(root,{recursive:true,force:true})}
});
