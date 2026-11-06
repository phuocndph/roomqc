import { staffInvitationSession } from './staff-invitation'

export const ROOM_COMMAND_STATUSES = ['vacant_clean', 'vacant_inspected', 'vacant_dirty', 'occupied_clean', 'occupied_dirty',
  'dnd', 'service_refused', 'sleep_out', 'skipper', 'out_of_order', 'out_of_service'] as const
export type RoomCommandStatus = typeof ROOM_COMMAND_STATUSES[number]
export type RoomCommandContext = { actorId: string; sessionId: string; tenantId: string; runtime: string }
export type RoomCommandInput = { roomId: string; toStatus: string; reason?: string | null; dndUntil?: string | null; oosUntil?: string | null; force?: boolean }
export type RoomCommand = { _room_id: string; _to_status: RoomCommandStatus; _reason: string | null;
  _dnd_until: string | null; _oos_until: string | null; _force: boolean; _command_id: string }
export type RoomCommandResult = { room_id: string; tenant_id: string; hotel_id: string; command_id: string;
  from: string; to: RoomCommandStatus; legacy_status: string; changed: boolean; status_changed: boolean;
  workflow_event_id: string | null; workflow_dispatch_state: 'pending' | 'not_required'; replayed: boolean }
export type PendingRoomCommand = { version: 1; actorId: string; tenantId: string; runtime: string; command: RoomCommand }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
type Session = { access_token: string; user: { id: string } }
type Options = { signal?: AbortSignal; isCurrent?: () => boolean }
export class RoomCommandError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'RoomCommandError' }
}
const changed = () => new RoomCommandError('identity_changed', 'Tài khoản hoặc không gian làm việc đã thay đổi. Vui lòng kiểm tra lại.')
const unknown = () => new RoomCommandError('outcome_unknown', 'Chưa xác nhận được kết quả đổi trạng thái. Hãy kiểm tra lệnh đang chờ trước khi thao tác tiếp.')
const invalid = () => new RoomCommandError('invalid_request', 'Không thể chuyển trạng thái với thông tin hiện tại. Vui lòng kiểm tra lại.')
const storageError = () => new RoomCommandError('storage_unavailable', 'Không thể giữ lệnh đang chờ trong tab này. Chưa gửi lệnh mới; vui lòng kiểm tra bộ nhớ trình duyệt.')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw unknown()
  return v as Record<string, unknown>
}
export function normalizeRoomCommandStatus(value: string): RoomCommandStatus {
  const aliases: Record<string, RoomCommandStatus> = { vacant: 'vacant_clean', available: 'vacant_clean', occupied: 'occupied_clean',
    check_in: 'occupied_clean', cleaning: 'vacant_dirty', dirty: 'vacant_dirty', check_out: 'vacant_dirty', maintenance: 'out_of_service' }
  if (Object.hasOwn(aliases, value)) return aliases[value]
  if (!(ROOM_COMMAND_STATUSES as readonly string[]).includes(value)) throw invalid()
  return value as RoomCommandStatus
}
function date(value: string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid()
  return new Date(value).toISOString()
}
function command(input: RoomCommandInput, id: string): RoomCommand {
  if (!uuid(input.roomId) || !uuid(id) || (input.reason != null && (typeof input.reason !== 'string' || input.reason.length > 4000))
    || (input.force !== undefined && typeof input.force !== 'boolean')) throw invalid()
  return { _room_id: input.roomId, _to_status: normalizeRoomCommandStatus(input.toStatus), _reason: input.reason ?? null,
    _dnd_until: date(input.dndUntil), _oos_until: date(input.oosUntil), _force: input.force ?? false, _command_id: id }
}
function parseCommand(value: unknown): RoomCommand {
  const c = object(value)
  if (Object.keys(c).length !== 7 || typeof c._room_id !== 'string' || typeof c._to_status !== 'string' || typeof c._command_id !== 'string') throw storageError()
  const parsed = command({ roomId: c._room_id, toStatus: c._to_status, reason: c._reason as string | null,
    dndUntil: c._dnd_until as string | null, oosUntil: c._oos_until as string | null, force: c._force as boolean }, c._command_id)
  if (JSON.stringify(parsed) !== JSON.stringify(c)) throw storageError()
  return parsed
}
function wait<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { reject(unknown()); return }
    signal.addEventListener('abort', abort, { once: true })
    value.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await wait(reader.read(), signal); if (done) break
      size += value.byteLength; if (size > 16384) throw unknown(); chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { void reader.cancel().catch(() => {}) }
}

export function createRoomTransitionClient(deps: { endpoint: string; publishableKey: string; storage: () => Store;
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>; isRuntimeCurrent?: () => boolean;
  onPendingChange?: () => void; fetch?: typeof fetch; newId?: () => string }) {
  const request = deps.fetch ?? fetch, endpoint = deps.endpoint.replace(/\/$/, '')
  const assertContext = (context: RoomCommandContext) => {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || !uuid(context.actorId) || !uuid(context.tenantId) || !uuid(context.sessionId) || !context.runtime || context.runtime.length > 4096) throw changed()
  }
  const prefix = (context: RoomCommandContext) => {
    assertContext(context)
    return 'roomqc:room-command:v1:' + encodeURIComponent(JSON.stringify([context.runtime, context.actorId, context.tenantId])) + ':'
  }
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Presentation cannot authorize a command. */ } }
  // Plaintext reasons live only in this tab's sessionStorage, never tokens.
  // Reload/remount recovery is supported; closing the tab is not cancellation.
  const pending = (context: RoomCommandContext, roomId?: string): PendingRoomCommand[] => {
    try {
      const store = deps.storage(), start = prefix(context), values: PendingRoomCommand[] = []
      if (store.length > 4096 || (roomId !== undefined && !uuid(roomId))) throw storageError()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i); if (!key?.startsWith(start)) continue
        const raw = store.getItem(key); if (!raw || raw.length > 20000) throw storageError()
        const value = object(JSON.parse(raw)), c = parseCommand(value.command)
        if (Object.keys(value).length !== 5 || value.version !== 1 || value.actorId !== context.actorId
          || value.tenantId !== context.tenantId || value.runtime !== context.runtime || key !== start + c._command_id) throw storageError()
        if (!roomId || c._room_id === roomId) values.push({ version: 1, actorId: context.actorId, tenantId: context.tenantId, runtime: context.runtime, command: c })
      }
      if (values.length > 32) throw storageError()
      return values
    } catch { throw storageError() }
  }
  async function execute(context: RoomCommandContext, rpc: string, body: unknown, options: Options = {}) {
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
    const abort = () => controller.abort(), timer = setTimeout(abort, 20000)
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      current(); assertContext(captured); const token = await session(); current()
      const response = await wait(request(endpoint + '/rest/v1/rpc/' + rpc, { method: 'POST',
        headers: { apikey: deps.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal }), controller.signal)
      current(); const value = await boundedJson(response, controller.signal); await session(); current()
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new RoomCommandError('permission_denied', 'Phiên hoặc quyền thao tác không còn hiệu lực. Lệnh chưa xác nhận vẫn được giữ để kiểm tra.')
        if (response.status === 409) throw new RoomCommandError('command_conflict', 'Mã lệnh đang xung đột. Hãy kiểm tra kết quả trước khi gửi lệnh mới.')
        if (response.status === 400) {
          const message = object(value).message
          const messages: Record<string, string> = { INVALID_TRANSITION: 'Không thể chuyển trạng thái này từ trạng thái hiện tại.',
            DND_UNTIL_MUST_BE_FUTURE: 'Thời điểm gỡ DND phải ở tương lai.', OOS_UNTIL_MUST_BE_FUTURE: 'Thời điểm gỡ OOS phải ở tương lai.' }
          throw new RoomCommandError('invalid_request', typeof message === 'string' && Object.hasOwn(messages, message) ? messages[message] : invalid().message)
        }
        throw unknown()
      }
      return value
    } catch (error) { current(); if (error instanceof RoomCommandError) throw error; throw unknown() }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
  const clear = (context: RoomCommandContext, c: RoomCommand) => {
    try { deps.storage().removeItem(prefix(context) + c._command_id) } catch { /* Known results remain safe to recover again. */ }
    notify()
  }
  const outcome = (context: RoomCommandContext, c: RoomCommand, value: unknown): RoomCommandResult => {
    const result = object(value)
    if (result.room_id !== c._room_id || result.command_id !== c._command_id || result.tenant_id !== context.tenantId || !uuid(result.hotel_id)) throw unknown()
    if (result.state === 'cancelled') {
      if (result.changed !== false || result.status_changed !== false || result.workflow_event_id !== null || result.workflow_dispatch_state !== 'not_required') throw unknown()
      clear(context, c)
      throw new RoomCommandError('command_cancelled', 'Lệnh trước chưa được áp dụng và đã được hủy an toàn. Bạn có thể kiểm tra rồi thao tác lại.')
    }
    if (result.to !== c._to_status || typeof result.from !== 'string' || result.from.length > 64
      || typeof result.legacy_status !== 'string' || result.legacy_status.length > 64 || typeof result.changed !== 'boolean'
      || typeof result.status_changed !== 'boolean' || typeof result.replayed !== 'boolean'
      || result.status_changed !== (result.from !== result.to)
      || (result.status_changed ? !result.changed || !uuid(result.workflow_event_id) || result.workflow_dispatch_state !== 'pending'
        : result.workflow_event_id !== null || result.workflow_dispatch_state !== 'not_required')) throw unknown()
    clear(context, c); return result as RoomCommandResult
  }
  async function dispatch(context: RoomCommandContext, c: RoomCommand, options?: Options) {
    let value: unknown, validation: RoomCommandError | null = null
    try { value = await execute(context, 'transition_room_status', c, options) }
    catch (error) {
      if (!(error instanceof RoomCommandError) || error.code !== 'invalid_request') throw error
      validation = error
      // Serialize terminal abandonment with late same-key mutations; a 400
      // alone must never remove recovery data and mint a replacement ID.
      value = await execute(context, 'cancel_room_transition_command', c, options)
    }
    try { return outcome(context, c, value) }
    catch (error) {
      if (validation && error instanceof RoomCommandError && error.code === 'command_cancelled') {
        throw new RoomCommandError('command_cancelled', validation.message + ' Lệnh chưa được áp dụng; bạn có thể sửa thông tin rồi thử lại.')
      }
      throw error
    }
  }
  const selected = (context: RoomCommandContext, roomId: string) => {
    const items = pending(context, roomId)
    if (items.length !== 1) throw new RoomCommandError('pending_command', 'Cần kiểm tra từng lệnh đang chờ trước khi tiếp tục.')
    return items[0].command
  }
  const recover = async (context: RoomCommandContext, roomId: string, options?: Options) => {
    const c = selected(context, roomId), value = await execute(context, 'get_room_transition_result', { p_command_id: c._command_id }, options)
    return value === null ? dispatch(context, c, options) : outcome(context, c, value)
  }
  return {
    pending, recover,
    cancel: async (context: RoomCommandContext, roomId: string, options?: Options) => {
      const c = selected(context, roomId)
      return outcome(context, c, await execute(context, 'cancel_room_transition_command', c, options))
    },
    save: async (context: RoomCommandContext, input: RoomCommandInput, options: Options = {}) => {
      if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed()
      const start = prefix(context), items = pending(context, input.roomId)
      if (items.length) {
        const c = selected(context, input.roomId), expected = command(input, c._command_id)
        if (JSON.stringify(expected) !== JSON.stringify(c)) throw new RoomCommandError('pending_command', 'Phòng có lệnh chưa xác nhận. Hãy kiểm tra hoặc hủy lệnh đang chờ trước.')
        return recover(context, input.roomId, options)
      }
      const c = command(input, (deps.newId ?? (() => crypto.randomUUID()))())
      try {
        const store = deps.storage(), raw = JSON.stringify({ version: 1, actorId: context.actorId, tenantId: context.tenantId, runtime: context.runtime, command: c })
        if (store.length >= 4096 || pending(context).length >= 32) throw storageError()
        store.setItem(start + c._command_id, raw)
        if (store.getItem(start + c._command_id) !== raw) throw storageError()
      } catch { throw storageError() }
      notify(); return dispatch(context, c, options)
    },
  }
}
