import { createPasswordChangeFlow, PasswordChangeError, PasswordIdentityChangedError, type PasswordChangeResult } from './password-change'
import { createStaffInvitationClient, StaffInvitationError, type StaffInvitation } from './staff-invitation'

export type EmailAuthMode = 'signup' | 'recovery' | 'invite'
type User = { id: string; email?: string }
type Session = { access_token: string; user: User }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
type OtpResult = { data: { session?: Session | null; user?: User | null }; error: unknown }
type Dependencies = {
  endpoint: string; publishableKey: string; tenantId: string | null; storage: Store
  send: (mode: EmailAuthMode, email: string) => Promise<void>
  verifyOtp: (input: { type: EmailAuthMode; email: string; token: string }) => Promise<OtpResult>
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>
  clearSession: () => Promise<{ error: unknown }>
  fetch?: typeof fetch; randomUUID?: () => string
}
type Verified = {
  generation: number; mode: EmailAuthMode; actorId: string; sessionId: string; session: Session
  password: ReturnType<typeof createPasswordChangeFlow>; receipt: PasswordChangeResult | null
  invitation: StaffInvitation | null; acceptanceAttempted: boolean; logoutPending: boolean
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const failure = (code: string, message: string) => new PasswordChangeError(code, message)
const verifyFirst = () => failure('verification_required', 'Vui lòng xác minh mã trước.')
const invalidOtp = () => failure('invalid_otp', 'Mã không hợp lệ, đã dùng hoặc đã hết hạn. Hãy yêu cầu mã mới.')

// JWT decoding correlates the SDK session only. Native Auth/RPC still authorize.
function identity(session?: Session | null) {
  try {
    if (!session?.access_token || !uuid.test(session.user.id)) throw new Error()
    const encoded = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)))
    if (claims.sub !== session.user.id || !uuid.test(claims.session_id)) throw new Error()
    return { actorId: session.user.id, sessionId: claims.session_id as string }
  } catch { throw new PasswordIdentityChangedError() }
}

/** One isolated OTP client per coordinator. Targets and request tokens never follow
 * mutable app runtime state. Receipt IDs persist; passwords/tokens never do.
 * Invitation authorization remains the server's responsibility, not this cache. */
export function createEmailAuthCoordinator(deps: Dependencies) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), key = deps.publishableKey, tenantId = deps.tenantId
  const request = deps.fetch ?? fetch
  let generation = 0, disposed = false, verified: Verified | null = null
  let active: Promise<unknown> | null = null, disposal: Promise<void> | null = null
  const live = (g: number) => !disposed && generation === g
  const assertLive = (g: number) => { if (!live(g)) throw new PasswordIdentityChangedError() }
  const single = <T>(action: () => Promise<T>): Promise<T> => {
    if (disposed) return Promise.reject(new PasswordIdentityChangedError())
    if (active) return Promise.reject(failure('flow_busy', 'Thao tác trước đang xử lý. Vui lòng chờ.'))
    const pending = Promise.resolve().then(action); active = pending
    return pending.finally(() => { if (active === pending) active = null })
  }
  const clear = async () => {
    try {
      const { error } = await deps.clearSession()
      if (error) throw new Error()
    } catch { throw failure('session_cleanup_failed', 'Chưa kết thúc được phiên xác minh trước. Vui lòng thử lại.') }
  }
  const currentSession = async (c: Verified): Promise<Session> => {
    assertLive(c.generation)
    const result = await deps.getSession().catch(() => { throw new PasswordIdentityChangedError() })
    assertLive(c.generation)
    if (result.error) throw new PasswordIdentityChangedError()
    const found = identity(result.data.session)
    if (found.actorId !== c.actorId || found.sessionId !== c.sessionId) throw new PasswordIdentityChangedError()
    // Keep the initiating token even if the SDK refreshed within this session.
    return c.session
  }
  const selected = (mode: EmailAuthMode) => {
    if (!verified || verified.mode !== mode || mode === 'signup') throw verifyFirst()
    assertLive(verified.generation)
    return verified
  }
  const headers = (c: Verified) => ({ apikey: key, Authorization: 'Bearer ' + c.session.access_token, 'Content-Type': 'application/json' })
  const invitationClient = (c: Verified) => createStaffInvitationClient({ endpoint, publishableKey: key, tenantId,
    fetch: request, getSession: async () => ({ data: { session: await currentSession(c) }, error: null }) })
  const accept = async (c: Verified) => {
    await currentSession(c)
    try {
      if (!c.invitation) throw new Error()
      const client = invitationClient(c), options = { sessionId: c.sessionId, isCurrent: () => live(c.generation) }
      if (c.acceptanceAttempted) {
        const result = await client.status(c.actorId, c.invitation, options)
        if (result.status === 'accepted') return
        if (result.status === 'revoked' || result.expired) throw new Error()
      }
      c.acceptanceAttempted = true
      await client.accept(c.actorId, c.invitation, options)
    } catch (error) {
      assertLive(c.generation)
      if (error instanceof PasswordIdentityChangedError || (error instanceof StaffInvitationError && error.code === 'identity_changed')) throw new PasswordIdentityChangedError()
      throw failure('invitation_pending', 'Chưa xác nhận được việc nhận lời mời. Hãy kiểm tra kết quả hoặc liên hệ quản lý; quyền truy cập chưa được xác nhận.')
    }
    await currentSession(c)
  }
  const logout = async (c: Verified) => {
    await currentSession(c)
    // Use the exact initiating token; SDK signOut can suppress invalid-token errors.
    // A lost logout response is not evidence that all refresh sessions were revoked.
    try {
      const response = await request(endpoint + '/auth/v1/logout?scope=' + (c.mode === 'recovery' ? 'global' : 'local'), {
        method: 'POST', headers: headers(c), cache: 'no-store', credentials: 'omit',
        redirect: 'error', signal: AbortSignal.timeout(20000),
      })
      await response.body?.cancel()
      if (!response.ok) throw new Error()
    } catch {
      assertLive(c.generation)
      throw failure('logout_unknown', 'Mật khẩu đã được xác nhận nhưng chưa xác nhận được việc kết thúc phiên. Không đặt mật khẩu lại; hãy kiểm tra kết quả hoặc đăng nhập để kiểm tra tài khoản.')
    }
    assertLive(c.generation)
  }
  const complete = async (c: Verified, result: PasswordChangeResult): Promise<PasswordChangeResult> => {
    assertLive(c.generation); c.receipt = result
    if (c.mode === 'invite') await accept(c)
    // Acceptance can overlap revocation/offboarding. Read the native receipt again
    // before the final logout, rather than treating a client boolean as authority.
    await c.password.confirm(result, () => live(c.generation))
    c.logoutPending = true
    await logout(c)
    verified = null
    return result
  }
  return {
    send: (mode: EmailAuthMode, email: string) => single(async () => {
      verified = null; const g = ++generation
      assertLive(g); await clear(); assertLive(g)
      try { await deps.send(mode, email.trim().toLowerCase()) }
      catch (error) {
        assertLive(g)
        if (error instanceof PasswordChangeError) throw error
        throw failure('send_failed', mode === 'invite' ? 'Hãy nhờ quản lý gửi lại lời mời.' : 'Chưa gửi được mã. Vui lòng chờ một phút và thử lại.')
      }
      assertLive(g)
    }),
    verify: (mode: EmailAuthMode, email: string, token: string) => single(async () => {
      verified = null; const g = ++generation
      assertLive(g)
      if (!/^\d{6}$/.test(token)) throw failure('invalid_otp', 'Mã xác minh gồm 6 chữ số.')
      await clear(); assertLive(g)
      const normalized = email.trim().toLowerCase()
      let result: OtpResult
      try {
        result = await deps.verifyOtp({ type: mode, email: normalized, token })
        assertLive(g)
        if (mode === 'invite' && result.error) result = await deps.verifyOtp({ type: 'recovery', email: normalized, token })
      } catch (error) {
        assertLive(g)
        if (error instanceof PasswordIdentityChangedError) throw error
        throw invalidOtp()
      }
      assertLive(g)
      const { data, error } = result
      if (error || !data.user || !data.session || data.user.email?.toLowerCase() !== normalized
        || data.session.user.id !== data.user.id || (data.session.user.email && data.session.user.email.toLowerCase() !== normalized)) throw invalidOtp()
      const found = identity(data.session)
      const c = { generation: g, mode, ...found,
        session: { access_token: data.session.access_token, user: { ...data.session.user } },
        receipt: null, invitation: null, acceptanceAttempted: false, logoutPending: false } as Verified
      c.password = createPasswordChangeFlow({
        endpoint, publishableKey: key, storage: deps.storage, fetch: request, randomUUID: deps.randomUUID,
        getSession: async () => ({ data: { session: await currentSession(c) }, error: null }),
      })
      await currentSession(c)
      if (mode !== 'signup') {
        const context = await c.password.context(c.actorId)
        if (!context.isRecovery) throw failure('recovery_context_required', 'Phiên xác minh không cho phép đặt mật khẩu. Vui lòng yêu cầu mã mới.')
      }
      if (mode === 'invite') {
        c.invitation = await invitationClient(c).mine(c.actorId, { sessionId: c.sessionId, isCurrent: () => live(g) })
        if (!c.invitation || c.invitation.revoked || c.invitation.expired) throw failure('invitation_unavailable', 'Lời mời không còn khả dụng. Vui lòng liên hệ quản lý khách sạn.')
      }
      assertLive(g); verified = c
      return data.user
    }),
    finish: (mode: EmailAuthMode, password: string) => single(async () => {
      const c = selected(mode)
      if (c.logoutPending && c.receipt) {
        await logout(c); verified = null
        return { ...c.receipt, completion: 'previous' as const }
      }
      await currentSession(c)
      const result = c.receipt ? await c.password.confirm(c.receipt, () => live(c.generation))
        : await c.password.change({ actorId: c.actorId, newPassword: password, isCurrent: () => live(c.generation) })
      return complete(c, result)
    }),
    check: (mode: EmailAuthMode) => single(async () => {
      const c = selected(mode)
      if (c.logoutPending && c.receipt) {
        await logout(c); verified = null
        return { ...c.receipt, completion: 'previous' as const }
      }
      await currentSession(c)
      const result = c.receipt ? await c.password.confirm(c.receipt, () => live(c.generation))
        : await c.password.reconcile(c.actorId, () => live(c.generation))
      if (!result) throw failure('no_pending_change', 'Chưa có lần đặt mật khẩu nào cần kiểm tra trong phiên này.')
      return complete(c, result)
    }),
    dispose() {
      if (disposal) return disposal
      disposed = true; generation++; verified = null
      const pending = active
      // verifyOtp writes its SDK session before returning. Wait for that write,
      // then clear it, so an unmounted form cannot leave a late OTP session alive.
      disposal = (async () => { await pending?.catch(() => {}); await clear() })()
      return disposal
    },
  }
}

