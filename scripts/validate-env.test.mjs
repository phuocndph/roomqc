import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createECDH} from 'node:crypto';

const publicPoint=createECDH('prime256v1');publicPoint.generateKeys();
const env={...process.env,ROOMQC_ENV_FILE:'nonexistent-validation-fixture.env',ROOMQC_ENVIRONMENT:'vps',
 VITE_SUPABASE_URL:'https://roomqc.example',VITE_SUPABASE_PROJECT_ID:'pilot',
 VITE_VAPID_PUBLIC_KEY:publicPoint.getPublicKey().toString('base64url'),VITE_ENABLE_DEMO_DATA:'false',
 VITE_ROOMQC_DIRECTORY_ENABLED:'false',VITE_ROOMQC_CLUSTER_ORIGINS:''};
const anon='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
test('build rejects serialized backend objects before values reach Vite',()=>{
 for(const key of [`@{publishableKey=${anon}; serviceKey=private-fixture; jwtSecret=private-fixture}.publishableKey`,
  JSON.stringify({publishableKey:anon,serviceKey:'private-fixture'}),'sb_secret_private-fixture']){
  let rejected=false;
  try{execFileSync(process.execPath,['scripts/validate-env.mjs'],{env:{...env,VITE_SUPABASE_PUBLISHABLE_KEY:key},stdio:'pipe'})}
  catch(error){rejected=true;assert(!(String(error.stdout)+String(error.stderr)).includes('private-fixture'))}
  assert(rejected);
 }
});
test('build accepts a single anon JWT or publishable key',()=>{
 for(const key of [anon,'sb_publishable_fixture']){
  const output=execFileSync(process.execPath,['scripts/validate-env.mjs'],{env:{...env,VITE_SUPABASE_PUBLISHABLE_KEY:key},encoding:'utf8',stdio:'pipe'});
  assert.match(output,/Environment validated for vps/);
 }
});
