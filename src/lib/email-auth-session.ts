import { isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js'

/** Clear only the isolated OTP client. The coordinator separately verifies
 * native logout; this helper never proves global session revocation. */
export async function clearIsolatedEmailSession(auth: Pick<SupabaseClient['auth'], 'signOut' | 'getUser' | 'getSession'>) {
  const result = await auth.signOut({ scope: 'local' })
  if (!isAuthSessionMissingError(result.error)) return result

  // Native logout already removed this session. auth-js maps session_not_found
  // to AuthSessionMissingError, which signOut does not clear. Its public getUser
  // path removes the local copy on that exact native error.
  const user = await auth.getUser()
  if (!isAuthSessionMissingError(user.error)) return { error: user.error ?? result.error }
  const remaining = await auth.getSession()
  return { error: remaining.error ?? (remaining.data.session ? result.error : null) }
}
