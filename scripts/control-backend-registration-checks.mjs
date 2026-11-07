// Defensive regression only on the exact-owned offline backend sandbox.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {ClusterGateway} from '/control/cluster.mjs';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ACCESS_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[],workspaceIds=new Set();let phase='registration-setup';
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'registration_check_failed',phase,checks})+'\n'));
async function request(path,token,body,method=body===undefined?'GET':'POST'){
  const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(10000),headers:{
    apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=null}
  return {status:r.status,data};
}
async function ok(label,path,token,body){const r=await request(path,token,body);
  assert.equal(r.status,200,label+' must succeed');checks.push(label);return r.data}
async function deny(label,path,token,body,method){const r=await request(path,token,body,method);
  if(![401,403].includes(r.status))process.stderr.write(JSON.stringify({event:'registration_denial_unexpected',label,status:r.status,code:r.data?.code})+'\n');
  assert.ok([401,403].includes(r.status),label+' permission denial');assert.equal(r.data?.code,'42501',label);
  checks.push(label);}
const rpc=(name,token,body={})=>ok(name,'/rest/v1/rpc/'+name,token,body);
const fields={fullName:'Owned registration fixture',phone:'0901234567',tenantName:'Owned registration fixture',
  hotelName:'Owned registration fixture',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',totalRooms:3};
async function actor(label,{login=true,missingProfile=false}={}){
  const email='registration-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const u=await ok('create-'+label,'/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true,
    ...(missingProfile?{user_metadata:{created_by_admin:true}}:{})});
  let s;if(login)s=await ok('login-'+label,'/auth/v1/token?grant_type=password',input.publishableKey,{email,password});
  return {id:u.id,email,token:s?.access_token,sessionId:s?JSON.parse(Buffer.from(s.access_token.split('.')[1],'base64url')).session_id:null};
}
const legacyBody=u=>({p_user_id:u.id,p_full_name:fields.fullName,p_phone:fields.phone,p_tenant_name:fields.tenantName,
  p_email:u.email,p_hotel_name:fields.hotelName,p_hotel_address:fields.hotelAddress,p_hotel_phone:fields.hotelPhone,
  p_hotel_email:u.email,p_total_rooms:3});
async function patchUser(u,body){
  const r=await request('/rest/v1/users?id=eq.'+u.id,input.serviceKey,body,'PATCH');
  if(r.status!==204)process.stderr.write(JSON.stringify({event:'registration_fixture_patch_failed',phase,status:r.status,
    code:r.data?.code,constraint:r.data?.message?.match(/constraint "([a-z0-9_]+)"/)?.[1]??null})+'\n');
  assert.equal(r.status,204);
}
async function snapshot(){
  const out={};for(const table of ['tenants','hotels','room_types','email_deliveries','users','staff_invitations']){
    const columns=table==='tenants'?'id,subscription_status,trial_ends_at,trial_end_date,subscription_end_date':
      table==='users'?'id,tenant_id,hotel_id,full_name,role,user_level_code,is_primary_owner':'id';
    const rows=await request('/rest/v1/'+table+'?select='+columns+'&order=id',input.serviceKey);
    assert.equal(rows.status,200);out[table]=rows.data;
  }
  out.receipts=[];
  for(const id of [...workspaceIds].sort()){
    const receipt=await request('/rest/v1/rpc/get_workspace_provisioning',input.serviceKey,{p_workspace_id:id});
    assert.equal(receipt.status,200);out.receipts.push({id,binding:receipt.data});
  }
  return out;
}
const gateway=new ClusterGateway({clusters:[{id:'owned',url:origin,publishableKey:input.publishableKey,serviceKey:input.serviceKey}]},
  (url,options)=>fetch(url,options));
const w={id:randomUUID(),slug:'registration-'+input.run,cluster_id:'owned',api_url:origin};
workspaceIds.add(w.id);
const owner=await actor('owner');
phase='legacy';
const pre=await rpc('registration_actor',owner.token);assert.equal(pre.id,owner.id);assert.equal(pre.session_id,owner.sessionId);
await deny('actor-anon','/rest/v1/rpc/registration_actor',input.publishableKey,{});
await deny('actor-service-not-browser','/rest/v1/rpc/registration_actor',input.serviceKey,{});
await deny('service-rpc-not-browser','/rest/v1/rpc/provision_workspace_registration',owner.token,
  {p_workspace_id:w.id,p_owner_id:owner.id,p_fields:fields});
await deny('internal-registration-not-browser','/rest/v1/rpc/complete_registration_impl',owner.token,legacyBody(owner));
await deny('internal-service-not-browser','/rest/v1/rpc/provision_workspace_registration_impl',owner.token,
  {p_workspace_id:w.id,p_owner_id:owner.id,p_fields:fields});
const first=await rpc('complete_registration',owner.token,legacyBody(owner));assert.equal(first.success,true);
const legacyBefore=await snapshot(),again=await rpc('complete_registration',owner.token,legacyBody(owner));
assert.equal(again.success,true);assert.equal(again.idempotent,true);assert.equal(again.tenant_id,first.tenant_id);
assert.deepEqual(await snapshot(),legacyBefore);checks.push('legacy-retry-no-side-effects');

phase='gateway';
const g=await actor('gateway'),user=await gateway.user(w,g.token);assert.equal(user.id,g.id);
const provision=await gateway.provision(w,user,{...fields,hotelEmail:g.email});assert.equal(provision.success,true);
const beforeReplay=await snapshot();
const replays=await Promise.all(Array.from({length:4},()=>gateway.provision(w,user,{...fields,hotelEmail:g.email})));
assert.ok(replays.every(v=>v.success&&v.idempotent&&v.tenant_id===provision.tenant_id&&v.hotel_id===provision.hotel_id));
assert.deepEqual(await snapshot(),beforeReplay);checks.push('gateway-concurrent-retry-one-binding');
const beforeProtectedWrite=await snapshot();
await deny('browser-protected-tenant-cannot-trigger-email','/rest/v1/users?id=eq.'+g.id,g.token,
  {tenant_id:first.tenant_id,hotel_id:first.hotel_id,status:'active'},'PATCH');
assert.deepEqual(await snapshot(),beforeProtectedWrite);checks.push('browser-protected-write-no-business-side-effects');
const selfName='Owned browser profile update';
assert.equal((await request('/rest/v1/users?id=eq.'+g.id,g.token,{full_name:selfName},'PATCH')).status,204);
assert.deepEqual(await ok('browser-self-profile-read','/rest/v1/users?id=eq.'+g.id+'&select=id,full_name',g.token),[{id:g.id,full_name:selfName}]);
assert.equal((await request('/rest/v1/users?id=eq.'+g.id,g.token,{full_name:fields.fullName},'PATCH')).status,204);
for(const [label,body] of [['primary-owner',{is_primary_owner:false}],['platform-flag',{is_super_admin:true}],
  ['self-role',{role:'staff',user_level_code:'staff',created_by:g.id}]]){
  const before=await snapshot();await deny('browser-protected-'+label,'/rest/v1/users?id=eq.'+g.id,g.token,body,'PATCH');
  assert.deepEqual(await snapshot(),before);
}
const profileStaff=await actor('profile-staff',{missingProfile:true});
assert.equal((await request('/rest/v1/users',input.serviceKey,{id:profileStaff.id,tenant_id:provision.tenant_id,
  hotel_id:provision.hotel_id,email:profileStaff.email,full_name:'Owned staff profile',role:'staff',user_level_code:'staff',
  status:'active',is_super_admin:false,is_primary_owner:false,created_by:g.id})).status,201);
assert.equal((await request('/rest/v1/user_roles',input.serviceKey,{user_id:profileStaff.id,role:'staff',created_by:g.id})).status,201);
assert.equal((await request('/rest/v1/users?id=eq.'+profileStaff.id,profileStaff.token,{full_name:'Staff self update'},'PATCH')).status,204);
assert.equal((await request('/rest/v1/users?id=eq.'+profileStaff.id,g.token,{full_name:'Owner managed staff update'},'PATCH')).status,204);
assert.deepEqual(await ok('browser-managed-staff-profile-read','/rest/v1/users?id=eq.'+profileStaff.id+'&select=id,full_name',g.token),
  [{id:profileStaff.id,full_name:'Owner managed staff update'}]);
await deny('browser-staff-self-escalation','/rest/v1/users?id=eq.'+profileStaff.id,profileStaff.token,{is_primary_owner:true},'PATCH');
const beforeCrossTenant=await snapshot();
assert.equal((await request('/rest/v1/users?id=eq.'+owner.id,g.token,{full_name:'MUST NOT CHANGE'},'PATCH')).status,204);
assert.deepEqual(await ok('browser-cross-tenant-profile-hidden','/rest/v1/users?id=eq.'+owner.id+'&select=id,full_name',g.token),[]);
assert.deepEqual(await snapshot(),beforeCrossTenant);checks.push('browser-profile-rls-positive-and-negative');
const mail=await ok('workspace-ready-queue','/rest/v1/email_deliveries?tenant_id=eq.'+provision.tenant_id,input.serviceKey);
assert.equal(mail.length,1);assert.equal(mail[0].recipient_email,g.email);assert.equal(mail[0].event_key,'workspace-ready:'+provision.tenant_id);
assert.equal(mail[0].template_name,'workspace_ready');assert.equal(mail[0].attempts,0);checks.push('workspace-ready-dedupe-provider-disabled');

for(const [label,change,restore] of [['locked',{account_locked:true},{account_locked:false}],
  ['profile-deleted',{deleted_at:new Date().toISOString()},{deleted_at:null}],['inactive',{status:'inactive'},{status:'active'}],
  ['null-status',{status:null},{status:'active'}],['staff-profile',{role:'staff',user_level_code:'staff',is_primary_owner:false,created_by:g.id},{role:'owner',user_level_code:'tenant_owner',is_primary_owner:true}],
  ['admin-profile',{is_super_admin:true,is_primary_owner:false},{is_super_admin:false,is_primary_owner:true}]]){
  phase=label;await patchUser(g,change);const before=await snapshot();
  await deny(label+'-actor','/rest/v1/rpc/registration_actor',g.token,{});
  await deny(label+'-legacy','/rest/v1/rpc/complete_registration',g.token,legacyBody(g));
  for(const bound of [true,false])await deny(label+'-service-'+bound,'/rest/v1/rpc/provision_workspace_registration',input.serviceKey,
    {p_workspace_id:w.id,p_owner_id:g.id,p_fields:{...fields,...(bound?{registrationSessionId:g.sessionId}:{})}});
  assert.deepEqual(await snapshot(),before);await patchUser(g,restore);
  assert.equal((await gateway.user(w,g.token)).id,g.id);checks.push(label+'-positive-after-restore');
}
phase='revoked-between-preflight-and-write';
const roleBefore=await snapshot();
assert.equal((await request('/rest/v1/user_roles?user_id=eq.'+g.id+'&role=eq.owner',input.serviceKey,undefined,'DELETE')).status,204);
await deny('removed-owner-role-actor','/rest/v1/rpc/registration_actor',g.token,{});
await deny('removed-owner-role-legacy','/rest/v1/rpc/complete_registration',g.token,legacyBody(g));
await deny('removed-owner-role-service','/rest/v1/rpc/provision_workspace_registration',input.serviceKey,
  {p_workspace_id:w.id,p_owner_id:g.id,p_fields:fields});
assert.deepEqual(await snapshot(),roleBefore);
assert.equal((await request('/rest/v1/user_roles',input.serviceKey,{user_id:g.id,role:'owner'})).status,201);
assert.equal((await gateway.user(w,g.token)).id,g.id);checks.push('owner-role-restore-positive');
const revoked=await actor('revoked'),rw={...w,id:randomUUID()},authorized=await gateway.user(rw,revoked.token);
workspaceIds.add(rw.id);
assert.equal((await request('/auth/v1/logout?scope=global',revoked.token,undefined,'POST')).status,204);
const deniedBefore=await snapshot();
await assert.rejects(()=>gateway.provision(rw,authorized,fields),e=>e.status===403);
await deny('revoked-actor','/rest/v1/rpc/registration_actor',revoked.token,{});
await deny('revoked-legacy','/rest/v1/rpc/complete_registration',revoked.token,legacyBody(revoked));
assert.deepEqual(await snapshot(),deniedBefore);checks.push('revoked-before-write-no-side-effects');
const noSession=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:rw.id,p_owner_id:revoked.id,p_fields:fields});
assert.equal(noSession.success,true);checks.push('trusted-service-without-interactive-session');

phase='missing-profile';
const missing=await actor('missing',{missingProfile:true}),missingActor=await rpc('registration_actor',missing.token);
assert.equal(missingActor.id,missing.id);
assert.deepEqual(await ok('missing-profile-confirmed','/rest/v1/users?id=eq.'+missing.id+'&select=id',input.serviceKey),[]);
const mp=await rpc('complete_registration',missing.token,legacyBody(missing));assert.equal(mp.success,true);checks.push('missing-profile-supported');
phase='wrong-owner';
await deny('legacy-wrong-owner','/rest/v1/rpc/complete_registration',owner.token,legacyBody(g));
const receiptBefore=await snapshot();
const conflict=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:w.id,p_owner_id:owner.id,p_fields:fields});
assert.equal(conflict.success,false);assert.deepEqual(await snapshot(),receiptBefore);checks.push('receipt-owner-conflict-no-side-effects');
phase='pending-owner-denial';
const pending=await actor('pending'),pw={...w,id:randomUUID()};
workspaceIds.add(pw.id);
// Current Auth signup intentionally creates no public profile. A null-tenant
// INSERT is not a valid pending fixture: quota/staff-status triggers reject it.
// Exercise a recoverable bound pending profile created by the actual provisioner,
// while the preceding missing-profile case covers a genuinely new owner.
const initialPending=await gateway.provision(pw,await gateway.user(pw,pending.token),fields);
assert.equal(initialPending.success,true);
await patchUser(pending,{status:'pending_setup'});
const pendingProfile=await ok('pending-profile-verify','/rest/v1/users?id=eq.'+pending.id+'&select=id,status,tenant_id,hotel_id',input.serviceKey);
assert.deepEqual(pendingProfile,[{id:pending.id,status:'pending_setup',tenant_id:initialPending.tenant_id,hotel_id:initialPending.hotel_id}]);
assert.equal((await gateway.user(pw,pending.token)).id,pending.id);checks.push('pending-profile-positive');
await patchUser(pending,{account_locked:true});
const locked=await ok('pending-lock-verify','/rest/v1/users?id=eq.'+pending.id+'&select=id,account_locked',input.serviceKey);
assert.deepEqual(locked,[{id:pending.id,account_locked:true}]);
const pendingBefore=await snapshot();
await deny('pending-locked-actor','/rest/v1/rpc/registration_actor',pending.token,{});
await deny('pending-locked-legacy','/rest/v1/rpc/complete_registration',pending.token,legacyBody(pending));
await deny('pending-locked-service','/rest/v1/rpc/provision_workspace_registration',input.serviceKey,
  {p_workspace_id:pw.id,p_owner_id:pending.id,p_fields:fields});
assert.deepEqual(await snapshot(),pendingBefore);checks.push('pending-denial-no-provision-or-email');
await patchUser(pending,{account_locked:false});
const pendingReplayBefore=await snapshot();
const pendingProvision=await gateway.provision(pw,await gateway.user(pw,pending.token),fields);
assert.equal(pendingProvision.success,true);assert.equal(pendingProvision.idempotent,true);
assert.equal(pendingProvision.tenant_id,initialPending.tenant_id);assert.equal(pendingProvision.hotel_id,initialPending.hotel_id);
assert.deepEqual(await snapshot(),pendingReplayBefore);checks.push('bound-pending-replay-positive-after-unlock');
await patchUser(pending,{status:'active'});

phase='invitation-eligibility';
const invited=await actor('invited'),iw={...w,id:randomUUID()};workspaceIds.add(iw.id);
assert.equal((await gateway.user(iw,invited.token)).id,invited.id);
const positionId=randomUUID(),invitationId=randomUUID();
assert.equal((await request('/rest/v1/positions',input.serviceKey,{id:positionId,tenant_id:provision.tenant_id,
  code:'owned-registration-'+input.run,name:'Owned registration invitation',user_level_code:'staff',department:'other'})).status,201);
assert.equal((await request('/rest/v1/staff_invitations',input.serviceKey,{id:invitationId,tenant_id:provision.tenant_id,
  hotel_id:provision.hotel_id,email:invited.email,full_name:'Owned invited fixture',user_level_code:'staff',
  position_id:positionId,invited_by:g.id,auth_user_id:invited.id})).status,201);
for(const state of ['pending','revoked']){
  assert.equal((await request('/rest/v1/staff_invitations?id=eq.'+invitationId,input.serviceKey,{status:state},'PATCH')).status,204);
  const before=await snapshot();
  await deny('invitation-'+state+'-actor','/rest/v1/rpc/registration_actor',invited.token,{});
  await deny('invitation-'+state+'-legacy','/rest/v1/rpc/complete_registration',invited.token,legacyBody(invited));
  await deny('invitation-'+state+'-service','/rest/v1/rpc/provision_workspace_registration',input.serviceKey,
    {p_workspace_id:iw.id,p_owner_id:invited.id,p_fields:fields});
  assert.deepEqual(await snapshot(),before);checks.push('invitation-'+state+'-no-business-side-effects');
}

// Real PostgreSQL locks + real HTTP prove overlapping mutation, not merely
// revocation between two sequential API calls. These are installer credentials
// for this internal-only disposable fixture, never production runtime access.
phase='concurrent-live-revocation';
const pool=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:3,statement_timeout:10000,application_name:'owned-registration-'+input.run});
async function waitForBlockedRegistration(blocker){
  const until=Date.now()+5000;
  while(Date.now()<until){
    const result=await pool.query(`SELECT a.pid FROM pg_stat_activity a
      WHERE a.wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(a.pid))
      AND a.query LIKE '%provision_workspace_registration%'`,[blocker]);
    if(result.rowCount>0)return;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.fail('Actual registration transaction must overlap and wait on the held row lock');
}
async function concurrentDenial(label,u,workspace,mutation){
  const approved=await gateway.user(workspace,u.token),before=await snapshot(),writer=await pool.connect();
  let pendingWrite;
  try{
    await writer.query('BEGIN');const blocker=(await writer.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    assert.equal((await writer.query(mutation,[u.id,u.sessionId])).rowCount,1,'Owned mutation must affect the exact row');
    pendingWrite=gateway.provision(workspace,approved,fields).then(value=>({value}),error=>({error}));
    await waitForBlockedRegistration(blocker);checks.push(label+'-actual-lock-overlap');
    await writer.query('COMMIT');const result=await pendingWrite;
    assert.equal(result.error?.status,403,label+' denied after concurrent commit');
    assert.deepEqual(await snapshot(),before);checks.push(label+'-rollback-no-business-side-effects');
  }finally{await writer.query('ROLLBACK');writer.release();await pendingWrite}
}
try{
  await concurrentDenial('profile-lock-race',g,w,'UPDATE public.users SET account_locked=true WHERE id=$1 AND $2::uuid IS NOT NULL');
  await patchUser(g,{account_locked:false});assert.equal((await gateway.user(w,g.token)).id,g.id);
  const sessionRace=await actor('session-race'),sw={...w,id:randomUUID()};workspaceIds.add(sw.id);
  await concurrentDenial('session-revoke-race',sessionRace,sw,'DELETE FROM auth.sessions WHERE user_id=$1 AND id=$2');
  const recovered=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:sw.id,p_owner_id:sessionRace.id,p_fields:fields});
  assert.equal(recovered.success,true);checks.push('session-revoke-race-trusted-service-recovery');
}finally{await pool.end()}
console.log(JSON.stringify({verified:true,checks,fixtures:8,
  sessionFixture:{id:g.id,sessionId:g.sessionId,workspaceId:w.id},
  emailReadyFixtures:{owner:{id:g.id,tenantId:provision.tenant_id,hotelId:provision.hotel_id},emailFixtures:[
    {id:owner.id,tenantId:first.tenant_id,hotelId:first.hotel_id,path:'/auth/login'},
    {id:g.id,tenantId:provision.tenant_id,hotelId:provision.hotel_id,path:'/app/'+w.slug+'/auth/login'},
    {id:revoked.id,tenantId:noSession.tenant_id,hotelId:noSession.hotel_id,path:'/auth/login'}]}}));
