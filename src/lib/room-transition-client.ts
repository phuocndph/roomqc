import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from './runtime-config'
import { staffInvitationSession } from './staff-invitation'
import { createRoomTransitionClient, RoomCommandError, type RoomCommandContext, type RoomCommandInput } from './room-transition-command'

export const roomCommandPendingEvent = 'roomqc-room-command-pending'
const flights = new Map<string, number>()
const notify = () => window.dispatchEvent(new Event(roomCommandPendingEvent))
export function roomCommandRuntimeScope() {
  return JSON.stringify([runtimeConfig.supabaseUrl, runtimeConfig.workspace?.cluster.id ?? null,
    runtimeConfig.workspace?.workspace.id ?? null, runtimeConfig.workspace?.workspace.tenantId ?? null,
    runtimeConfig.workspace?.workspace.routingVersion ?? null])
}
let cached: { runtime: string; publicKey: string; client: ReturnType<typeof createRoomTransitionClient> } | null = null
export function roomCommandClient() {
  const runtime = roomCommandRuntimeScope(), publicKey = runtimeConfig.supabasePublishableKey
  if (cached?.runtime === runtime && cached.publicKey === publicKey) return cached.client
  const client = createRoomTransitionClient({ endpoint: runtimeConfig.supabaseUrl, publishableKey: publicKey,
    storage: () => sessionStorage, getSession: () => supabase.auth.getSession(),
    isRuntimeCurrent: () => runtime === roomCommandRuntimeScope() && publicKey === runtimeConfig.supabasePublishableKey,
    onPendingChange: notify })
  cached = { runtime, publicKey, client }; return client
}
type ExecutionOptions = { signal?: AbortSignal; isCurrent?: () => boolean }
export async function currentRoomCommandContext(options: ExecutionOptions = {}): Promise<RoomCommandContext> {
  const runtime = roomCommandRuntimeScope(), controller = new AbortController()
  const changed = () => new RoomCommandError('identity_changed', 'Tài khoản hoặc không gian làm việc đã thay đổi. Vui lòng kiểm tra lại.')
  const current = () => { if (options.signal?.aborted || options.isCurrent?.() === false || runtime !== roomCommandRuntimeScope()) throw changed() }
  const abort = () => controller.abort(), timer = setTimeout(abort, 10000)
  options.signal?.addEventListener('abort', abort, { once: true })
  const bounded = <T,>(value: PromiseLike<T>): Promise<T> => new Promise((resolve, reject) => {
    const failed = () => reject(new RoomCommandError('context_unavailable', 'Chưa kiểm tra được phiên và quyền thao tác. Vui lòng thử lại.'))
    if (controller.signal.aborted) { failed(); return }
    controller.signal.addEventListener('abort', failed, { once: true })
    Promise.resolve(value).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', failed))
  })
  try {
    current(); const auth = await bounded(supabase.auth.getSession()); current()
    if (auth.error) throw changed()
    const native = staffInvitationSession(auth.data.session)
    const { data: profile, error } = await bounded(supabase.from('users').select('id,tenant_id,status,account_locked,deleted_at')
      .eq('id', native.actorId).abortSignal(controller.signal).single())
    current(); const after = await bounded(supabase.auth.getSession()); current()
    const actual = staffInvitationSession(after.data.session)
    if (error || after.error || !profile?.tenant_id || profile.status !== 'active' || profile.account_locked || profile.deleted_at
      || actual.actorId !== native.actorId || actual.sessionId !== native.sessionId
      || (runtimeConfig.workspace && runtimeConfig.workspace.workspace.tenantId !== profile.tenant_id)) throw changed()
    return { ...native, tenantId: profile.tenant_id, runtime }
  } catch (error) {
    current()
    if (error instanceof RoomCommandError) throw error
    throw new RoomCommandError('context_unavailable', 'Chưa kiểm tra được phiên và quyền thao tác. Vui lòng thử lại.')
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
}
function flightKey(context: RoomCommandContext, roomId: string) {
  return JSON.stringify([context.runtime, context.actorId, context.tenantId, roomId])
}
export function isRoomCommandRunning(context: RoomCommandContext, roomId: string) {
  return (flights.get(flightKey(context, roomId)) ?? 0) > 0
}
async function run(roomId: string, action: 'save' | 'recover' | 'cancel', input?: RoomCommandInput,
  options?: ExecutionOptions) {
  const context = await currentRoomCommandContext(options), client = roomCommandClient(), key = flightKey(context, roomId)
  if (action === 'save') {
    const { assertNoPendingRoomOperation } = await import('./room-operation-client')
    assertNoPendingRoomOperation(context, roomId)
  }
  if (options?.signal?.aborted || options?.isCurrent?.() === false) throw new RoomCommandError('identity_changed', 'Phiên đã thay đổi.')
  flights.set(key, (flights.get(key) ?? 0) + 1); notify()
  try {
    const result = action === 'save' ? await client.save(context, input!, options)
      : action === 'recover' ? await client.recover(context, roomId, options) : await client.cancel(context, roomId, options)
    const actual = await currentRoomCommandContext(options)
    if (JSON.stringify(actual) !== JSON.stringify(context) || options?.signal?.aborted || options?.isCurrent?.() === false) {
      throw new RoomCommandError('identity_changed', 'Phiên đã thay đổi. Vui lòng kiểm tra lại kết quả.')
    }
    return result
  } finally {
    const count = (flights.get(key) ?? 1) - 1
    if (count > 0) flights.set(key, count); else flights.delete(key)
    notify()
  }
}
export const submitRoomTransition = (input: RoomCommandInput, options?: ExecutionOptions) => run(input.roomId, 'save', input, options)
export const recoverRoomTransition = (roomId: string, options?: ExecutionOptions) => run(roomId, 'recover', undefined, options)
export const cancelRoomTransition = (roomId: string, options?: ExecutionOptions) => run(roomId, 'cancel', undefined, options)
