import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Use the CLI's running local stack, never a linked project or a production
// env file. Keep the service credential inside this server-side test process.
const statusText = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx supabase status --output json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const status = JSON.parse(statusText.slice(statusText.indexOf('{')))
const url = new URL(status.API_URL)
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Provisioning tests require a local stack')
assert.ok(status.SERVICE_ROLE_KEY && status.ANON_KEY, 'Local Supabase credentials are missing')
const options = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(url.href, status.SERVICE_ROLE_KEY, options)
const anonymous = createClient(url.href, status.ANON_KEY, options)
const testUsers = []
const testEmails = []
let checks = 0

function check(condition, message) {
  assert.ok(condition, message)
  checks += 1
  console.log(`PASS ${message}`)
}

async function createAccount(label) {
  const email = `roomqc-saas-${randomUUID()}@example.invalid`
  const password = `QC!${randomUUID()}a9`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Test ${label}` } })
  assert.ifError(created.error)
  testUsers.push(created.data.user.id)
  testEmails.push(email)
  const client = createClient(url.href, status.ANON_KEY, options)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  assert.ifError(signedIn.error)
  return { client, id: created.data.user.id, email, label }
}

function payload(account) {
  return {
    p_user_id: account.id, p_full_name: `Test ${account.label}`,
    p_email: account.email, p_phone: '0901234567',
    p_tenant_name: `Test tenant ${account.label}`, p_hotel_name: `Test hotel ${account.label}`,
    p_hotel_address: '123 Đường Kiểm Tra', p_hotel_phone: '0281234567',
    p_hotel_email: account.email, p_total_rooms: 12,
  }
}

async function provision(account, fields = {}) {
  const result = await account.client.rpc('complete_registration', { ...payload(account), ...fields })
  assert.ifError(result.error)
  return result.data
}

try {
  const owner = await createAccount('owner A')
  const outsider = await createAccount('owner B')

  const anonCall = await anonymous.rpc('complete_registration', payload(owner))
  check(Boolean(anonCall.error), 'Anonymous callers cannot provision tenants')
  const implementationCall = await owner.client.rpc('complete_registration_impl', payload(owner))
  check(Boolean(implementationCall.error), 'Authenticated clients cannot bypass the registration wrapper')

  const forged = await provision(outsider, { p_user_id: owner.id, p_email: owner.email })
  check(forged.success === false, 'A user cannot provision another user')
  const mismatchedEmail = await provision(owner, { p_email: outsider.email })
  check(mismatchedEmail.success === false, 'Registration requires the authenticated email')
  const invalid = await provision(owner, { p_total_rooms: -1 })
  check(invalid.success === false, 'Invalid registration data is rejected')
  const before = await admin.from('tenants').select('id').eq('email', owner.email)
  assert.ifError(before.error)
  check(before.data.length === 0, 'Rejected registration leaves no partial tenant')

  const simultaneous = await Promise.all(Array.from({ length: 6 }, () => provision(owner)))
  check(simultaneous.every(result => result.success === true), 'Six simultaneous first registrations all succeed')
  const first = simultaneous[0]
  check(simultaneous.every(result => result.tenant_id === first.tenant_id && result.hotel_id === first.hotel_id), 'Concurrent registrations return the same tenant and hotel')

  const retry = await provision(owner, { p_tenant_name: 'Must not overwrite tenant', p_hotel_name: 'Must not overwrite hotel' })
  check(retry.success === true && retry.idempotent === true && retry.tenant_id === first.tenant_id, 'Completed registration is idempotent')

  const tenant = await admin.from('tenants').select('*').eq('id', first.tenant_id).single()
  assert.ifError(tenant.error)
  const trialDays = (new Date(tenant.data.trial_ends_at).getTime() - Date.now()) / 86400000
  check(tenant.data.subscription_status === 'trial' && tenant.data.approval_status === 'approved' && trialDays > 29 && trialDays <= 30.01, 'Tenant is approved and receives a 30-day trial')
  check(tenant.data.name === payload(owner).p_tenant_name, 'Retries cannot overwrite the completed tenant')

  const hotel = await admin.from('hotels').select('id,name,total_rooms').eq('tenant_id', first.tenant_id)
  assert.ifError(hotel.error)
  check(hotel.data.length === 1 && hotel.data[0].name === payload(owner).p_hotel_name && hotel.data[0].total_rooms === 12, 'Only one hotel is created and retries preserve its data')
  const profile = await owner.client.from('users').select('tenant_id,hotel_id,user_level_code,is_primary_owner,status').eq('id', owner.id).single()
  assert.ifError(profile.error)
  check(profile.data.tenant_id === first.tenant_id && profile.data.hotel_id === first.hotel_id && profile.data.user_level_code === 'tenant_owner' && profile.data.is_primary_owner && profile.data.status === 'active', 'Owner has an active profile attached to the tenant and hotel')
  const roles = await owner.client.from('user_roles').select('role').eq('user_id', owner.id)
  assert.ifError(roles.error)
  check(roles.data.filter(role => role.role === 'owner').length === 1, 'Owner role is assigned once')
  const assignment = await admin.from('user_hotels').select('hotel_id,can_create_staff,can_create_managers,can_approve_requests').eq('user_id', owner.id)
  assert.ifError(assignment.error)
  check(assignment.data.length === 1 && assignment.data[0].can_create_staff && assignment.data[0].can_create_managers && assignment.data[0].can_approve_requests, 'Owner can manage the first hotel')
  for (const [table, count] of [['item_categories', 5], ['laundry_categories', 3], ['maintenance_categories', 5], ['room_types', 4]]) {
    const seeded = await admin.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', first.tenant_id)
    assert.ifError(seeded.error)
    check(seeded.count === count, `${table} defaults are seeded once`)
  }

  const otherTenant = await provision(outsider)
  check(otherTenant.success === true && otherTenant.tenant_id !== first.tenant_id, 'Another owner receives a separate tenant')
  for (const table of ['hotels', 'users', 'item_categories', 'room_types']) {
    const leaked = await outsider.client.from(table).select('id').eq('tenant_id', first.tenant_id)
    assert.ifError(leaked.error)
    check(leaked.data.length === 0, `RLS prevents cross-tenant access to ${table}`)
  }

  const crossTenantWrite = await outsider.client.from('hotels').update({ name: 'Unauthorized change' }).eq('id', first.hotel_id).select('id')
  assert.ifError(crossTenantWrite.error)
  check(crossTenantWrite.data.length === 0, 'RLS prevents updating another tenant hotel')
  const escalation = await owner.client.from('users').update({ is_super_admin: true }).eq('id', owner.id)
  check(Boolean(escalation.error), 'A tenant owner cannot promote themselves to super admin')

  const staff = await createAccount('staff')
  const staffProfile = await admin.from('users').insert({ id: staff.id, email: staff.email, full_name: 'Test staff', tenant_id: first.tenant_id, hotel_id: first.hotel_id, role: 'staff', user_level_code: 'staff', status: 'active', created_by: owner.id })
  assert.ifError(staffProfile.error)
  const staffResult = await provision(staff)
  check(staffResult.success === false, 'Staff cannot create a separate tenant through onboarding')
  const staffTenant = await admin.from('tenants').select('id').eq('email', staff.email)
  assert.ifError(staffTenant.error)
  check(staffTenant.data.length === 0, 'Rejected staff onboarding does not create a tenant')
  console.log(`Provisioning verified: ${checks} checks passed.`)
} finally {
  // Delete only accounts and tenants created by this exact invocation. Never
  // clean by a shared prefix; separate invocations can safely run together.
  const cleanupErrors = []
  for (const email of testEmails) {
    const result = await admin.from('tenants').delete().eq('email', email)
    if (result.error) cleanupErrors.push(result.error.message)
  }
  for (const id of testUsers) {
    const result = await admin.auth.admin.deleteUser(id)
    if (result.error) cleanupErrors.push(result.error.message)
  }
  assert.deepEqual(cleanupErrors, [], 'Test data cleanup failed')
  console.log('Temporary test tenants and accounts removed.')
}
