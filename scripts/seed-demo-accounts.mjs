import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const demoPassword = process.env.ROOMQC_DEMO_PASSWORD || 'RoomQC-Demo-2026!'

if (!serviceRoleKey) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY. For local Supabase, run `npx supabase@latest status -o env` and export SERVICE_ROLE_KEY before seeding.',
  )
}

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(supabaseUrl)) {
  throw new Error(`Refusing to seed demo accounts outside local Supabase: ${supabaseUrl}`)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const accounts = [
  { key: 'finance', email: 'roomqc.demo.finance@example.com', fullName: 'Demo Finance Staff', role: 'staff', userLevelCode: 'staff', department: 'accounting' },
  { key: 'housekeeping', email: 'roomqc.demo.housekeeping@example.com', fullName: 'Demo Housekeeping Staff', role: 'staff', userLevelCode: 'staff', department: 'housekeeping' },
  { key: 'inventory', email: 'roomqc.demo.inventory@example.com', fullName: 'Demo Inventory Staff', role: 'staff', userLevelCode: 'staff', department: 'inventory' },
  { key: 'maintenance', email: 'roomqc.demo.maintenance@example.com', fullName: 'Demo Maintenance Staff', role: 'staff', userLevelCode: 'staff', department: 'maintenance' },
  { key: 'manager', email: 'roomqc.demo.manager@example.com', fullName: 'Demo Hotel Manager', role: 'hotel_manager', userLevelCode: 'manager', department: null },
  { key: 'operations', email: 'roomqc.demo.operations@example.com', fullName: 'Demo Operations Manager', role: 'department_manager', userLevelCode: 'department_manager', department: null },
  { key: 'reception', email: 'roomqc.demo.reception@example.com', fullName: 'Demo Reception Staff', role: 'staff', userLevelCode: 'staff', department: 'front_desk' },
]

const fail = (message, error) => {
  if (error) throw new Error(`${message}: ${error.message}`)
}

const { data: owner, error: ownerError } = await supabase
  .from('users')
  .select('id, tenant_id, hotel_id')
  .eq('user_level_code', 'tenant_owner')
  .limit(1)
  .maybeSingle()
fail('Unable to find a local tenant owner', ownerError)
if (!owner?.tenant_id) throw new Error('No local tenant owner exists. Seed the local tenant before demo accounts.')

const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
fail('Unable to list local Auth users', authUsersError)

for (const account of accounts) {
  let authUser = authUsers.users.find((candidate) => candidate.email?.toLowerCase() === account.email)

  if (authUser) {
    const result = await supabase.auth.admin.updateUserById(authUser.id, {
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, demo_account: true },
    })
    fail(`Unable to update Auth user ${account.email}`, result.error)
  } else {
    const result = await supabase.auth.admin.createUser({
      email: account.email,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, demo_account: true },
    })
    fail(`Unable to create Auth user ${account.email}`, result.error)
    authUser = result.data.user
  }

  if (!authUser?.id) throw new Error(`Auth user id missing for ${account.email}`)

  const { error: profileError } = await supabase.from('users').upsert({
    id: authUser.id,
    email: account.email,
    full_name: account.fullName,
    tenant_id: owner.tenant_id,
    hotel_id: owner.hotel_id,
    role: account.role,
    user_level_code: account.userLevelCode,
    department: account.department,
    status: 'active',
    created_by: account.userLevelCode === 'tenant_owner' ? null : owner.id,
    must_change_password: false,
    account_locked: false,
  }, { onConflict: 'id' })
  fail(`Unable to upsert profile ${account.email}`, profileError)

  const { error: roleError } = await supabase.from('user_roles').upsert({
    user_id: authUser.id,
    role: account.role,
  }, { onConflict: 'user_id,role' })
  fail(`Unable to upsert role ${account.email}`, roleError)

  if (account.department === 'front_desk') {
    const { error: permissionError } = await supabase.from('user_permissions').upsert(
      ['view', 'create', 'update', 'export'].map((action) => ({
        user_id: authUser.id,
        tenant_id: owner.tenant_id,
        module: 'bookings',
        action,
        enabled: true,
      })),
      { onConflict: 'user_id,module,action' },
    )
    fail(`Unable to assign front-desk permissions ${account.email}`, permissionError)
  }

  console.log(`${account.key}: ${account.email}`)
}

console.log(`Seeded ${accounts.length} local demo accounts.`)
console.log(`Password: ${demoPassword}`)
