import { createClient } from 'npm:@supabase/supabase-js@2.80.0'
import { getBearerToken } from '../internalAuth.ts'
import { HttpError, requireEmailAdministrator } from './authorization.ts'
export { HttpError } from './authorization.ts'

export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

export async function authenticatedUser(req: Request, client = adminClient()) {
  const token = getBearerToken(req)
  if (!token) throw new HttpError(401, 'Vui lòng đăng nhập.')
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.')
  return data.user
}

export async function superAdmin(req: Request, client = adminClient()) {
  return requireEmailAdministrator(getBearerToken(req), {
    verifyUser: token => client.auth.getUser(token),
    loadProfile: userId => client.from('users').select('is_super_admin,status,account_locked,deleted_at').eq('id', userId).single(),
    verifyAdministratorSession: token => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).rpc('email_admin_actor'),
  })
}

export function json(data: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
