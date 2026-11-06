// One coherent customer journey through the real HTTP/Auth/RPC/SMTP/Storage/
// Realtime stack. Loopback only; no UI automation or production email claims.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createClient } from '@supabase/supabase-js';
import { ControlStore } from '../server/control/store.mjs';
import { ClusterGateway } from '../server/control/cluster.mjs';
import { createControlServer } from '../server/control/app.mjs';
import { fixtureConfig, seedOperationalCluster } from '../server/control/test-fixtures.mjs';
import {
  assertAuthDenied, assertDatabaseDenied, assertFunctionDenied, assertStorageDenied,
  boundedFetch, withDeadline, waitUntil, observeFor, RealtimeGuard,
} from './lib/customer-journey-checks.mjs';

const fetch=boundedFetch();

const loopback=value=>['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname);
const raw=process.platform==='win32'
  ?execFileSync('cmd.exe',['/d','/s','/c','npx --no-install supabase status --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000})
  :execFileSync('npx',['--no-install','supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000});
const local=JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(loopback(local.API_URL)&&loopback(local.DB_URL),'Only the local API and database are allowed');
const mailUrl=new URL(local.INBUCKET_URL || local.MAILPIT_URL || 'http://127.0.0.1:54324').origin;
assert.ok(loopback(mailUrl),'Only local SMTP capture is allowed');
const projectId=(await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(projectId,'Local project namespace is required');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}).trim();
const authEnv=JSON.parse(docker('inspect',`supabase_auth_${projectId}`))[0].Config.Env;
assert.ok(authEnv.some(value=>/^GOTRUE_SMTP_HOST=.*inbucket/.test(value)),'Auth must use local SMTP capture');
assert.ok(authEnv.includes('GOTRUE_MAILER_AUTOCONFIRM=false'),'Auth must require email confirmation');
const edgeEnv=JSON.parse(docker('inspect',`supabase_edge_runtime_${projectId}`))[0].Config.Env;
assert.ok(edgeEnv.includes('ROOMQC_EMAIL_PROVIDER=mailpit')&&edgeEnv.includes('ROOMQC_EMAIL_ENVIRONMENT=local'),
  'Business email must use local Mailpit; this suite never enables Resend');

const runId=randomUUID().slice(0,12), prefix=`qc-journey-${runId}`, startedAt=new Date().toISOString();
const credentials={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch}};
const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,credentials);
const clients=[],userIds=new Set(),tenantIds=new Set(),workspaceIds=new Set(),emails=new Set(),objects=[],capturedIds=new Set();
const realtimeObservers=[];
const client=()=>{const value=createClient(local.API_URL,local.ANON_KEY,credentials);clients.push(value);return value};
const container=`roomqc-journey-test-${randomUUID().slice(0,8)}`;
const config={...fixtureConfig('',[{id:'cluster-a',url:new URL(local.API_URL).origin,publishableKey:local.ANON_KEY,serviceKey:local.SERVICE_ROLE_KEY,
    vapidPublicKey:'local-fixture-vapid',maxWorkspaces:10}]),
  publicOrigin:'http://127.0.0.1:8082',signupEnabled:true,emailKey:randomUUID()};
let clusterDb,store,server,containerStarted=false,api,checks=0,initialDirectoryRequired;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log(`PASS ${label}`)};
const authDenied=(result,code,label)=>{assertAuthDenied(result,code,label);check(true,label)};
const databaseDenied=(result,code,label,message)=>{assertDatabaseDenied(result,code,label,message);check(true,label)};
const functionDenied=async(result,status,message,label)=>{await assertFunctionDenied(result,status,message,label);check(true,label)};
const storageDenied=async(result,label,apiStatus=403)=>{await assertStorageDenied(result,apiStatus,label);check(true,label)};
const post=async(path,body,token)=>fetch(`${api}${path}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Origin:config.publicOrigin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
async function captured(email) {
  assert.ok(emails.has(email),'Only owned fixture mail may be read');
  let message;
  await waitUntil(async()=>{
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,{signal:AbortSignal.timeout(5000)});
    assert.ok(response.ok,'Mailpit search must succeed');
    const data=await response.json();
    const matches=(data.messages || []).filter(m=>m.To?.some(to=>to.Address?.toLowerCase()===email));
    for(const value of matches)capturedIds.add(value.ID);
    if(!matches.length)return false;
    const detail=await fetch(`${mailUrl}/api/v1/message/${matches[0].ID}`,{signal:AbortSignal.timeout(5000)});
    assert.ok(detail.ok,'Mailpit message must exist');message=await detail.json();return true;
  },'fixture email delivery');
  return message;
}
function otp(message) {
  const value=message.Text?.match(/\b\d{6}\b/)?.[0];
  assert.ok(value,'Auth email must contain a six-digit OTP');return value;
}
async function signIn(email,password) {
  const value=client(),result=await value.auth.signInWithPassword({email,password});assert.ifError(result.error);
  assert.ok(result.data.session,'Password login must establish a session');return value;
}
const token=async value=>{const result=await value.auth.getSession();assert.ifError(result.error);return result.data.session?.access_token};
const room=number=>({room_number:String(number),floor:1,room_type:'standard',max_guests:2,
  base_price:450000,hourly_price:120000,monthly_price:6000000});

async function registerWorkspace(suffix,expectedRooms,{loseConfirmation=false}={}) {
  const slug=`${prefix}-${suffix}`,email=`${prefix}-${suffix}@example.invalid`,password=`QC!a9${randomUUID()}`;
  emails.add(email);
  const intent={slug,email,displayName:`Journey ${suffix}`};
  const reservation=await post('/signup-intents',intent);
  const reservationBody=await reservation.text();
  assert.equal(reservation.status,201,`reservation failed: HTTP ${reservation.status} ${reservationBody}`);
  const reserved=JSON.parse(reservationBody);
  check(reserved.path===`/app/${slug}/auth/register`&&Date.parse(reserved.expiresAt)>Date.now(),`${suffix}: reservation returns the scoped registration path and expiry`);
  const initial=await(await fetch(`${api}/workspaces/${slug}/bootstrap`)).json();workspaceIds.add(initial.workspace.id);
  const secondTab=await(await post('/signup-intents',intent)).json();
  check(secondTab.expiresAt===reserved.expiresAt&&initial.workspace.status==='reserved',`${suffix}: a second tab resumes the same reservation without extending it`);
  const registration=client();
  const signup=await registration.auth.signUp({email,password,options:{emailRedirectTo:`${config.publicOrigin}/app/${slug}/auth/callback`,data:{full_name:'Journey owner'}}});
  assert.ifError(signup.error);assert.ok(signup.data.user?.id);userIds.add(signup.data.user.id);
  check(!signup.data.session&&!signup.data.user.email_confirmed_at,`${suffix}: real signup requires email verification`);
  authDenied(await client().auth.signInWithPassword({email,password}),'email_not_confirmed',`${suffix}: unverified email cannot log in`);
  const fields={fullName:'Journey owner',phone:'0901234567',tenantName:`${prefix} ${suffix}`,hotelName:`Journey ${suffix}`,
    hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:email,totalRooms:expectedRooms};
  check((await post(`/workspaces/${slug}/provision`,fields)).status===401,`${suffix}: unauthenticated setup is blocked`);
  const mail=await captured(email),code=otp(mail);
  check(mail.Subject.includes('Xác minh'),`${suffix}: signup email uses the Vietnamese Auth template`);
  const verified=client();
  authDenied(await verified.auth.verifyOtp({email,token:code==='111111'?'222222':'111111',type:'signup'}),'otp_expired',`${suffix}: an incorrect signup code is rejected`);
  const stillUnconfirmed=await admin.auth.admin.getUserById(signup.data.user.id);assert.ifError(stillUnconfirmed.error);
  check(!stillUnconfirmed.data.user.email_confirmed_at,`${suffix}: wrong OTP does not confirm the identity`);
  const confirmation=await verified.auth.verifyOtp({email,token:code,type:'signup'});assert.ifError(confirmation.error);
  check(confirmation.data.user.id===signup.data.user.id&&!!confirmation.data.session,`${suffix}: OTP on a fresh client verifies the original identity`);
  authDenied(await client().auth.verifyOtp({email,token:code,type:'signup'}),'otp_expired',`${suffix}: signup OTP cannot be reused`);
  const owner=await signIn(email,password);
  const profileBefore=await admin.from('users').select('tenant_id').eq('id',signup.data.user.id);assert.ifError(profileBefore.error);
  check(!profileBefore.data.some(row=>row.tenant_id),`${suffix}: verification alone does not create an application tenant`);
  const ownerToken=await token(owner);
  const originalActivate=store.activate.bind(store);
  if(loseConfirmation) {
    let loseOnce=true;
    store.activate=async(...args)=>{if(loseOnce){loseOnce=false;throw new Error('Fixture: lost directory confirmation')}return originalActivate(...args)};
  }
  let result;
  try {
    const provision=await post(`/workspaces/${slug}/provision`,fields,ownerToken);
    result=await provision.json();
    if(loseConfirmation) {
      check(provision.status===503&&!!result.requestId,`${suffix}: lost post-commit confirmation returns a support request ID`);
      const recovered=await(await fetch(`${api}/workspaces/${slug}/bootstrap`)).json();
      check(recovered.workspace.status==='active',`${suffix}: bootstrap recovers the already committed tenant`);
      const retry=await post(`/workspaces/${slug}/provision`,fields,ownerToken);assert.equal(retry.status,200);result=await retry.json();
      check(result.idempotent===true,`${suffix}: retry resumes setup without another tenant or trial`);
    } else assert.equal(provision.status,200);
  } finally {store.activate=originalActivate}
  assert.ok(result.success&&result.tenant_id&&result.hotel_id);tenantIds.add(result.tenant_id);
  const binding=await admin.rpc('get_workspace_provisioning',{p_workspace_id:initial.workspace.id});assert.ifError(binding.error);
  check(binding.data.owner_id===signup.data.user.id&&binding.data.tenant_id===result.tenant_id&&binding.data.hotel_id===result.hotel_id,
    `${suffix}: verified owner, workspace, tenant and hotel share one receipt`);
  const welcome=await admin.from('email_deliveries').select('id,template_data').eq('tenant_id',result.tenant_id).eq('template_name','workspace_ready');assert.ifError(welcome.error);
  check(welcome.data.length===1&&welcome.data[0].template_data.path===`/app/${slug}/auth/login`,`${suffix}: exactly one welcome event points to the scoped workspace`);
  return {client:owner,email,password,userId:signup.data.user.id,slug,workspaceId:initial.workspace.id,tenantId:result.tenant_id,hotelId:result.hotel_id};
}

async function subscribeRooms(value,label,events,fixtureRoomIds) {
  const guard=new RealtimeGuard(label);
  realtimeObservers.push({guard,client:value});
  await value.realtime.setAuth(await token(value));
  value.channel(`${prefix}-${label}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms'},payload=>{
    // Retain only this run's records. Unexpected records fail the test without
    // retaining other customers' IDs/notes if server-side isolation regresses.
    if(!fixtureRoomIds.has(payload.new.id)){guard.status('CHANNEL_ERROR');return}
    events.push({id:payload.new.id,marker:payload.new.notes});
  }).subscribe(status=>guard.status(status));
  await waitUntil(()=>{guard.assertNotFailed();return guard.subscribed},`Realtime subscription: ${label}`);
  guard.assertHealthy(value.realtime.isConnected());
}
function assertRealtimeHealthy() {
  for(const {guard,client:value} of realtimeObservers)guard.assertHealthy(value.realtime.isConnected());
}

try {
  await withDeadline(async()=>{
  clusterDb=new ControlStore({...config,databaseUrl:local.DB_URL});
  const prerequisite=await clusterDb.pool.query(`SELECT
    to_regclass('private.workspace_provisioning') IS NOT NULL AS receipt,
    to_regprocedure('public.get_hotel_room_setup(uuid)') IS NOT NULL AS room_setup,
    to_regprocedure('public.accept_staff_invitation(uuid,uuid)') IS NOT NULL AS invitations,
    EXISTS(SELECT 1 FROM storage.buckets WHERE id='guest-documents' AND NOT public) AS private_documents,
    EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='rooms') AS realtime_rooms`);
  assert.ok(Object.values(prerequisite.rows[0]).every(Boolean),'Current migrations, private documents and rooms publication are required');
  // Plan only, without ANALYZE or data writes: fail before fixture creation if
  // a Storage upgrade left an incompatible current-object conflict target.
  await clusterDb.pool.query(`EXPLAIN INSERT INTO storage.objects(bucket_id,name)
    VALUES ('roomqc-plan-only','roomqc-plan-only')
    ON CONFLICT (bucket_id,name COLLATE "C") WHERE archived_at IS NULL DO NOTHING`);
  initialDirectoryRequired=(await clusterDb.pool.query('SELECT directory_required FROM private.roomqc_cluster_config WHERE singleton')).rows[0].directory_required;
  const dbPassword=randomUUID();
  containerStarted=true; // also attempt cleanup if Docker creates it but loses the response
  docker('run','-d','--name',container,'-e',`POSTGRES_PASSWORD=${dbPassword}`,'-e','POSTGRES_DB=roomqc_control',
    '-p','127.0.0.1::5432','postgres:16-alpine');
  const dbPort=docker('port',container,'5432/tcp').split(':').at(-1);
  store=new ControlStore({...config,databaseUrl:`postgresql://postgres:${dbPassword}@127.0.0.1:${dbPort}/roomqc_control`});
  await waitUntil(async()=>{try{await store.pool.query('SELECT 1');return true}catch{return false}},'temporary directory database',20000);
  await store.migrate();
  await seedOperationalCluster(store.pool,'cluster-a',{limit:10});
  server=createControlServer({config,store,gateway:new ClusterGateway(config,undefined,store)});server.listen(0,'127.0.0.1');await once(server,'listening');
  api=`http://127.0.0.1:${server.address().port}/api/control`;
  const alpha=await registerWorkspace('alpha',3,{loseConfirmation:true});
  const initial=await alpha.client.rpc('get_hotel_room_setup',{p_hotel_id:alpha.hotelId});assert.ifError(initial.error);
  check(initial.data.version===0&&initial.data.actual_rooms===0&&initial.data.expected_rooms===3,'Newly registered hotel starts with its declared room target');
  const rooms=[room(101),room(102),room(103)];
  const saved=await alpha.client.rpc('save_hotel_room_setup',{p_hotel_id:alpha.hotelId,p_expected_version:0,p_rooms:rooms});assert.ifError(saved.error);
  const anotherDevice=await signIn(alpha.email,alpha.password);
  const restored=await anotherDevice.rpc('get_hotel_room_setup',{p_hotel_id:alpha.hotelId});assert.ifError(restored.error);
  check(restored.data.request_id===saved.data.request_id&&restored.data.rooms.length===3,'A fresh device resumes the real saved room draft');
  const commitFields={p_hotel_id:alpha.hotelId,p_request_id:saved.data.request_id,p_version:saved.data.version,p_confirm_prices:true};
  databaseDenied(await alpha.client.rpc('complete_hotel_room_setup',{...commitFields,p_confirm_prices:false}),'22023',
    'Room creation requires explicit price confirmation','Cần xác nhận danh sách phòng và bảng giá.');
  const uncommitted=await alpha.client.rpc('get_hotel_room_setup',{p_hotel_id:alpha.hotelId});assert.ifError(uncommitted.error);
  check(uncommitted.data.actual_rooms===0&&!uncommitted.data.completed_at&&uncommitted.data.version===saved.data.version,
    'Rejected room confirmation leaves the draft and actual room count unchanged');
  const completed=await anotherDevice.rpc('complete_hotel_room_setup',commitFields);assert.ifError(completed.error);
  const replay=await alpha.client.rpc('complete_hotel_room_setup',commitFields);assert.ifError(replay.error);
  check(completed.data.actual_rooms===3&&replay.data.idempotent===true,'Room setup commits three rooms once and is safely replayable');
  const actual=await alpha.client.from('rooms').select('id,tenant_id,hotel_id,room_number,status,base_price').eq('hotel_id',alpha.hotelId);assert.ifError(actual.error);
  check(actual.data.length===3&&actual.data.every(r=>r.tenant_id===alpha.tenantId&&r.status==='vacant_clean'&&r.base_price===450000),
    'Committed rooms have the requested tenant, operational status and nightly price');
  const positions=await alpha.client.from('positions').select('id,department,user_level_code').eq('tenant_id',alpha.tenantId);assert.ifError(positions.error);
  let position=positions.data.find(p=>p.user_level_code==='staff'&&p.department==='housekeeping');
  if(!position) {
    const added=await alpha.client.from('positions').insert({tenant_id:alpha.tenantId,code:'JOURNEY-HK',name:'Fixture housekeeping',user_level_code:'staff',department:'housekeeping'})
      .select('id,department,user_level_code').single();assert.ifError(added.error);position=added.data;
  }
  const employeeEmail=`${prefix}-employee@example.invalid`,employeePassword=`QC!a9${randomUUID()}`;emails.add(employeeEmail);
  const invited=await alpha.client.functions.invoke('create-user',{body:{email:employeeEmail,fullName:'Journey employee',tenantId:alpha.tenantId,
    hotelId:alpha.hotelId,userLevelCode:'staff',positionId:position.id,path:`/app/${alpha.slug}/auth/accept-invite`}});
  assert.ifError(invited.error);assert.ok(invited.data.success);
  const invitation=await admin.from('staff_invitations').select('id,auth_user_id').eq('id',invited.data.invitation.id).single();assert.ifError(invitation.error);
  userIds.add(invitation.data.auth_user_id);
  const pending=await admin.from('users').select('id').eq('id',invitation.data.auth_user_id);assert.ifError(pending.error);
  check(pending.data.length===0,'An invitation creates no active employee profile before acceptance');
  const inviteMail=await captured(employeeEmail);
  check(inviteMail.HTML.includes(`/app/${alpha.slug}/auth/accept-invite`),'Invitation email retains the exact workspace acceptance path');
  const employee=client();
  assert.ifError((await employee.auth.verifyOtp({email:employeeEmail,token:otp(inviteMail),type:'invite'})).error);
  await functionDenied(await employee.functions.invoke('staff-invitations',{body:{action:'accept',tenantId:alpha.tenantId}}),409,
    'Lời mời đã hết hạn, bị thu hồi hoặc quyền người mời đã thay đổi. Vui lòng liên hệ quản lý.',
    'Verified invitation still requires employee password setup');
  // The function intentionally maps several DB failures to 409. Probe the
  // underlying guard too, so an unrelated RPC failure cannot pass this case.
  databaseDenied(await admin.rpc('accept_staff_invitation',{p_invitation:invitation.data.id,p_user:invitation.data.auth_user_id}),'P0001',
    'Backend rejects acceptance specifically because password setup is missing','Hãy xác minh lời mời và đặt mật khẩu trước');
  const stillPending=await admin.from('staff_invitations').select('status,password_set_at').eq('id',invitation.data.id).single();assert.ifError(stillPending.error);
  const stillNoProfile=await admin.from('users').select('id').eq('id',invitation.data.auth_user_id);assert.ifError(stillNoProfile.error);
  check(stillPending.data.status==='pending'&&!stillPending.data.password_set_at&&stillNoProfile.data.length===0,
    'Rejected acceptance leaves the invitation pending and creates no active profile');
  assert.ifError((await employee.auth.updateUser({password:employeePassword})).error);
  await functionDenied(await employee.functions.invoke('staff-invitations',{body:{action:'accept',tenantId:randomUUID()}}),403,
    'Lời mời thuộc khách sạn khác. Hãy mở đúng không gian làm việc.','Invitation cannot be accepted into another workspace');
  const accepted=await employee.functions.invoke('staff-invitations',{body:{action:'accept',tenantId:alpha.tenantId}});assert.ifError(accepted.error);
  check(accepted.data.success===true,'Employee accepts the same owner-issued invitation after setting a password');
  const acceptedAgain=await employee.functions.invoke('staff-invitations',{body:{action:'accept',tenantId:alpha.tenantId}});assert.ifError(acceptedAgain.error);
  check(acceptedAgain.data.success===true,'Acceptance can be replayed after a lost confirmation');
  assert.ifError((await employee.auth.signOut()).error);
  const staff=await signIn(employeeEmail,employeePassword);
  const profile=await staff.from('users').select('tenant_id,hotel_id,position_id,department,user_level_code,must_change_password').eq('id',invitation.data.auth_user_id).single();assert.ifError(profile.error);
  check(profile.data.tenant_id===alpha.tenantId&&profile.data.hotel_id===alpha.hotelId&&profile.data.position_id===position.id
    &&profile.data.department==='housekeeping'&&profile.data.user_level_code==='staff'&&!profile.data.must_change_password,
    'Fresh employee password login has the intended hotel, position, department and staff level');
  const roles=await staff.from('user_roles').select('role').eq('user_id',invitation.data.auth_user_id);assert.ifError(roles.error);
  check(roles.data.some(r=>r.role==='staff')&&!roles.data.some(r=>['owner','super_admin','hotel_manager'].includes(r.role)),
    'Employee receives the real staff role without management escalation');
  const staffRooms=await staff.from('rooms').select('id').eq('hotel_id',alpha.hotelId);assert.ifError(staffRooms.error);
  check(staffRooms.data.length===3,'Employee can read the rooms of the assigned hotel');
  databaseDenied(await staff.rpc('get_hotel_room_setup',{p_hotel_id:alpha.hotelId}),'42501',
    'Employee cannot run the owner-only room setup workflow','Chỉ chủ sở hữu được thiết lập khách sạn này.');
  const planColumns='subscription_status,subscription_plan_id,registered_rooms,trial_ends_at,subscription_end_date,is_read_only';
  const beforePlan=await admin.from('tenants').select(planColumns).eq('id',alpha.tenantId).single();assert.ifError(beforePlan.error);
  databaseDenied(await staff.from('tenants').update({subscription_status:'active'}).eq('id',alpha.tenantId),'42501',
    'Employee cannot self-activate the customer subscription');
  const afterPlan=await admin.from('tenants').select(planColumns).eq('id',alpha.tenantId).single();assert.ifError(afterPlan.error);
  assert.deepEqual(afterPlan.data,beforePlan.data);
  check(true,'Rejected employee subscription update leaves the plan, quota, trial and read-only state unchanged');

  const bravo=await registerWorkspace('bravo',1);
  check(bravo.tenantId!==alpha.tenantId&&bravo.hotelId!==alpha.hotelId,'A second verified customer receives a distinct tenant and hotel');
  const bravoDraft=await bravo.client.rpc('save_hotel_room_setup',{p_hotel_id:bravo.hotelId,p_expected_version:0,p_rooms:[room(201)]});assert.ifError(bravoDraft.error);
  assert.ifError((await bravo.client.rpc('complete_hotel_room_setup',{p_hotel_id:bravo.hotelId,p_request_id:bravoDraft.data.request_id,p_version:bravoDraft.data.version,p_confirm_prices:true})).error);
  for(const [label,value,other] of [['owner',alpha.client,bravo],['staff',staff,bravo],['second owner',bravo.client,alpha]]) {
    const hidden=await value.from('rooms').select('id').eq('hotel_id',other.hotelId);assert.ifError(hidden.error);
    check(hidden.data.length===0,`${label}: REST cannot read another fixture hotel's rooms`);
    const draft=await value.rpc('get_hotel_room_setup',{p_hotel_id:other.hotelId});
    databaseDenied(draft,'42501',`${label}: RPC cannot read another fixture hotel's private setup`,'Chỉ chủ sở hữu được thiết lập khách sạn này.');
  }

  // Private document isolation, with successful owner/staff controls. No real
  // guest document is used and no bucket/policy is created or made public.
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG7sAAAAASUVORK5CYII=','base64');
  for(const value of [alpha,bravo]) {
    value.documentPath=`${value.tenantId}/${prefix}-document.png`;
    objects.push({bucket:'guest-documents',path:value.documentPath});
    assert.ifError((await value.client.storage.from('guest-documents').upload(value.documentPath,image,{contentType:'image/png',upsert:false})).error);
    const own=await value.client.storage.from('guest-documents').download(value.documentPath);assert.ifError(own.error);
    check(Buffer.from(await own.data.arrayBuffer()).equals(image),'Document owner can upload and retrieve its exact fixture bytes');
    // The scanner creates a fresh file path, and this bucket intentionally has
    // INSERT/SELECT/DELETE but no UPDATE policy. Do not broaden it for a test.
    await storageDenied(await value.client.storage.from('guest-documents').upload(value.documentPath,image,{contentType:'image/png',upsert:true}),
      'Existing guest documents cannot be overwritten, including by their owner, under the current policy');
    const unchanged=await value.client.storage.from('guest-documents').download(value.documentPath);assert.ifError(unchanged.error);
    check(Buffer.from(await unchanged.data.arrayBuffer()).equals(image),'Rejected overwrite preserves the original document bytes');
  }
  check(!(await staff.storage.from('guest-documents').download(alpha.documentPath)).error,'Same-tenant employee can read its hotel document under current tenant-wide policy');
  await storageDenied(await bravo.client.storage.from('guest-documents').download(alpha.documentPath),'Another tenant cannot download the private fixture document',404);
  await storageDenied(await bravo.client.storage.from('guest-documents').createSignedUrl(alpha.documentPath,60),'Another tenant cannot create a signed document link',404);
  await storageDenied(await client().storage.from('guest-documents').download(alpha.documentPath),'Anonymous access to a private guest document is denied',404);
  const replacement=Buffer.concat([image,Buffer.from('\n')]);
  await storageDenied(await bravo.client.storage.from('guest-documents').upload(alpha.documentPath,replacement,{contentType:'image/png',upsert:true}),
    'Another tenant cannot overwrite the private fixture document (server errors do not count as a denial)');
  const afterCrossOverwrite=await alpha.client.storage.from('guest-documents').download(alpha.documentPath);assert.ifError(afterCrossOverwrite.error);
  check(Buffer.from(await afterCrossOverwrite.data.arrayBuffer()).equals(image),'Rejected cross-tenant overwrite preserves the exact original bytes');

  // A new path tests INSERT independently from the bucket-wide UPDATE denial.
  const freshPath=`${alpha.tenantId}/${prefix}-cross-create.png`;
  objects.push({bucket:'guest-documents',path:freshPath});
  const beforeCreate=await admin.storage.from('guest-documents').list(alpha.tenantId,{search:`${prefix}-cross-create.png`});assert.ifError(beforeCreate.error);
  check(beforeCreate.data.length===0,'Cross-tenant INSERT target is genuinely absent before the request');
  await storageDenied(await bravo.client.storage.from('guest-documents').upload(freshPath,image,{contentType:'image/png',upsert:false}),
    'Another tenant cannot INSERT a new document into the owner folder');
  const afterCreate=await admin.storage.from('guest-documents').list(alpha.tenantId,{search:`${prefix}-cross-create.png`});assert.ifError(afterCreate.error);
  check(afterCreate.data.length===0,'Rejected cross-tenant INSERT creates no visible object metadata');
  assert.ifError((await alpha.client.storage.from('guest-documents').upload(freshPath,image,{contentType:'image/png',upsert:false})).error);
  const freshRead=await alpha.client.storage.from('guest-documents').download(freshPath);assert.ifError(freshRead.error);
  check(Buffer.from(await freshRead.data.arrayBuffer()).equals(image),'Owner can create and retrieve that same path as a successful INSERT control');
  const publicUrl=alpha.client.storage.from('guest-documents').getPublicUrl(alpha.documentPath).data.publicUrl;
  check([400,401,403,404].includes((await fetch(publicUrl,{redirect:'error'})).status),'Private guest documents cannot be retrieved through a public object URL');
  const otherListing=await bravo.client.storage.from('guest-documents').list(alpha.tenantId);assert.ifError(otherListing.error);
  check(!otherListing.data.some(o=>o.name===`${prefix}-document.png`),'Storage listing does not disclose another tenant fixture document');
  const crossDelete=await bravo.client.storage.from('guest-documents').remove([alpha.documentPath]);assert.ifError(crossDelete.error);
  check(crossDelete.data.length===0,'Cross-tenant delete API returns no removed objects');
  check(!(await alpha.client.storage.from('guest-documents').download(alpha.documentPath)).error,'A cross-tenant delete request does not remove the owner document');

  const alphaEvents=[],bravoEvents=[],staffEvents=[];
  const bravoRooms=await bravo.client.from('rooms').select('id').eq('hotel_id',bravo.hotelId);assert.ifError(bravoRooms.error);
  const fixtureRoomIds=new Set([...actual.data,...bravoRooms.data].map(value=>value.id));
  const subscribed=await Promise.allSettled([
    subscribeRooms(alpha.client,'owner-alpha',alphaEvents,fixtureRoomIds),
    subscribeRooms(bravo.client,'owner-bravo',bravoEvents,fixtureRoomIds),
    subscribeRooms(staff,'staff-alpha',staffEvents,fixtureRoomIds),
  ]);
  assert.ok(subscribed.every(result=>result.status==='fulfilled'),'All Realtime fixture subscriptions must become live');
  assertRealtimeHealthy();
  const alphaRoom=actual.data[0].id,bravoRoom=bravoRooms.data[0].id,markerA=`${prefix}:alpha`,markerB=`${prefix}:bravo`;
  assert.ifError((await alpha.client.from('rooms').update({notes:markerA}).eq('id',alphaRoom)).error);
  assert.ifError((await bravo.client.from('rooms').update({notes:markerB}).eq('id',bravoRoom)).error);
  const received=(a,b)=>alphaEvents.some(e=>e.id===alphaRoom&&e.marker===a)
    &&bravoEvents.some(e=>e.id===bravoRoom&&e.marker===b)&&staffEvents.some(e=>e.id===alphaRoom&&e.marker===a);
  const assertNoCrossEvents=()=>assert.ok(!alphaEvents.some(e=>e.id===bravoRoom)&&!staffEvents.some(e=>e.id===bravoRoom)&&!bravoEvents.some(e=>e.id===alphaRoom),
    'Realtime must not deliver another fixture tenant event');
  await waitUntil(()=>{assertRealtimeHealthy();assertNoCrossEvents();return received(markerA,markerB)},
  'positive Realtime controls for both tenants and the invited employee');
  check(true,'Both owners and the invited employee receive their authorized room UPDATE events');
  await observeFor(()=>{assertRealtimeHealthy();assertNoCrossEvents()},'live Realtime isolation window');
  check(true,'Unfiltered room UPDATE subscriptions stay live without cross-tenant events during the observation window');
  const finalA=`${markerA}:after-window`,finalB=`${markerB}:after-window`;
  assert.ifError((await alpha.client.from('rooms').update({notes:finalA}).eq('id',alphaRoom)).error);
  assert.ifError((await bravo.client.from('rooms').update({notes:finalB}).eq('id',bravoRoom)).error);
  await waitUntil(()=>{assertRealtimeHealthy();assertNoCrossEvents();return received(finalA,finalB)},'post-window Realtime positive controls');
  check(true,'All three observers still receive authorized events after the negative window');
  const tenant=await admin.from('tenants').select('subscription_status,trial_ends_at').eq('id',alpha.tenantId).single();assert.ifError(tenant.error);
  const receipt=await admin.rpc('get_workspace_provisioning',{p_workspace_id:alpha.workspaceId});assert.ifError(receipt.error);
  check(tenant.data.subscription_status==='trial'&&Date.parse(tenant.data.trial_ends_at)>Date.now()&&receipt.data.tenant_id===alpha.tenantId,
    'The same trial tenant remains linked from signup through employee access and isolation checks');
  check((await clusterDb.pool.query('SELECT directory_required FROM private.roomqc_cluster_config WHERE singleton')).rows[0].directory_required===initialDirectoryRequired,
    'Customer journey tests never toggle the shared legacy/directory cutover flag');
  console.log(`Customer journey verified: ${checks} checks passed (local service integration, not browser E2E).`);
  },'complete customer journey',180000);
} finally {
  const errors=[];
  const clean=async(label,action)=>{try{await withDeadline(action,`cleanup: ${label}`,20000)}catch{errors.push(`${label} (failed or timed out)`)}};
  // Shut observers first: neither deleted-row events nor an open socket should
  // outlive the fixture. Preserve all users/data/mail not owned by this run.
  for(const {guard} of realtimeObservers)guard.stop();
  for(const value of clients)await clean('client sessions',async()=>{
    try {assert.ok((await value.removeAllChannels()).every(status=>status==='ok'),'Channel shutdown must succeed')}
    finally {value.realtime.disconnect();await value.auth.stopAutoRefresh()}
    const session=await value.auth.getSession();assert.ifError(session.error);
    if(session.data.session)assert.ifError((await value.auth.signOut({scope:'local'})).error);
  });
  if(clusterDb) {
    await clean('recover fixture IDs',async()=>{
      const ids=await clusterDb.pool.query('SELECT id FROM auth.users WHERE email=ANY($1::text[]) AND created_at>=$2',[Array.from(emails),startedAt]);
      for(const row of ids.rows)userIds.add(row.id);
      const receipts=await clusterDb.pool.query('SELECT tenant_id FROM private.workspace_provisioning WHERE workspace_id=ANY($1::uuid[])',[Array.from(workspaceIds)]);
      for(const row of receipts.rows)tenantIds.add(row.tenant_id);
    });
  }
  for(const object of objects)await clean('fixture document',async()=>{
    assert.ok(tenantIds.has(object.path.split('/')[0])&&['document','cross-create'].some(suffix=>object.path.endsWith(`/${prefix}-${suffix}.png`)),
      'Cleanup must stay inside an exact owned document path');
    assert.ifError((await admin.storage.from(object.bucket).remove([object.path])).error);
    const folder=object.path.split('/')[0],name=object.path.split('/')[1];
    const remaining=await admin.storage.from(object.bucket).list(folder,{search:name});assert.ifError(remaining.error);
    assert.ok(!remaining.data.some(value=>value.name===name),'Fixture object must actually be absent');
  });
  if(tenantIds.size)await clean('fixture email queue',async()=>{
    const deliveries=await admin.from('email_deliveries').select('id').in('tenant_id',Array.from(tenantIds));assert.ifError(deliveries.error);
    const ids=deliveries.data.map(d=>d.id);
    if(ids.length) {
      await clusterDb.pool.query("DELETE FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=ANY($1::text[])",[ids]);
      assert.ifError((await admin.from('email_send_log').delete().in('message_id',ids)).error);
      assert.ifError((await admin.from('email_deliveries').delete().in('id',ids)).error);
    }
  });
  for(const id of tenantIds)await clean('fixture tenant',async()=>{assert.ifError((await admin.from('tenants').delete().eq('id',id)).error)});
  // Invited employee role rows can reference the inviter through created_by.
  // Remove newest identities before their owners, without deleting FK guards.
  for(const id of Array.from(userIds).reverse())await clean('fixture identity',async()=>{
    const user=await admin.auth.admin.getUserById(id);assert.ifError(user.error);
    assert.ok(emails.has(user.data.user.email),'Only exact fixture identities may be removed');
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  });
  if(clusterDb)await clean('verify fixture database cleanup',async()=>{
    const remaining=await clusterDb.pool.query(`SELECT
      (SELECT count(*)::int FROM auth.users WHERE id=ANY($1::uuid[]) OR email=ANY($2::text[])) AS identities,
      (SELECT count(*)::int FROM public.tenants WHERE id=ANY($3::uuid[])) AS tenants,
      (SELECT count(*)::int FROM auth.sessions WHERE user_id=ANY($1::uuid[])) AS sessions`,
    [Array.from(userIds),Array.from(emails),Array.from(tenantIds)]);
    assert.ok(Object.values(remaining.rows[0]).every(value=>value===0),'No fixture tenant, identity or Auth session may remain');
    if(initialDirectoryRequired!==undefined)assert.equal((await clusterDb.pool.query('SELECT directory_required FROM private.roomqc_cluster_config WHERE singleton')).rows[0].directory_required,initialDirectoryRequired);
  });
  for(const email of emails)await clean('fixture SMTP capture',async()=>{
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);assert.ok(response.ok);
    const remaining=await response.json();
    for(const message of remaining.messages || [])if(message.To?.some(to=>to.Address?.toLowerCase()===email))capturedIds.add(message.ID);
  });
  if(capturedIds.size)await clean('fixture message IDs',async()=>{
    assert.ok((await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:Array.from(capturedIds)})})).ok);
  });
  for(const email of emails)await clean('verify fixture SMTP cleanup',async()=>{
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);assert.ok(response.ok);
    const remaining=await response.json();
    assert.ok(!(remaining.messages || []).some(message=>message.To?.some(to=>to.Address?.toLowerCase()===email)),'Fixture SMTP message must actually be absent');
  });
  if(server)await clean('temporary HTTP server',async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
  if(store)await clean('directory pool',()=>store.close());
  if(clusterDb)await clean('cluster pool',()=>clusterDb.close());
  if(containerStarted)await clean('temporary directory container',()=>docker('rm','-f',container));
  if(errors.length){console.error(`Cleanup incomplete for ${container}: ${errors.join(', ')}. Inspect only this run's fixture resources.`);process.exitCode=1}
  else console.log('Identified journey fixtures, documents, email, sessions and temporary directory container removed; legacy configuration unchanged.');
}
