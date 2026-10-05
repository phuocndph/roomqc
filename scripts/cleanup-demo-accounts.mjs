import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.')
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(supabaseUrl)) {
  throw new Error(`Refusing to delete accounts outside local Supabase: ${supabaseUrl}`)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (error) throw error

const demoUsers = data.users.filter((user) => user.email?.startsWith('roomqc.demo.'))
for (const user of demoUsers) {
  const result = await supabase.auth.admin.deleteUser(user.id)
  if (result.error) throw result.error
  console.log(`Deleted ${user.email}`)
}

console.log(`Removed ${demoUsers.length} local demo Auth users and their profiles.`)
