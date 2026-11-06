// Defensive regression checks against isolated fixtures on loopback only.
// Never prints credentials, touches a linked project or uses real payments.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const output = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d','/s','/c','npx --no-install supabase status --output json'], { encoding:'utf8',stdio:['ignore','pipe','pipe'] })
  : execFileSync('npx', ['--no-install','supabase','status','--output','json'], { encoding:'utf8',stdio:['ignore','pipe','pipe'] });
const local = JSON.parse(output.slice(output.indexOf('{')));
assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(local.API_URL).hostname),'Loopback only');
const options = { auth:{ persistSession:false, autoRefreshToken:false } };
const admin = createClient(local.API_URL,local.SERVICE_ROLE_KEY,options);
const anonymous = createClient(local.API_URL,local.ANON_KEY,options);
const users = [], tenants = [];
let checks = 0;
function check(value,label) { assert.ok(value,label); console.log('PASS ' + label); checks++; }
async function account() {
  const email = 'permissions-' + randomUUID() + '@example.invalid', password = 'QC!' + randomUUID() + 'a9';
  const created = await admin.auth.admin.createUser({ email,password,email_confirm:true });
  assert.ifError(created.error); users.push(created.data.user.id);
  const client = createClient(local.API_URL,local.ANON_KEY,options);
  assert.ifError((await client.auth.signInWithPassword({email,password})).error);
  const provision = await admin.rpc('provision_workspace_registration',{
    p_workspace_id:randomUUID(),p_owner_id:created.data.user.id,
    p_fields:{ fullName:'Permission fixture',phone:'0901234567',tenantName:'Permission fixture',
      hotelName:'Permission fixture',hotelAddress:'123 Test Road',hotelPhone:'0281234567',
      hotelEmail:email,totalRooms:3 },
  });
  assert.ifError(provision.error); assert.ok(provision.data.success);
  tenants.push(provision.data.tenant_id);
  return {client,userId:created.data.user.id,tenantId:provision.data.tenant_id};
}
const manage = (actor,tenant,action,reason='Local regression check',extra={}) =>
  actor.rpc('admin_manage_tenant',{p_tenant_id:tenant,p_action:action,p_reason:reason,...extra});
const snapshot = async (id) => {
  const result = await admin.from('tenants').select('*').eq('id',id).single();
  assert.ifError(result.error); return result.data;
};
try {
  const owner = await account(), outsider = await account(), superUser = await account();
  const before = await snapshot(owner.tenantId);
  const profile = await owner.client.from('tenants').update({name:'Updated fixture',phone:'0901111222',
    settings:{currency:'VND'},usage_mode:'standard'}).eq('id',owner.tenantId).select('id,name').single();
  assert.ifError(profile.error);
  check(profile.data.name==='Updated fixture','Owner can update profile, settings and display mode');
  const protectedFields = {
    subscription_status:'active',registered_rooms:99999,subscription_plan_id:randomUUID(),
    subscription_end_date:'2099-01-01',subscription_current_period_end:'2099-01-01T00:00:00Z',
    trial_ends_at:'2099-01-01T00:00:00Z',trial_end_date:'2099-01-01',
    approval_status:'approved',approved_by:owner.userId,is_read_only:false,
    read_only_reason:null,grace_period_ends_at:'2099-01-01T00:00:00Z',
    payment_tolerance_vnd:9999999,grace_period_days_override:99999,
    subscription_plan:'enterprise',subscription_duration_days:99999,
    subscription_expires_at:'2099-01-01T00:00:00Z',id:randomUUID(),
  };
  for (const [field,value] of Object.entries(protectedFields)) {
    const result = await owner.client.from('tenants').update({[field]:value}).eq('id',owner.tenantId).select('id');
    check(result.error?.code==='42501','Owner cannot update protected field: ' + field);
  }
  const after = await snapshot(owner.tenantId);
  check(Object.keys(protectedFields).every(key=>JSON.stringify(before[key])===JSON.stringify(after[key])),
    'Rejected updates preserve every protected value');
  check((await outsider.client.from('tenants').update({name:'Wrong tenant'}).eq('id',owner.tenantId).select('id').single()).error,
    'RLS prevents cross-tenant profile updates');
  check((await owner.client.from('tenants').delete().eq('id',owner.tenantId)).error?.code==='42501','Owner hard delete is denied explicitly');
  check((await anonymous.from('tenants').delete().eq('id',owner.tenantId)).error,'Anonymous hard delete is denied');
  for (const action of ['suspend','reactivate','change_plan']) {
    check((await manage(owner.client,owner.tenantId,action)).error?.code==='42501','Owner cannot call admin action: ' + action);
  }
  check((await anonymous.rpc('admin_manage_tenant',{p_tenant_id:owner.tenantId,p_action:'suspend',p_reason:'Anonymous check'})).error,
    'Anonymous admin RPC is denied');
  for (const fn of ['set_tenant_read_only','clear_tenant_read_only']) {
    check((await owner.client.rpc(fn,{p_tenant_id:owner.tenantId,p_reason:'Owner check'})).error,'Owner cannot call ' + fn);
  }
  const payment = {tenant_id:owner.tenantId,amount:50000,payment_method:'bank_transfer',
    metadata:{type:'extend',duration_days:30,rooms:3}};
  check((await owner.client.from('payment_transactions').insert({...payment,payment_status:'completed'})).error,
    'Owner cannot create an already-completed payment');
  check((await owner.client.from('payment_transactions').insert({...payment,gateway_transaction_id:'unverified'})).error,
    'Owner cannot create a gateway-confirmed payment');
  check((await owner.client.from('payment_transactions').insert(payment)).error?.code==='42501',
    'Browser-priced pending payment creation is denied after cutover');
  const pending = await admin.from('payment_transactions').insert(payment).select('id').single();
  assert.ifError(pending.error);
  check(!!pending.data.id,'Only the trusted test server can prepare a legacy reconciliation fixture');
  check((await owner.client.from('payment_transactions').update({payment_status:'completed'}).eq('id',pending.data.id)).error,
    'Owner cannot mark a pending payment completed');
  check((await owner.client.rpc('settle_subscription_payment',{p_payment_id:pending.data.id})).error?.code==='42501',
    'Owner cannot settle an unverified payment through RPC');
  check((await outsider.client.rpc('settle_subscription_payment',{p_payment_id:pending.data.id})).error?.code==='42501',
    'Another tenant cannot settle the payment');
  const gatewayKey='local-permissions-' + randomUUID();
  const settlements = await Promise.all(Array.from({length:20},()=>admin.rpc('settle_subscription_payment',{
    p_payment_id:pending.data.id,p_gateway_transaction_id:gatewayKey})));
  check(settlements.every(result=>result.error?.code==='PT409'),
    '20 trusted settlement attempts cannot activate an unverified legacy price');
  const paid = await snapshot(owner.tenantId);
  check(paid.subscription_status===after.subscription_status&&paid.registered_rooms===after.registered_rooms,
    'Rejected legacy settlements preserve the existing entitlement');
  assert.ifError((await admin.from('user_roles').insert({user_id:superUser.userId,role:'super_admin'})).error);
  assert.ifError((await admin.from('users').update({is_super_admin:true}).eq('id',superUser.userId)).error);
  check((await superUser.client.from('tenants').update({subscription_status:'active'}).eq('id',owner.tenantId)).error?.code==='42501',
    'Super admin also cannot bypass the audited RPC with direct billing writes');
  check((await superUser.client.from('tenants').delete().eq('id',owner.tenantId)).error?.code==='42501',
    'Super admin browser cannot hard delete a tenant');
  check((await manage(superUser.client,owner.tenantId,'suspend','')).error,'Admin action requires a reason');
  check((await manage(superUser.client,owner.tenantId,'unknown')).error,'Unknown admin action is rejected');
  check((await manage(superUser.client,randomUUID(),'suspend')).error,'Missing tenant does not report success');
  assert.ifError((await manage(superUser.client,owner.tenantId,'change_plan','Audited test setup of a valid plan',{p_rooms:3,p_duration_days:30})).error);
  const suspended = await manage(superUser.client,owner.tenantId,'suspend'); assert.ifError(suspended.error);
  check(suspended.data.subscription_status==='suspended'&&suspended.data.is_read_only,'Admin suspension atomically enables read-only');
  const restored = await manage(superUser.client,owner.tenantId,'reactivate'); assert.ifError(restored.error);
  check(restored.data.subscription_status==='active'&&!restored.data.is_read_only,'Admin restores an existing valid plan');
  assert.ifError((await admin.from('tenants').update({subscription_end_date:'2020-01-01',subscription_status:'suspended'}).eq('id',owner.tenantId)).error);
  check((await manage(superUser.client,owner.tenantId,'reactivate')).error,'Reactivation cannot renew an expired plan');
  check((await manage(superUser.client,owner.tenantId,'change_plan','Invalid room count',{p_rooms:0,p_duration_days:30})).error,
    'Admin plan adjustment validates room count');
  check((await manage(superUser.client,owner.tenantId,'change_plan','Invalid duration',{p_rooms:3,p_duration_days:99999})).error,
    'Admin plan adjustment validates duration');
  const changed = await manage(superUser.client,owner.tenantId,'change_plan','Approved local test adjustment',{p_rooms:3,p_duration_days:30});
  assert.ifError(changed.error);
  check(changed.data.subscription_status==='active'&&changed.data.registered_rooms===3&&!changed.data.is_read_only,
    'Admin plan adjustment commits plan, quota and write access together');
  const audit = await admin.from('audit_log').select('actor_id,context,action').eq('tenant_id',owner.tenantId).eq('action','admin_change_plan');
  assert.ifError(audit.error);
  check(audit.data.some(row=>row.actor_id===superUser.userId&&row.context.reason==='Approved local test adjustment'
    &&row.context.before&&row.context.after),'Audit records real actor, reason and before/after values');
  assert.ifError((await admin.from('users').update({account_locked:true}).eq('id',superUser.userId)).error);
  check((await manage(superUser.client,owner.tenantId,'suspend')).error?.code==='42501','Locked admin loses mutation access even with an existing session');
  for (const fn of ['set_tenant_read_only','clear_tenant_read_only']) {
    check((await superUser.client.rpc(fn,{p_tenant_id:owner.tenantId,p_reason:'Locked admin check'})).error?.code==='42501',
      'Locked admin cannot use legacy ' + fn);
  }
  assert.ifError((await admin.rpc('set_tenant_read_only',{p_tenant_id:owner.tenantId,p_reason:'Trusted server regression'})).error);
  assert.ifError((await admin.rpc('clear_tenant_read_only',{p_tenant_id:owner.tenantId,p_reason:'Trusted server recovery'})).error);
  check(!(await snapshot(owner.tenantId)).is_read_only,'Trusted server retains read-only expiry/recovery access');
  assert.ifError((await admin.from('user_roles').delete().eq('user_id',outsider.userId).eq('role','owner')).error);
  assert.ifError((await admin.from('user_roles').insert({user_id:outsider.userId,role:'staff'})).error);
  check((await outsider.client.from('tenants').update({name:'Staff edit'}).eq('id',outsider.tenantId).select('id').single()).error,
    'Staff cannot edit tenant settings');
  check((await manage(outsider.client,outsider.tenantId,'suspend')).error?.code==='42501','Staff cannot call administrative RPC');
  console.log('Tenant permission integration verified: ' + checks + ' checks passed.');
} finally {
  const errors = [];
  for (const id of tenants) { try { assert.ifError((await admin.from('tenants').delete().eq('id',id)).error); } catch { errors.push('tenant'); } }
  for (const id of users) { try { assert.ifError((await admin.auth.admin.deleteUser(id)).error); } catch { errors.push('user'); } }
  if (errors.length) { console.error('Fixture cleanup failed for ' + errors.length + ' identified resources.'); process.exitCode=1; }
  else console.log('Only identified permission-test tenants and accounts were removed.');
}
