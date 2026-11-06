import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadRuntimeConfig} from './config.mjs';
const fixture=()=>({NODE_ENV:'test',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_EMAIL_HASH_KEY:'k'.repeat(32),
 ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'public',serviceKey:'private-fixture',vapidPublicKey:'public-vapid',maxWorkspaces:10}])});
test('API loads only its bounded private DSN file, preserves env compatibility and never mutates input env',async t=>{
 const root=await mkdtemp(join(tmpdir(),'roomqc-api-dsn-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=join(root,'api.dsn'),dsn='postgresql://fixture:synthetic-secret@localhost/control';await writeFile(file,dsn+'\n',{mode:0o600});
 const env={...fixture(),ROOMQC_CONTROL_DATABASE_URL_FILE:file},before=structuredClone(env);
 const loaded=await loadRuntimeConfig(env);assert.equal(loaded.databaseUrl,dsn);assert.equal(loaded.signupEnabled,false);assert.deepEqual(env,before);
 assert.equal((await loadRuntimeConfig({...fixture(),ROOMQC_CONTROL_DATABASE_URL:dsn})).databaseUrl,dsn);
 for(const change of [{ROOMQC_CONTROL_DATABASE_URL:dsn},{ROOMQC_CONTROL_DATABASE_URL_FILE:''},{ROOMQC_CONTROL_DATABASE_URL_FILE:'relative'},
  {ROOMQC_CONTROL_DATABASE_URL_FILE:join(root,'absent')},{NODE_TLS_REJECT_UNAUTHORIZED:'0'}]){
  await assert.rejects(()=>loadRuntimeConfig({...env,...change}),e=>e.code==='CONTROL_DATABASE_SECRET_INVALID'&&!e.message.includes('synthetic-secret'));
 }
 for(const value of ['','a'.repeat(8193),'postgresql://fixture:synthetic-secret@remote.invalid/control?sslmode=disable',
  'postgresql://fixture:synthetic-secret@localhost/control?sslmode=verify-full&options=override']){
  await writeFile(file,value,{mode:0o600});await assert.rejects(()=>loadRuntimeConfig(env),{code:'CONTROL_DATABASE_SECRET_INVALID'});
 }
});
