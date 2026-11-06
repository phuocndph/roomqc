// Dependency-injected server authorization, shared by every email-admin action.
// No cached JWT/user_metadata authorization, and no provider calls before this.
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
type AuthUser = { id: string; email_confirmed_at?: string | null }
type AdminProfile = { is_super_admin: boolean | null; status: string | null; account_locked: boolean | null; deleted_at?: string | null }
type Result<T> = { data: T; error: unknown }

// Context extraction ONLY after requireEmailAdministrator/Auth verification.
// This does not authenticate a JWT: neither metadata nor parsed claims grant
// authority. The service-only action RPC rechecks this live user/session.
export function verifiedEmailAdministratorContext(token: string | null, verifiedUserId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  try {
    if (!token || token.length > 16384 || token.split('.').length !== 3 || !uuid.test(verifiedUserId)) throw new Error()
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload))
    if (claims.sub !== verifiedUserId || typeof claims.session_id !== 'string' || !uuid.test(claims.session_id)) throw new Error()
    return { actorId: verifiedUserId, sessionId: claims.session_id }
  } catch {
    throw new HttpError(403, 'Phiên quản trị email không còn hiệu lực.')
  }
}

export async function requireEmailAdministrator<T extends AuthUser>(token: string | null, {
  verifyUser, loadProfile, verifyAdministratorSession,
}: {
  verifyUser: (token: string) => Promise<Result<{ user: T | null }>>
  loadProfile: (userId: string) => PromiseLike<Result<AdminProfile | null>>
  verifyAdministratorSession: (token: string) => PromiseLike<Result<string | null>>
}): Promise<T> {
  if (!token) throw new HttpError(401, 'Vui lòng đăng nhập.')
  const verified = await verifyUser(token)
  const user = verified.data?.user
  if (verified.error || !user || !user.id || !user.email_confirmed_at) {
    throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.')
  }
  const profile = await loadProfile(user.id)
  if (profile.error || !profile.data || profile.data.is_super_admin !== true || profile.data.status !== 'active'
    || profile.data.account_locked || profile.data.deleted_at !== null) {
    throw new HttpError(403, 'Bạn không có quyền quản trị email.')
  }
  const session = await verifyAdministratorSession(token)
  if (session.error || session.data !== user.id) {
    throw new HttpError(403, 'Phiên quản trị email không còn hiệu lực.')
  }
  return user
}
