// Exact-owned full-backend negative controls. Privileged credentials belong to
// this disposable installer/test process only, never to the monitoring worker.
import assert from 'node:assert/strict';
import {probeRealtimeCanary,verifyRealtimeProbeIsolation} from '/control/service-probes.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_PERMISSION_INPUT),origin='http://127.0.0.1:8000';
const checked=[];let phase='auth-session';
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'permission_control_failed',phase,checks:checked})+'\n'));
async function request(path,token,{body,method=body===undefined?'GET':'POST',binary=false}={}){
  return fetch(origin+path,{method,signal:AbortSignal.timeout(5000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':binary?'application/octet-stream':'application/json'},
    ...(body===undefined?{}:{body:binary?body:JSON.stringify(body)})});
}
async function denied(name,path,token,options){
  const response=await request(path,token,options);await response.arrayBuffer();
  assert.ok([400,401,403,404].includes(response.status),name+' must deny owned fixture access');checked.push(name);
}
// A full timed drill can exceed the original canary JWT's one-hour lifetime.
// Authenticate the owned installer again instead of extending token lifetime
// or mistaking an expired JWT for a successful permission denial.
if(input.authSessionOnly)await denied('auth-initial-expired-session','/auth/v1/user',input.auth.token);
const initialLogin=await request('/auth/v1/token?grant_type=password',input.publishableKey,{body:input.installer});
assert.equal(initialLogin.status,200,'Owned installer must establish a fresh session');
const initialSession=await initialLogin.json();assert.equal(initialSession.user.id,input.auth.userId);
assert.ok(initialSession.access_token);
assert.equal((await request('/auth/v1/user',initialSession.access_token)).status,200,'Fresh Auth session positive control');
checked.push('auth-fresh-session');
let realtime;
if(!input.authSessionOnly){
phase='manifest';
for(const [name,token] of [['anon',input.publishableKey],['authenticated',initialSession.access_token],['service-role',input.serviceKey],['expired',input.expiredProbeToken]]){
  await denied('manifest-'+name,'/rest/v1/rpc/control_cluster_manifest',token,{body:{p_challenge:'c'.repeat(64)}});
}
const business='/rest/v1/hotels?select=id&limit=1';
phase='business';
assert.equal((await request(business,input.serviceKey)).status,200,'Installer positive control must reach the empty owned app table');
await denied('business-rest-read','/rest/v1/hotels?select=id&limit=1',input.probeToken);
phase='storage';for(const path of ['/storage/v1/object/authenticated/roomqc-control-probe/outside-scope.bin',
  '/storage/v1/object/authenticated/roomqc-probe-forbidden/health.bin']){
  const positive=await request(path,input.serviceKey);assert.equal(positive.status,200);assert.ok((await positive.arrayBuffer()).byteLength>0);
  await denied('storage-outside-'+checked.length,path,input.probeToken);
}
const object='/storage/v1/object/authenticated/roomqc-control-probe/health.bin';
assert.equal((await request(object,input.probeToken)).status,200,'Probe positive control must read its actual private object');
await denied('storage-probe-upload','/storage/v1/object/roomqc-control-probe/denied-upload.bin',input.probeToken,
  {body:'owned negative control',binary:true});
const list=await request('/storage/v1/object/list/roomqc-control-probe',input.probeToken,{body:{prefix:'',limit:100}});
assert.equal(list.status,200);const listed=await list.json();assert.deepEqual(listed.map(v=>v.name),['health.bin']);checked.push('storage-list-only-owned-path');
phase='realtime-denied-topic';const cluster={id:'fixture-a',url:origin},config={allowLocal:true,inventory:new Map([['fixture-a',cluster]])};
const credential={publishableKey:input.publishableKey,token:input.probeToken};
await probeRealtimeCanary(config,cluster,credential);
realtime=await verifyRealtimeProbeIsolation(config,cluster,credential);
checked.push('realtime-other-private-topic');
await probeRealtimeCanary(config,cluster,credential);checked.push('realtime-positive-after-denial');
}
phase='auth-revoke';
assert.equal((await request('/auth/v1/user',initialSession.access_token)).status,200,'Auth session positive control');
const logout=await request('/auth/v1/logout?scope=global',initialSession.access_token,{method:'POST'});
assert.equal(logout.status,204);await denied('auth-revoked-session','/auth/v1/user',initialSession.access_token);
const login=await request('/auth/v1/token?grant_type=password',input.publishableKey,{body:input.installer});
assert.equal(login.status,200);const session=await login.json();assert.equal(session.user.id,input.auth.userId);
assert.ok(session.access_token);assert.equal((await request('/auth/v1/user',session.access_token)).status,200);checked.push('auth-same-identity-recovery');
// Parent consumes this privately and emits only the check names/count, not auth.
console.log(JSON.stringify({verified:true,checks:checked,realtime,auth:{token:session.access_token,userId:session.user.id}}));
