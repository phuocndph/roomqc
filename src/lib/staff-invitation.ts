type Session = { access_token: string; user: { id: string } }
type Context = { actorId: string; sessionId: string }
type Target = Context & { tenantId?: string | null; invitationId?: string; hotelId?: string }
export type StaffInvitation = { id: string; name: string; tenantId: string; hotelId: string; passwordReady: boolean; expired: boolean; revoked: boolean }
export type InvitationReceipt = { invitationId: string; tenantId: string; hotelId: string; acceptedAt: string; idempotent: boolean }
export type InvitationTarget = Pick<StaffInvitation, 'id' | 'tenantId' | 'hotelId'>
export type InvitationStatus = { status: 'accepted'; receipt: InvitationReceipt } | { status: 'pending' | 'revoked'; expired: boolean }
type Options = { signal?: AbortSignal; isCurrent?: () => boolean; sessionId?: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export class StaffInvitationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'StaffInvitationError' }
}
const changed = () => new StaffInvitationError('identity_changed', 'Phiên hoặc lời mời đã thay đổi. Vui lòng kiểm tra lại tài khoản.')
const unknown = () => new StaffInvitationError('invitation_unconfirmed', 'Chưa xác nhận được kết quả nhận lời mời. Hãy kiểm tra kết quả; không cần đặt lại mật khẩu.')
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unknown()
  return value as Record<string, unknown>
}

// Correlation only. Server Auth and the transactional native session check
// authorize; decoding a local JWT never grants employee membership.
export function staffInvitationSession(session: Session | null): Context {
  try {
    if (!session?.access_token || !uuid.test(session.user.id)) throw new Error()
    const parts = session.access_token.split('.'); if (parts.length !== 3) throw new Error()
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)))
    if (claims.sub !== session.user.id || typeof claims.session_id !== 'string' || !uuid.test(claims.session_id)) throw new Error()
    return { actorId: session.user.id, sessionId: claims.session_id }
  } catch { throw changed() }
}

function envelope(value: unknown, expected: Target, hasTarget: boolean) {
  const data = object(value)
  if (data.version !== 1 || data.actor_id !== expected.actorId || data.session_id !== expected.sessionId) throw unknown()
  if (hasTarget && (typeof data.invitation_id !== 'string' || !uuid.test(data.invitation_id)
    || typeof data.tenant_id !== 'string' || !uuid.test(data.tenant_id) || typeof data.hotel_id !== 'string' || !uuid.test(data.hotel_id)
    || (expected.tenantId && data.tenant_id !== expected.tenantId) || (expected.invitationId && data.invitation_id !== expected.invitationId)
    || (expected.hotelId && data.hotel_id !== expected.hotelId))) throw unknown()
  return data
}
export function parseInvitationAcceptance(value: unknown, expected: Target): InvitationReceipt {
  const data = envelope(value, expected, true)
  if (data.success !== true || data.status !== 'accepted' || typeof data.idempotent !== 'boolean'
    || typeof data.accepted_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.accepted_at)
    || !Number.isFinite(Date.parse(data.accepted_at))) throw unknown()
  return { invitationId: data.invitation_id as string, tenantId: data.tenant_id as string, hotelId: data.hotel_id as string,
    acceptedAt: data.accepted_at, idempotent: data.idempotent }
}
function mine(value: unknown, expected: Target): StaffInvitation | null {
  const data = envelope(value, expected, false)
  if (data.invitation === null) {
    if (data.invitation_id !== undefined || data.tenant_id !== undefined || data.hotel_id !== undefined) envelope(value, expected, true)
    return null
  }
  envelope(value, expected, true)
  const invite = object(data.invitation)
  if (invite.id !== data.invitation_id || invite.tenantId !== data.tenant_id || invite.hotelId !== data.hotel_id
    || typeof invite.name !== 'string' || !invite.name.trim() || invite.name.length > 150
    || typeof invite.revoked !== 'boolean' || typeof invite.expired !== 'boolean' || typeof invite.passwordReady !== 'boolean') throw unknown()
  return { id: invite.id as string, name: invite.name, tenantId: invite.tenantId as string, hotelId: invite.hotelId as string,
    passwordReady: invite.passwordReady, expired: invite.expired, revoked: invite.revoked }
}
async function boundedJson(response: Response) {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; if (size > 16384) throw unknown(); chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } finally { await reader.cancel().catch(() => {}) }
}

export function createStaffInvitationClient(deps: {
  endpoint: string; publishableKey: string; tenantId: string | null
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>; fetch?: typeof fetch
}) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), key = deps.publishableKey, tenantId = deps.tenantId, request = deps.fetch ?? fetch
  let accepting = false
  const execute = async (action: 'mine' | 'accept' | 'status', actorId: string, selection: InvitationTarget | undefined, options: Options = {}) => {
    const target = selection && { ...selection }
    const current = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw changed() }
    current()
    const initial = await deps.getSession().catch(() => { throw changed() }); current()
    if (initial.error || !initial.data.session) throw changed()
    const context = staffInvitationSession(initial.data.session), token = initial.data.session.access_token
    if (context.actorId !== actorId || (options.sessionId && context.sessionId !== options.sessionId)
      || (target && (!uuid.test(target.id) || !uuid.test(target.tenantId) || !uuid.test(target.hotelId)
        || (tenantId && tenantId !== target.tenantId)))) throw changed()
    const expected = { ...context, tenantId: tenantId ?? target?.tenantId, invitationId: target?.id, hotelId: target?.hotelId }, controller = new AbortController()
    const abort = () => controller.abort(), timeout = setTimeout(abort, 20000)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      current()
      const response = await request(endpoint + '/functions/v1/staff-invitations', {
        method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tenantId: expected.tenantId ?? null, ...(target ? { invitationId: target.id } : {}) }),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      })
      if (!response.ok) { await response.body?.cancel(); throw unknown() }
      const data = await boundedJson(response)
      if (controller.signal.aborted) throw unknown()
      current(); const latest = await deps.getSession(); current()
      if (latest.error) throw changed()
      const found = staffInvitationSession(latest.data.session)
      if (found.actorId !== context.actorId || found.sessionId !== context.sessionId) throw changed()
      if (action === 'mine') return mine(data, expected)
      const result = envelope(data, expected, true)
      if (action === 'status') {
        if (result.success === false && (result.status === 'pending' || result.status === 'revoked')
          && result.accepted_at === null && typeof result.expired === 'boolean') return { status: result.status, expired: result.expired }
        return { status: 'accepted', receipt: parseInvitationAcceptance(data, expected) }
      }
      return parseInvitationAcceptance(data, expected)
    } catch (error) {
      current()
      if (error instanceof StaffInvitationError) throw error
      throw unknown()
    } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
  }
  return {
    mine: (actorId: string, options?: Options) => execute('mine', actorId, undefined, options) as Promise<StaffInvitation | null>,
    status: (actorId: string, target: InvitationTarget, options?: Options) => execute('status', actorId, target, options) as Promise<InvitationStatus>,
    accept: async (actorId: string, target: InvitationTarget, options?: Options): Promise<InvitationReceipt> => {
      if (accepting) throw new StaffInvitationError('flow_busy', 'Thao tác trước đang xử lý. Vui lòng chờ.')
      accepting = true
      try { return await execute('accept', actorId, target, options) as InvitationReceipt }
      finally { accepting = false }
    },
  }
}
