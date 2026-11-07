// Owned fixture setup only. Never used by a monitoring worker.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
const key=process.env.ROOMQC_FIXTURE_SERVICE_KEY,origin='http://api-gw:8000';assert.ok(key);
const call=async(path,body,extra={})=>{
  const result=await fetch(origin+path,{method:'POST',signal:AbortSignal.timeout(5000),
    headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',...extra.headers},
    body:typeof body==='string'?body:JSON.stringify(body)});
  assert.ok(result.ok,'Owned canary setup failed ('+result.status+')');return result.json();
};
const email='probe-'+randomBytes(6).toString('hex')+'@roomqc.invalid',password=randomBytes(32).toString('hex');
const user=await call('/auth/v1/admin/users',{email,password,email_confirm:true,app_metadata:{roomqc_control_canary:true}});
assert.match(user.id,/^[a-f0-9-]{36}$/);
const session=await call('/auth/v1/token?grant_type=password',{email,password});
assert.equal(session.user.id,user.id);assert.ok(session.access_token);assert.ok(session.user.email_confirmed_at);
const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
assert.equal(claims.sub,user.id);assert.match(claims.session_id,/^[a-f0-9-]{36}$/);
assert.equal(typeof session.refresh_token,'string');assert.ok(session.refresh_token.length);
const bytes='RoomQC private control canary v1\n';
await call('/storage/v1/object/roomqc-control-probe/health.bin',bytes,{headers:{'content-type':'application/octet-stream','x-upsert':'false'}});
await call('/storage/v1/object/roomqc-control-probe/outside-scope.bin',bytes,{headers:{'content-type':'application/octet-stream','x-upsert':'false'}});
await call('/storage/v1/bucket',{id:'roomqc-probe-forbidden',name:'roomqc-probe-forbidden',public:false,file_size_limit:4096});
await call('/storage/v1/object/roomqc-probe-forbidden/health.bin',bytes,{headers:{'content-type':'application/octet-stream','x-upsert':'false'}});
// Captured privately by parent; never emitted to the public runner log.
// Installer-only recovery credentials never enter the five-probe input/worker.
console.log(JSON.stringify({auth:{token:session.access_token,userId:user.id},storage:{sha256:createHash('sha256').update(bytes).digest('hex')},
  coordinatorAuth:{token:session.access_token,refreshToken:session.refresh_token,userId:user.id,sessionId:claims.session_id},
  installer:{email,password}}));
