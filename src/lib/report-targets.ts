import { staffInvitationSession } from './staff-invitation'

export const FINANCIAL_TARGET_METRICS = ['occupancy', 'revpar', 'adr', 'gop_margin', 'goppar', 'labor_ratio', 'net_revenue', 'gop'] as const
export const MONTHLY_TARGET_METRICS = ['revenue_target', 'occupancy_target'] as const
export type TargetMetric = typeof FINANCIAL_TARGET_METRICS[number]
export type TargetKind = 'financial' | 'monthly'
export type TargetScope = { kind: TargetKind; month: string; hotelId: string | null }
export type TargetContext = { actorId: string; sessionId: string; tenantId: string; runtime: string }
export type TargetReport = { version: 1; kind: TargetKind; period_month: string; hotel_id: string | null;
  revision: string; values: Record<string, number>; review_required: boolean; can_manage: boolean }
export type TargetCommand = { p_kind: TargetKind; p_period_month: string; p_hotel_id: string | null;
  p_values: Record<string, number>; p_expected_revision: string; p_command_id: string; p_resolve_legacy: boolean }
export type TargetReceipt = { state: 'completed'; command_id: string; report: TargetReport }
export type TargetCancellation = { state: 'cancelled'; reason: 'not_applied'; command_id: string;
  request: { kind: TargetKind; month: string; hotel: string | null; values: Record<string, number>; expected_revision: string; resolve_legacy: boolean } }
export type TargetOutcome = TargetReceipt | TargetCancellation
export type PendingTargetCommand = { version: 1; context: TargetContext; command: TargetCommand }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
type Options = { signal?: AbortSignal; isCurrent?: () => boolean }
export class TargetError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'TargetError' }
}
const invalid = () => new TargetError('invalid_value', 'Mục tiêu không hợp lệ. Kiểm tra chỉ số, giới hạn và số thập phân.')
const changed = () => new TargetError('identity_changed', 'Phiên hoặc phạm vi mục tiêu đã thay đổi. Vui lòng tải lại.')
const unknown = () => new TargetError('outcome_unknown', 'Chưa xác nhận được kết quả. Kiểm tra lần lưu trước khi tiếp tục.')
const storageError = () => new TargetError('storage_unavailable', 'Không thể giữ thông tin phục hồi trên thiết bị. Chưa gửi lần lưu mới.')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const revision = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,18}):[a-f0-9]{64}$/.test(v)
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid()
  return v as Record<string, unknown>
}
export function targetScope(value: TargetScope): TargetScope {
  if (!['financial', 'monthly'].includes(value.kind) || typeof value.month !== 'string' || !/^(?:(?:19|20)\d{2}|2100)-(0[1-9]|1[0-2])-01$/.test(value.month)
    || (value.hotelId !== null && !uuid(value.hotelId)) || (value.kind === 'monthly' && value.hotelId === null)) throw invalid()
  return { kind: value.kind, month: value.month, hotelId: value.hotelId }
}
export function targetValues(kind: TargetKind, input: unknown): Record<string, number> {
  const x = record(input), metrics: readonly string[] = kind === 'financial' ? FINANCIAL_TARGET_METRICS : MONTHLY_TARGET_METRICS
  if (!['financial', 'monthly'].includes(kind) || Object.keys(x).length > metrics.length) throw invalid()
  const values: Record<string, number> = {}
  for (const key of Object.keys(x).sort()) {
    const v = x[key]
    if (!metrics.includes(key) || typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 999999999999.99 || Number(v.toFixed(2)) !== v) throw invalid()
    if (['occupancy', 'occupancy_target'].includes(key) && (v < 0 || v > 100)) throw invalid()
    if (key === 'gop_margin' && (v < -1000 || v > 100)) throw invalid()
    if (key === 'labor_ratio' && (v < 0 || v > 1000)) throw invalid()
    if (!['gop', 'goppar', 'gop_margin'].includes(key) && v < 0) throw invalid()
    if (key === 'revenue_target' && !Number.isInteger(v)) throw invalid()
    values[key] = Object.is(v, -0) ? 0 : v
  }
  return values
}
/** No thousands separators: 123.45 and 123,45 both mean a decimal. Blank removes a value. */
export function targetDraftValues(kind: TargetKind, draft: Record<string, string>) {
  const values: Record<string, number> = {}
  for (const [key, raw] of Object.entries(draft)) {
    const text = raw.trim(); if (text === '') continue
    if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text)) throw invalid()
    values[key] = Number(text.replace(',', '.'))
  }
  return targetValues(kind, values)
}
export function parseTargetReport(input: unknown, scope: TargetScope): TargetReport {
  targetScope(scope)
  const x = record(input)
  if (x.version !== 1 || x.kind !== scope.kind || x.period_month !== scope.month || x.hotel_id !== scope.hotelId
    || !revision(x.revision) || typeof x.review_required !== 'boolean' || typeof x.can_manage !== 'boolean') throw invalid()
  return { version: 1, kind: scope.kind, period_month: scope.month, hotel_id: scope.hotelId, revision: x.revision,
    values: targetValues(scope.kind, x.values), review_required: x.review_required, can_manage: x.can_manage }
}
function parseCommand(input: unknown): TargetCommand {
  const x = record(input)
  const scope = targetScope({ kind: x.p_kind as TargetKind, month: x.p_period_month as string, hotelId: x.p_hotel_id as string | null })
  if (Object.keys(x).length !== 7 || !revision(x.p_expected_revision) || !uuid(x.p_command_id) || typeof x.p_resolve_legacy !== 'boolean') throw invalid()
  return { p_kind: scope.kind, p_period_month: scope.month, p_hotel_id: scope.hotelId, p_values: targetValues(scope.kind, x.p_values),
    p_expected_revision: x.p_expected_revision, p_command_id: x.p_command_id, p_resolve_legacy: x.p_resolve_legacy }
}
function receipt(input: unknown, command: TargetCommand): TargetOutcome {
  const x = record(input)
  if (x.command_id !== command.p_command_id) throw unknown()
  if (x.state === 'cancelled') {
    const r = record(x.request)
    if (Object.keys(x).length !== 4 || x.reason !== 'not_applied' || Object.keys(r).length !== 6
      || r.kind !== command.p_kind || r.month !== command.p_period_month || r.hotel !== command.p_hotel_id
      || r.expected_revision !== command.p_expected_revision || r.resolve_legacy !== command.p_resolve_legacy
      || JSON.stringify(targetValues(command.p_kind, r.values)) !== JSON.stringify(command.p_values)) throw unknown()
    return { state: 'cancelled', reason: 'not_applied', command_id: command.p_command_id,
      request: { kind: command.p_kind, month: command.p_period_month, hotel: command.p_hotel_id, values: command.p_values,
        expected_revision: command.p_expected_revision, resolve_legacy: command.p_resolve_legacy } }
  }
  if (x.state !== 'completed') throw unknown()
  const report = parseTargetReport(x.report, { kind: command.p_kind, month: command.p_period_month, hotelId: command.p_hotel_id })
  if (report.review_required || !report.can_manage || JSON.stringify(report.values) !== JSON.stringify(command.p_values)
    || BigInt(report.revision.split(':')[0]) <= BigInt(command.p_expected_revision.split(':')[0])) throw unknown()
  return { state: 'completed', command_id: command.p_command_id, report }
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
async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await wait(reader.read(), signal); if (done) break
      size += value.byteLength; if (size > 32768) throw unknown(); chunks.push(value)
    }
    const bytes = new Uint8Array(size); let at = 0
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } finally { void reader.cancel().catch(() => {}) }
}
export function createReportTargetClient(deps: {
  endpoint: string; publishableKey: string; storage: () => Store;
  getSession: () => Promise<{ data: { session: { access_token: string; user: { id: string } } | null }; error: unknown }>;
  isRuntimeCurrent?: () => boolean; onPendingChange?: () => void; fetch?: typeof fetch; newId?: () => string;
}) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), request = deps.fetch ?? fetch
  const assertContext = (context: TargetContext) => {
    if (!uuid(context.actorId) || !uuid(context.sessionId) || !uuid(context.tenantId) || !context.runtime || context.runtime.length > 4096) throw changed()
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw changed()
  }
  const prefix = (context: TargetContext, scope: TargetScope) => {
    assertContext(context); targetScope(scope)
    return 'roomqc:report-targets:v1:' + encodeURIComponent(JSON.stringify([context.runtime, context.actorId, context.tenantId, scope.kind, scope.month, scope.hotelId])) + ':'
  }
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Notification cannot change a commit. */ } }
  const pending = (context: TargetContext, scope: TargetScope): PendingTargetCommand[] => {
    try {
      const store = deps.storage(), start = prefix(context, scope), items: PendingTargetCommand[] = []
      if (store.length > 4096) throw storageError()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i); if (!key?.startsWith(start)) continue
        const raw = store.getItem(key); if (!raw || raw.length > 16384) throw storageError()
        const x = record(JSON.parse(raw)), captured = record(x.context), command = parseCommand(x.command)
        if (x.version !== 1 || captured.actorId !== context.actorId || captured.tenantId !== context.tenantId || captured.runtime !== context.runtime
          || !uuid(captured.sessionId) || command.p_kind !== scope.kind || command.p_period_month !== scope.month || command.p_hotel_id !== scope.hotelId
          || key !== start + command.p_command_id) throw storageError()
        items.push({ version: 1, context: { ...context, sessionId: captured.sessionId }, command })
      }
      if (items.length > 16) throw storageError()
      return items.sort((a, b) => a.command.p_command_id.localeCompare(b.command.p_command_id))
    } catch { throw storageError() }
  }
  async function execute(context: TargetContext, rpc: string, body: unknown, options: Options = {}) {
    const controller = new AbortController(), captured = { ...context }
    const current = () => { if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed() }
    const session = async () => {
      const found = await wait(deps.getSession(), controller.signal); current()
      if (found.error || !found.data.session) throw changed()
      let actual: ReturnType<typeof staffInvitationSession>
      try { actual = staffInvitationSession(found.data.session) } catch { throw changed() }
      if (actual.actorId !== captured.actorId || actual.sessionId !== captured.sessionId) throw changed()
      return found.data.session.access_token
    }
    const abort = () => controller.abort(), timeout = setTimeout(abort, 20000)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      current(); assertContext(captured); const token = await session(); current()
      const response = await wait(request(endpoint + '/rest/v1/rpc/' + rpc, { method: 'POST',
        headers: { apikey: deps.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' }), controller.signal)
      current(); const data = await boundedJson(response, controller.signal); await session(); current()
      if (!response.ok) {
        const code = typeof record(data).message === 'string' ? String(record(data).message) : ''
        if ([401, 403].includes(response.status)) throw new TargetError('permission_denied', 'Phiên hoặc quyền báo cáo không còn hiệu lực. Lần lưu chưa xác nhận vẫn được giữ để đối soát.')
        if (response.status === 409) throw new TargetError(code === 'REPORT_TARGET_STALE_REVISION' ? 'stale_revision' : 'command_conflict',
          'Mục tiêu đã thay đổi hoặc lần lưu đang xung đột. Kiểm tra kết quả trước khi chỉnh sửa tiếp.')
        if (response.status === 400) throw invalid()
        throw unknown()
      }
      return data
    } catch (error) { current(); if (error instanceof TargetError) throw error; throw unknown() }
    finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
  }
  const outcome = (context: TargetContext, scope: TargetScope, command: TargetCommand, data: unknown) => {
    let result: TargetOutcome
    try { result = receipt(data, command) } catch { throw unknown() }
    try { deps.storage().removeItem(prefix(context, scope) + command.p_command_id) } catch { /* Receipt can be read again. */ }
    notify(); return result
  }
  return {
    pending,
    read: async (context: TargetContext, scope: TargetScope, options?: Options) => {
      targetScope(scope)
      return parseTargetReport(await execute(context, 'get_report_targets', { p_kind: scope.kind, p_period_month: scope.month, p_hotel_id: scope.hotelId }, options), scope)
    },
    save: async (context: TargetContext, scope: TargetScope, values: Record<string, number>, expectedRevision: string, resolveLegacy = false, options: Options = {}) => {
      if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
      if (pending(context, scope).length) throw new TargetError('pending_command', 'Có lần lưu chưa xác nhận. Kiểm tra kết quả trước.')
      const id = (deps.newId ?? (() => crypto.randomUUID()))()
      const command = parseCommand({ p_kind: scope.kind, p_period_month: scope.month, p_hotel_id: scope.hotelId,
        p_values: values, p_expected_revision: expectedRevision, p_command_id: id, p_resolve_legacy: resolveLegacy })
      try {
        const store = deps.storage(), raw = JSON.stringify({ version: 1, context: { ...context }, command }), key = prefix(context, scope) + id
        if (store.length >= 4096 || store.getItem(key) !== null) throw storageError()
        store.setItem(key, raw); if (store.getItem(key) !== raw) throw storageError()
      } catch { throw storageError() }
      notify()
      return outcome(context, scope, command, await execute(context, 'replace_report_targets', command, options))
    },
    recover: async (context: TargetContext, scope: TargetScope, options?: Options) => {
      const item = pending(context, scope)[0]
      if (!item) throw new TargetError('no_pending', 'Không còn lần lưu cần kiểm tra. Tải lại mục tiêu.')
      const command = item.command, result = record(await execute(context, 'get_report_target_command', { p_command_id: command.p_command_id }, options))
      // NOT_FOUND does not fence a delayed request. Replay exactly the stored key/payload.
      if (result.state === 'not_found' && result.command_id === command.p_command_id && Object.keys(result).length === 2) {
        return outcome(context, scope, command, await execute(context, 'replace_report_targets', command, options))
      }
      return outcome(context, scope, command, result)
    },
    cancel: async (context: TargetContext, scope: TargetScope, options?: Options) => {
      const item = pending(context, scope)[0]
      if (!item) throw new TargetError('no_pending', 'Không còn lần lưu cần xử lý. Tải lại mục tiêu.')
      // The server arbitrates against a delayed save under the same actor/key lock.
      // A completed save wins over cancellation; never delete an unknown result.
      return outcome(context, scope, item.command, await execute(context, 'cancel_report_target_command', item.command, options))
    },
  }
}
