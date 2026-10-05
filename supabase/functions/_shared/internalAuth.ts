/** Authentication for server-to-server Edge Function calls.
 *
 * Browser callers must use a Supabase user JWT. Internal callers use the
 * secret header configured in ROOMQC_INTERNAL_FUNCTION_SECRET; the service
 * role bearer is also accepted for trusted function-to-function calls.
 */
export function getBearerToken(req: Request): string | null {
  const value = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!value?.startsWith('Bearer ')) return null
  return value.slice(7).trim() || null
}

function secureEquals(left: string | null, right: string | null): boolean {
  if (!left || !right) return false
  const length = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let i = 0; i < length; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0)
  }
  return diff === 0
}

export function isInternalRequest(req: Request): boolean {
  const configuredSecret = Deno.env.get('ROOMQC_INTERNAL_FUNCTION_SECRET')?.trim() ?? null
  const suppliedSecret = req.headers.get('x-internal-secret')?.trim() ?? null
  if (secureEquals(suppliedSecret, configuredSecret)) return true

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? null
  return secureEquals(getBearerToken(req), serviceRoleKey)
}
