import { staffInvitationSession } from './staff-invitation'

type Session = { access_token: string; user: { id: string } }
export type InvitationAdminContext = { actorId: string; sessionId: string; tenantId: string }
export type InvitationAdminRow = {
  id: string; hotel_id: string; email: string; full_name: string
  user_level_code: 'manager' | 'department_manager' | 'staff'
  expires_at: string; sent_at: string | null; created_at: string
}
export type InvitationDraft = {
  email: string; fullName: string; userLevelCode: string
  hotelId?: string | null; positionId?: string | null; reportsTo?: string | null
}
export type InvitationSendReceipt = { id: string; email: string; fullName: string; tenantId: string; hotelId: string }
export type InvitationPageCursor = { createdAt: string; id: string }
export type InvitationAdminPage = { rows: InvitationAdminRow[]; nextCursor: InvitationPageCursor | null }
export const INVITATION_PAGE_SIZE = 50
type Options = { signal?: AbortSignal; isCurrent?: () => boolean }
type Code = 'identity_changed' | 'flow_busy' | 'invalid_request' | 'permission_denied' | 'cooldown' | 'conflict' | 'outcome_unknown' | 'load_failed'
export class InvitationAdminError extends Error {
  constructor(public readonly code: Code, message: string) { super(message); this.name = 'InvitationAdminError' }
}
const changed = () => new InvitationAdminError('identity_changed', 'Phiên hoặc khách sạn đã thay đổi. Vui lòng kiểm tra lại.')
const unknown = () => new InvitationAdminError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy tải lại lời mời để kiểm tra; không gửi lại ngay.')
const invalid = () => new InvitationAdminError('invalid_request', 'Thông tin lời mời không hợp lệ. Vui lòng kiểm tra lại.')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max
const timestamp = (x: unknown): x is string => typeof x === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x))
const object = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw unknown()
  return x as Record<string, unknown>
}
function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await wait(reader.read(), signal)
      if (done) break
      size += value.byteLength
      if (size > 131072) throw unknown()
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let at = 0
    for (const part of chunks) { bytes.set(part, at); at += part.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { void reader.cancel().catch(() => {}) }
}
function row(value: unknown, hotelId: string | null): InvitationAdminRow {
  const x = object(value)
  if (typeof x.id !== 'string' || !uuid.test(x.id) || typeof x.hotel_id !== 'string' || !uuid.test(x.hotel_id)
    || (hotelId !== null && x.hotel_id !== hotelId) || !text(x.email, 254) || !text(x.full_name, 150)
    || !['manager', 'department_manager', 'staff'].includes(String(x.user_level_code))
    || !timestamp(x.expires_at) || !timestamp(x.created_at) || (x.sent_at !== null && !timestamp(x.sent_at))) throw unknown()
  return { id: x.id, hotel_id: x.hotel_id, email: x.email, full_name: x.full_name,
    user_level_code: x.user_level_code as InvitationAdminRow['user_level_code'],
    expires_at: x.expires_at, sent_at: x.sent_at as string | null, created_at: x.created_at }
}

function cursor(value: unknown): InvitationPageCursor {
  const x = object(value)
  if (!timestamp(x.createdAt) || typeof x.id !== 'string' || !uuid.test(x.id)) throw unknown()
  return { createdAt: x.createdAt, id: x.id }
}
// Preserve Postgres microseconds: Date.parse alone rounds away the tie breaker.
function micros(value: string): bigint {
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? ''
  return BigInt(Date.parse(value)) * 1000n + BigInt((fraction + '000000').slice(3, 6))
}
function older(a: InvitationPageCursor, b: InvitationPageCursor): boolean {
  const ta = micros(a.createdAt), tb = micros(b.createdAt)
  return ta < tb || (ta === tb && a.id.toLowerCase() < b.id.toLowerCase())
}
function sameCursor(a: InvitationPageCursor | null, b: InvitationPageCursor | null): boolean {
  return a === null || b === null ? a === b : micros(a.createdAt) === micros(b.createdAt) && a.id.toLowerCase() === b.id.toLowerCase()
}

// Decoded JWT claims correlate requests only. The server verifies native Auth,
// current authority and the exact live session transactionally.
export function createInvitationAdminClient(deps: {
  endpoint: string; publishableKey: string; path: string
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>
  isRuntimeCurrent?: () => boolean; fetch?: typeof fetch
}) {
  const request = deps.fetch ?? fetch, endpoint = deps.endpoint.replace(/\/$/, ''), key = deps.publishableKey
  let mutating = false
  async function execute(action: 'list' | 'create' | 'resend' | 'revoke', context: InvitationAdminContext,
    body: Record<string, unknown>, options: Options = {}) {
    const expected = { ...context }, controller = new AbortController()
    const current = () => {
      if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
    }
    const assertSession = async () => {
      const result = await wait(deps.getSession(), controller.signal); current()
      if (result.error) throw changed()
      let found: ReturnType<typeof staffInvitationSession>
      try { found = staffInvitationSession(result.data.session) } catch { throw changed() }
      if (found.actorId !== expected.actorId || found.sessionId !== expected.sessionId) throw changed()
      return result.data.session!.access_token
    }
    const abort = () => controller.abort(), timeout = setTimeout(abort, 20000)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      current()
      if (!uuid.test(expected.tenantId) || !uuid.test(expected.actorId) || !uuid.test(expected.sessionId)) throw changed()
      const token = await assertSession(); current()
      const response = await wait(request(endpoint + '/functions/v1/' + (action === 'create' ? 'create-user' : 'staff-invitations'), {
        method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, action, tenantId: expected.tenantId }),
        cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      }), controller.signal)
      current()
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        if (response.status === 401 || response.status === 403) throw new InvitationAdminError('permission_denied', 'Phiên hoặc quyền quản lý lời mời không còn hiệu lực.')
        if (response.status === 429) throw new InvitationAdminError('cooldown', 'Lời mời vừa được yêu cầu gửi. Vui lòng chờ ít nhất một phút và kiểm tra danh sách.')
        if (response.status === 409) throw new InvitationAdminError('conflict', 'Lời mời đã thay đổi. Vui lòng tải lại danh sách.')
        if (response.status === 400) throw invalid()
        throw unknown()
      }
      const data = object(await boundedJson(response, controller.signal))
      await assertSession(); current()
      if (controller.signal.aborted || data.version !== 1 || data.actor_id !== expected.actorId
        || data.session_id !== expected.sessionId || data.tenant_id !== expected.tenantId) throw unknown()
      return data
    } catch (error) {
      current()
      if (error instanceof InvitationAdminError) throw error
      if (action === 'list') throw new InvitationAdminError('load_failed', 'Không thể tải lời mời. Vui lòng thử lại.')
      throw unknown()
    } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
  }
  async function mutation<T>(run: () => Promise<T>) {
    if (mutating) throw new InvitationAdminError('flow_busy', 'Thao tác trước đang xử lý. Vui lòng chờ.')
    mutating = true
    try { return await run() } finally { mutating = false }
  }
  const sent = (data: Record<string, unknown>, expected: { id?: string; hotelId: string; email: string; fullName: string }, tenantId: string): InvitationSendReceipt => {
    const invitation = object(data.invitation)
    if (data.success !== true || data.status !== 'invited' || typeof data.invitation_id !== 'string' || !uuid.test(data.invitation_id)
      || (expected.id && data.invitation_id !== expected.id) || data.hotel_id !== expected.hotelId
      || invitation.id !== data.invitation_id || invitation.email !== expected.email || invitation.full_name !== expected.fullName) throw unknown()
    return { id: data.invitation_id, email: expected.email, fullName: expected.fullName, hotelId: expected.hotelId, tenantId }
  }
  return {
    listPage: async (context: InvitationAdminContext, hotelId: string | null, after: InvitationPageCursor | null = null, options?: Options): Promise<InvitationAdminPage> => {
      if (hotelId !== null && !uuid.test(hotelId)) throw invalid()
      let captured: InvitationPageCursor | null = null
      if (after !== null) { try { captured = cursor(after) } catch { throw invalid() } }
      const data = await execute('list', context, { hotelId, pageSize: INVITATION_PAGE_SIZE, cursor: captured }, options)
      const echoed = data.page_cursor === null ? null : cursor(data.page_cursor)
      if (data.hotel_id !== hotelId || data.page_size !== INVITATION_PAGE_SIZE || !sameCursor(echoed, captured)
        || !Array.isArray(data.invitations) || data.invitations.length > INVITATION_PAGE_SIZE) throw unknown()
      const rows = data.invitations.map(value => row(value, hotelId))
      if (new Set(rows.map(x => x.id.toLowerCase())).size !== rows.length) throw unknown()
      let previous = captured
      for (const item of rows) {
        const here = { createdAt: item.created_at, id: item.id }
        if (previous && !older(here, previous)) throw unknown()
        previous = here
      }
      const nextCursor = data.next_cursor === null ? null : cursor(data.next_cursor)
      if (nextCursor !== null && (rows.length !== INVITATION_PAGE_SIZE || !sameCursor(nextCursor, previous))) throw unknown()
      return { rows, nextCursor }
    },
    list: async (context: InvitationAdminContext, hotelId: string | null, options?: Options) => {
      if (hotelId !== null && !uuid.test(hotelId)) throw invalid()
      const data = await execute('list', context, { hotelId }, options)
      if (data.hotel_id !== hotelId || !Array.isArray(data.invitations) || data.invitations.length > 100) throw unknown()
      const rows = data.invitations.map(value => row(value, hotelId))
      if (new Set(rows.map(x => x.id)).size !== rows.length) throw unknown()
      return rows
    },
    create: (context: InvitationAdminContext, input: InvitationDraft, options?: Options) => mutation(async () => {
      const draft = { email: input.email.trim().toLowerCase(), fullName: input.fullName.trim(), userLevelCode: input.userLevelCode,
        hotelId: input.hotelId, positionId: input.positionId, reportsTo: input.reportsTo ?? null, path: deps.path }
      if (!text(draft.email, 254) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(draft.email) || !text(draft.fullName, 150)
        || draft.fullName.length < 2 || !draft.hotelId || !uuid.test(draft.hotelId) || !draft.positionId || !uuid.test(draft.positionId)
        || (draft.reportsTo !== null && !uuid.test(draft.reportsTo)) || !['manager', 'department_manager', 'staff'].includes(draft.userLevelCode)) throw invalid()
      const expected = { ...draft, hotelId: draft.hotelId }
      return sent(await execute('create', context, draft, options), expected, context.tenantId)
    }),
    act: (context: InvitationAdminContext, target: InvitationAdminRow, action: 'resend' | 'revoke', options?: Options) => mutation(async () => {
      const expected = row({ ...target }, null)
      const data = await execute(action, context, { id: expected.id, hotelId: expected.hotel_id, path: deps.path }, options)
      if (action === 'resend') return sent(data, { id: expected.id, hotelId: expected.hotel_id,
        email: expected.email, fullName: expected.full_name }, context.tenantId)
      if (data.success !== true || data.status !== 'revoked' || data.invitation_id !== expected.id
        || data.hotel_id !== expected.hotel_id || typeof data.idempotent !== 'boolean') throw unknown()
      return { id: expected.id, status: 'revoked' as const, idempotent: data.idempotent }
    }),
  }
}
