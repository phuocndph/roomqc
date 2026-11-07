/** Password operations use one captured token, not the SDK's mutable global session.
 * Decoding JWT below is only local correlation; Auth and the status RPC authorize.
 * Durable records contain IDs only. Never persist a password, token or hash here. */
type SessionLike = { access_token: string; user: { id: string } }
type SessionResult = { data: { session: SessionLike | null }; error: unknown }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
export type PasswordChangeContext = { actorId: string; sessionId: string; isRecovery: boolean; mustChangePassword: boolean }
export type PasswordChangeResult = { id: string; changeId: string; completion: 'submitted' | 'previous' }
type Capture = { actorId: string; sessionId: string; token: string }
type Status = { actor_id: string; session_id: string; is_recovery: boolean; must_change_password: boolean; change_id: string | null; completed_at: string | null }
type Pending = { version: 1; changeId: string; createdAt: number }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export class PasswordChangeError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PasswordChangeError' }
}
export class PasswordIdentityChangedError extends PasswordChangeError {
  constructor() { super('identity_changed', 'Phiên đăng nhập đã thay đổi. Vui lòng kiểm tra lại tài khoản.'); this.name = 'PasswordIdentityChangedError' }
}
const uncertain = () => new PasswordChangeError('outcome_unknown',
  'Chưa xác nhận được kết quả đổi mật khẩu. Hãy kiểm tra kết quả trước khi thử lại; nếu phiên đã hết hạn, hãy đăng nhập hoặc dùng khôi phục mật khẩu.')
const refusal = (code: string) => new PasswordChangeError(code,
  ['current_password_invalid', 'current_password_mismatch'].includes(code) ? 'Mật khẩu hiện tại không đúng.'
    : code === 'current_password_required' ? 'Vui lòng nhập mật khẩu hiện tại.'
    : code === 'weak_password' ? 'Mật khẩu mới chưa đáp ứng yêu cầu bảo mật.'
    : code === 'same_password' ? 'Mật khẩu mới cần khác mật khẩu hiện tại.'
    : 'Không thể đổi mật khẩu trong phiên này. Vui lòng kiểm tra tài khoản hoặc đăng nhập lại.')

function sessionIdentity(session: SessionLike | null): Capture {
  try {
    if (!session?.access_token) throw new Error()
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(payload + '='.repeat((4 - payload.length % 4) % 4)))
    if (!uuid.test(claims.sub) || claims.sub !== session.user.id || !uuid.test(claims.session_id)) throw new Error()
    return { actorId: claims.sub, sessionId: claims.session_id, token: session.access_token }
  } catch { throw new PasswordChangeError('session_required', 'Vui lòng đăng nhập lại để đổi mật khẩu.') }
}

export function createPasswordChangeFlow(deps: {
  endpoint: string; publishableKey: string; getSession: () => Promise<SessionResult>;
  storage: Store; fetch?: typeof fetch; randomUUID?: () => string
}) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), request = deps.fetch ?? fetch
  const prefix = 'roomqc-password-change:v1:' + encodeURIComponent(endpoint) + ':'
  const keyPrefix = (c: Capture) => prefix + c.actorId + ':' + c.sessionId + ':'
  const capture = async (expectedActor?: string): Promise<Capture> => {
    const result = await deps.getSession()
    if (result.error) throw new PasswordChangeError('session_required', 'Vui lòng đăng nhập lại để đổi mật khẩu.')
    const current = sessionIdentity(result.data.session)
    if (expectedActor && current.actorId !== expectedActor) throw new PasswordIdentityChangedError()
    return current
  }
  const ensureCurrent = async (c: Capture, isCurrent?: () => boolean) => {
    const current = await capture(c.actorId)
    if (current.sessionId !== c.sessionId || isCurrent?.() === false) throw new PasswordIdentityChangedError()
  }
  const headers = (c: Capture) => ({ apikey: deps.publishableKey, Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' })
  const json = async (response: Response): Promise<unknown> => {
    if (!response.body) throw uncertain()
    const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = []
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 16384) throw uncertain()
        chunks.push(value)
      }
      const bytes = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      return JSON.parse(new TextDecoder().decode(bytes))
    } finally { await reader.cancel().catch(() => {}) }
  }
  const status = async (c: Capture, changeId: string | null): Promise<Status> => {
    try {
      const response = await request(endpoint + '/rest/v1/rpc/password_change_status', {
        method: 'POST', headers: headers(c), body: JSON.stringify({ p_change_id: changeId }),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) { await response.body?.cancel(); throw uncertain() }
      const value = await json(response) as Status
      if (!value || value.actor_id !== c.actorId || value.session_id !== c.sessionId
        || typeof value.is_recovery !== 'boolean' || typeof value.must_change_password !== 'boolean'
        || (value.change_id !== null && !uuid.test(value.change_id))
        || (value.completed_at !== null && (typeof value.completed_at !== 'string' || !Number.isFinite(Date.parse(value.completed_at))))) throw uncertain()
      return value
    } catch { throw uncertain() }
  }
  const records = (c: Capture): Pending[] => {
    try {
      const list: Pending[] = [], start = keyPrefix(c)
      for (let i = 0; i < deps.storage.length; i++) {
        const key = deps.storage.key(i)
        if (!key?.startsWith(start)) continue
        const item = JSON.parse(deps.storage.getItem(key) || 'null') as Pending
        if (!item || item.version !== 1 || !uuid.test(item.changeId) || key !== start + item.changeId
          || !Number.isFinite(item.createdAt) || list.length >= 16) throw uncertain()
        list.push(item)
      }
      return list.sort((a, b) => a.createdAt - b.createdAt || a.changeId.localeCompare(b.changeId))
    } catch { throw uncertain() }
  }
  const completed = (s: Status, id: string) => s.change_id === id && s.completed_at !== null && s.must_change_password === false
  const remove = (c: Capture, id: string) => {
    try { deps.storage.removeItem(keyPrefix(c) + id) } catch { throw uncertain() }
  }
  const reconcileCaptured = async (c: Capture, isCurrent?: () => boolean): Promise<PasswordChangeResult | null> => {
    const pending = records(c); let result: PasswordChangeResult | null = null
    for (const item of pending) {
      const found = await status(c, item.changeId)
      await ensureCurrent(c, isCurrent)
      if (!completed(found, item.changeId)) throw uncertain()
      remove(c, item.changeId)
      result = { id: c.actorId, changeId: item.changeId, completion: 'previous' }
    }
    return result
  }
  return {
    async confirm(result: PasswordChangeResult, isCurrent?: () => boolean): Promise<PasswordChangeResult> {
      if (!uuid.test(result.changeId)) throw uncertain()
      const c = await capture(result.id), found = await status(c, result.changeId)
      await ensureCurrent(c, isCurrent)
      if (!completed(found, result.changeId)) throw uncertain()
      return { id: c.actorId, changeId: result.changeId, completion: 'previous' }
    },
    async context(actorId?: string): Promise<PasswordChangeContext> {
      const c = await capture(actorId), found = await status(c, null)
      await ensureCurrent(c)
      return { actorId: c.actorId, sessionId: c.sessionId, isRecovery: found.is_recovery, mustChangePassword: found.must_change_password }
    },
    async reconcile(actorId?: string, isCurrent?: () => boolean) {
      const c = await capture(actorId)
      return reconcileCaptured(c, isCurrent)
    },
    async change(input: { actorId?: string; newPassword: string; currentPassword?: string; isCurrent?: () => boolean }): Promise<PasswordChangeResult> {
      const c = await capture(input.actorId)
      const previous = await reconcileCaptured(c, input.isCurrent)
      if (previous) return previous // Never claim the newly entered password was sent.
      const context = await status(c, null)
      if (!context.is_recovery && !input.currentPassword) throw refusal('current_password_required')
      if (!input.newPassword) throw refusal('weak_password')
      const changeId = (deps.randomUUID ?? (() => crypto.randomUUID()))()
      if (!uuid.test(changeId)) throw uncertain()
      await ensureCurrent(c, input.isCurrent)
      const record: Pending = { version: 1, changeId, createdAt: Date.now() }
      try { deps.storage.setItem(keyPrefix(c) + changeId, JSON.stringify(record)) } catch { throw uncertain() }
      let code: string | null = null
      try {
        const response = await request(endpoint + '/auth/v1/user', {
          method: 'PUT', headers: headers(c), body: JSON.stringify({ password: input.newPassword,
            ...(input.currentPassword ? { current_password: input.currentPassword } : {}), roomqc_password_change_id: changeId }),
          cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20000),
        })
        if (response.status >= 400 && response.status < 500) {
          const body = await json(response) as { code?: unknown; error_code?: unknown }
          const candidate = typeof body?.error_code === 'string' ? body.error_code : body?.code
          if (typeof candidate === 'string' && ['current_password_invalid', 'current_password_mismatch', 'current_password_required',
            'weak_password', 'same_password', 'password_change_forbidden', 'password_change_conflict'].includes(candidate)) code = candidate
        } else await response.body?.cancel()
      } catch { /* Uncertain transport/body outcome: always read the receipt, never retry PUT. */ }
      const found = await status(c, changeId)
      await ensureCurrent(c, input.isCurrent)
      if (completed(found, changeId)) {
        remove(c, changeId)
        return { id: c.actorId, changeId, completion: 'submitted' }
      }
      if (code && found.change_id === null && found.completed_at === null) {
        remove(c, changeId)
        throw refusal(code)
      }
      throw uncertain()
    },
  }
}
