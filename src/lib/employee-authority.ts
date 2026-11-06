import { staffInvitationSession } from './staff-invitation'

export type AuthorityKind = 'grants' | 'hotels'
export type AuthorityContext = { actorId: string; sessionId: string; tenantId: string; runtime: string }
export type AdditionalGrant = { module: string; action: string; enabled: boolean }
export const HOTEL_FLAGS = ['can_create_managers', 'can_create_staff', 'can_view_reports', 'can_export_data', 'can_approve_requests'] as const
export type HotelGrant = { hotel_id: string } & Record<typeof HOTEL_FLAGS[number], boolean>
export type AuthorityAction = { module: string; action: string; custom: boolean; inherited: boolean; effective: boolean; delegatable: boolean }
export type AuthorityHotel = { id: string; name: string; code: string; status: string; assignable: boolean; allowed: Omit<HotelGrant, 'hotel_id'> }
export type AuthorityConfiguration = { target_id: string; semantics: 'additive'; versions: Record<AuthorityKind, string>;
  grants: AdditionalGrant[]; hotels: HotelGrant[]; primary_hotel_id: string | null; actions: AuthorityAction[]; hotel_catalog: AuthorityHotel[] }
export type AuthorityCommand = { p_target_id: string; p_kind: AuthorityKind; p_entries: AdditionalGrant[] | HotelGrant[];
  p_expected_version: string; p_request_id: string }
export type AuthorityReceipt = { state: 'completed'; target_id: string; kind: AuthorityKind; request_id: string;
  version: string; entries: AdditionalGrant[] | HotelGrant[] }
export type PendingAuthorityCommand = { version: 1; context: AuthorityContext; command: AuthorityCommand }
type Options = { signal?: AbortSignal; isCurrent?: () => boolean }
type Session = { access_token: string; user: { id: string } }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
export class AuthorityError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'AuthorityError' }
}
const changed = () => new AuthorityError('identity_changed', 'Tài khoản hoặc nhân viên đã thay đổi. Vui lòng kiểm tra lại.')
const unknown = () => new AuthorityError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy kiểm tra lần lưu trước khi tiếp tục.')
const invalid = () => new AuthorityError('invalid_request', 'Cấu hình quyền không hợp lệ. Vui lòng tải lại và kiểm tra thông tin.')
const storageError = () => new AuthorityError('storage_unavailable', 'Không thể giữ thông tin đối soát trên thiết bị. Chưa gửi lần lưu mới.')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const version = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(v)
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid()
  return v as Record<string, unknown>
}
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100
export const canonicalAction = (action: string) => action === 'edit' ? 'update' : action
export function canonicalGrants(entries: AdditionalGrant[]): AdditionalGrant[] {
  // Legacy edit+update aliases are additive. Preserve their effective custom
  // grant while exposing one editable action; unknown modules are not dropped.
  const merged = new Map<string, AdditionalGrant>()
  for (const entry of entries) {
    const value = { ...entry, action: canonicalAction(entry.action) }, key = JSON.stringify([value.module, value.action])
    merged.set(key, { ...value, enabled: value.enabled || merged.get(key)?.enabled === true })
  }
  return [...merged.values()].sort((a, b) => a.module.localeCompare(b.module) || a.action.localeCompare(b.action))
}
export function defaultHotelGrant(hotelId: string): HotelGrant {
  return { hotel_id: hotelId, can_create_managers: false, can_create_staff: false, can_view_reports: false,
    can_export_data: false, can_approve_requests: false }
}
function entries(kind: AuthorityKind, values: unknown): AdditionalGrant[] | HotelGrant[] {
  if (!Array.isArray(values) || values.length > 256 || JSON.stringify(values).length > 131072) throw invalid()
  const seen = new Set<string>()
  const result = values.map(value => {
    const x = record(value)
    if (kind === 'grants') {
      if (Object.keys(x).length !== 3 || !name(x.module) || !name(x.action) || typeof x.enabled !== 'boolean') throw invalid()
      const action = canonicalAction(x.action), key = JSON.stringify([x.module, action])
      if (seen.has(key)) throw invalid(); seen.add(key)
      return { module: x.module, action, enabled: x.enabled }
    }
    if (Object.keys(x).length !== 6 || !uuid(x.hotel_id) || HOTEL_FLAGS.some(flag => typeof x[flag] !== 'boolean')) throw invalid()
    const id = x.hotel_id.toLowerCase(); if (seen.has(id)) throw invalid(); seen.add(id)
    return { hotel_id: id, ...Object.fromEntries(HOTEL_FLAGS.map(flag => [flag, x[flag]])) } as HotelGrant
  })
  return result.sort((a, b) => kind === 'hotels' ? (a as HotelGrant).hotel_id.localeCompare((b as HotelGrant).hotel_id)
    : (a as AdditionalGrant).module.localeCompare((b as AdditionalGrant).module) || (a as AdditionalGrant).action.localeCompare((b as AdditionalGrant).action)) as AdditionalGrant[] | HotelGrant[]
}
export function parseAuthorityConfiguration(value: unknown, targetId: string): AuthorityConfiguration {
  const x = record(value), versions = record(x.versions)
  if (x.target_id !== targetId || x.semantics !== 'additive' || !version(versions.grants) || !version(versions.hotels)
    || (x.primary_hotel_id !== null && !uuid(x.primary_hotel_id)) || !Array.isArray(x.actions) || x.actions.length > 1000) throw invalid()
  const keys = new Set<string>()
  const actions = x.actions.map(value => {
    const a = record(value)
    if (!name(a.module) || !name(a.action) || a.action === 'edit' || typeof a.custom !== 'boolean'
      || typeof a.inherited !== 'boolean' || typeof a.effective !== 'boolean' || typeof a.delegatable !== 'boolean'
      || a.effective !== (a.custom || a.inherited)) throw invalid()
    const key = JSON.stringify([a.module, a.action]); if (keys.has(key)) throw invalid(); keys.add(key)
    return { module: a.module, action: a.action, custom: a.custom, inherited: a.inherited, effective: a.effective, delegatable: a.delegatable }
  })
  // Normalize additive legacy aliases before the new aggregate command.
  if (!Array.isArray(x.grants)) throw invalid()
  const grants = x.grants.map(value => {
    const g = record(value)
    if (!name(g.module) || !name(g.action) || typeof g.enabled !== 'boolean' || Object.keys(g).length !== 3) throw invalid()
    return { module: g.module, action: g.action, enabled: g.enabled }
  })
  if (!Array.isArray(x.hotel_catalog) || x.hotel_catalog.length > 1000) throw invalid()
  const hotelIds = new Set<string>()
  const hotel_catalog = x.hotel_catalog.map(value => {
    const h = record(value), allowed = record(h.allowed)
    if (!uuid(h.id) || typeof h.name !== 'string' || h.name.length < 1 || h.name.length > 4096
      || typeof h.code !== 'string' || h.code.length > 1024 || typeof h.status !== 'string' || h.status.length > 100 || typeof h.assignable !== 'boolean'
      || HOTEL_FLAGS.some(flag => typeof allowed[flag] !== 'boolean') || hotelIds.has(h.id)) throw invalid()
    hotelIds.add(h.id)
    return { id: h.id, name: h.name, code: h.code, status: h.status, assignable: h.assignable,
      allowed: Object.fromEntries(HOTEL_FLAGS.map(flag => [flag, allowed[flag]])) as AuthorityHotel['allowed'] }
  })
  return { target_id: targetId, semantics: 'additive', versions: { grants: versions.grants, hotels: versions.hotels },
    grants: entries('grants', canonicalGrants(grants)) as AdditionalGrant[], hotels: entries('hotels', x.hotels) as HotelGrant[],
    primary_hotel_id: x.primary_hotel_id as string | null, actions, hotel_catalog }
}
function receipt(value: unknown, command: AuthorityCommand): AuthorityReceipt {
  const x = record(value)
  if (x.state !== 'completed' || x.target_id !== command.p_target_id || x.kind !== command.p_kind
    || x.request_id !== command.p_request_id || !version(x.version) || BigInt(x.version) <= BigInt(command.p_expected_version)) throw unknown()
  const committed = entries(command.p_kind, x.entries)
  if (JSON.stringify(committed) !== JSON.stringify(command.p_entries)) throw unknown()
  return { state: 'completed', target_id: x.target_id, kind: command.p_kind, request_id: x.request_id, version: x.version, entries: committed }
}
function cancellation(value: unknown, command: AuthorityCommand) {
  const x = record(value)
  if (x.state !== 'cancelled' || x.reason !== 'not_applied' || x.target_id !== command.p_target_id
    || x.kind !== command.p_kind || x.request_id !== command.p_request_id
    || x.expected_version !== command.p_expected_version
    || JSON.stringify(entries(command.p_kind, x.entries)) !== JSON.stringify(command.p_entries)) throw unknown()
}
function wait<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    task.then(value => { signal.removeEventListener('abort', abort); resolve(value) },
      error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await wait(reader.read(), signal); if (done) break
      size += value.byteLength; if (size > 262144) throw unknown(); chunks.push(value)
    }
    const bytes = new Uint8Array(size); let at = 0
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } finally { void reader.cancel().catch(() => {}) }
}

export function createEmployeeAuthorityClient(deps: {
  endpoint: string; publishableKey: string; storage: () => Store; getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>;
  isRuntimeCurrent?: () => boolean; onPendingChange?: () => void; fetch?: typeof fetch; newId?: () => string
}) {
  const request = deps.fetch ?? fetch, endpoint = deps.endpoint.replace(/\/$/, '')
  const assertContext = (context: AuthorityContext) => {
    if (!uuid(context.actorId) || !uuid(context.sessionId) || !uuid(context.tenantId)
      || !context.runtime || context.runtime.length > 4096) throw changed()
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw changed()
  }
  // Persist per command, never overwrite another tab's unresolved key. Session
  // stays in the record; the same actor can reauthorize recovery after relogin.
  const prefix = (context: AuthorityContext, target: string, kind: AuthorityKind) => {
    assertContext(context); if (!uuid(target) || !['grants', 'hotels'].includes(kind)) throw invalid()
    return 'roomqc:authority:v1:' + encodeURIComponent(JSON.stringify([context.runtime, context.actorId, context.tenantId, target, kind])) + ':'
  }
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Notification is not authority. */ } }
  const pending = (context: AuthorityContext, target: string, kind: AuthorityKind): PendingAuthorityCommand[] => {
    try {
      const store = deps.storage(), start = prefix(context, target, kind), values: PendingAuthorityCommand[] = []
      if (store.length > 4096) throw storageError()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i); if (!key?.startsWith(start)) continue
        const raw = store.getItem(key); if (!raw || raw.length > 150000) throw storageError()
        const value = record(JSON.parse(raw)), captured = record(value.context), command = record(value.command)
        if (value.version !== 1 || captured.actorId !== context.actorId || captured.tenantId !== context.tenantId
          || captured.runtime !== context.runtime || !uuid(captured.sessionId) || command.p_target_id !== target
          || command.p_kind !== kind || !version(command.p_expected_version) || !uuid(command.p_request_id)
          || key !== start + command.p_request_id) throw storageError()
        values.push({ version: 1, context: { ...context, sessionId: captured.sessionId }, command: { p_target_id: target, p_kind: kind,
          p_expected_version: command.p_expected_version, p_request_id: command.p_request_id, p_entries: entries(kind, command.p_entries) } })
      }
      if (values.length > 16) throw storageError()
      return values.sort((a, b) => a.command.p_request_id.localeCompare(b.command.p_request_id))
    } catch { throw storageError() }
  }
  async function execute(context: AuthorityContext, rpc: string, body: unknown, options: Options = {}) {
    const captured = { ...context }, controller = new AbortController()
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
        body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal }), controller.signal)
      current(); const data = await boundedJson(response, controller.signal); await session(); current()
      if (!response.ok) {
        const code = typeof record(data).message === 'string' ? String(record(data).message) : ''
        if (response.status === 401 || response.status === 403) throw new AuthorityError('permission_denied', 'Phiên hoặc quyền quản lý không còn hiệu lực. Lần lưu chưa xác nhận vẫn được giữ để đối soát.')
        if (response.status === 409 && code === 'EMPLOYEE_AUTHORITY_STALE_VERSION') throw new AuthorityError('stale_version', 'Cấu hình đã được thay đổi ở nơi khác. Hãy tải lại trước khi sửa tiếp.')
        if (response.status === 409) throw new AuthorityError('command_conflict', 'Lần lưu đang xung đột hoặc đang xử lý. Hãy kiểm tra kết quả trước khi tiếp tục.')
        if (response.status === 400) throw invalid()
        throw unknown()
      }
      return data
    } catch (error) {
      current()
      if (error instanceof AuthorityError) throw error
      throw unknown()
    } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort) }
  }
  const clear = (context: AuthorityContext, command: AuthorityCommand) => {
    try { deps.storage().removeItem(prefix(context, command.p_target_id, command.p_kind) + command.p_request_id) } catch { /* A known receipt remains safe to recover again. */ }
    notify()
  }
  const outcome = (context: AuthorityContext, command: AuthorityCommand, value: unknown): AuthorityReceipt => {
    if (record(value).state === 'cancelled') {
      cancellation(value, command); clear(context, command)
      throw new AuthorityError('command_cancelled', 'Lần lưu này chưa được áp dụng. Bạn có thể kiểm tra và sửa cấu hình rồi lưu lại.')
    }
    const committed = receipt(value, command); clear(context, command); return committed
  }
  async function dispatch(context: AuthorityContext, command: AuthorityCommand, options?: Options) {
    let data: unknown
    try {
      data = await execute(context, 'replace_employee_authority', command, options)
    } catch (error) {
      // A 400 alone cannot prove that a concurrent same-key request did not
      // commit. Serialize abandonment on the server before discarding recovery
      // data; it either returns that success or fences every future same-key save.
      if (error instanceof AuthorityError && error.code === 'invalid_request') {
        return outcome(context, command, await execute(context, 'cancel_employee_authority_command', command, options))
      }
      // Monotonic revision and the server's key lock make STALE_VERSION a
      // terminal no-commit result for this exact expected version/key.
      if (error instanceof AuthorityError && error.code === 'stale_version') clear(context, command)
      throw error
    }
    return outcome(context, command, data)
  }
  return {
    pending,
    read: async (context: AuthorityContext, target: string, options?: Options) => {
      if (!uuid(target)) throw invalid()
      try { return parseAuthorityConfiguration(await execute(context, 'get_employee_authority_configuration', { p_target_id: target }, options), target) }
      catch (error) { if (error instanceof AuthorityError) throw error; throw unknown() }
    },
    save: async (context: AuthorityContext, target: string, kind: AuthorityKind, values: AdditionalGrant[] | HotelGrant[], expectedVersion: string, options: Options = {}) => {
      if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
      const start = prefix(context, target, kind), normalized = entries(kind, values)
      if (!version(expectedVersion)) throw invalid()
      if (pending(context, target, kind).length) throw new AuthorityError('pending_command', 'Có lần lưu chưa xác nhận. Hãy kiểm tra kết quả trước.')
      const id = (deps.newId ?? (() => crypto.randomUUID()))(); if (!uuid(id)) throw invalid()
      const command: AuthorityCommand = { p_target_id: target, p_kind: kind, p_entries: normalized, p_expected_version: expectedVersion, p_request_id: id }
      try { const store = deps.storage(), raw = JSON.stringify({ version: 1, context: { ...context }, command })
        if (store.length >= 4096) throw storageError()
        store.setItem(start + id, raw)
        if (store.getItem(start + id) !== raw) throw storageError()
      } catch { throw storageError() }
      notify(); return dispatch(context, command, options)
    },
    recover: async (context: AuthorityContext, target: string, kind: AuthorityKind, options?: Options) => {
      const item = pending(context, target, kind)[0]
      if (!item) throw new AuthorityError('no_pending', 'Không còn lần lưu cần kiểm tra. Hãy tải lại cấu hình.')
      const command = item.command, data = record(await execute(context, 'get_employee_authority_command_result',
        { p_target_id: target, p_request_id: command.p_request_id }, options))
      if (data.state === 'not_found' && Object.keys(data).length === 1) return dispatch(context, command, options)
      return outcome(context, command, data)
    },
  }
}
