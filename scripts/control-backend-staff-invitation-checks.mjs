// Defensive contract regression in an exact-owned disposable backend. Fixed
// internal origins, synthetic identities and process-local SMTP capture only.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';

const input=JSON.parse(process.env.ROOMQC_FIXTURE_INVITATION_INPUT);
assert.match(input.run,/^[a-f0-9]{12}$/);
const {default:pg}=await import('/control/node_modules/pg/lib/index.js');
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:2,statement_timeout:12000,connectionTimeoutMillis:5000,application_name:'owned-invitation-'+input.run});
const checks=[];let phase='fixtures',complete=false,errorCode=null,errorConstraint=null,actor=null,invitation=null;
const expected=['pre-profile-mine','password-setup-required','admin-reset-not-native-setup','native-otp-password-setup',
  'pending-status-read','expired-invitation','revoked-invitation','wrong-workspace','inactive-inviter','banned-inviter',
  'expired-native-session','signed-out-session','new-session-resume','concurrent-accept-one-result','accepted-status-read',
  'removed-membership-no-regrant','removed-role-no-regrant','locked-profile','restored-replay','retired-rpc-unavailable',
  'user-cannot-call-service-adapter','bounded-request-body'];
const callerChecks=[],callerExpected=['compiled-client-pre-profile-mine','compiled-client-new-session-resume',
  'compiled-client-old-session-no-dispatch','compiled-client-accepted-replay','compiled-client-accepted-status',
  'actual-email-invitation-loss-after-commit','actual-email-invitation-status-recovery'];
const managementChecks=[];
const adminChecks=[],adminExpected=['compiled-admin-list-selected-hotel','compiled-admin-list-all-hotels',
  'compiled-admin-wrong-tenant-no-effects','compiled-admin-old-session-no-dispatch','compiled-admin-resend-cooldown',
  'compiled-admin-wrong-hotel-no-effects','compiled-admin-revoke-verified','compiled-admin-revoke-replay',
  'compiled-admin-page-first-50','compiled-admin-page-complete-over-100','compiled-admin-page-all-hotels',
  'compiled-admin-page-capability-revoked','compiled-admin-page-expired-session',
  'compiled-admin-page-invalid-cursor','compiled-admin-page-recovery'];
let deliveryControls=null,authorityControls=null;
let callerDispatches=0;
const callerClient=()=>RoomQCStaffInvitationCaller.createStaffInvitationClient({
  endpoint:'http://staff-invitation-test:9000',publishableKey:input.publishableKey,tenantId:invitation.tenant_id,
  getSession:async()=>({data:{session:{access_token:actor.token,user:{id:actor.id}}},error:null}),
  fetch:async(url,options)=>{assert.equal(String(url),'http://staff-invitation-test:9000/functions/v1/staff-invitations');callerDispatches++;
    return fetch(url,{...options,headers:{...options.headers,Origin:'http://127.0.0.1:8082'}});},
});
const callerTarget=()=>({id:invitation.id,tenantId:invitation.tenant_id,hotelId:invitation.hotel_id});
function callerRecord(label,details,passed){callerChecks.push({label,...details,passed:Boolean(passed)});assert.equal(Boolean(passed),true,label);}
async function call(path,token,body,method='POST'){
  const response=await fetch('http://127.0.0.1:8000'+path,{method,signal:AbortSignal.timeout(15000),
    headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});
  let data;try{data=await response.json()}catch{data=null}return {status:response.status,data};
}
async function edge(user,body,raw=false){
  const response=await fetch('http://staff-invitation-test:9000/',{method:'POST',signal:AbortSignal.timeout(15000),
    headers:{authorization:'Bearer '+user.token,'content-type':'application/json',Origin:'http://127.0.0.1:8082'},
    body:raw?body:JSON.stringify(body)});
  assert.equal(response.headers.get('cache-control'),'no-store');
  let data;try{data=await response.json()}catch{data=null}return {status:response.status,data};
}
const sid=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
async function login(user){
  const v=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:user.email,password:user.password});
  assert.equal(v.status,200);user.token=v.data.access_token;user.sessionId=sid(user.token);
}
async function account(label){
  const email='invitation-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const v=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(v.status,200);
  const user={id:v.data.id,email,password};await login(user);return user;
}
function record(label,details,passed){checks.push({label,...details,passed:Boolean(passed)});assert.equal(Boolean(passed),true,label);}
const snapshot=async()=> (await db.query(`SELECT jsonb_build_object(
  'invitation',(SELECT to_jsonb(i) FROM public.staff_invitations i WHERE id=$2),
  'profile',(SELECT to_jsonb(u) FROM public.users u WHERE id=$1),
  'roles',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY role),'[]') FROM public.user_roles r WHERE user_id=$1),
  'memberships',(SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY hotel_id),'[]') FROM public.user_hotels h WHERE user_id=$1),
  'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.activity_logs a WHERE entity_id=$1),
  'usage',(SELECT to_jsonb(t) FROM public.tenant_usage t WHERE tenant_id=$3)) AS value`,
  [actor.id,invitation.id,invitation.tenant_id])).rows[0].value;
async function denied(label,body,statuses){
  const before=await snapshot(),result=await edge(actor,body),after=await snapshot();
  record(label,{status:result.status,effectsUnchanged:JSON.stringify(before)===JSON.stringify(after)},
    statuses.includes(result.status)&&result.data?.success!==true&&JSON.stringify(before)===JSON.stringify(after));
}
try{
  const owner=await account('owner');actor=await account('employee');
  const provision=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:owner.id,
    p_fields:{fullName:'Owned invitation owner',phone:'0901234567',tenantName:'Owned invitation fixture',hotelName:'Owned invitation fixture',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:owner.email,totalRooms:3}});
  assert.equal(provision.status,200);assert.equal(provision.data.success,true);
  const tenant=provision.data.tenant_id,hotel=provision.data.hotel_id,position=randomUUID();
  const plan=(await db.query(`INSERT INTO public.subscription_plans
    SELECT (jsonb_populate_record(NULL::public.subscription_plans,to_jsonb(sp)||jsonb_build_object(
      'id',gen_random_uuid(),'code',$2::text,'name','Owned invitation plan','max_users',32))).*
    FROM public.tenants t JOIN public.subscription_plans sp ON sp.id=t.subscription_plan_id WHERE t.id=$1 RETURNING id`,
    [tenant,'owned-invitation-'+input.run])).rows[0];assert.ok(plan?.id);
  await db.query("UPDATE public.tenants SET approval_status='approved',subscription_plan_id=$2 WHERE id=$1",[tenant,plan.id]);
  await db.query("INSERT INTO public.positions(id,tenant_id,code,name,user_level_code,department,status) VALUES($1,$2,$3,'Owned invitation position','staff','housekeeping','active')",
    [position,tenant,'owned-invitation-'+input.run]);

  phase='management-boundary';
  const manage=(user,action,payload)=>call('/rest/v1/rpc/staff_invitation_manage',input.serviceKey,{
    p_actor:user.id,p_session:user.sessionId,p_action:action,p_payload:payload});
  const createPayload=email=>({tenantId:tenant,hotelId:hotel,positionId:position,email,fullName:'Owned managed staff',userLevelCode:'staff'});
  const managementSnapshot=async()=> (await db.query(`SELECT jsonb_build_object(
    'invitations',(SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY id),'[]') FROM public.staff_invitations i WHERE tenant_id=$1),
    'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.activity_logs a WHERE tenant_id=$1),
    'profiles',(SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY id),'[]') FROM public.users u WHERE tenant_id=$1),
    'roles',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.user_id,r.role),'[]') FROM public.user_roles r JOIN public.users u ON u.id=r.user_id WHERE u.tenant_id=$1),
    'memberships',(SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY user_id,hotel_id),'[]') FROM public.user_hotels h WHERE hotel_id=$2)) value`,[tenant,hotel])).rows[0].value;
  const managedRecord=(label,details,passed)=>{managementChecks.push({label,...details,passed:Boolean(passed)});assert.equal(Boolean(passed),true,label)};
  const managedDeny=async(label,user,action,payload,status=403)=>{
    const before=JSON.stringify(await managementSnapshot()),v=await manage(user,action,payload);
    const unchanged=before===JSON.stringify(await managementSnapshot());
    managedRecord(label,{status:v.status,effectsUnchanged:unchanged},v.status===status&&unchanged);
  };
  const managedRecipient=await account('managed-recipient');
  const managedPayload=createPayload(managedRecipient.email),managed=await manage(owner,'create',managedPayload);
  let managedRow=managed.data?.invitation;
  managedRecord('management-create-atomic',{status:managed.status,profileAbsent:!(await db.query('SELECT 1 FROM public.users WHERE id=$1',[managedRecipient.id])).rowCount},
    managed.status===200&&managed.data?.version===1&&managed.data.actor_id===owner.id&&managed.data.session_id===owner.sessionId
      &&managedRow?.tenant_id===tenant&&managedRow?.hotel_id===hotel&&managedRow.status==='pending'
      &&!(await db.query('SELECT 1 FROM public.users WHERE id=$1',[managedRecipient.id])).rowCount);
  const duplicateBefore=JSON.stringify(await managementSnapshot()),duplicate=await manage(owner,'create',managedPayload);
  managedRecord('management-create-replay',{status:duplicate.status,effectsUnchanged:duplicateBefore===JSON.stringify(await managementSnapshot())},
    duplicate.status===200&&duplicate.data?.invitation?.id===managedRow.id&&duplicate.data.idempotent===true
      &&duplicateBefore===JSON.stringify(await managementSnapshot()));
  const listing=await edge(owner,{action:'list'});
  managedRecord('management-list-edge',{status:listing.status},listing.status===200&&listing.data?.version===1
    &&listing.data.actor_id===owner.id&&listing.data.session_id===owner.sessionId&&listing.data.invitations.some(x=>x.id===managedRow.id));
  const reservations=await Promise.all([manage(owner,'reserve',{id:managedRow.id}),manage(owner,'reserve',{id:managedRow.id})]);
  const won=reservations.find(x=>x.status===200);
  managedRecord('management-concurrent-reserve-one',{statuses:reservations.map(x=>x.status)},
    reservations.filter(x=>x.status===200).length===1&&reservations.filter(x=>x.status===400&&x.data?.message==='INVITATION_SEND_COOLDOWN').length===1);
  const cooldownBefore=JSON.stringify(await managementSnapshot()),cooldown=await edge(owner,{action:'resend',id:managedRow.id});
  managedRecord('management-resend-cooldown-edge',{status:cooldown.status,effectsUnchanged:cooldownBefore===JSON.stringify(await managementSnapshot())},
    cooldown.status===429&&cooldownBefore===JSON.stringify(await managementSnapshot()));
  await managedDeny('management-finish-wrong-recipient',owner,'finish',{id:managedRow.id,reservedAt:won.data.invitation.sent_at,authUserId:owner.id});
  await managedDeny('management-stale-reservation',owner,'release',{id:managedRow.id,reservedAt:'2000-01-01T00:00:00Z',previousSentAt:null},400);
  const released=await manage(owner,'release',{id:managedRow.id,reservedAt:won.data.invitation.sent_at,previousSentAt:null});
  managedRecord('management-release-exact-reservation',{status:released.status},released.status===200&&released.data?.invitation?.sent_at===null);
  const resendReservation=await manage(owner,'reserve',{id:managedRow.id});assert.equal(resendReservation.status,200);
  const finished=await manage(owner,'finish',{id:managedRow.id,reservedAt:resendReservation.data.invitation.sent_at,authUserId:managedRecipient.id});
  managedRecord('management-finish-same-native-identity',{status:finished.status},finished.status===200
    &&finished.data?.invitation?.auth_user_id===managedRecipient.id&&finished.data.invitation.id===managedRow.id);
  const auditBeforeRevoke=(await managementSnapshot()).audit.length,revoked=await edge(owner,{action:'revoke',id:managedRow.id});
  managedRecord('management-revoke-atomic-edge',{status:revoked.status,auditDelta:(await managementSnapshot()).audit.length-auditBeforeRevoke},
    revoked.status===200&&revoked.data?.status==='revoked'&&revoked.data.invitation_id===managedRow.id
      &&(await managementSnapshot()).audit.length===auditBeforeRevoke+1);
  const revokeBefore=JSON.stringify(await managementSnapshot()),replayedRevoke=await edge(owner,{action:'revoke',id:managedRow.id});
  managedRecord('management-revoke-replay-edge',{status:replayedRevoke.status,effectsUnchanged:revokeBefore===JSON.stringify(await managementSnapshot())},
    replayedRevoke.status===200&&replayedRevoke.data?.idempotent===true&&revokeBefore===JSON.stringify(await managementSnapshot()));
  phase='management-positions';const managerPosition=randomUUID(),outsidePosition=randomUUID();
  await db.query(`INSERT INTO public.positions(id,tenant_id,code,name,user_level_code,department,status)
    VALUES($1,$3,$4,'Owned manager position','manager','housekeeping','active'),
      ($2,$3,$5,'Owned outside position','staff','maintenance','active')`,
    [managerPosition,outsidePosition,tenant,'owned-manager-'+input.run,'owned-outside-'+input.run]);
  async function managedActor(label,level,role) {
    const u=await account(label);
    await db.query(`INSERT INTO public.users(id,tenant_id,hotel_id,full_name,email,role,user_level_code,department,status,created_by,
      position_id,must_change_password,is_super_admin,is_primary_owner,account_locked)
      VALUES($1,$2,$3,$4,$5,$6,$7,'housekeeping','active',$8,$9,false,false,false,false)`,
      [u.id,tenant,hotel,'Owned '+label,u.email,role,level,owner.id,level==='staff'?position:managerPosition]);
    await db.query('INSERT INTO public.user_roles(user_id,role,created_by) VALUES($1,$2,$3)',[u.id,role,owner.id]);
    await db.query(`INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,can_create_staff)
      VALUES($1,$2,$3,$4,$5)`,[u.id,hotel,owner.id,level==='manager',level!=='staff']);
    return u;
  }
  phase='management-actors';const manager=await managedActor('manager','manager','hotel_manager'),department=await managedActor('department','department_manager','department_manager'),
    ordinary=await managedActor('ordinary','staff','staff');
  phase='management-role-matrix';const invitationEmail=label=>'management-'+input.run+'-'+label+'@roomqc.invalid';
  const managerStaff=await manage(manager,'create',createPayload(invitationEmail('manager-staff')));
  managedRecord('management-manager-create-staff',{status:managerStaff.status},managerStaff.status===200);
  const managerDept=await manage(manager,'create',{...createPayload(invitationEmail('manager-department')),userLevelCode:'department_manager',positionId:managerPosition});
  managedRecord('management-manager-create-department',{status:managerDept.status},managerDept.status===200);
  const deptStaff=await manage(department,'create',createPayload(invitationEmail('department-staff')));
  managedRecord('management-department-create-own-staff',{status:deptStaff.status},deptStaff.status===200);
  await managedDeny('management-manager-no-peer-manager',manager,'create',{...createPayload(invitationEmail('peer')),userLevelCode:'manager',positionId:managerPosition});
  await managedDeny('management-department-no-other-department',department,'create',{...createPayload(invitationEmail('outside')),positionId:outsidePosition});
  await managedDeny('management-staff-no-create',ordinary,'create',createPayload(invitationEmail('staff')));
  await managedDeny('management-wrong-tenant',owner,'create',{...createPayload(invitationEmail('wrong-tenant')),tenantId:randomUUID()});
  await db.query('UPDATE public.user_hotels SET can_create_staff=false WHERE user_id=$1 AND hotel_id=$2',[manager.id,hotel]);
  await managedDeny('management-live-membership-denial',manager,'reserve',{id:managerStaff.data.invitation.id});
  const noCapabilityList=await edge(manager,{action:'list'});
  managedRecord('management-list-hides-lost-capability',{status:noCapabilityList.status},noCapabilityList.status===200
    &&noCapabilityList.data?.invitations.every(x=>x.id!==managerStaff.data.invitation.id));
  await db.query('UPDATE public.user_hotels SET can_create_staff=true WHERE user_id=$1 AND hotel_id=$2',[manager.id,hotel]);
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[owner.id]);
  await managedDeny('management-locked-actor',owner,'reserve',{id:managerStaff.data.invitation.id});
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[owner.id]);
  const savedOwnerRole=(await db.query('SELECT to_jsonb(r) value FROM public.user_roles r WHERE user_id=$1',[owner.id])).rows[0].value;
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[owner.id]);
  await managedDeny('management-removed-role',owner,'list',{});
  await db.query('INSERT INTO public.user_roles SELECT (jsonb_populate_record(NULL::public.user_roles,$1::jsonb)).*',[JSON.stringify(savedOwnerRole)]);
  await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[owner.sessionId]);
  await managedDeny('management-expired-session',owner,'list',{});
  await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[owner.sessionId]);
  const oldOwnerSession=owner.sessionId,ownerLogout=await call('/auth/v1/logout?scope=local',owner.token,{});
  assert.ok([200,204].includes(ownerLogout.status));
  const signedOutBefore=JSON.stringify(await managementSnapshot()),signedOutManage=await edge(owner,{action:'list'});
  managedRecord('management-signed-out-edge',{status:signedOutManage.status,effectsUnchanged:signedOutBefore===JSON.stringify(await managementSnapshot())},
    [401,403].includes(signedOutManage.status)&&signedOutBefore===JSON.stringify(await managementSnapshot()));
  await login(owner);const managementRecovered=await edge(owner,{action:'list'});
  managedRecord('management-new-session-recovery-edge',{status:managementRecovered.status},
    managementRecovered.status===200&&managementRecovered.data?.session_id===owner.sessionId&&owner.sessionId!==oldOwnerSession);
  const nativeBefore=(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[managedRecipient.id])).rows[0].encrypted_password;
  const disabledSend=await edge(owner,{action:'create',...managedPayload});
  const nativeAfter=(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[managedRecipient.id])).rows[0].encrypted_password;
  const pendingAfterFailure=(await db.query("SELECT auth_user_id,sent_at FROM public.staff_invitations WHERE email=$1 AND status='pending'",[managedRecipient.email])).rows[0];
  managedRecord('management-provider-disabled-failure-no-membership',{status:disabledSend.status,passwordUnchanged:nativeBefore===nativeAfter,
    reservationReleased:pendingAfterFailure?.sent_at===null,profileAbsent:!(await db.query('SELECT 1 FROM public.users WHERE id=$1',[managedRecipient.id])).rowCount},
    disabledSend.status===503&&nativeBefore===nativeAfter&&pendingAfterFailure?.auth_user_id===managedRecipient.id&&pendingAfterFailure.sent_at===null
      &&!(await db.query('SELECT 1 FROM public.users WHERE id=$1',[managedRecipient.id])).rowCount);
  const directManagement=await call('/rest/v1/rpc/staff_invitation_manage',owner.token,{p_actor:owner.id,p_session:owner.sessionId,p_action:'list',p_payload:{}});
  managedRecord('management-user-cannot-call-service-adapter',{status:directManagement.status},[401,403,404].includes(directManagement.status));
  const retiredPrepare=await call('/rest/v1/rpc/prepare_staff_invitation',input.serviceKey,{p_creator:owner.id,p_tenant:tenant,p_hotel:hotel,
    p_email:invitationEmail('retired'),p_name:'Owned retired',p_level:'staff',p_position:position,p_reports:null});
  managedRecord('management-retired-prepare-unavailable',{status:retiredPrepare.status},[401,403,404].includes(retiredPrepare.status));
  const browserRead=await fetch('http://127.0.0.1:8000/rest/v1/staff_invitations?select=id&limit=1',{
    headers:{apikey:input.publishableKey,authorization:'Bearer '+owner.token},signal:AbortSignal.timeout(15000)});
  const directColumns=(await db.query("SELECT count(*)::int n FROM pg_attribute WHERE attrelid='public.staff_invitations'::regclass AND attnum>0 AND NOT attisdropped AND has_column_privilege('authenticated',attrelid,attnum,'SELECT')")).rows[0].n;
  managedRecord('management-user-cannot-read-invitation-table',{status:browserRead.status,directColumnPrivileges:directColumns},browserRead.status===403&&directColumns===0);
  await db.query("UPDATE public.positions SET status='inactive' WHERE id=$1",[position]);
  await managedDeny('management-inactive-position-no-send',owner,'reserve',{id:managerStaff.data.invitation.id});
  const inactiveRevoke=await edge(owner,{action:'revoke',id:managerStaff.data.invitation.id});
  managedRecord('management-inactive-position-revoke-edge',{status:inactiveRevoke.status},inactiveRevoke.status===200&&inactiveRevoke.data?.status==='revoked');
  await db.query("UPDATE public.positions SET status='active' WHERE id=$1",[position]);
  assert.equal(managementChecks.length,31);assert.ok(managementChecks.every(x=>x.passed));

  phase='compiled-management-caller';
  const otherHotel=randomUUID();
  await db.query(`INSERT INTO public.hotels SELECT (jsonb_populate_record(NULL::public.hotels,to_jsonb(h)
    ||jsonb_build_object('id',$2::uuid,'code',$3::text,'name','Owned second invitation hotel'))).*
    FROM public.hotels h WHERE h.id=$1`,[hotel,otherHotel,'INV-'+input.run.toUpperCase()]);
  const otherInvite=await manage(owner,'create',{...createPayload(invitationEmail('other-hotel')),hotelId:otherHotel});
  assert.equal(otherInvite.status,200);
  let adminDispatches=0;
  const adminClient=RoomQCInvitationAdmin.createInvitationAdminClient({
    endpoint:'http://staff-invitation-test:9000',publishableKey:input.publishableKey,path:'/auth/accept-invite',
    getSession:async()=>({data:{session:{access_token:owner.token,user:{id:owner.id}}},error:null}),
    fetch:async(url,options)=>{assert.equal(String(url),'http://staff-invitation-test:9000/functions/v1/staff-invitations');adminDispatches++;
      return fetch(url,{...options,headers:{...options.headers,Origin:'http://127.0.0.1:8082'}})},
  });
  const adminContext={actorId:owner.id,sessionId:owner.sessionId,tenantId:tenant};
  const adminRecord=(label,details,passed)=>{adminChecks.push({label,...details,passed:Boolean(passed)});assert.equal(Boolean(passed),true,label)};
  const selected=await adminClient.list(adminContext,hotel);
  adminRecord('compiled-admin-list-selected-hotel',{selectedOnly:selected.every(x=>x.hotel_id===hotel),otherHotelExcluded:!selected.some(x=>x.id===otherInvite.data.invitation.id)},
    selected.length>0&&selected.every(x=>x.hotel_id===hotel)&&!selected.some(x=>x.id===otherInvite.data.invitation.id));
  const all=await adminClient.list(adminContext,null);
  adminRecord('compiled-admin-list-all-hotels',{bothHotels:all.some(x=>x.hotel_id===hotel)&&all.some(x=>x.hotel_id===otherHotel)},
    all.some(x=>x.hotel_id===hotel)&&all.some(x=>x.hotel_id===otherHotel));
  let adminBefore=JSON.stringify(await managementSnapshot()),adminError=null;
  try{await adminClient.list({...adminContext,tenantId:randomUUID()},hotel)}catch(error){adminError=error}
  adminRecord('compiled-admin-wrong-tenant-no-effects',{code:adminError?.code,effectsUnchanged:adminBefore===JSON.stringify(await managementSnapshot())},
    adminError?.code==='permission_denied'&&adminBefore===JSON.stringify(await managementSnapshot()));
  const dispatchBefore=adminDispatches;adminError=null;
  try{await adminClient.list({...adminContext,sessionId:oldOwnerSession},hotel)}catch(error){adminError=error}
  adminRecord('compiled-admin-old-session-no-dispatch',{code:adminError?.code,dispatches:adminDispatches-dispatchBefore},
    adminError?.code==='identity_changed'&&adminDispatches===dispatchBefore);
  const adminTarget=selected.find(x=>x.email===managedRecipient.email);assert.ok(adminTarget);
  const adminReserved=await manage(owner,'reserve',{id:adminTarget.id});assert.equal(adminReserved.status,200);
  adminBefore=JSON.stringify(await managementSnapshot());adminError=null;
  try{await adminClient.act(adminContext,adminTarget,'resend')}catch(error){adminError=error}
  adminRecord('compiled-admin-resend-cooldown',{code:adminError?.code,effectsUnchanged:adminBefore===JSON.stringify(await managementSnapshot())},
    adminError?.code==='cooldown'&&adminBefore===JSON.stringify(await managementSnapshot()));
  adminBefore=JSON.stringify(await managementSnapshot());adminError=null;
  try{await adminClient.act(adminContext,{...adminTarget,hotel_id:otherHotel},'revoke')}catch(error){adminError=error}
  adminRecord('compiled-admin-wrong-hotel-no-effects',{code:adminError?.code,effectsUnchanged:adminBefore===JSON.stringify(await managementSnapshot())},
    adminError?.code==='permission_denied'&&adminBefore===JSON.stringify(await managementSnapshot()));
  const adminRevoke=await adminClient.act(adminContext,adminTarget,'revoke');
  adminRecord('compiled-admin-revoke-verified',{revoked:adminRevoke.status==='revoked'},
    adminRevoke.status==='revoked'&&adminRevoke.id===adminTarget.id&&adminRevoke.idempotent===false);
  adminBefore=JSON.stringify(await managementSnapshot());
  const adminReplay=await adminClient.act(adminContext,adminTarget,'revoke');
  adminRecord('compiled-admin-revoke-replay',{idempotent:adminReplay.idempotent,effectsUnchanged:adminBefore===JSON.stringify(await managementSnapshot())},
    adminReplay.idempotent===true&&adminBefore===JSON.stringify(await managementSnapshot()));
  // Installer-owned synthetic volume only; table privileges remain closed to users.
  await db.query(`INSERT INTO public.staff_invitations
    SELECT (jsonb_populate_record(NULL::public.staff_invitations,to_jsonb(i)||jsonb_build_object(
      'id',gen_random_uuid(),'hotel_id',$2::uuid,'email','invitation-'||$3||'-page-'||n||'@roomqc.invalid',
      'created_at',now()-interval '1 day','sent_at',NULL,'auth_user_id',NULL))).*
    FROM public.staff_invitations i CROSS JOIN generate_series(1,123) n WHERE i.id=$1`,
    [otherInvite.data.invitation.id,hotel,input.run]);
  const expectedPageIds=(await db.query(`SELECT i.id FROM public.staff_invitations i
    JOIN public.positions p ON p.id=i.position_id AND p.tenant_id=i.tenant_id
    JOIN public.hotels h ON h.id=i.hotel_id AND h.tenant_id=i.tenant_id AND h.status='active'
    WHERE i.tenant_id=$1 AND i.hotel_id=$2 AND i.status='pending' ORDER BY i.created_at DESC,i.id DESC`,[tenant,hotel])).rows.map(x=>x.id);
  const firstPage=await adminClient.listPage(adminContext,hotel);
  adminRecord('compiled-admin-page-first-50',{rows:firstPage.rows.length,hasNext:!!firstPage.nextCursor},
    firstPage.rows.length===50&&!!firstPage.nextCursor);
  const walkPages=async(selectedHotel)=>{
    const ids=[];let cursor=null,pages=0;
    do{const page=await adminClient.listPage(adminContext,selectedHotel,cursor);
      assert.ok(page.rows.every(x=>selectedHotel===null||x.hotel_id===selectedHotel));
      ids.push(...page.rows.map(x=>x.id));cursor=page.nextCursor;pages++;assert.ok(pages<=10);
    }while(cursor);
    return {ids,pages};
  };
  const walked=await walkPages(hotel);
  adminRecord('compiled-admin-page-complete-over-100',{rows:walked.ids.length,pages:walked.pages,duplicates:walked.ids.length-new Set(walked.ids).size},
    expectedPageIds.length>100&&JSON.stringify(walked.ids)===JSON.stringify(expectedPageIds));
  const allPages=await walkPages(null);
  adminRecord('compiled-admin-page-all-hotels',{includesOtherHotel:allPages.ids.includes(otherInvite.data.invitation.id)},
    allPages.ids.includes(otherInvite.data.invitation.id)&&expectedPageIds.every(id=>allPages.ids.includes(id))
      &&new Set(allPages.ids).size===allPages.ids.length);
  const managerClient=RoomQCInvitationAdmin.createInvitationAdminClient({
    endpoint:'http://staff-invitation-test:9000',publishableKey:input.publishableKey,path:'/auth/accept-invite',
    getSession:async()=>({data:{session:{access_token:manager.token,user:{id:manager.id}}},error:null}),
    fetch:async(url,options)=>fetch(url,{...options,headers:{...options.headers,Origin:'http://127.0.0.1:8082'}}),
  });
  const managerContext={actorId:manager.id,sessionId:manager.sessionId,tenantId:tenant};
  const managerPage=await managerClient.listPage(managerContext,hotel);assert.ok(managerPage.nextCursor);
  await db.query('UPDATE public.user_hotels SET can_create_staff=false WHERE user_id=$1 AND hotel_id=$2',[manager.id,hotel]);
  const capabilityBefore=JSON.stringify(await managementSnapshot()),hiddenPage=await managerClient.listPage(managerContext,hotel,managerPage.nextCursor);
  adminRecord('compiled-admin-page-capability-revoked',{rows:hiddenPage.rows.length,effectsUnchanged:capabilityBefore===JSON.stringify(await managementSnapshot())},
    hiddenPage.rows.every(x=>x.user_level_code!=='staff')&&capabilityBefore===JSON.stringify(await managementSnapshot()));
  await db.query('UPDATE public.user_hotels SET can_create_staff=true WHERE user_id=$1 AND hotel_id=$2',[manager.id,hotel]);
  await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[owner.sessionId]);
  adminBefore=JSON.stringify(await managementSnapshot());adminError=null;
  try{await adminClient.listPage(adminContext,hotel,firstPage.nextCursor)}catch(error){adminError=error}
  adminRecord('compiled-admin-page-expired-session',{code:adminError?.code,effectsUnchanged:adminBefore===JSON.stringify(await managementSnapshot())},
    adminError?.code==='permission_denied'&&adminBefore===JSON.stringify(await managementSnapshot()));
  await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[owner.sessionId]);
  const malformedPage=await edge(owner,{action:'list',tenantId:tenant,hotelId:hotel,pageSize:50,cursor:{createdAt:'infinity',id:randomUUID()}});
  adminRecord('compiled-admin-page-invalid-cursor',{status:malformedPage.status},malformedPage.status===400);
  const restoredPage=await adminClient.listPage(adminContext,hotel,firstPage.nextCursor);
  adminRecord('compiled-admin-page-recovery',{rows:restoredPage.rows.length},
    restoredPage.rows.length===50&&!restoredPage.rows.some(x=>firstPage.rows.some(y=>y.id===x.id)));
  assert.equal(adminChecks.length,adminExpected.length);assert.ok(adminChecks.every(x=>x.passed));

  phase='delivery';
  deliveryControls=await runStaffInvitationDeliveryChecks({input,db,owner,ordinary,tenant,hotel,position,call,account});
  assert.equal(deliveryControls.verified,true,'Actual native invitation delivery and onboarding');

  const preparedResponse=await manage(owner,'create',createPayload(actor.email));
  const prepared={status:preparedResponse.status,data:preparedResponse.data?.invitation};
  assert.equal(prepared.status,200);assert.ok(prepared.data.id);invitation=prepared.data;
  await db.query('UPDATE public.staff_invitations SET auth_user_id=$2 WHERE id=$1',[invitation.id,actor.id]);
  const body={action:'accept',invitationId:invitation.id,tenantId:tenant};
  const mine=await edge(actor,{action:'mine',tenantId:tenant});
  record('pre-profile-mine',{status:mine.status,profileAbsent:(await snapshot()).profile===null},
    mine.status===200&&mine.data?.version===1&&mine.data.actor_id===actor.id&&mine.data.session_id===actor.sessionId
      &&mine.data.invitation?.id===invitation.id&&!mine.data.invitation.passwordReady&&(await snapshot()).profile===null);
  const callerMine=await callerClient().mine(actor.id,{sessionId:actor.sessionId});
  callerRecord('compiled-client-pre-profile-mine',{invitationMatches:callerMine?.id===invitation.id,profileAbsent:(await snapshot()).profile===null},
    callerMine?.id===invitation.id&&callerMine.tenantId===tenant&&callerMine.hotelId===hotel&&!callerMine.passwordReady&&(await snapshot()).profile===null);
  await denied('password-setup-required',body,[409]);
  actor.password=randomBytes(32).toString('hex');
  const reset=await call('/auth/v1/admin/users/'+actor.id,input.serviceKey,{password:actor.password},'PUT');assert.equal(reset.status,200);
  // Admin reset invalidates the old Auth session. Obtain a legitimate new one
  // so this check measures missing native setup, not an unrelated stale bearer.
  await login(actor);
  assert.ok((await snapshot()).invitation.password_set_at);
  assert.equal((await db.query('SELECT count(*)::int n FROM private.password_change_receipts WHERE actor_id=$1',[actor.id])).rows[0].n,0);
  await denied('admin-reset-not-native-setup',body,[409]);
  checks.at(-1).passwordReady=true;checks.at(-1).nativeReceipts=0;
  phase='native-password';
  const generated=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:actor.email});assert.equal(generated.status,200);
  const verified=await call('/auth/v1/verify',input.publishableKey,{token_hash:generated.data.hashed_token,type:'recovery'});assert.equal(verified.status,200);
  actor.token=verified.data.access_token;actor.sessionId=sid(actor.token);actor.password=randomBytes(32).toString('hex');
  const change=randomUUID(),password=await call('/auth/v1/user',actor.token,{password:actor.password,roomqc_password_change_id:change},'PUT');
  const receipt=(await db.query('SELECT actor_id::text,session_id::text FROM private.password_change_receipts WHERE id=$1',[change])).rows[0];
  record('native-otp-password-setup',{status:password.status,nativeReceipt:receipt?.actor_id===actor.id&&receipt?.session_id===actor.sessionId},
    password.status===200&&receipt?.actor_id===actor.id&&receipt?.session_id===actor.sessionId&&(await snapshot()).profile===null);
  const beforeStatus=await snapshot(),pending=await edge(actor,{...body,action:'status'});
  record('pending-status-read',{status:pending.status,effectsUnchanged:JSON.stringify(beforeStatus)===JSON.stringify(await snapshot())},
    pending.status===200&&pending.data?.status==='pending'&&pending.data.success===false&&JSON.stringify(beforeStatus)===JSON.stringify(await snapshot()));
  phase='pending-contract';
  await db.query("UPDATE public.staff_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[invitation.id]);
  await denied('expired-invitation',body,[409]);
  await db.query('UPDATE public.staff_invitations SET expires_at=$2 WHERE id=$1',[invitation.id,invitation.expires_at]);
  await db.query("UPDATE public.staff_invitations SET status='revoked' WHERE id=$1",[invitation.id]);await denied('revoked-invitation',body,[409]);
  await db.query("UPDATE public.staff_invitations SET status='pending' WHERE id=$1",[invitation.id]);
  await denied('wrong-workspace',{...body,tenantId:randomUUID()},[403]);
  await db.query("UPDATE public.users SET status='inactive' WHERE id=$1",[owner.id]);await denied('inactive-inviter',body,[403]);
  await db.query("UPDATE public.users SET status='active' WHERE id=$1",[owner.id]);
  await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",[owner.id]);await denied('banned-inviter',body,[403]);
  await db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[owner.id]);
  await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1",[actor.sessionId]);
  await denied('expired-native-session',body,[401,403]);await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[actor.sessionId]);
  const previousSession=actor.sessionId,logout=await call('/auth/v1/logout?scope=local',actor.token,{});assert.ok([200,204].includes(logout.status));
  await denied('signed-out-session',body,[401,403]);await login(actor);
  const resumed=await edge(actor,{...body,action:'status'});
  record('new-session-resume',{status:resumed.status,originalPasswordReceiptPreserved:receipt?.session_id!==actor.sessionId},
    resumed.status===200&&resumed.data?.session_id===actor.sessionId&&resumed.data.status==='pending'&&receipt?.session_id!==actor.sessionId);
  const callerResume=await callerClient().status(actor.id,callerTarget(),{sessionId:actor.sessionId});
  callerRecord('compiled-client-new-session-resume',{status:callerResume.status},callerResume.status==='pending');
  const countBefore=callerDispatches;let staleCode=null;
  try{await callerClient().status(actor.id,callerTarget(),{sessionId:previousSession})}catch(error){staleCode=error.code}
  callerRecord('compiled-client-old-session-no-dispatch',{errorCode:staleCode,dispatches:callerDispatches-countBefore},
    staleCode==='identity_changed'&&callerDispatches===countBefore);
  phase='accept';const before=await snapshot(),results=await Promise.all([edge(actor,body),edge(actor,body)]),after=await snapshot();
  const accepted=results[0].data;
  record('concurrent-accept-one-result',{statuses:results.map(r=>r.status),profiles:after.profile?1:0,roles:after.roles.length,
    memberships:after.memberships.length,auditDelta:after.audit.length-before.audit.length},
    results.every(r=>r.status===200&&r.data?.success===true&&r.data.version===1&&r.data.invitation_id===invitation.id&&r.data.actor_id===actor.id
      &&r.data.session_id===actor.sessionId&&r.data.tenant_id===tenant&&r.data.hotel_id===hotel&&r.data.accepted_at===accepted.accepted_at)
      &&results.filter(r=>r.data.idempotent===false).length===1&&after.profile?.id===actor.id&&after.roles.length===1&&after.memberships.length===1
      &&after.audit.length===before.audit.length+1&&after.invitation.status==='accepted');
  const saved=await snapshot(),status=await edge(actor,{...body,action:'status'});
  record('accepted-status-read',{status:status.status,effectsUnchanged:JSON.stringify(saved)===JSON.stringify(await snapshot())},
    status.status===200&&status.data?.success===true&&status.data.idempotent===true&&JSON.stringify(saved)===JSON.stringify(await snapshot()));
  const replay=await callerClient().accept(actor.id,callerTarget(),{sessionId:actor.sessionId});
  callerRecord('compiled-client-accepted-replay',{idempotent:replay.idempotent,effectsUnchanged:JSON.stringify(saved)===JSON.stringify(await snapshot())},
    replay.idempotent&&replay.acceptedAt===accepted.accepted_at&&JSON.stringify(saved)===JSON.stringify(await snapshot()));
  const callerStatus=await callerClient().status(actor.id,callerTarget(),{sessionId:actor.sessionId});
  callerRecord('compiled-client-accepted-status',{status:callerStatus.status,effectsUnchanged:JSON.stringify(saved)===JSON.stringify(await snapshot())},
    callerStatus.status==='accepted'&&callerStatus.receipt.acceptedAt===accepted.accepted_at&&JSON.stringify(saved)===JSON.stringify(await snapshot()));
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[actor.id,hotel]);
  await denied('removed-membership-no-regrant',body,[403]);
  await db.query('INSERT INTO public.user_hotels SELECT (jsonb_populate_record(NULL::public.user_hotels,$1::jsonb)).*',[JSON.stringify(saved.memberships[0])]);
  await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[actor.id]);await denied('removed-role-no-regrant',body,[403]);
  await db.query('INSERT INTO public.user_roles SELECT (jsonb_populate_record(NULL::public.user_roles,$1::jsonb)).*',[JSON.stringify(saved.roles[0])]);
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);await denied('locked-profile',body,[403]);
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[actor.id]);
  const restoredBefore=await snapshot(),restored=await edge(actor,body);
  record('restored-replay',{status:restored.status,effectsUnchanged:JSON.stringify(restoredBefore)===JSON.stringify(await snapshot())},
    restored.status===200&&restored.data?.accepted_at===accepted.accepted_at&&restored.data.idempotent===true&&JSON.stringify(restoredBefore)===JSON.stringify(await snapshot()));
  const legacyBefore=await snapshot(),legacy=await call('/rest/v1/rpc/accept_staff_invitation',input.serviceKey,{p_invitation:invitation.id,p_user:actor.id});
  record('retired-rpc-unavailable',{status:legacy.status,effectsUnchanged:JSON.stringify(legacyBefore)===JSON.stringify(await snapshot())},
    [401,403,404].includes(legacy.status)&&JSON.stringify(legacyBefore)===JSON.stringify(await snapshot()));
  const direct=await call('/rest/v1/rpc/staff_invitation_action',actor.token,{p_actor:actor.id,p_session:actor.sessionId,p_action:'accept',p_invitation:invitation.id,p_tenant:tenant});
  record('user-cannot-call-service-adapter',{status:direct.status},[401,403,404].includes(direct.status));
  const malformed=await edge(actor,'[]',true),oversized=await edge(actor,JSON.stringify({action:'mine',unused:'x'.repeat(16384)}),true);
  record('bounded-request-body',{malformedStatus:malformed.status,oversizedStatus:oversized.status},malformed.status===400&&oversized.status===413);
  assert.deepEqual(checks.map(x=>x.label),expected);
  phase='email-invitation-caller';actor=await account('email-caller');
  const preparedEmailResponse=await manage(owner,'create',createPayload(actor.email));
  const preparedEmail={status:preparedEmailResponse.status,data:preparedEmailResponse.data?.invitation};
  assert.equal(preparedEmail.status,200);invitation=preparedEmail.data;
  await db.query('UPDATE public.staff_invitations SET auth_user_id=$2 WHERE id=$1',[invitation.id,actor.id]);
  let isolated=null,puts=0,accepts=0,loss=true;const memory=new Map();
  const storage={get length(){return memory.size},key:i=>[...memory.keys()][i]??null,getItem:k=>memory.get(k)??null,
    setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const flow=RoomQCEmailCaller.createEmailAuthCoordinator({endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,
    tenantId:tenant,storage,send:async()=>{throw new Error('OWNED_MAIL_DISABLED')},
    getSession:async()=>({data:{session:isolated},error:null}),
    clearSession:async()=>{if(isolated){const result=await call('/auth/v1/logout?scope=local',isolated.access_token,{});
      assert.ok([200,204,401,403].includes(result.status));}isolated=null;return {error:null}},
    verifyOtp:async params=>{const result=await call('/auth/v1/verify',input.publishableKey,params);
      if(result.status!==200)return {data:{},error:new Error('OWNED_OTP_REFUSED')};
      isolated={access_token:result.data.access_token,user:{id:result.data.user.id,email:result.data.user.email}};
      actor.token=isolated.access_token;actor.sessionId=sid(actor.token);return {data:{session:isolated,user:result.data.user},error:null};},
    fetch:async(url,options)=>{
      assert.equal(new URL(url).origin,'http://127.0.0.1:8000');
      if(String(url).endsWith('/functions/v1/staff-invitations')){
        const action=JSON.parse(options.body).action;
        const response=await fetch('http://staff-invitation-test:9000/',{...options,
          headers:{...options.headers,Origin:'http://127.0.0.1:8082'}});
        if(action==='accept'){accepts++;if(loss){loss=false;await response.body?.cancel();throw new Error('OWNED_LOST_ACCEPT_REPLY')}}
        return response;
      }
      if(String(url).endsWith('/auth/v1/user'))puts++;
      return fetch(url,options);
    }});
  const emailCode=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:actor.email});
  assert.equal(emailCode.status,200);await flow.verify('invite',actor.email,emailCode.data.email_otp);
  const beforeEmail=await snapshot(),nextPassword='OwnedInvitation!'+randomUUID();let unknown=null;
  try{await flow.finish('invite',nextPassword)}catch(error){unknown=error.code}
  const committed=await snapshot();
  callerRecord('actual-email-invitation-loss-after-commit',{errorCode:unknown,puts,accepts,profileCreated:!!committed.profile,
    oneAudit:committed.audit.length===beforeEmail.audit.length+1,pendingIds:memory.size},
    unknown==='invitation_pending'&&puts===1&&accepts===1&&committed.invitation.status==='accepted'&&!!committed.profile
      &&committed.roles.length===1&&committed.memberships.length===1&&committed.audit.length===beforeEmail.audit.length+1
      &&[...memory.values()].every(v=>!v.includes(nextPassword)&&!v.includes(actor.token)));
  const recovered=await flow.check('invite'),afterEmail=await snapshot();
  const sessionRemaining=(await db.query('SELECT count(*)::int n FROM auth.sessions WHERE id=$1',[actor.sessionId])).rows[0].n;
  callerRecord('actual-email-invitation-status-recovery',{completion:recovered.completion,puts,accepts,
    effectsUnchanged:JSON.stringify(committed)===JSON.stringify(afterEmail),sessionRevoked:sessionRemaining===0,pendingIds:memory.size},
    recovered.completion==='previous'&&puts===1&&accepts===1&&JSON.stringify(committed)===JSON.stringify(afterEmail)&&sessionRemaining===0&&memory.size===0);
  await flow.dispose();assert.deepEqual(callerChecks.map(x=>x.label),callerExpected);
  phase='authority-matrix';authorityControls=await runInvitationAuthorityChecks({db,input,call,account,edge});
  assert.equal(authorityControls.verified,true,'Bounded invitation authority and observed cross-operation inventory');
  phase='complete';complete=true;
}catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_INVITATION_ASSERTION';
  errorConstraint=typeof error?.constraint==='string'&&/^[a-z_][a-z0-9_]{0,127}$/i.test(error.constraint)?error.constraint:null;}
finally{await db.end();}
process.stdout.write(JSON.stringify({contractVersion:1,verified:complete&&checks.length===expected.length&&checks.every(x=>x.passed)
    &&callerChecks.length===callerExpected.length&&callerChecks.every(x=>x.passed)&&managementChecks.length===31&&managementChecks.every(x=>x.passed)
    &&adminChecks.length===adminExpected.length&&adminChecks.every(x=>x.passed)&&deliveryControls?.verified===true&&authorityControls?.verified===true,
  complete,phase,errorCode,errorConstraint,expectedChecks:expected.length,checks,callerExpectedChecks:callerExpected.length,callerChecks,managementExpectedChecks:31,managementChecks,
  actualAuth:true,actualEdge:true,actualRpc:true,providerEnabled:false,
  adminExpectedChecks:adminExpected.length,adminChecks,
  delivery:deliveryControls,
  authority:authorityControls,
  coverage:{nativePreProfilePassword:checks.some(x=>x.label==='native-otp-password-setup'&&x.passed),
    resumeNewSession:checks.some(x=>x.label==='new-session-resume'&&x.passed),
    acceptedReplayNoRegrant:['removed-membership-no-regrant','removed-role-no-regrant'].every(label=>checks.some(x=>x.label===label&&x.passed)),
    concurrentAccept:checks.some(x=>x.label==='concurrent-accept-one-result'&&x.passed),
    productionInvitationClient:callerChecks.some(x=>x.label==='compiled-client-accepted-replay'&&x.passed),
    productionEmailInvitation:callerChecks.some(x=>x.label==='actual-email-invitation-status-recovery'&&x.passed),
    adapterPostCommitResponseLoss:callerChecks.some(x=>x.label==='actual-email-invitation-loss-after-commit'&&x.passed),
    fullInviterRoleMatrix:false,createResendRevokeEndpoint:deliveryControls?.verified===true,externalMail:false,observedLockMatrix:false,browserAndroid:false,networkLoss:false,fullIntegratedRun:false}}));
