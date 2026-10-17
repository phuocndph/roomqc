// Real Auth, SMTP capture, Edge Functions, SQL transactions and RLS. No external email.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const raw = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d','/s','/c','npx supabase status --output json'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] })
  : execFileSync('npx', ['supabase','status','--output','json'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const local = JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(local.API_URL).hostname), 'Local only');
const authContainer = JSON.parse(execFileSync('docker',['inspect','supabase_auth_ehjtoajnlnuvuiwkpmbp'],{encoding:'utf8'}))[0];
assert.ok(authContainer.Config.Env.some(v => /^GOTRUE_SMTP_HOST=.*inbucket/.test(v)), 'Auth must use local SMTP capture');
assert.ok(authContainer.Config.Env.includes('GOTRUE_MAILER_AUTOCONFIRM=false'), 'Auth must require email verification');
const options = { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} };
const admin = createClient(local.API_URL,local.SERVICE_ROLE_KEY,options);
const anon = () => createClient(local.API_URL,local.ANON_KEY,options);
const prefix = `email-e2e-${randomUUID().slice(0,8)}`;
const users = [], tenants = [], deliveries = [], invitationIds = [], capturedIds = [];
let checks = 0;
const check = (value,label) => { assert.ok(value,label); checks++; console.log(`PASS ${label}`) };
const invoke = async (client,name,body) => client.functions.invoke(name,{body});
const mailUrl = 'http://127.0.0.1:54324';

async function captured(email, count = 1) {
  for (let attempt=0; attempt<80; attempt++) {
    const response=await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    assert.ok(response.ok,'Mail capture available'); const data=await response.json();
    const matches=data.messages || [];
    if(matches.length>=count){
      const message=await (await fetch(`${mailUrl}/api/v1/message/${matches[0].ID}`)).json();
      for(const m of matches) if(!capturedIds.includes(m.ID)) capturedIds.push(m.ID);
      return message;
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Local SMTP email did not arrive');
}
const otp = message => { const token=message.Text?.match(/\b\d{6}\b/)?.[0]; assert.ok(token,'Auth email contains a six-digit OTP'); return token };
async function account(suffix) {
  const email=`${prefix}-${suffix}@example.invalid`,password=`QC!a9${randomUUID()}`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.ifError(created.error); users.push(created.data.user.id);
  const client=anon(); assert.ifError((await client.auth.signInWithPassword({email,password})).error);
  const result=await admin.rpc('provision_workspace_registration',{p_workspace_id:randomUUID(),p_owner_id:created.data.user.id,
    p_fields:{fullName:'Email test owner',phone:'0901234567',tenantName:'Email E2E',hotelName:'Email test hotel',hotelAddress:'Test road',
      hotelPhone:'0281234567',hotelEmail:email,totalRooms:3,workspaceSlug:`${prefix}-${suffix}`}});
  assert.ifError(result.error); assert.ok(result.data.success,'Provision test owner'); tenants.push(result.data.tenant_id);
  return {client,email,password,id:created.data.user.id,tenant:result.data.tenant_id,hotel:result.data.hotel_id};
}
async function messageCount(email) {
  return (await (await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()).messages?.length || 0;
}

try {
  const registration=anon(), signupEmail=`${prefix}-signup@example.invalid`,signupPassword=`QC!a9${randomUUID()}`;
  const signup=await registration.auth.signUp({email:signupEmail,password:signupPassword});assert.ifError(signup.error); users.push(signup.data.user.id);
  check(!signup.data.session&&!signup.data.user.email_confirmed_at,'New signup requires email confirmation');
  const signupMail=await captured(signupEmail), signupCode=otp(signupMail);
  check(signupMail.Subject.includes('Xác minh'),'Signup uses Vietnamese Auth template');
  check(!(await registration.auth.signInWithPassword({email:signupEmail,password:signupPassword})).data.session,'Unconfirmed account cannot log in');
  const confirmed=await registration.auth.verifyOtp({email:signupEmail,token:signupCode,type:'signup'});assert.ifError(confirmed.error);
  check(!!confirmed.data.session,'Signup OTP verifies on an independent client/device');
  check(!!(await anon().auth.verifyOtp({email:signupEmail,token:signupCode,type:'signup'})).error,'Signup OTP cannot be replayed');

  const recovery=anon();assert.ifError((await recovery.auth.resetPasswordForEmail(signupEmail)).error);
  const resetMail=await captured(signupEmail,2),resetCode=otp(resetMail);
  check(resetMail.Subject.includes('khôi phục'),'Recovery uses the Auth SMTP OTP template');
  check(!!(await anon().auth.verifyOtp({email:signupEmail,token:'000000',type:'recovery'})).error,'Incorrect recovery OTP is rejected');
  assert.ifError((await recovery.auth.verifyOtp({email:signupEmail,token:resetCode,type:'recovery'})).error);
  const nextPassword=`QC!a9${randomUUID()}`;assert.ifError((await recovery.auth.updateUser({password:nextPassword})).error);
  check(!!(await anon().auth.signInWithPassword({email:signupEmail,password:signupPassword})).error,'Old password no longer authenticates');
  check(!!(await anon().auth.signInWithPassword({email:signupEmail,password:nextPassword})).data.session,'New recovery password authenticates');
  check(!!(await anon().auth.verifyOtp({email:signupEmail,token:resetCode,type:'recovery'})).error,'Recovery OTP is single use');
  const unknown=await anon().auth.resetPasswordForEmail(`${prefix}-missing@example.invalid`);
  check(!unknown.error,'Unknown recovery email gets a neutral success response');
  check((await invoke(anon(),'send-password-reset',{email:signupEmail})).error?.context?.status===410,'Legacy custom reset endpoint is retired');

  const owner=await account('owner'), outsider=await account('outsider');
  const ready=await admin.from('email_deliveries').select('id,template_data').eq('tenant_id',owner.tenant).eq('template_name','workspace_ready');assert.ifError(ready.error);
  check(ready.data.length===1&&ready.data[0].template_data.path===`/app/${prefix}-owner/auth/login`,'Backend provisioning queues exactly one welcome with the correct workspace link');
  const positions=await admin.from('positions').select('id,user_level_code,department').eq('tenant_id',owner.tenant);assert.ifError(positions.error);
  let position=positions.data.find(p=>p.user_level_code==='staff');
  if(!position) {
    const createdPosition=await admin.from('positions').insert({tenant_id:owner.tenant,code:'EMAIL-TEST',name:'Email test staff',user_level_code:'staff',department:'housekeeping'}).select('id,user_level_code,department').single();
    assert.ifError(createdPosition.error);position=createdPosition.data;
  }
  const employeeEmail=`${prefix}-employee@example.invalid`;
  const body={email:employeeEmail,fullName:'Email Test Employee',tenantId:owner.tenant,hotelId:owner.hotel,userLevelCode:'staff',positionId:position.id};
  const forbidden=await invoke(outsider.client,'create-user',body);
  check(!!forbidden.error,'Another tenant cannot invite into this hotel');
  const invitation=await invoke(owner.client,'create-user',body);assert.ifError(invitation.error);assert.ok(invitation.data.success);
  invitationIds.push(invitation.data.invitation.id);
  const pending=await admin.from('staff_invitations').select('*').eq('id',invitation.data.invitation.id).single();assert.ifError(pending.error);users.push(pending.data.auth_user_id);
  check(!(await admin.from('users').select('id').eq('id',pending.data.auth_user_id).maybeSingle()).data,'Pending invite has no application profile or permissions');
  const inviteMail=await captured(employeeEmail);let inviteCode=otp(inviteMail);
  check(inviteMail.Subject.includes('Lời mời')&&!inviteMail.Text.includes('Mật khẩu tạm'),'Invitation contains an Auth OTP, never a temporary password');
  const doubled=await invoke(owner.client,'create-user',body);
  check(doubled.error?.context?.status===429,'Repeated invitation requests are throttled');
  check((await messageCount(employeeEmail))===1,'Repeated submit does not send a second invitation');
  check(!(await outsider.client.from('staff_invitations').select('id').eq('id',pending.data.id)).data.length,'RLS hides another hotel’s invitation');
  check((await invoke(owner.client,'staff-invitations',{action:'list'})).data.invitations.some(i=>i.id===pending.data.id),'Invitation remains visible to the manager until accepted');
  await admin.from('staff_invitations').update({sent_at:new Date(Date.now()-120000).toISOString()}).eq('id',pending.data.id);
  assert.ifError((await invoke(owner.client,'staff-invitations',{action:'resend',id:pending.data.id})).error);
  inviteCode=otp(await captured(employeeEmail,2));
  check((await messageCount(employeeEmail))===2,'Manager can resend an unverified invitation without creating another identity');
  const employee=anon();assert.ifError((await employee.auth.verifyOtp({email:employeeEmail,token:inviteCode,type:'invite'})).error);
  check(!!(await invoke(employee,'staff-invitations',{action:'accept',tenantId:owner.tenant})).error,'Invite cannot grant membership before password setup');
  const bypass=await employee.rpc('complete_registration',{p_user_id:pending.data.auth_user_id,p_full_name:'Bypass',p_phone:'0901234567',p_tenant_name:'Bypass',
    p_email:employeeEmail,p_hotel_name:'Bypass',p_hotel_address:'Test',p_hotel_phone:'0281234567',p_hotel_email:employeeEmail,p_total_rooms:1});
  check(!bypass.data?.success,'Pending staff cannot bypass acceptance by onboarding as a new owner');
  check((await invoke(employee,'staff-invitations',{action:'mine'})).data.invitation.passwordReady===false,'Interrupted invite can be detected before granting access');
  await admin.from('staff_invitations').update({sent_at:new Date(Date.now()-120000).toISOString()}).eq('id',pending.data.id);
  assert.ifError((await invoke(owner.client,'staff-invitations',{action:'resend',id:pending.data.id})).error);
  const repeatedCode=otp(await captured(employeeEmail,3));
  assert.ifError((await employee.auth.verifyOtp({email:employeeEmail,token:repeatedCode,type:'recovery'})).error);
  check((await admin.from('staff_invitations').select('auth_user_id').eq('id',pending.data.id).single()).data.auth_user_id===pending.data.auth_user_id,'Resend after verification uses Auth recovery while preserving the same identity');
  assert.ifError((await employee.auth.updateUser({password:`QC!a9${randomUUID()}`})).error);
  await admin.from('staff_invitations').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('id',pending.data.id);
  check(!!(await invoke(employee,'staff-invitations',{action:'accept',tenantId:owner.tenant})).error,'Expired invitation cannot grant access even after password setup');
  await admin.from('staff_invitations').update({expires_at:new Date(Date.now()+3600000).toISOString()}).eq('id',pending.data.id);
  await admin.from('users').update({account_locked:true}).eq('id',owner.id);
  check(!!(await invoke(employee,'staff-invitations',{action:'accept',tenantId:owner.tenant})).error,'Locked inviter cannot grant membership through a previously issued invitation');
  await admin.from('users').update({account_locked:false}).eq('id',owner.id);
  check(!!(await invoke(employee,'staff-invitations',{action:'accept',tenantId:outsider.tenant})).error,'Acceptance rejects the wrong workspace');
  const accepted=await invoke(employee,'staff-invitations',{action:'accept',tenantId:owner.tenant});assert.ifError(accepted.error);assert.ok(accepted.data.success);
  const profile=await admin.from('users').select('tenant_id,hotel_id,position_id,user_level_code,department,must_change_password').eq('id',pending.data.auth_user_id).single();assert.ifError(profile.error);
  check(profile.data.tenant_id===owner.tenant&&profile.data.hotel_id===owner.hotel&&profile.data.position_id===position.id&&profile.data.department===position.department&&!profile.data.must_change_password,'Acceptance atomically assigns the requested hotel, position, department and account level');
  check((await admin.from('user_roles').select('role').eq('user_id',pending.data.auth_user_id)).data.some(r=>r.role==='staff'),'Authoritative application role is assigned');
  check((await invoke(employee,'staff-invitations',{action:'accept',tenantId:owner.tenant})).data.success,'Acceptance retry after a lost response is idempotent');
  check(!!(await employee.rpc('accept_staff_invitation',{p_invitation:pending.data.id,p_user:pending.data.auth_user_id})).error,'Browser cannot bypass the service-only invitation RPC');
  check(!!(await employee.rpc('enqueue_roomqc_email',{p_event_key:'forged',p_tenant_id:owner.tenant,p_recipient:employeeEmail,p_template:'system_test',p_data:{}})).error,'Ordinary users cannot enqueue arbitrary email');
  check(!!(await invoke(employee,'email-admin',{action:'status'})).error,'Ordinary users cannot read platform email administration');
  check((await invoke(employee,'send-notification-email',{notification_type:'payment_succeeded',to_email:employeeEmail,template_data:{}})).error?.context?.status===403,'Ordinary users cannot fabricate billing email');
  const invoice=await admin.from('guest_invoices').insert({tenant_id:owner.tenant,hotel_id:owner.hotel,invoice_number:prefix,guest_name:'<b>Demo guest</b>',total_amount:100000}).select('id').single();assert.ifError(invoice.error);
  check((await invoke(outsider.client,'send-invoice-email',{invoice_id:invoice.data.id,to_email:outsider.email})).error?.context?.status===403,'Invoice emails cannot disclose another tenant’s invoice');
  const invoiceRecipient=`${prefix}-invoice@example.invalid`;
  assert.ifError((await invoke(owner.client,'send-invoice-email',{invoice_id:invoice.data.id,to_email:invoiceRecipient})).error);
  const invoiceMail=await captured(invoiceRecipient);
  check(invoiceMail.HTML.includes('&lt;b&gt;Demo guest&lt;/b&gt;')&&!invoiceMail.HTML.includes('<b>Demo guest</b>'),'Authorized invoice uses local capture and escapes guest-supplied HTML');

  const revokedEmail=`${prefix}-revoked@example.invalid`;
  const revoked=await invoke(owner.client,'create-user',{...body,email:revokedEmail});assert.ifError(revoked.error);invitationIds.push(revoked.data.invitation.id);
  const revokedRow=await admin.from('staff_invitations').select('*').eq('id',revoked.data.invitation.id).single();users.push(revokedRow.data.auth_user_id);
  const revokedCode=otp(await captured(revokedEmail));const revokedClient=anon();assert.ifError((await revokedClient.auth.verifyOtp({email:revokedEmail,token:revokedCode,type:'invite'})).error);
  assert.ifError((await revokedClient.auth.updateUser({password:`QC!a9${randomUUID()}`})).error);
  assert.ifError((await invoke(owner.client,'staff-invitations',{action:'revoke',id:revokedRow.data.id})).error);
  check(!!(await invoke(revokedClient,'staff-invitations',{action:'accept',tenantId:owner.tenant})).error,'Revoked invitations grant no membership even after email verification');
  check((await invoke(revokedClient,'staff-invitations',{action:'mine'})).data.invitation.revoked===true,'Revoked recipients receive a clear blocked state instead of owner onboarding');
  const renewed=await invoke(owner.client,'create-user',{...body,email:revokedEmail});assert.ifError(renewed.error);invitationIds.push(renewed.data.invitation.id);
  const renewedRow=await admin.from('staff_invitations').select('auth_user_id').eq('id',renewed.data.invitation.id).single();
  check(renewedRow.data.auth_user_id===revokedRow.data.auth_user_id,'A new invitation after revocation preserves the original Auth identity');
  check((await invoke(revokedClient,'staff-invitations',{action:'mine'})).data.invitation.id===renewed.data.invitation.id,'New pending invitation supersedes the old revoked screen');

  const managementPosition=await admin.from('positions').insert({tenant_id:owner.tenant,code:'EMAIL-MANAGER',name:'Email test manager',user_level_code:'manager',department:'housekeeping'}).select('id').single();assert.ifError(managementPosition.error);
  for(const [level,role] of [['manager','hotel_manager'],['department_manager','department_manager']]) {
    const email=`${prefix}-${level}@example.invalid`,invited=await invoke(owner.client,'create-user',{...body,email,userLevelCode:level,positionId:managementPosition.data.id});
    assert.ifError(invited.error);invitationIds.push(invited.data.invitation.id);
    const identity=await admin.from('staff_invitations').select('auth_user_id').eq('id',invited.data.invitation.id).single();users.push(identity.data.auth_user_id);
    const manager=anon();assert.ifError((await manager.auth.verifyOtp({email,token:otp(await captured(email)),type:'invite'})).error);
    assert.ifError((await manager.auth.updateUser({password:`QC!a9${randomUUID()}`})).error);
    assert.ifError((await invoke(manager,'staff-invitations',{action:'accept',tenantId:owner.tenant})).error);
    const membership=await admin.from('users').select('user_level_code,hotel_id,department').eq('id',identity.data.auth_user_id).single();
    check(membership.data.user_level_code===level&&membership.data.hotel_id===owner.hotel&&membership.data.department==='housekeeping'
      &&(await admin.from('user_roles').select('role').eq('user_id',identity.data.auth_user_id)).data.some(row=>row.role===role),`${level} invitation assigns its requested scope and authoritative role`);
    check(!!(await invoke(manager,'create-user',{...body,email:`${prefix}-${level}-escalation@example.invalid`,userLevelCode:'manager',positionId:managementPosition.data.id})).error,`${level} cannot invite a hotel manager to escalate authority`);
  }

  assert.ifError((await admin.from('users').update({is_super_admin:true}).eq('id',owner.id)).error);
  const status=await invoke(owner.client,'email-admin',{action:'status'});assert.ifError(status.error);
  check(status.data.provider==='mailpit','Email administration reports the actual local capture provider');
  const eventKey=`${prefix}:concurrent`,recipient=`${prefix}-queue@example.invalid`;
  const queued=await Promise.all(Array.from({length:6},()=>admin.rpc('enqueue_roomqc_email',{p_event_key:eventKey,p_tenant_id:null,p_recipient:recipient,p_template:'system_test',p_data:{}})));
  queued.forEach(r=>assert.ifError(r.error));deliveries.push(queued[0].data);
  check(queued.every(r=>r.data===queued[0].data),'Concurrent identical events produce one durable delivery');
  const worker=async(token=local.SERVICE_ROLE_KEY)=>fetch(`${local.API_URL}/functions/v1/process-email-queue`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});
  check((await worker(local.ANON_KEY)).status===403,'Worker rejects non-service credentials even when gateway JWT verification is disabled');
  const results=await Promise.all([worker(),worker(),worker()]);check(results.every(r=>r.ok),'Concurrent worker invocations are serialized safely');
  // Each worker intentionally processes at most four queue entries. Other
  // local suites may have queued welcome messages, or cron may own the lease.
  // Observe this fixture's persisted outcome and advance bounded worker batches
  // instead of assuming one invocation drains the entire queue. Never clear it.
  for(let attempt=0;attempt<15;attempt++) {
    const current=await admin.from('email_deliveries').select('status').eq('id',queued[0].data).single();
    assert.ifError(current.error);
    if(['accepted','delivered'].includes(current.data.status)) break;
    assert.ok(['queued','processing'].includes(current.data.status),'Fixture delivery must not fail or expire');
    await new Promise(resolve=>setTimeout(resolve,1000));
    assert.ok((await worker()).ok,'Local worker batch must succeed');
  }
  await captured(recipient);
  const delivered=await admin.from('email_deliveries').select('status,provider_id').eq('id',queued[0].data).single();assert.ifError(delivered.error);
  check(delivered.data.status==='accepted'&&!!delivered.data.provider_id,'Provider acceptance is recorded without falsely claiming inbox delivery');
  check((await invoke(owner.client,'email-admin',{action:'retry',id:queued[0].data})).error?.context?.status===409,'Admin cannot retry an email already accepted by the provider');
  await worker();check((await messageCount(recipient))===1,'Worker replay does not send accepted email again');
  check(!(await anon().from('email_deliveries').select('id')).data?.length,'Public clients cannot read delivery history');
  const providerId=delivered.data.provider_id;
  assert.ifError((await admin.rpc('record_email_provider_event',{p_event_id:`${prefix}:delivered`,p_provider_id:providerId,p_type:'email.delivered'})).error);
  assert.ifError((await admin.rpc('record_email_provider_event',{p_event_id:`${prefix}:delay`,p_provider_id:providerId,p_type:'email.delivery_delayed'})).error);
  check((await admin.from('email_deliveries').select('status').eq('id',queued[0].data).single()).data.status==='delivered','Out-of-order delay does not overwrite successful delivery');
  const bounced=await admin.rpc('record_email_provider_event',{p_event_id:`${prefix}:bounce`,p_provider_id:providerId,p_type:'email.bounced'});assert.ifError(bounced.error);
  check((await admin.from('suppressed_emails').select('reason').eq('email',recipient).single()).data.reason==='bounce','Bounce suppresses further transactional sends');
  await admin.from('suppressed_emails').delete().eq('email',recipient);
  const retryEvent=await admin.rpc('enqueue_roomqc_email',{p_event_key:`${prefix}:retry`,p_tenant_id:null,p_recipient:`${prefix}-retry@example.invalid`,p_template:'system_test',p_data:{}});assert.ifError(retryEvent.error);deliveries.push(retryEvent.data);
  await admin.from('email_deliveries').update({status:'failed',attempts:1}).eq('id',retryEvent.data);
  const retryResults=await Promise.all([invoke(owner.client,'email-admin',{action:'retry',id:retryEvent.data}),invoke(owner.client,'email-admin',{action:'retry',id:retryEvent.data})]);
  check(retryResults.filter(result=>result.data?.success).length===1,'Concurrent manual retries create one retry and reject duplicate clicks');
  check((await admin.from('email_admin_actions').select('id').eq('delivery_id',retryEvent.data).eq('action','retry')).data?.length===1,'Manual retry creates exactly one audit entry');
  check(!!(await employee.rpc('retry_roomqc_email',{p_id:retryEvent.data,p_actor:owner.id})).error,'Browser cannot spoof the administrator in the service-only retry RPC');
  await admin.from('email_admin_actions').delete().eq('delivery_id',retryEvent.data).eq('action','retry');
  console.log(`\n${checks} local email integration checks passed. No external email was sent.`);
} finally {
  // Only data created by this run is eligible for cleanup; no existing accounts/mailbox are cleared.
  if(invitationIds.length) await admin.from('staff_invitations').delete().in('id',invitationIds);
  if(tenants.length) {
    const tenantMail=await admin.from('email_deliveries').select('id').in('tenant_id',tenants);
    for(const row of tenantMail.data || []) if(!deliveries.includes(row.id)) deliveries.push(row.id);
  }
  if(deliveries.length) {
    assert.ok(deliveries.every(id=>/^[0-9a-f-]{36}$/.test(id)),'Cleanup delivery IDs must be UUIDs');
    execFileSync('docker',['exec','-i','supabase_db_ehjtoajnlnuvuiwkpmbp','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{
      input:`DELETE FROM pgmq.q_transactional_emails WHERE message->>'delivery_id' IN (${deliveries.map(id=>`'${id}'`).join(',')});`,
      encoding:'utf8',stdio:['pipe','pipe','pipe'],
    });
    await admin.from('email_send_log').delete().in('message_id',deliveries);
    await admin.from('email_provider_events').delete().like('event_id',`${prefix}%`);
    await admin.from('email_deliveries').delete().in('id',deliveries);
  }
  for(const tenant of tenants) await admin.from('tenants').delete().eq('id',tenant);
  for(const user of users.reverse()) if(user) await admin.auth.admin.deleteUser(user);
  const remaining=await (await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(prefix)}`)).json();
  for(const message of remaining.messages || []) if(message.To?.some(to=>to.Address?.startsWith(prefix))&&!capturedIds.includes(message.ID)) capturedIds.push(message.ID);
  if(capturedIds.length) await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:capturedIds})});
}
