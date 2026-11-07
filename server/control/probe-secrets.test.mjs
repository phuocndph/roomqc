import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,symlink,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProbeKeyring,loadProbeKeyring} from './probe-secrets.mjs';
import {validateProbeBundle,probeBinding} from './probe-credentials.mjs';
import {refreshProbeSession} from './probe-session.mjs';
import {syntheticToken,syntheticBundle,syntheticRelease} from './probe-test-fixtures.mjs';
const cluster={id:'cluster-a',url:'http://127.0.0.1:54321'};
const context={clusterId:'cluster-a',credentialRef:'cluster-a',bindingHash:'f'.repeat(64),revision:1};
test('probe secrets: randomized AES-GCM, context binding, integrity, key overlap and sanitized failures',()=>{
  const key=randomBytes(32),ring=new ProbeKeyring({activeKeyId:'key-one',keys:new Map([['key-one',key]])}),bundle=syntheticBundle();
  const a=ring.seal(bundle,context),b=ring.seal(bundle,context);assert.notEqual(a.ciphertext,b.ciphertext);
  assert.deepEqual(ring.unseal(a,context),bundle);assert.ok(!JSON.stringify(a).includes(bundle.auth.refreshToken));
  for(const field of ['revision','clusterId','credentialRef','bindingHash']){
    const changed={...context,[field]:field==='revision'?2:field==='bindingHash'?'e'.repeat(64):'cluster-b'};
    assert.throws(()=>ring.unseal(a,changed),{code:'PROBE_SECRET_INVALID'});
  }
  for(const field of ['nonce','tag','ciphertext']){
    const changed={...a,[field]:(a[field][0]==='A'?'B':'A')+a[field].slice(1)};
    assert.throws(()=>ring.unseal(changed,context),{code:'PROBE_SECRET_INVALID'});
  }
  const next=new ProbeKeyring({activeKeyId:'key-two',keys:new Map([['key-one',key],['key-two',randomBytes(32)]])});
  assert.deepEqual(next.unseal(a,context),bundle);assert.equal(next.seal(bundle,context).keyId,'key-two');
  const alias=new ProbeKeyring({activeKeyId:'key-two',keys:new Map([['key-one',key],['key-two',key]])});
  assert.throws(()=>alias.unseal({...a,keyId:'key-two'},context),{code:'PROBE_SECRET_INVALID'});
  const lost=new ProbeKeyring({activeKeyId:'key-two',keys:new Map([['key-two',randomBytes(32)]])});
  assert.throws(()=>lost.unseal(a,context),{code:'PROBE_KEY_UNAVAILABLE'});
  assert.equal(JSON.stringify(ring),'{}','key material is not enumerable');
});
test('probe secrets: file-only keyring rejects invalid shape and unsafe file permissions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'roomqc-probe-key-test-')),file=join(dir,'key.json');
  try{
    await assert.rejects(()=>loadProbeKeyring('relative.json'),{code:'PROBE_KEYRING_INVALID'});
    await writeFile(file,JSON.stringify({version:1,activeKeyId:'key-one',keys:{'key-one':randomBytes(32).toString('hex')}}),{mode:0o600});
    const ring=await loadProbeKeyring(file);assert.deepEqual(ring.unseal(ring.seal({check:true},context),context),{check:true});
    if(process.platform!=='win32'){
      await chmod(file,0o644);await assert.rejects(()=>loadProbeKeyring(file),{code:'PROBE_KEYRING_INVALID'});await chmod(file,0o600);
      const alias=join(dir,'alias');await symlink(file,alias);await assert.rejects(()=>loadProbeKeyring(alias),{code:'PROBE_KEYRING_INVALID'});
    }
    await writeFile(file,JSON.stringify({version:1,activeKeyId:'key-one',keys:{'key-one':'not-a-key'}}));
    await assert.rejects(()=>loadProbeKeyring(file),{code:'PROBE_KEYRING_INVALID'});
  }finally{await rm(dir,{recursive:true,force:true})}
});
test('probe credentials: reject privileged keys, expired/wrong-role/wrong-session bundles and unstable binding',()=>{
  const bundle=syntheticBundle();assert.ok(validateProbeBundle(bundle));
  const bad=edit=>{const value=structuredClone(bundle);edit(value);assert.throws(()=>validateProbeBundle(value),{code:'PROBE_BUNDLE_INVALID'})};
  bad(v=>v.credential.publishableKey='sb_secret_test');bad(v=>v.credential.publishableKey=syntheticToken({role:'service_role'}));
  bad(v=>v.auth.sessionId=randomUUID());bad(v=>v.auth.password='forbidden');bad(v=>v.auth.refreshToken='');
  bad(v=>v.auth.token=syntheticToken({role:'service_role'}));
  bad(v=>v.credential.token=syntheticToken({role:'roomqc_control_probe',exp:1}));
  const expired=syntheticBundle({expiresIn:-1});assert.throws(()=>validateProbeBundle(expired),{code:'PROBE_BUNDLE_INVALID'});
  assert.ok(validateProbeBundle(expired,{allowExpiredAuth:true}));
  const a=probeBinding(cluster,syntheticRelease),b=probeBinding({...cluster,internalUrl:'http://localhost:54321'},syntheticRelease);
  assert.notEqual(a.bindingHash,b.bindingHash);
  assert.notEqual(a.bindingHash,probeBinding(cluster,{...syntheticRelease,artifactDigest:'e'.repeat(64)}).bindingHash);
});
test('probe refresh: fixed public-key endpoint; same identity/session; no retries or leaked provider errors',async()=>{
  const bundle=syntheticBundle(),next=syntheticBundle({userId:bundle.auth.userId,sessionId:bundle.auth.sessionId});
  let calls=0;
  const fetcher=async(url,init,target)=>{
    calls++;assert.equal(url,cluster.url+'/auth/v1/token?grant_type=refresh_token');assert.equal(target,cluster);
    assert.equal(init.headers.apikey,bundle.credential.publishableKey);assert.equal(init.headers.authorization,undefined);
    assert.deepEqual(JSON.parse(init.body),{refresh_token:bundle.auth.refreshToken});assert.equal(init.redirect,'error');
    return {ok:true,json:async()=>({access_token:next.auth.token,refresh_token:next.auth.refreshToken,
      user:{id:bundle.auth.userId,email_confirmed_at:new Date().toISOString()}})};
  };
  assert.deepEqual((await refreshProbeSession({},cluster,bundle,{fetcher})).auth,next.auth);assert.equal(calls,1);
  await assert.rejects(()=>refreshProbeSession({},cluster,bundle,{fetcher:async()=>{calls++;throw new Error('SECRET '+bundle.auth.refreshToken)}}),
    e=>e.code==='PROBE_REFRESH_UNCERTAIN'&&!e.message.includes(bundle.auth.refreshToken));assert.equal(calls,2);
  const wrong=syntheticBundle({userId:bundle.auth.userId});
  await assert.rejects(()=>refreshProbeSession({},cluster,bundle,{fetcher:async()=>({ok:true,json:async()=>({
    access_token:wrong.auth.token,refresh_token:wrong.auth.refreshToken,user:{id:bundle.auth.userId,email_confirmed_at:'confirmed'}})})}),
    {code:'PROBE_REFRESH_UNCERTAIN'});
  const controller=new AbortController();controller.abort();let invoked=false;
  await assert.rejects(()=>refreshProbeSession({},cluster,bundle,{signal:controller.signal,fetcher:async()=>{invoked=true}}),{code:'PROBE_REFRESH_UNCERTAIN'});
  assert.equal(invoked,false);
});
