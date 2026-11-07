import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from './runtime-config'
import { currentRoomCommandContext, roomCommandClient, roomCommandRuntimeScope } from './room-transition-client'
import { RoomCommandError, type RoomCommandContext } from './room-transition-command'
import { createRoomOperationClient, type OperationOptions, type RoomOperationRpc } from './room-operation-command'

export const roomOperationPendingEvent = 'roomqc-room-operation-pending'
const notify = () => window.dispatchEvent(new Event(roomOperationPendingEvent))
const flights = new Map<string, number>()
const flightKey = (c: RoomCommandContext, id: string) => JSON.stringify([c.runtime, c.actorId, c.tenantId, id])
let cached: { runtime: string; key: string; client: ReturnType<typeof createRoomOperationClient> } | null = null
export function roomOperationClient() {
  const runtime = roomCommandRuntimeScope(), key = runtimeConfig.supabasePublishableKey
  if (cached?.runtime === runtime && cached.key === key) return cached.client
  const client = createRoomOperationClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: key, storage: () => sessionStorage,
    getSession: () => supabase.auth.getSession(), onPendingChange: notify,
    isRuntimeCurrent: () => runtime === roomCommandRuntimeScope() && key === runtimeConfig.supabasePublishableKey,
    assertOtherPending: (context, roomIds) => {
      if (roomCommandClient().pending(context).some(p => roomIds.includes(p.command._room_id))) throw new RoomCommandError('pending_command', 'Phòng có yêu cầu đổi trạng thái chưa xác nhận. Hãy kiểm tra hoặc dừng yêu cầu trước.')
    } })
  cached = { runtime, key, client }; return client
}
export function assertNoPendingRoomOperation(context: RoomCommandContext, roomId: string) {
  if (roomOperationClient().pending(context).some(p => p.roomIds.includes(roomId))) throw new RoomCommandError('pending_command', 'Phòng có yêu cầu kiểm phòng hoặc booking chưa xác nhận. Hãy kiểm tra hoặc dừng yêu cầu trước.')
}
export function isRoomOperationRunning(context: RoomCommandContext, id: string) {
  return (flights.get(flightKey(context, id)) ?? 0) > 0 || (flights.get(flightKey(context, '*')) ?? 0) > 0
}
async function run(action: 'save' | 'recover' | 'cancel', id: string, rpc?: RoomOperationRpc, args?: Record<string, unknown>, options: OperationOptions = {}) {
  const context = await currentRoomCommandContext(options), client = roomOperationClient(), key = flightKey(context, action === 'save' ? '*' : id)
  flights.set(key, (flights.get(key) ?? 0) + 1); notify()
  try {
    const data = action === 'save' ? await client.save(context, rpc!, args!, options)
      : action === 'recover' ? await client.recover(context, id, options) : await client.cancel(context, id, options)
    const actual = await currentRoomCommandContext(options)
    if (JSON.stringify(actual) !== JSON.stringify(context) || options.signal?.aborted || options.isCurrent?.() === false) throw new RoomCommandError('identity_changed', 'Phiên đã thay đổi. Vui lòng kiểm tra lại kết quả.')
    return { data, error: null as Error | null }
  } finally {
    const n = (flights.get(key) ?? 1) - 1
    if (n > 0) flights.set(key, n); else flights.delete(key)
    notify()
  }
}
export const submitRoomOperation = (rpc: RoomOperationRpc, args: Record<string, unknown>, options?: OperationOptions) => run('save', '', rpc, args, options)
export const recoverRoomOperation = (id: string, options?: OperationOptions) => run('recover', id, undefined, undefined, options)
export const cancelRoomOperation = (id: string, options?: OperationOptions) => run('cancel', id, undefined, undefined, options)
export function roomOperationErrorMessage(error: unknown) {
  return error instanceof RoomCommandError ? error.message : 'Chưa hoàn tất việc kiểm tra kết quả. Vui lòng thử lại từ mục thao tác đang chờ.'
}
