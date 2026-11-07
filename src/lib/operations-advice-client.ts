import { staffInvitationSession } from './staff-invitation'
import { adviceUuid, parseAdviceReceipt, parseAdviceRequest, readBoundedJson,
  type AdviceReceipt, type AdviceScope, type AdviceRequest } from '../../supabase/functions/_shared/advice/contracts'

export type { AdviceReceipt, AdviceScope }
export type AdviceContext = { actorId: string; sessionId: string; tenantId: string; runtime: string }
export type PendingAdvice = { version: 1; context: AdviceContext; request: AdviceRequest & AdviceScope }
type Store = Pick<Storage, 'length' | 'getItem' | 'setItem' | 'removeItem'>
type Options = { signal?: AbortSignal; isCurrent?: () => boolean }
export type AdviceLock = <T>(name: string, run: () => Promise<T>) => Promise<T>
export class AdviceClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'AdviceClientError' }
}
const changed = () => new AdviceClientError('identity_changed', 'Phiên hoặc phạm vi đã thay đổi. Vui lòng kiểm tra lại.')
const unknown = () => new AdviceClientError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra yêu cầu cũ; hệ thống không tự gửi lại.')
const storageError = () => new AdviceClientError('storage_unavailable', 'Không thể lưu thông tin phục hồi trên thiết bị. Chưa gửi yêu cầu mới.')
const busy = () => new AdviceClientError('flow_busy', 'Yêu cầu trong phạm vi này đang được xử lý ở một cửa sổ khác. Vui lòng chờ rồi kiểm tra.')
function object(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw storageError()
  return x as Record<string, unknown>
}
const sameScope = (a: AdviceScope, b: AdviceScope) => a.start === b.start && a.end === b.end && a.hotel === b.hotel && a.timezone === b.timezone
const validateScope = (scope: AdviceScope): AdviceScope => {
  try {
    const s = parseAdviceRequest({ ...scope, action: 'generate', command_id: '00000000-0000-0000-0000-000000000001' })
    return { start: s.start!, end: s.end!, hotel: s.hotel!, timezone: s.timezone! }
  } catch { throw new AdviceClientError('invalid_scope', 'Kỳ, khách sạn hoặc múi giờ tư vấn không hợp lệ. Chọn tối đa 366 ngày.') }
}
export const browserAdviceLock: AdviceLock = async (name, run) => {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    throw new AdviceClientError('lock_unavailable', 'Trình duyệt chưa hỗ trợ khóa thao tác giữa các cửa sổ. Mở bằng Chrome hoặc trình duyệt được cập nhật.')
  }
  return navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock) throw busy()
    return run()
  })
}
function wait<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(task).then(v => { signal.removeEventListener('abort', abort); resolve(v) },
      e => { signal.removeEventListener('abort', abort); reject(e) })
  })
}
export function createOperationsAdviceClient(deps: {
  endpoint: string; publishableKey: string; storage: () => Store;
  getSession: () => Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }>;
  fetch?: typeof fetch; lock?: AdviceLock; newId?: () => string; onPendingChange?: () => void; isRuntimeCurrent?: () => boolean;
}) {
  const request = deps.fetch ?? fetch, lock = deps.lock ?? browserAdviceLock
  let endpoint: string
  try {
    const url = new URL(deps.endpoint)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !deps.publishableKey) throw changed()
    endpoint = url.origin
  } catch { throw changed() }
  const validateContext = (c: AdviceContext) => {
    if (!adviceUuid(c.actorId) || !adviceUuid(c.sessionId) || !adviceUuid(c.tenantId) || !c.runtime || c.runtime.length > 4096) throw changed()
  }
  const key = (context: AdviceContext, value: AdviceScope) => {
    validateContext(context); const s = validateScope(value)
    return 'roomqc:operations-advice:v1:' + encodeURIComponent(JSON.stringify([context.runtime, context.actorId, context.tenantId, s.start, s.end, s.hotel, s.timezone]))
  }
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Notification cannot change the outcome. */ } }
  const pending = (context: AdviceContext, scope: AdviceScope): PendingAdvice | null => {
    const name = key(context, scope)
    try {
      const store = deps.storage(); if (store.length > 4096) throw storageError()
      const raw = store.getItem(name); if (raw === null) return null
      if (raw.length > 8192) throw storageError()
      const item = object(JSON.parse(raw)), captured = object(item.context), r = object(item.request)
      const parsed = parseAdviceRequest(r) as AdviceRequest & AdviceScope
      if (Object.keys(item).sort().join(',') !== 'context,request,version' || item.version !== 1 || parsed.action !== 'generate'
        || Object.keys(captured).sort().join(',') !== 'actorId,runtime,sessionId,tenantId' || !adviceUuid(captured.sessionId)
        || captured.actorId !== context.actorId || captured.tenantId !== context.tenantId || captured.runtime !== context.runtime
        || !sameScope(parsed, validateScope(scope))) throw storageError()
      return { version: 1, context: { ...context, sessionId: captured.sessionId }, request: parsed }
    } catch { throw storageError() }
  }
  const current = (options: Options) => {
    if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
  }
  async function execute(context: AdviceContext, body: AdviceRequest, options: Options): Promise<AdviceReceipt> {
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 65000)
    options.signal?.addEventListener('abort', abort, { once: true })
    const session = async () => {
      const found = await wait(deps.getSession(), controller.signal); current(options)
      if (found.error || !found.data.session) throw changed()
      let native: ReturnType<typeof staffInvitationSession>
      try { native = staffInvitationSession(found.data.session) } catch { throw changed() }
      if (native.actorId !== context.actorId || native.sessionId !== context.sessionId) throw changed()
      return found.data.session.access_token
    }
    try {
      validateContext(context); current(options); const token = await session(); current(options)
      const response = await wait(request(endpoint + '/functions/v1/operations-advisor', { method: 'POST',
        headers: { apikey: deps.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }), controller.signal)
      const data = await wait(readBoundedJson(response, 49152), controller.signal); current(options); await session(); current(options)
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new AdviceClientError('permission_denied', 'Phiên, quyền hoặc gói hiện tại chưa cho phép tư vấn. Yêu cầu cũ vẫn được giữ để kiểm tra.')
        if (response.status === 429) throw new AdviceClientError('quota_exceeded', 'Đã hết hạn mức tư vấn. Kiểm tra hoặc hủy yêu cầu chưa gửi trước khi tạo lần mới.')
        if (response.status === 409 && data && typeof data === 'object' && (data as Record<string, unknown>).code === 'ADVICE_STILL_RUNNING') {
          throw new AdviceClientError('still_processing', 'Yêu cầu vẫn trong thời hạn xử lý. Hãy kiểm tra kết quả trước khi đóng.')
        }
        if (response.status === 409) throw new AdviceClientError('command_conflict', 'Yêu cầu hoặc dữ liệu nguồn cần đối soát. Giữ mã cũ và kiểm tra kết quả.')
        if (response.status === 503) throw new AdviceClientError('unavailable', 'Dịch vụ tư vấn AI chưa sẵn sàng. Hãy kiểm tra yêu cầu cũ trước khi tiếp tục.')
        throw unknown()
      }
      return parseAdviceReceipt(data, body.command_id)
    } catch (e) { current(options); if (e instanceof AdviceClientError) throw e; throw unknown() }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
  const finish = (context: AdviceContext, scope: AdviceScope, item: PendingAdvice, result: AdviceReceipt, options: Options) => {
    current(options)
    if (result.request && !sameScope(result.request, item.request)) throw unknown()
    if (result.state === 'completed' || result.state === 'cancelled' || result.state === 'closed_unknown') {
      try {
        const existing = pending(context, scope)
        if (existing?.request.command_id === item.request.command_id) deps.storage().removeItem(key(context, scope))
      } catch { /* A valid terminal receipt can be read again if storage fails. */ }
      notify()
    }
    return result
  }
  const run = async (context: AdviceContext, scope: AdviceScope, operation: 'generate' | 'lookup' | 'resume' | 'cancel' | 'close', options: Options = {}) => {
    current(options); validateContext(context); const normalized = validateScope(scope), name = key(context, normalized)
    return lock(name, async () => {
      current(options)
      let item = pending(context, normalized)
      if (operation === 'generate') {
        if (item) throw new AdviceClientError('pending_command', 'Có yêu cầu chưa xác nhận trong kỳ này. Hãy kiểm tra hoặc hủy yêu cầu cũ.')
        const parsed = parseAdviceRequest({ action: 'generate', command_id: (deps.newId ?? (() => crypto.randomUUID()))(), ...normalized }) as AdviceRequest & AdviceScope
        item = { version: 1, context: { ...context }, request: parsed }
        try {
          const store = deps.storage(), raw = JSON.stringify(item)
          if (store.length >= 4096 || store.getItem(name) !== null) throw storageError()
          store.setItem(name, raw); if (store.getItem(name) !== raw) throw storageError()
        } catch { throw storageError() }
        notify(); current(options)
      }
      if (!item) throw new AdviceClientError('no_pending', 'Không có yêu cầu cần phục hồi trong phạm vi này.')
      if (operation === 'resume') {
        // Explicit user action only. An unknown/completed dispatch must never be resent.
        const previous = await execute(context, { action: 'lookup', command_id: item.request.command_id }, options)
        if (!['not_found', 'reserved'].includes(previous.state)) return finish(context, normalized, item, previous, options)
        if (previous.request && !sameScope(previous.request, item.request)) throw unknown()
      }
      const body: AdviceRequest = operation === 'lookup' ? { action: 'lookup', command_id: item.request.command_id }
        : { ...item.request, action: operation === 'cancel' ? 'cancel' : operation === 'close' ? 'close' : 'generate' }
      return finish(context, normalized, item, await execute(context, body, options), options)
    })
  }
  return { pending,
    generate: (c: AdviceContext, s: AdviceScope, o?: Options) => run(c, s, 'generate', o),
    lookup: (c: AdviceContext, s: AdviceScope, o?: Options) => run(c, s, 'lookup', o),
    resume: (c: AdviceContext, s: AdviceScope, o?: Options) => run(c, s, 'resume', o),
    cancel: (c: AdviceContext, s: AdviceScope, o?: Options) => run(c, s, 'cancel', o),
    close: (c: AdviceContext, s: AdviceScope, o?: Options) => run(c, s, 'close', o),
  }
}
