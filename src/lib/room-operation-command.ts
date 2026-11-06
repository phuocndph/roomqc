import { staffInvitationSession } from './staff-invitation'
import { RoomCommandError, ROOM_COMMAND_STATUSES, type RoomCommandContext } from './room-transition-command'

export const operationNames = { perform_quick_room_check: 'quick_check', undo_quick_room_check: 'undo_quick_check',
  transfer_booking_room: 'transfer', perform_checkin: 'checkin', perform_checkout: 'checkout', perform_group_checkout: 'group_checkout',
  transition_booking_flag: 'booking_flag', resolve_booking_no_show: 'no_show' } as const
export type RoomOperationRpc = keyof typeof operationNames
export type OperationOptions = { signal?: AbortSignal; isCurrent?: () => boolean; roomIds?: string[] }
type Store = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
type Session = { access_token: string; user: { id: string } }
export type PendingRoomOperation = { version: 1; actorId: string; tenantId: string; runtime: string; id: string;
  rpc: RoomOperationRpc; request: Record<string, unknown>; roomIds: string[] }
export type RoomOperationResult = Record<string, unknown> & { command_id: string; operation: string; replayed: boolean }
export type NoShowDepositResolution = { id: string; decision: 'retain' | 'refund_due'; deposit_amount: number; amount_paid: number;
  retained_amount: number; refund_due_amount: number; cash_movement: number; recorded_at: string }
const invalid = () => new RoomCommandError('invalid_request', 'Thông tin thao tác chưa hợp lệ. Vui lòng kiểm tra lại.')
const unknown = () => new RoomCommandError('outcome_unknown', 'Chưa xác nhận được kết quả. Hãy dùng mục thao tác đang chờ để kiểm tra hoặc dừng yêu cầu trước.')
const changed = () => new RoomCommandError('identity_changed', 'Tài khoản hoặc không gian làm việc đã thay đổi. Vui lòng kiểm tra lại kết quả.')
const storageError = () => new RoomCommandError('storage_unavailable', 'Không đọc hoặc giữ được yêu cầu trong tab này. Chưa gửi yêu cầu mới; vui lòng kiểm tra bộ nhớ trình duyệt.')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v)
const id = (v: unknown) => { if (!uuid(v)) throw invalid(); return v.toLowerCase() }
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid(); return v as Record<string, unknown> }
const canonical = (v: unknown): string => JSON.stringify(v, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item)
const note = (v: unknown, max: number) => { if (v == null) return null; if (typeof v !== 'string' || v.length > max) throw invalid(); return v }
const amount = (v: unknown, fallback = 0) => { const n = v === undefined ? fallback : v; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw invalid(); return n }
export function parseNoShowDepositResolution(value: unknown, bookingId?: string): NoShowDepositResolution {
  const v = object(value)
  if (!uuid(v.id) || !['retain', 'refund_due'].includes(v.decision as string) || (bookingId && v.booking_id !== bookingId)
    || typeof v.recorded_at !== 'string' || !Number.isFinite(Date.parse(v.recorded_at)) || v.cash_movement !== 0) throw unknown()
  for (const key of ['deposit_amount', 'amount_paid', 'retained_amount', 'refund_due_amount']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || Number(v[key]) < 0) throw unknown()
  }
  if (Math.abs(Number(v.retained_amount) + Number(v.refund_due_amount) - Number(v.deposit_amount)) > 0.000001
    || (v.decision === 'retain' ? v.refund_due_amount !== 0 : v.retained_amount !== 0)) throw unknown()
  return v as NoShowDepositResolution
}
function date(v: unknown) {
  if (v == null) return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw invalid()
  return v
}
function array(v: unknown, max: number): unknown[] {
  const result = v ?? []
  if (!Array.isArray(result) || result.length > max) throw invalid()
  const raw = JSON.stringify(result)
  if (raw.length > 262144 || /data:[^;]*;base64,/i.test(raw)) throw invalid()
  return JSON.parse(raw)
}
function checkout(value: Record<string, unknown>) {
  const request = { booking_id: id(value.booking_id), room_id: id(value.room_id), late_checkout_charge: amount(value.late_checkout_charge),
    service_charges: amount(value.service_charges), subtotal: amount(value.subtotal), damage_charges: amount(value.damage_charges),
    damage_notes: note(value.damage_notes, 10000), damage_items: array(value.damage_items, 1000), check_out_date: date(value.check_out_date),
    ...adjustmentNotes(value.adjustment_notes) }
  if (request.damage_charges > request.subtotal) throw invalid()
  if (Object.keys(value).some(key => !Object.hasOwn(request, key) && !(key === 'adjustment_notes' && value[key] == null))) throw invalid()
  return request
}
function adjustmentNotes(value: unknown): Record<string, string> {
  if (value == null) return {}
  const text = note(value, 10000)
  if (!text?.trim()) throw invalid()
  return { adjustment_notes: text }
}
export function normalizeRoomOperation(rpc: RoomOperationRpc, args: Record<string, unknown>) {
  if (!Object.hasOwn(operationNames, rpc)) throw invalid()
  const prefix = rpc === 'perform_quick_room_check' || rpc === 'undo_quick_room_check' ? '_' : 'p_'
  const input: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(object(args))) {
    if (!key.startsWith(prefix) || key === prefix + 'command_id') throw invalid()
    input[key.slice(prefix.length)] = value
  }
  if ((rpc === 'perform_checkin' || rpc === 'perform_checkout') && input.adjustment_notes == null) delete input.adjustment_notes
  let request: Record<string, unknown>
  if (rpc === 'perform_quick_room_check') {
    if (!['daily', 'periodic'].includes(input.check_type as string)) throw new RoomCommandError('invalid_request', 'Loại kiểm này cần dùng kiểm chuẩn. Kiểm nhanh chỉ dành cho kiểm hằng ngày hoặc định kỳ.')
    const photos = array(input.photos, 100)
    if (photos.some(v => typeof v !== 'string' || v.length > 4096)) throw invalid()
    request = { room_id: id(input.room_id), check_type: input.check_type, notes: note(input.notes, 10000), photos }
  } else if (rpc === 'undo_quick_room_check') request = { check_id: id(input.check_id), reason: note(input.reason, 4000) }
  else if (rpc === 'transfer_booking_room') request = { booking_id: id(input.booking_id), new_room_id: id(input.new_room_id), reason: note(input.reason, 4000) }
  else if (rpc === 'perform_checkin') request = { booking_id: id(input.booking_id), room_id: id(input.room_id), early_checkin_charge: amount(input.early_checkin_charge),
    ...adjustmentNotes(input.adjustment_notes) }
  else if (rpc === 'resolve_booking_no_show') {
    if (typeof input.refund_deposit !== 'boolean') throw invalid()
    request = { booking_id: id(input.booking_id), refund_deposit: input.refund_deposit, reason: note(input.reason, 4000) }
  } else if (rpc === 'transition_booking_flag') {
    if (!['checked_in', 'sleep_out', 'skipper'].includes(input.to_status as string)) throw invalid()
    const owed = input.amount_owed == null ? null : amount(input.amount_owed)
    if (owed !== null && (input.to_status !== 'skipper' || !Number.isInteger(owed) || owed > 99999999999999)) throw invalid()
    request = { booking_id: id(input.booking_id), to_status: input.to_status, reason: note(input.reason, 4000), amount_owed: owed }
  }
  else if (rpc === 'perform_checkout') {
    if (input.new_amount_paid != null) throw invalid()
    delete input.new_amount_paid
    request = checkout(input)
  } else {
    const items = array(input.checkouts, 100).map(v => checkout(object(v)))
    if (!items.length || new Set(items.map(v => v.booking_id)).size !== items.length) throw invalid()
    request = { checkouts: items.sort((a, b) => a.booking_id < b.booking_id ? -1 : a.booking_id > b.booking_id ? 1 : 0) }
  }
  if (Object.keys(input).some(key => !Object.hasOwn(request, key))) throw invalid()
  if (new TextEncoder().encode(canonical(request)).byteLength > 524288) throw invalid()
  return request
}
const isCheck = (c: Pick<PendingRoomOperation, 'rpc'>) => c.rpc === 'perform_quick_room_check' || c.rpc === 'undo_quick_room_check'
function resources(c: Pick<PendingRoomOperation, 'rpc' | 'request' | 'roomIds'>) {
  const items = c.rpc === 'perform_group_checkout' ? c.request.checkouts as Record<string, unknown>[] : [c.request]
  return new Set([...c.roomIds.map(v => 'room:' + v), ...items.flatMap(v => [v.booking_id ? 'booking:' + v.booking_id : '', v.check_id ? 'check:' + v.check_id : '']).filter(Boolean)])
}
function rooms(request: Record<string, unknown>, extra: string[] = []) {
  const items = Array.isArray(request.checkouts) ? request.checkouts as Record<string, unknown>[] : [request]
  return [...new Set([...items.flatMap(v => [v.room_id, v.new_room_id].filter(Boolean)).map(id), ...extra.map(id)])].sort()
}
const argsFor = (c: PendingRoomOperation) => Object.fromEntries([...Object.entries(c.request).map(([key, value]) => [
  (isCheck(c) ? '_' : 'p_') + key, value]), [(isCheck(c) ? '_' : 'p_') + 'command_id', c.id]])
const validationMessage = (value: unknown) => {
  let message = ''; try { const m = object(value).message; if (typeof m === 'string') message = m } catch { /* Never display raw backend data. */ }
  const messages: Record<string, string> = { photo_required: 'Khách sạn yêu cầu ảnh bằng chứng.', quick_path_disabled: 'Khách sạn đã tắt kiểm nhanh.',
    newer_check_exists: 'Phòng đã có lần kiểm mới hơn.', not_quick_check: 'Chỉ hoàn tác được lần kiểm nhanh.',
    ROOM_NOT_READY_FOR_CHECKIN: 'Phòng chưa sẵn sàng nhận khách.', NEW_ROOM_UNAVAILABLE: 'Phòng đích chưa sẵn sàng.' }
  if (Object.hasOwn(messages, message)) return messages[message]
  if (/^quick_rate_limited:\d+$/.test(message)) return 'Vừa có lần kiểm nhanh. Vui lòng chờ đủ thời gian quy định.'
  if (/^undo_window_expired:/.test(message)) return 'Đã quá thời gian cho phép hoàn tác.'
  return invalid().message
}
function wait<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(unknown())
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.body) throw unknown()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0
  try {
    for (;;) { const v = await wait(reader.read(), signal); if (v.done) break; length += v.value.byteLength; if (length > 1048576) throw unknown(); chunks.push(v.value) }
    const bytes = new Uint8Array(length); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder().decode(bytes))
  } finally { void reader.cancel().catch(() => {}) }
}
function transition(value: unknown, context: RoomCommandContext, roomId: unknown, to: string, commandId?: string) {
  const t = object(value)
  if (t.room_id !== roomId || t.tenant_id !== context.tenantId || !uuid(t.hotel_id) || !uuid(t.command_id)
    || (commandId && t.command_id !== commandId) || t.to !== to || t.changed !== true || t.status_changed !== true
    || !uuid(t.workflow_event_id) || t.workflow_dispatch_state !== 'pending' || !(ROOM_COMMAND_STATUSES as readonly unknown[]).includes(t.from)) throw unknown()
  return t
}
function completed(value: unknown, c: PendingRoomOperation, context: RoomCommandContext, child = false): RoomOperationResult {
  const r = object(value), op = child ? 'checkout' : operationNames[c.rpc]
  if ((!child && r.command_id !== c.id) || !uuid(r.command_id) || r.operation !== op || typeof r.replayed !== 'boolean'
    || (r.tenant_id !== undefined && r.tenant_id !== context.tenantId)) throw unknown()
  if (r.state !== undefined) throw unknown()
  const q = c.request
  if (c.rpc === 'perform_quick_room_check') {
    const expected = r.old_status === 'vacant_dirty' ? 'vacant_clean' : r.old_status === 'occupied_dirty' ? 'occupied_clean' : r.old_status
    if (r.room_id !== q.room_id || !uuid(r.check_id) || r.new_status !== expected
      || !(ROOM_COMMAND_STATUSES as readonly unknown[]).includes(r.old_status)
      || !Number.isInteger(r.summary_ok_count) || Number(r.summary_ok_count) < 0
      || (r.old_status !== r.new_status ? !uuid(r.workflow_event_id) : r.workflow_event_id !== null)) throw unknown()
  } else if (c.rpc === 'undo_quick_room_check') {
    if (r.check_id !== q.check_id || r.status !== 'undone' || !uuid(r.room_id)) throw unknown()
  } else if (c.rpc === 'transfer_booking_room') {
    if (r.success !== true || r.booking_id !== q.booking_id || r.to_room_id !== q.new_room_id || !uuid(r.from_room_id) || r.from_room_id === r.to_room_id
      || (c.roomIds.length > 1 && !c.roomIds.includes(r.from_room_id)) || !Array.isArray(r.room_transitions) || r.room_transitions.length !== 2) throw unknown()
    if (r.room_transitions.some(v => v !== null)) {
      transition(r.room_transitions[0], context, r.from_room_id, 'vacant_dirty')
      transition(r.room_transitions[1], context, r.to_room_id, 'occupied_clean')
    }
  } else if (c.rpc === 'resolve_booking_no_show' || c.rpc === 'transition_booking_flag') {
    const booking = object(r.booking)
    if (r.success !== true || r.booking_id !== q.booking_id || r.tenant_id !== context.tenantId || !uuid(r.room_id) || !uuid(r.hotel_id)
      || (c.roomIds.length && !c.roomIds.includes(r.room_id)) || booking.id !== q.booking_id || booking.room_id !== r.room_id
      || booking.tenant_id !== context.tenantId || booking.hotel_id !== r.hotel_id || booking.status !== r.status) throw unknown()
    if (c.rpc === 'resolve_booking_no_show') {
      const resolution = parseNoShowDepositResolution(r.deposit_resolution)
      if (r.status !== 'no_show' || r.previous_status !== 'confirmed' || typeof r.already_resolved !== 'boolean'
        || r.room_status_changed !== false || r.workflow_event_id !== null
        || resolution.decision !== (q.refund_deposit ? 'refund_due' : 'retain')
        || !Object.hasOwn(booking, 'deposit_amount') || !Object.hasOwn(booking, 'amount_paid')
        || (booking.deposit_amount ?? 0) !== resolution.deposit_amount || (booking.amount_paid ?? 0) !== resolution.amount_paid) throw unknown()
    } else {
      if (r.status !== q.to_status || !['checked_in', 'sleep_out'].includes(r.previous_status as string)) throw unknown()
      const target = q.to_status === 'checked_in' ? object(r.room_transition).to : q.to_status
      if (q.to_status === 'checked_in' && !['occupied_clean', 'occupied_dirty'].includes(target as string)) throw unknown()
      const t = transition(r.room_transition, context, r.room_id, String(target), c.id)
      if (t.workflow_event_id !== r.workflow_event_id || (r.previous_status === 'sleep_out' ? t.from !== 'sleep_out'
        : !['occupied_clean', 'occupied_dirty'].includes(t.from as string))) throw unknown()
    }
  } else if (c.rpc === 'perform_group_checkout') {
    const items = q.checkouts as Record<string, unknown>[]
    if (r.success !== true || r.booking_count !== items.length || !Array.isArray(r.results) || r.results.length !== items.length) throw unknown()
    const members = r.results.map(object)
    if (new Set(members.map(m => m.booking_id)).size !== items.length || new Set(members.map(m => m.command_id)).size !== items.length) throw unknown()
    const events = members.filter(m => m.notification_event_id !== undefined).map(m => m.notification_event_id)
    if (new Set(events).size !== events.length) throw unknown()
    for (const item of items) {
      const member = members.find(m => m.booking_id === item.booking_id)
      completed(member, { ...c, rpc: 'perform_checkout', request: item }, context, true)
    }
  } else {
    if (r.success !== true || r.booking_id !== q.booking_id || r.room_id !== q.room_id) throw unknown()
    if (q.adjustment_notes !== undefined && r.adjustment_notes_applied !== true) throw unknown()
    // Historical receipts may omit both fields. A partial/invalid queue receipt
    // is an unknown outcome; never clear recovery state on that response.
    if ((r.notification_event_id !== undefined || r.notification_state !== undefined)
      && (!uuid(r.notification_event_id) || r.notification_state !== 'queued')) throw unknown()
    const t = transition(r.room_transition, context, q.room_id, c.rpc === 'perform_checkin' ? 'occupied_clean' : 'vacant_dirty', r.command_id as string)
    if (r.workflow_event_id !== t.workflow_event_id) throw unknown()
    if (c.rpc === 'perform_checkin') {
      if (typeof r.checked_in_at !== 'string' || !Number.isFinite(Date.parse(r.checked_in_at))) throw unknown()
    } else {
      for (const key of ['subtotal', 'vat_base', 'vat_amount', 'service_fee_amount', 'total_amount', 'damage_charges']) if (typeof r[key] !== 'number' || !Number.isFinite(r[key]) || Number(r[key]) < 0) throw unknown()
      if (typeof r.payment_status !== 'string' || !r.payment_status || r.payment_status.length > 64) throw unknown()
    }
  }
  return r as RoomOperationResult
}

export function createRoomOperationClient(deps: { endpoint: string; publishableKey: string; storage: () => Store;
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>; fetch?: typeof fetch; newId?: () => string;
  isRuntimeCurrent?: () => boolean; onPendingChange?: () => void; assertOtherPending?: (context: RoomCommandContext, roomIds: string[]) => void }) {
  const endpoint = deps.endpoint.replace(/\/$/, ''), request = deps.fetch ?? fetch
  const notify = () => { try { deps.onPendingChange?.() } catch { /* Rendering is not authorization. */ } }
  const prefix = (context: RoomCommandContext) => {
    const url = new URL(endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !uuid(context.actorId)
      || !uuid(context.sessionId) || !uuid(context.tenantId) || !context.runtime || context.runtime.length > 4096) throw changed()
    return 'roomqc:room-operation:v1:' + encodeURIComponent(JSON.stringify([context.runtime, context.actorId, context.tenantId])) + ':'
  }
  const current = (options: OperationOptions) => { if (options.signal?.aborted || options.isCurrent?.() === false || deps.isRuntimeCurrent?.() === false) throw changed() }
  const pending = (context: RoomCommandContext): PendingRoomOperation[] => {
    try {
      const store = deps.storage(), start = prefix(context), values: PendingRoomOperation[] = []; let total = 0
      if (store.length > 4096) throw storageError()
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i); if (!key?.startsWith(start)) continue
        const raw = store.getItem(key); if (!raw || raw.length > 550000 || (total += raw.length) > 2097152) throw storageError()
        const value = object(JSON.parse(raw)) as unknown as PendingRoomOperation
        if (Object.keys(value).length !== 8 || value.version !== 1 || value.actorId !== context.actorId || value.tenantId !== context.tenantId
          || value.runtime !== context.runtime || !uuid(value.id) || key !== start + value.id || !Object.hasOwn(operationNames, value.rpc)
          || !Array.isArray(value.roomIds) || value.roomIds.length > 200) throw storageError()
        const normalized = normalizeRoomOperation(value.rpc, Object.fromEntries(Object.entries(object(value.request)).map(([k, v]) => [(isCheck(value) ? '_' : 'p_') + k, v])))
        if (canonical(normalized) !== canonical(value.request) || canonical(rooms(normalized, value.roomIds)) !== canonical(value.roomIds)) throw storageError()
        values.push(value)
      }
      if (values.length > 32) throw storageError(); return values
    } catch { throw storageError() }
  }
  async function execute(context: RoomCommandContext, rpc: string, body: unknown, options: OperationOptions) {
    const controller = new AbortController(), abort = () => controller.abort(), timer = setTimeout(abort, 20000)
    options.signal?.addEventListener('abort', abort, { once: true })
    const session = async () => {
      const found = await wait(deps.getSession(), controller.signal); current(options)
      if (found.error || !found.data.session) throw changed()
      const actual = staffInvitationSession(found.data.session)
      if (actual.actorId !== context.actorId || actual.sessionId !== context.sessionId) throw changed()
      return found.data.session.access_token
    }
    try {
      current(options); prefix(context); const token = await session()
      const response = await wait(request(endpoint + '/rest/v1/rpc/' + rpc, { method: 'POST',
        headers: { apikey: deps.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal }), controller.signal)
      const value = await boundedJson(response, controller.signal); await session(); current(options)
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new RoomCommandError('permission_denied', 'Phiên hoặc quyền thao tác không còn hiệu lực. Yêu cầu chưa xác nhận vẫn được giữ để kiểm tra.')
        if (response.status === 400) throw new RoomCommandError('invalid_request', validationMessage(value))
        if (response.status === 409) throw new RoomCommandError('command_conflict', 'Thao tác xung đột với dữ liệu hiện tại. Kiểm tra hoặc dừng yêu cầu đang chờ trước khi gửi lại.')
        throw unknown()
      }
      return value
    } catch (error) { current(options); if (error instanceof RoomCommandError) throw error; throw unknown() }
    finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
  }
  const outcome = (context: RoomCommandContext, c: PendingRoomOperation, value: unknown) => {
    let result: RoomOperationResult, cancelled = false
    try {
      const r = object(value)
      if (r.state === 'cancelled') {
        if (r.command_id !== c.id || r.operation !== operationNames[c.rpc] || r.tenant_id !== context.tenantId || r.changed !== false
          || r.workflow_event_id !== null || typeof r.replayed !== 'boolean') throw unknown()
        if (isCheck(c)) {
          if (!uuid(r.hotel_id) || !uuid(r.room_id) || (c.request.room_id && r.room_id !== c.request.room_id)
            || (c.request.check_id ? r.check_id !== c.request.check_id : r.check_id !== null)) throw unknown()
        } else {
          const targets = resources(c), actualRooms = r.room_ids, actualBookings = r.booking_ids
          if (r.success !== false || !Array.isArray(actualRooms) || !actualRooms.length || !actualRooms.every(uuid)
            || !Array.isArray(actualBookings) || !actualBookings.length || !actualBookings.every(uuid)) throw unknown()
          const expectedBookings = [...targets].filter(v => v.startsWith('booking:')).map(v => v.slice(8)).sort()
          if (canonical([...actualBookings].sort()) !== canonical(expectedBookings)
            || c.roomIds.some(roomId => !actualRooms.includes(roomId))) throw unknown()
        }
        result = r as RoomOperationResult; cancelled = true
      } else result = completed(value, c, context)
    } catch { throw unknown() }
    // Removing only this known receipt cannot discard another request.
    try { deps.storage().removeItem(prefix(context) + c.id) } catch { /* Safe to look up the same receipt again. */ }
    notify()
    if (cancelled) throw new RoomCommandError('command_cancelled', 'Yêu cầu chưa được áp dụng và đã được dừng an toàn. Bạn có thể kiểm tra rồi thao tác lại.')
    return result
  }
  const selected = (context: RoomCommandContext, id: string) => {
    const c = pending(context).find(v => v.id === id)
    if (!c) throw new RoomCommandError('pending_command', 'Không còn yêu cầu đang chờ này. Vui lòng kiểm tra lại dữ liệu.'); return c
  }
  const cancel = (context: RoomCommandContext, c: PendingRoomOperation, options: OperationOptions) => execute(context,
    isCheck(c) ? 'cancel_room_check_command' : 'cancel_booking_room_command', { p_command_id: c.id, p_operation: operationNames[c.rpc], p_request: c.request }, options)
  const dispatch = async (context: RoomCommandContext, c: PendingRoomOperation, options: OperationOptions) => {
    let value: unknown, validation: RoomCommandError | null = null
    try { value = await execute(context, c.rpc, argsFor(c), options) }
    catch (error) {
      if (!(error instanceof RoomCommandError) || error.code !== 'invalid_request') throw error
      validation = error; value = await cancel(context, c, options)
    }
    try { return outcome(context, c, value) }
    catch (error) { if (validation && error instanceof RoomCommandError && error.code === 'command_cancelled') throw new RoomCommandError('command_cancelled', validation.message + ' Yêu cầu đã dừng an toàn; bạn có thể sửa thông tin rồi thử lại.'); throw error }
  }
  const recover = async (context: RoomCommandContext, id: string, options: OperationOptions = {}) => {
    const c = selected(context, id), result = await execute(context, isCheck(c) ? 'get_room_check_command_result' : 'get_booking_room_command_result', { p_command_id: c.id }, options)
    return result === null ? dispatch(context, c, options) : outcome(context, c, result)
  }
  return { pending, recover,
    cancel: async (context: RoomCommandContext, id: string, options: OperationOptions = {}) => { const c = selected(context, id); return outcome(context, c, await cancel(context, c, options)) },
    save: async (context: RoomCommandContext, rpc: RoomOperationRpc, args: Record<string, unknown>, options: OperationOptions = {}) => {
      current(options); const start = prefix(context), q = normalizeRoomOperation(rpc, args)
      const c: PendingRoomOperation = { version: 1, actorId: context.actorId, tenantId: context.tenantId, runtime: context.runtime,
        id: '', rpc, request: q, roomIds: rooms(q, options.roomIds) }
      const mine = pending(context), keys = resources(c), existing = mine.filter(p => [...resources(p)].some(k => keys.has(k)))
      if (existing.length) {
        if (existing.length !== 1 || existing[0].rpc !== rpc || canonical(existing[0].request) !== canonical(q) || canonical(existing[0].roomIds) !== canonical(c.roomIds))
          throw new RoomCommandError('pending_command', 'Có yêu cầu chưa rõ kết quả cho phòng hoặc booking này. Hãy kiểm tra hoặc dừng yêu cầu trước.')
        return recover(context, existing[0].id, options)
      }
      deps.assertOtherPending?.(context, c.roomIds)
      c.id = id((deps.newId ?? (() => crypto.randomUUID()))())
      const raw = JSON.stringify(c)
      try {
        const store = deps.storage()
        if (store.length >= 4096 || mine.length >= 32 || raw.length + mine.reduce((n, p) => n + JSON.stringify(p).length, 0) > 2097152 || store.getItem(start + c.id) !== null) throw storageError()
        store.setItem(start + c.id, raw); if (store.getItem(start + c.id) !== raw) throw storageError()
      } catch { throw storageError() }
      notify(); return dispatch(context, c, options)
    },
  }
}
