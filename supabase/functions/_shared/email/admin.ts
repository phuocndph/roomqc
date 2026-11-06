import { createClient } from 'npm:@supabase/supabase-js@2.80.0'
import { getBearerToken } from '../internalAuth.ts'

export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

export async function authenticatedUser(req: Request, client = adminClient()) {
  const token = getBearerToken(req)
  if (!token) throw new HttpError(401, 'Vui lòng đăng nhập.')
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.')
  return data.user
}

export async function superAdmin(req: Request, client = adminClient()) {
  const user = await authenticatedUser(req, client)
  const { data, error } = await client.from('users').select('is_super_admin,status,account_locked').eq('id', user.id).single()
  if (error || !data?.is_super_admin || data.status !== 'active' || data.account_locked) throw new HttpError(403, 'Bạn không có quyền quản trị email.')
  return user
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
export function json(data: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
