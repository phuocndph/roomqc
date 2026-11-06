// Executed only by the exact-owned offline backend. No serving DB discovery.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import http from 'node:http';
import pg from '/control/node_modules/pg/lib/index.js';
import {createClient} from '@supabase/supabase-js';
import {migrateDirectory,importInitialRegistry} from '/control/migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '/control/test-fixtures.mjs';
import {startControl} from '/control/server.mjs';
import {assertStorageDenied,waitUntil,observeFor,RealtimeGuard} from './lib/customer-journey-checks.mjs';
import {awaitBrowserCustomerAccess,browserAccessContext} from './control-backend-browser-access.mjs';

const input=JSON.parse(process.env.ROOMQC_FIXTURE_JOURNEY_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword&&input.templates);
const origin='http://127.0.0.1:8000',publicOrigin=input.browserOrigin??'http://127.0.0.1:8082';
if(input.browserOrigin){const url=new URL(publicOrigin);assert.equal(url.origin,publicOrigin);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');}
const prefix='journey-'+input.run,database='roomqc_journey_'+input.run,role='journey_api_'+input.run;
const email=label=>'invitation-'+input.run+'-journey-'+label+'@roomqc.invalid';
const checks=[],clients=[],templateRequests=new Set(),functionResponses=[],realtimeObservers=[],replayObservations=[],realtimeSystem=[];
let phase='prepare',maintenance,directory,runtime,wire,templateServer,sink,created=false,roleCreated=false;
let wireOrigin,dropProvision=false,dropped=false;
let upstreamControl;
const check=(label,condition=true)=>{assert.ok(condition,'JOURNEY_'+label);checks.push({label,passed:true});};
const boundedFetch=async(url,options={})=>{
  const response=await fetch(url,{...options,redirect:'error',
    signal:AbortSignal.any([options.signal,AbortSignal.timeout(20000)].filter(Boolean))});
  const path=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url).pathname;
  if(['/functions/v1/create-user','/functions/v1/staff-invitations'].includes(path)){
    let body;try{body=await response.clone().json();}catch{}
    functionResponses.push({path,status:response.status,version:typeof body?.version==='number'?body.version:null,
      success:body?.success===true,bodyStatus:['invited','pending','accepted','revoked'].includes(body?.status)?body.status:null,
      hasInvitation:!!body?.invitation,fields:body&&typeof body==='object'?Object.keys(body).sort():[]});
  }
  return response;
};
const client=()=>{const value=createClient(origin,input.publishableKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch}});
  clients.push(value);return value;};
const admin=createClient(origin,input.serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
const currentToken=async value=>{const r=await value.auth.getSession();assert.ifError(r.error);assert.ok(r.data.session);return r.data.session.access_token;};
const sessionId=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
const request=async(path,body,token)=>{
  const r=await boundedFetch(wireOrigin+'/api/control'+path,{method:body===undefined?'GET':'POST',headers:{
    Origin:publicOrigin,'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,data:await r.json()};
};
async function login(address,password){const value=client(),r=await value.auth.signInWithPassword({email:address,password});
  assert.ifError(r.error);assert.ok(r.data.session);return value;}
function decodeMail(message){
  return message.raw.replace(/=\r\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
}
function mailCode(address){
  const messages=sink.messages.filter(m=>m.to.length===1&&m.to[0]===address);
  assert.equal(messages.length,1,'Exactly one owned Auth email is expected');
  const decoded=decodeMail(messages[0]);
  const code=decoded.match(/letter-spacing:6px[^>]*>\s*(\d{6})\s*</)?.[1];
  assert.ok(code,'Product email template must contain its OTP');return {code,decoded};
}
async function businessSnapshot(workspace){
  const r=await maintenance.query(`SELECT jsonb_build_object(
    'binding',(SELECT to_jsonb(w) FROM private.workspace_provisioning w WHERE workspace_id=$1),
    'tenant',(SELECT to_jsonb(t) FROM public.tenants t WHERE id=$2),
    'hotels',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY id),'[]') FROM public.hotels h WHERE tenant_id=$2),
    'welcome',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM public.email_deliveries e WHERE tenant_id=$2)) value`,
  [workspace.workspaceId,workspace.tenantId??null]);return r.rows[0].value;
}
async function register(label,rooms,{loseResponse=false}={}){
  phase='registration-'+label;
  await directory.query(`UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp(),
    valid_until=clock_timestamp()+interval '120 seconds',
    evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,checkedAt}',to_jsonb(clock_timestamp()))`);
  const address=email(label),password='Journey!a9'+randomBytes(24).toString('hex'),slug=prefix+'-'+label;
  const fields={fullName:'Journey '+label,phone:'0901234567',tenantName:'Journey '+label,hotelName:'Journey '+label,
    hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:address,totalRooms:rooms};
  const intent={slug,email:address,displayName:'Journey '+label};
  const first=await request('/signup-intents',intent);assert.equal(first.status,201);
  check(label+'-registration-scoped-path',first.data.path==='/app/'+slug+'/auth/register');
  const second=await request('/signup-intents',intent);assert.equal(second.status,201);
  const bootstrap=await request('/workspaces/'+slug+'/bootstrap');assert.equal(bootstrap.status,200);
  const workspaceId=bootstrap.data.workspace.id;
  check(label+'-second-tab-same-reservation',second.data.expiresAt===first.data.expiresAt&&bootstrap.data.workspace.status==='reserved');
  const signupClient=client(),signup=await signupClient.auth.signUp({email:address,password,
    options:{emailRedirectTo:publicOrigin+'/app/'+slug+'/auth/callback',data:{full_name:'Journey '+label}}});
  assert.ifError(signup.error);assert.ok(signup.data.user?.id);
  check(label+'-public-signup-no-session',!signup.data.session&&!signup.data.user.email_confirmed_at);
  const deniedLogin=await client().auth.signInWithPassword({email:address,password});
  check(label+'-unconfirmed-login-denied',deniedLogin.error?.status===400&&deniedLogin.error.code==='email_not_confirmed'&&!deniedLogin.data.session);
  check(label+'-unauthenticated-setup-denied',(await request('/workspaces/'+slug+'/provision',fields)).status===401);
  const {code,decoded}=mailCode(address);
  check(label+'-native-smtp-product-template',decoded.includes('RoomQC')&&templateRequests.has('confirmation'));
  const verification=client(),wrong=await verification.auth.verifyOtp({email:address,token:code==='111111'?'222222':'111111',type:'signup'});
  check(label+'-wrong-otp-denied',wrong.error?.status===403&&wrong.error.code==='otp_expired'&&!wrong.data.session);
  const unconfirmed=await admin.auth.admin.getUserById(signup.data.user.id);assert.ifError(unconfirmed.error);
  check(label+'-wrong-otp-no-identity-change',!unconfirmed.data.user.email_confirmed_at);
  const verified=await verification.auth.verifyOtp({email:address,token:code,type:'signup'});assert.ifError(verified.error);
  check(label+'-fresh-client-otp-confirms-original-user',verified.data.user?.id===signup.data.user.id&&!!verified.data.session);
  const reused=await client().auth.verifyOtp({email:address,token:code,type:'signup'});
  check(label+'-used-otp-denied',reused.error?.code==='otp_expired'&&!reused.data.session);
  const owner=await login(address,password),ownerToken=await currentToken(owner);
  const before=await businessSnapshot({workspaceId});
  check(label+'-verification-does-not-create-tenant',before.binding===null&&before.tenant===null);
  const ready=await request('/workspaces/'+slug+'/setup-status',undefined,ownerToken);
  check(label+'-verified-owner-ready',ready.status===200&&ready.data.step==='ready_to_setup');
  if(loseResponse){dropProvision=true;let failed=false;try{await request('/workspaces/'+slug+'/provision',fields,ownerToken);}catch{failed=true;}
    check(label+'-real-postcommit-response-lost',failed&&dropped);}
  const result=await request('/workspaces/'+slug+'/provision',fields,ownerToken);assert.equal(result.status,200);
  assert.ok(result.data.success&&result.data.tenant_id&&result.data.hotel_id);
  const item={client:owner,token:ownerToken,userId:signup.data.user.id,email:address,password,slug,workspaceId,
    tenantId:result.data.tenant_id,hotelId:result.data.hotel_id};
  if(loseResponse)check(label+'-lost-response-retry-same-binding',result.data.idempotent===true);
  const receipt=await admin.rpc('get_workspace_provisioning',{p_workspace_id:workspaceId});assert.ifError(receipt.error);
  check(label+'-owner-workspace-tenant-hotel-bound',receipt.data.owner_id===item.userId&&receipt.data.tenant_id===item.tenantId&&receipt.data.hotel_id===item.hotelId);
  const beforeReplay=await businessSnapshot(item);
  const retries=await Promise.all(Array.from({length:10},()=>request('/workspaces/'+slug+'/provision',fields,ownerToken)));
  const afterReplay=await businessSnapshot(item);
  replayObservations.push({label,responses:retries.map(r=>({status:r.status,idempotent:r.data?.idempotent===true,
    sameTenant:r.data?.tenant_id===item.tenantId,error:/^[A-Z_]{2,80}$/.test(r.data?.error??'')?r.data.error:null})),
    changedSections:Object.keys(beforeReplay).filter(k=>JSON.stringify(beforeReplay[k])!==JSON.stringify(afterReplay[k]))});
  check(label+'-concurrent-replay-no-business-effects',retries.every(r=>r.status===200&&r.data.idempotent===true&&r.data.tenant_id===item.tenantId)
    &&JSON.stringify(afterReplay)===JSON.stringify(beforeReplay));
  const trial=beforeReplay.tenant,welcome=beforeReplay.welcome;
  check(label+'-single-trial-and-welcome',trial.subscription_status==='trial'&&!!trial.trial_ends_at&&welcome.length===1
    &&welcome[0].template_data.path==='/app/'+slug+'/auth/login');
  const active=await request('/workspaces/'+slug+'/setup-status',undefined,ownerToken);
  check(label+'-setup-status-active',active.status===200&&active.data.step==='active');
  return item;
}
const room=number=>({room_number:String(number),floor:1,room_type:'standard',max_guests:2,base_price:450000,hourly_price:120000,monthly_price:6000000});
async function rooms(item,numbers){
  phase='rooms-'+item.slug;
  const initial=await item.client.rpc('get_hotel_room_setup',{p_hotel_id:item.hotelId});assert.ifError(initial.error);
  check(item.slug+'-initial-room-target',initial.data.version===0&&initial.data.expected_rooms===numbers.length&&initial.data.actual_rooms===0);
  const saved=await item.client.rpc('save_hotel_room_setup',{p_hotel_id:item.hotelId,p_expected_version:0,p_rooms:numbers.map(room)});assert.ifError(saved.error);
  const fresh=await login(item.email,item.password),restored=await fresh.rpc('get_hotel_room_setup',{p_hotel_id:item.hotelId});assert.ifError(restored.error);
  check(item.slug+'-new-device-restores-draft',restored.data.request_id===saved.data.request_id&&restored.data.rooms.length===numbers.length);
  const payload={p_hotel_id:item.hotelId,p_request_id:saved.data.request_id,p_version:saved.data.version,p_confirm_prices:true};
  const denied=await item.client.rpc('complete_hotel_room_setup',{...payload,p_confirm_prices:false});
  check(item.slug+'-room-prices-require-confirmation',denied.error?.code==='22023');
  const complete=await fresh.rpc('complete_hotel_room_setup',payload);assert.ifError(complete.error);
  const replay=await item.client.rpc('complete_hotel_room_setup',payload);assert.ifError(replay.error);
  const actual=await item.client.from('rooms').select('id,tenant_id,hotel_id,status,base_price').eq('hotel_id',item.hotelId);assert.ifError(actual.error);
  check(item.slug+'-room-commit-and-replay-once',complete.data.actual_rooms===numbers.length&&replay.data.idempotent===true&&actual.data.length===numbers.length
    &&actual.data.every(r=>r.tenant_id===item.tenantId&&r.status==='vacant_clean'&&r.base_price===450000));
  item.rooms=actual.data;
}
async function storageDenial(value,label,status=403){await assertStorageDenied(value,status,label);check(label);}
async function subscribeRooms(value,label,events,ids){
  const guard=new RealtimeGuard(label);realtimeObservers.push({guard,value});
  value.__journeyRealtimeEvents=events;
  await value.realtime.setAuth(await currentToken(value));
  value.channel(prefix+'-'+label).on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms'},payload=>{
    if(!ids.has(payload.new.id)){guard.status('CHANNEL_ERROR');return;}
    events.push({id:payload.new.id,marker:payload.new.notes});
  }).on('system',{},payload=>{
    if(payload.extension==='postgres_changes')guard.postgresStatus(payload.status);
    if(realtimeSystem.length<12)realtimeSystem.push({label,status:['ok','error'].includes(payload.status)?payload.status:null,
      extension:payload.extension==='postgres_changes'?'postgres_changes':null,
      errorCode:/^[A-Za-z0-9_]{2,80}$/.test(payload.code??'')?payload.code:null,
      // This message is vendor-generated in an exact-owned fixture. Keep only
      // fixed diagnostic classifications, never its text or subscription JWT.
      missingPublication:/publication.*not.*exist/i.test(payload.message??''),
      permissionDenied:/permission denied/i.test(payload.message??''),
      unableSubscribe:/unable.*subscri/i.test(payload.message??'')});
  }).subscribe(status=>guard.status(status));
  // The pinned server acknowledges the channel join before asynchronously
  // creating its PostgreSQL subscription/slot. Wait for the native CDC ack,
  // otherwise a write before slot creation can never appear in its stream.
  await waitUntil(()=>{guard.assertNotFailed();return guard.subscribed&&guard.postgresReady;},'owned-journey-realtime-'+label,25000);
  guard.assertPostgresReady(value.realtime.isConnected());
}
function realtimeHealthy(){for(const {guard,value} of realtimeObservers)guard.assertPostgresReady(value.realtime.isConnected());}
async function realtimeDatabaseSnapshot(){
  return (await maintenance.query(`SELECT jsonb_build_object(
    'roomsPublication',(SELECT jsonb_build_object('update',p.pubupdate,'member',EXISTS(SELECT 1 FROM pg_publication_tables t
      WHERE t.pubname=p.pubname AND t.schemaname='public' AND t.tablename='rooms')) FROM pg_publication p WHERE p.pubname='supabase_realtime'),
    'roomSubscriptions',(SELECT count(*) FROM realtime.subscription WHERE entity='public.rooms'::regclass),
    'slots',(SELECT coalesce(jsonb_agg(jsonb_build_object('plugin',plugin,'active',active,
      'pending',pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)>0)),'[]') FROM pg_replication_slots),
    'replicationConnections',(SELECT count(*) FROM pg_stat_replication)) value`)).rows[0].value;
}
const memoryStorage=()=>{const values=new Map();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,
  getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
let result;
try{
  sink=await createInvitationSmtpSink({run:input.run,recipients:['alpha','bravo','employee'].map(email)});
  templateServer=http.createServer((req,res)=>{
    const name=req.url?.slice(1);if(!['confirmation','invite'].includes(name)){res.writeHead(404);res.end();return;}
    templateRequests.add(name);res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(input.templates[name]);
  });
  await new Promise((resolve,reject)=>{templateServer.once('error',reject);templateServer.listen(2526,'0.0.0.0',resolve);});
  maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:15000});
  if(input.management){
    const managed=input.management;
    assert.equal(managed.run,input.run);assert.equal(managed.origin,'http://roomqc-web:8080');
    const dsn=new URL(managed.databaseUrl);
    assert.equal(dsn.hostname,'roomqc-directory');assert.equal(dsn.pathname,'/roomqc_control');
    assert.equal(dsn.searchParams.get('sslmode'),'verify-full');dsn.searchParams.delete('sslmode');
    directory=new pg.Pool({connectionString:dsn.href,ssl:{ca:managed.ca,rejectUnauthorized:true},max:1,statement_timeout:15000});
    const identity=(await directory.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()")).rows[0];
    check('installed-directory-native-tls',identity.ssl===true);
    const marker=(await directory.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0];
    check('installed-directory-deployment-owner',marker.marker.includes(managed.deploymentId));
    upstreamControl=managed.origin;
  }else{
  await maintenance.query('CREATE DATABASE '+database);created=true;
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:15000});
  await migrateDirectory(directory);
  const cluster={id:'cluster-a',url:input.browserOrigin?publicOrigin:origin,internalUrl:origin,
    publishableKey:input.publishableKey,serviceKey:input.serviceKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99};
  await importInitialRegistry(directory,[cluster]);await seedOperationalCluster(directory,cluster.id,{cluster});
  const dbPassword=randomBytes(32).toString('hex');
  await directory.query(`CREATE ROLE ${role} LOGIN PASSWORD '${dbPassword}' IN ROLE roomqc_control_api`);roleCreated=true;
  const cfg={...fixtureConfig('postgresql://'+role+':'+dbPassword+'@db/'+database,[cluster]),
    publicOrigin,signupEnabled:true,setupDispatchEnabled:true,shutdownTimeoutMs:2000,
    ...(input.browserOrigin?{host:'0.0.0.0',port:8091}:{})};
  runtime=await startControl(cfg);await runtime.store.readiness();
  upstreamControl='http://127.0.0.1:'+runtime.server.address().port;
  }
  wire=http.createServer(async(req,res)=>{
    try{const body=[];let bytes=0;for await(const part of req){bytes+=part.length;assert.ok(bytes<=16384);body.push(part);}
      const upstream=await boundedFetch(upstreamControl+req.url,{method:req.method,
        headers:{...req.headers,host:'127.0.0.1',connection:'close'},...(body.length?{body:Buffer.concat(body)}:{})});
      const data=await upstream.arrayBuffer();
      if(dropProvision&&req.url.endsWith('/provision')&&upstream.status===200){dropProvision=false;dropped=true;res.destroy();return;}
      res.writeHead(upstream.status,Object.fromEntries(upstream.headers));res.end(Buffer.from(data));
    }catch{if(!res.destroyed){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"OWNED_JOURNEY_PROXY_FAILED"}');}}
  });
  await new Promise((resolve,reject)=>{wire.once('error',reject);wire.listen(0,'127.0.0.1',resolve);});
  wireOrigin='http://127.0.0.1:'+wire.address().port;
  for(const name of ['create-user','staff-invitations']){
    const end=Date.now()+25000;let ready=false;
    do{
      const r=await boundedFetch(origin+'/functions/v1/'+name,{method:'OPTIONS',headers:{Origin:publicOrigin,'Access-Control-Request-Method':'POST'}});
      ready=r.status===200&&r.headers.get('access-control-allow-origin')===publicOrigin;await r.body?.cancel();
      if(ready)break;await new Promise(resolve=>setTimeout(resolve,200));
    }while(Date.now()<end);
    check(name+'-actual-gateway-route-and-cors-ready',ready);
  }
  const alpha=await register('alpha',3,{loseResponse:true});await rooms(alpha,[101,102,103]);
  phase='staff-invitation';
  const positions=await alpha.client.from('positions').select('id,department,user_level_code').eq('tenant_id',alpha.tenantId);assert.ifError(positions.error);
  let position=positions.data.find(p=>p.user_level_code==='staff'&&p.department==='housekeeping');
  if(!position){const added=await alpha.client.from('positions').insert({tenant_id:alpha.tenantId,code:'JOURNEY-HK',name:'Fixture housekeeping',
    user_level_code:'staff',department:'housekeeping'}).select('id,department,user_level_code').single();assert.ifError(added.error);position=added.data;}
  const inviteAdmin=RoomQCInvitationAdmin.createInvitationAdminClient({endpoint:origin,publishableKey:input.publishableKey,
    path:'/app/'+alpha.slug+'/auth/accept-invite',fetch:boundedFetch,getSession:()=>alpha.client.auth.getSession()});
  const invitation=await inviteAdmin.create({actorId:alpha.userId,sessionId:sessionId(alpha.token),tenantId:alpha.tenantId},
    {email:email('employee'),fullName:'Journey employee',userLevelCode:'staff',hotelId:alpha.hotelId,positionId:position.id});
  const pending=await admin.from('staff_invitations').select('id,auth_user_id,status,password_set_at').eq('id',invitation.id).single();assert.ifError(pending.error);
  const noProfile=await admin.from('users').select('id').eq('id',pending.data.auth_user_id);assert.ifError(noProfile.error);
  check('compiled-owner-invitation-native-recipient-no-profile',pending.data.status==='pending'&&!pending.data.password_set_at&&noProfile.data.length===0);
  const employeeMail=mailCode(email('employee'));
  check('invitation-mail-product-template-and-workspace',templateRequests.has('invite')&&employeeMail.decoded.includes('/app/'+alpha.slug+'/auth/accept-invite'));
  const employee=client(),coordinator=RoomQCEmailCaller.createEmailAuthCoordinator({endpoint:origin,publishableKey:input.publishableKey,
    tenantId:alpha.tenantId,storage:memoryStorage(),fetch:boundedFetch,randomUUID,
    send:async()=>{throw new Error('Recipient never sends its own invitation');},verifyOtp:args=>employee.auth.verifyOtp(args),
    getSession:()=>employee.auth.getSession(),clearSession:()=>RoomQCEmailSession.clearIsolatedEmailSession(employee.auth)});
  const verifiedEmployee=await coordinator.verify('invite',email('employee'),employeeMail.code);
  check('compiled-recipient-verifies-real-invite-otp',verifiedEmployee.id===pending.data.auth_user_id);
  const invitationClient=RoomQCStaffInvitationCaller.createStaffInvitationClient({endpoint:origin,publishableKey:input.publishableKey,
    tenantId:alpha.tenantId,fetch:boundedFetch,getSession:()=>employee.auth.getSession()});
  const mine=await invitationClient.mine(verifiedEmployee.id);assert.ok(mine);
  let passwordRequired=false;try{await invitationClient.accept(verifiedEmployee.id,mine);}catch(e){passwordRequired=e.code==='invitation_unconfirmed';}
  check('invitation-cannot-activate-before-password',passwordRequired);
  const beforePassword=await admin.from('users').select('id').eq('id',verifiedEmployee.id);assert.ifError(beforePassword.error);
  check('denied-acceptance-still-no-active-profile',beforePassword.data.length===0);
  const employeePassword='JourneyStaff!a9'+randomBytes(24).toString('hex');
  const passwordReceipt=await coordinator.finish('invite',employeePassword);
  const nativePassword=(await maintenance.query('SELECT actor_id::text,session_id::text FROM private.password_change_receipts WHERE id=$1',
    [passwordReceipt.changeId])).rows[0];
  const ended=(await maintenance.query('SELECT NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=$1) AS ended',[nativePassword?.session_id])).rows[0].ended;
  check('compiled-password-accept-and-logout-complete',nativePassword?.actor_id===verifiedEmployee.id&&ended);
  await coordinator.dispose();
  check('disposed-otp-client-clears-native-ended-session',!(await employee.auth.getSession()).data.session);
  phase='fresh-staff-login';
  const staff=await login(email('employee'),employeePassword);
  const profile=await staff.from('users').select('tenant_id,hotel_id,position_id,department,user_level_code,must_change_password').eq('id',verifiedEmployee.id).single();assert.ifError(profile.error);
  check('fresh-staff-login-has-intended-assignment',profile.data.tenant_id===alpha.tenantId&&profile.data.hotel_id===alpha.hotelId
    &&profile.data.position_id===position.id&&profile.data.department==='housekeeping'&&profile.data.user_level_code==='staff'&&!profile.data.must_change_password);
  const roles=await staff.from('user_roles').select('role').eq('user_id',verifiedEmployee.id);assert.ifError(roles.error);
  check('staff-role-without-management-escalation',roles.data.length===1&&roles.data[0].role==='staff');
  const staffRooms=await staff.from('rooms').select('id').eq('hotel_id',alpha.hotelId);assert.ifError(staffRooms.error);
  check('staff-can-use-assigned-hotel',staffRooms.data.length===3);
  const deniedSetup=await staff.rpc('get_hotel_room_setup',{p_hotel_id:alpha.hotelId});
  check('staff-cannot-run-owner-setup',deniedSetup.error?.code==='42501');
  const beforeStaffPlan=await businessSnapshot(alpha);
  const escalate=await staff.from('tenants').update({subscription_status:'active'}).eq('id',alpha.tenantId);
  check('staff-cannot-self-activate-subscription',escalate.error?.code==='42501'&&JSON.stringify(await businessSnapshot(alpha))===JSON.stringify(beforeStaffPlan));
  const bravo=await register('bravo',1);await rooms(bravo,[201]);
  check('second-customer-distinct-tenant-and-hotel',bravo.tenantId!==alpha.tenantId&&bravo.hotelId!==alpha.hotelId);
  phase='cross-tenant';
  for(const [label,value,other] of [['owner',alpha.client,bravo],['staff',staff,bravo],['second-owner',bravo.client,alpha]]){
    const hidden=await value.from('rooms').select('id').eq('hotel_id',other.hotelId);assert.ifError(hidden.error);
    check(label+'-other-hotel-rooms-hidden',hidden.data.length===0);
    const denied=await value.rpc('get_hotel_room_setup',{p_hotel_id:other.hotelId});
    check(label+'-other-hotel-setup-denied',denied.error?.code==='42501');
  }
  const otherSetup=await request('/workspaces/'+alpha.slug+'/setup-status',undefined,await currentToken(bravo.client));
  check('second-owner-cannot-resume-first-workspace',[401,403].includes(otherSetup.status));
  phase='storage-isolation';
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG7sAAAAASUVORK5CYII=','base64');
  for(const [label,item] of [['alpha',alpha],['bravo',bravo]]){
    item.documentPath=item.tenantId+'/'+prefix+'-document.png';
    assert.ifError((await item.client.storage.from('guest-documents').upload(item.documentPath,image,{contentType:'image/png',upsert:false})).error);
    const own=await item.client.storage.from('guest-documents').download(item.documentPath);assert.ifError(own.error);
    check(label+'-private-document-upload-exact-download',Buffer.from(await own.data.arrayBuffer()).equals(image));
    await storageDenial(await item.client.storage.from('guest-documents').upload(item.documentPath,image,{contentType:'image/png',upsert:true}),label+'-private-document-overwrite-denied');
    const unchanged=await item.client.storage.from('guest-documents').download(item.documentPath);assert.ifError(unchanged.error);
    check(label+'-rejected-overwrite-preserves-bytes',Buffer.from(await unchanged.data.arrayBuffer()).equals(image));
  }
  const staffDocument=await staff.storage.from('guest-documents').download(alpha.documentPath);assert.ifError(staffDocument.error);
  check('same-tenant-staff-private-document-readable',Buffer.from(await staffDocument.data.arrayBuffer()).equals(image));
  await storageDenial(await bravo.client.storage.from('guest-documents').download(alpha.documentPath),'cross-tenant-private-download-denied',404);
  await storageDenial(await bravo.client.storage.from('guest-documents').createSignedUrl(alpha.documentPath,60),'cross-tenant-signed-link-denied',404);
  await storageDenial(await client().storage.from('guest-documents').download(alpha.documentPath),'anonymous-private-download-denied',404);
  await storageDenial(await bravo.client.storage.from('guest-documents').upload(alpha.documentPath,Buffer.concat([image,Buffer.from('\n')]),
    {contentType:'image/png',upsert:true}),'cross-tenant-private-overwrite-denied');
  const original=await alpha.client.storage.from('guest-documents').download(alpha.documentPath);assert.ifError(original.error);
  check('cross-tenant-overwrite-preserves-original',Buffer.from(await original.data.arrayBuffer()).equals(image));
  const fresh=alpha.tenantId+'/'+prefix+'-cross-create.png';
  const beforeCreate=await admin.storage.from('guest-documents').list(alpha.tenantId,{search:prefix+'-cross-create.png'});assert.ifError(beforeCreate.error);
  check('cross-tenant-insert-target-absent',beforeCreate.data.length===0);
  await storageDenial(await bravo.client.storage.from('guest-documents').upload(fresh,image,{contentType:'image/png',upsert:false}),'cross-tenant-private-insert-denied');
  const afterCreate=await admin.storage.from('guest-documents').list(alpha.tenantId,{search:prefix+'-cross-create.png'});assert.ifError(afterCreate.error);
  check('cross-tenant-insert-no-object-created',afterCreate.data.length===0);
  assert.ifError((await alpha.client.storage.from('guest-documents').upload(fresh,image,{contentType:'image/png',upsert:false})).error);
  const control=await alpha.client.storage.from('guest-documents').download(fresh);assert.ifError(control.error);
  check('owner-can-create-same-target',Buffer.from(await control.data.arrayBuffer()).equals(image));
  const publicUrl=alpha.client.storage.from('guest-documents').getPublicUrl(alpha.documentPath).data.publicUrl;
  const publicResponse=await boundedFetch(publicUrl);await publicResponse.body?.cancel();
  check('private-document-public-url-denied',[400,401,403,404].includes(publicResponse.status));
  const listing=await bravo.client.storage.from('guest-documents').list(alpha.tenantId);assert.ifError(listing.error);
  check('cross-tenant-private-listing-hidden',!listing.data.some(x=>x.name===prefix+'-document.png'));
  const deletion=await bravo.client.storage.from('guest-documents').remove([alpha.documentPath]);assert.ifError(deletion.error);
  check('cross-tenant-delete-has-no-effects',deletion.data.length===0);
  const preserved=await alpha.client.storage.from('guest-documents').download(alpha.documentPath);assert.ifError(preserved.error);
  check('cross-tenant-delete-preserves-owner-document',Buffer.from(await preserved.data.arrayBuffer()).equals(image));
  phase='realtime-isolation';
  const eventsA=[],eventsB=[],eventsStaff=[],ids=new Set([...alpha.rooms,...bravo.rooms].map(r=>r.id));
  await Promise.all([subscribeRooms(alpha.client,'owner-alpha',eventsA,ids),subscribeRooms(bravo.client,'owner-bravo',eventsB,ids),
    subscribeRooms(staff,'staff-alpha',eventsStaff,ids)]);
  const alphaRoom=alpha.rooms[0].id,bravoRoom=bravo.rooms[0].id;
  const noCross=()=>assert.ok(!eventsA.some(e=>e.id===bravoRoom)&&!eventsStaff.some(e=>e.id===bravoRoom)&&!eventsB.some(e=>e.id===alphaRoom),'Owned realtime cross-tenant event');
  const received=(a,b)=>eventsA.some(e=>e.id===alphaRoom&&e.marker===a)&&eventsStaff.some(e=>e.id===alphaRoom&&e.marker===a)&&eventsB.some(e=>e.id===bravoRoom&&e.marker===b);
  const update=async(suffix)=>{
    phase='realtime-mutation-'+suffix;
    const a=prefix+'-alpha-'+suffix,b=prefix+'-bravo-'+suffix;
    const writtenA=await alpha.client.from('rooms').update({notes:a}).eq('id',alphaRoom).select('id,notes');assert.ifError(writtenA.error);
    const writtenB=await bravo.client.from('rooms').update({notes:b}).eq('id',bravoRoom).select('id,notes');assert.ifError(writtenB.error);
    check('both-owner-updates-persisted-'+suffix,writtenA.data.length===1&&writtenA.data[0].notes===a&&writtenB.data.length===1&&writtenB.data[0].notes===b);
    phase='realtime-events-'+suffix;
    await waitUntil(()=>{realtimeHealthy();noCross();return received(a,b);},'owned-room-updates-'+suffix,25000);
  };
  await update('before');check('both-owners-and-staff-receive-authorized-realtime-events');
  await observeFor(()=>{realtimeHealthy();noCross();},'owned-realtime-isolation-window');
  check('unfiltered-realtime-stays-live-without-cross-tenant-events');
  await update('after');check('all-realtime-observers-receive-after-isolation-window');
  const finalTenant=await admin.from('tenants').select('subscription_status,trial_ends_at').eq('id',alpha.tenantId).single();assert.ifError(finalTenant.error);
  const finalBinding=await admin.rpc('get_workspace_provisioning',{p_workspace_id:alpha.workspaceId});assert.ifError(finalBinding.error);
  check('same-trial-and-binding-remain-through-entire-journey',finalTenant.data.subscription_status==='trial'
    &&Date.parse(finalTenant.data.trial_ends_at)>Date.now()&&finalBinding.data.tenant_id===alpha.tenantId);
  check('owned-smtp-exactly-two-signups-one-invitation',sink.messages.length===3&&sink.attempts===3);
  result={verified:true,checks,actualPublicSignup:true,actualEmailConfirmation:true,actualSmtp:true,actualControlApi:true,
    controlRuntime:input.management?'installed-management-image':'in-process-fixture',dedicatedManagementDirectory:!!input.management,
    actualSetupDispatch:true,actualCompiledInvitationClients:true,actualCompiledPasswordCoordinator:true,
    actualRoomSetup:true,actualFreshStaffLogin:true,crossTenantRestRpc:true,crossTenantStorage:true,crossTenantRealtime:true,lostProvisionResponse:true,
    healthAndReleaseApproval:'synthetic-directory-fixture',externalEmail:false,browserE2e:false,vps:false};
  if(input.browserOrigin){
    phase='browser-account-review';
    const actors=[{...alpha,label:'owner',id:alpha.userId},
      {label:'staff',id:verifiedEmployee.id,email:email('employee'),password:employeePassword,slug:alpha.slug},
      {...bravo,label:'second-owner',id:bravo.userId}];
    browserAccessContext({run:input.run,publicOrigin,actors});
    result.browserAccess=await awaitBrowserCustomerAccess({run:input.run,publicOrigin,actors,db:maintenance,
      unchanged:async()=>JSON.stringify({alpha:await businessSnapshot(alpha),bravo:await businessSnapshot(bravo),
        rooms:(await maintenance.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) value FROM public.rooms r WHERE tenant_id=ANY($1::uuid[])',[ [alpha.tenantId,bravo.tenantId] ])).rows[0].value,
        employee:(await maintenance.query(`SELECT jsonb_build_object(
          'profile',(SELECT jsonb_build_object('id',u.id,'tenant',u.tenant_id,'hotel',u.hotel_id,'level',u.user_level_code,
            'role',u.role,'position',u.position_id,'department',u.department,'status',u.status,
            'locked',u.account_locked,'passwordRequired',u.must_change_password) FROM public.users u WHERE id=$1),
          'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY role) FROM public.user_roles r WHERE user_id=$1),
          'memberships',(SELECT jsonb_agg(to_jsonb(h) ORDER BY hotel_id) FROM public.user_hotels h WHERE user_id=$1)) value`,[verifiedEmployee.id])).rows[0].value})});
    result.event='browser_fixture_finished';result.run=input.run;
  }
}catch(error){
  result={verified:false,phase,checks,functionResponses,replayObservations,errorCode:/^[A-Za-z0-9_-]{2,80}$/.test(error?.code??'')?error.code:'OWNED_JOURNEY_FAILED',
    failedCheck:/^JOURNEY_[a-z0-9-]+$/.test(error?.message??'')?error.message:undefined,
    timeoutLabel:/^Timed out: ([a-z0-9_-]+)$/.exec(error?.message??'')?.[1],
    assertion:typeof error?.operator==='string'?error.operator:undefined,
    actualNumber:typeof error?.actual==='number'?error.actual:undefined,expectedNumber:typeof error?.expected==='number'?error.expected:undefined};
  result.realtimeObservers=realtimeObservers.map(({guard,value})=>({label:guard.label,subscribed:guard.subscribed,
    postgresReady:guard.postgresReady,failed:guard.failed,stopped:guard.stopped,lastStatus:guard.lastStatus,statuses:guard.statuses,
    connected:value.realtime.isConnected(),eventCount:value.__journeyRealtimeEvents?.length??null,
    eventRoomIds:[...new Set((value.__journeyRealtimeEvents??[]).map(event=>event.id))].length,
    eventMarkers:(value.__journeyRealtimeEvents??[]).slice(-4).map(event=>typeof event.marker==='string'?event.marker.slice(-24):null)}));
  result.realtimeSystem=realtimeSystem;
  if(phase.startsWith('realtime')){
    try{result.realtimeDatabase=await realtimeDatabaseSnapshot();}catch{result.realtimeDatabase={snapshotFailed:true};}
  }
  // Node assertions can contain credential-bearing SDK objects. Retain no raw
  // exception or actual/expected payload in the receipt or the console.
}finally{
  for(const {guard} of realtimeObservers)guard.stop();
  for(const value of clients){await value.removeAllChannels();value.realtime.disconnect();await value.auth.stopAutoRefresh();}
  if(wire){wire.closeAllConnections();await new Promise(resolve=>wire.close(resolve));}
  if(runtime)await runtime.shutdown();
  if(directory)await directory.end();
  if(maintenance){
    if(created)await maintenance.query('DROP DATABASE '+database+' WITH (FORCE)');
    if(roleCreated)await maintenance.query('DROP ROLE '+role);
    await maintenance.end();
  }
  if(templateServer){templateServer.closeAllConnections();await new Promise(resolve=>templateServer.close(resolve));}
  if(sink)await sink.close();
}
process.stdout.write(JSON.stringify(result)+'\n');
if(!result.verified)process.exitCode=1;
