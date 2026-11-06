import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { submitRoomOperation } from '@/lib/room-operation-client'
import { RoomCommandError } from '@/lib/room-transition-command'
import type { RoomOperationRpc } from '@/lib/room-operation-command'

export function useRoomOperationExecutor(viewScope = '') {
  const auth = useAuth(), { user } = useUser()
  let sessionId: string | null = null, sessionActor: string | null = null
  try { const session = staffInvitationSession(auth.session); sessionId = session.sessionId; sessionActor = session.actorId } catch { /* No coherent active identity. */ }
  const identity = JSON.stringify([roomCommandRuntimeScope(), auth.user?.id, sessionId, user?.tenant_id,
    user?.status, user?.account_locked, user?.deleted_at, user?.updated_at, viewScope])
  const latest = useRef({ identity, epoch: 0 }), mounted = useRef(true), controllers = useRef(new Set<AbortController>())
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch
  useEffect(() => {
    mounted.current = true; const active = controllers.current
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear() }
  }, [identity])
  const current = () => mounted.current && latest.current.identity === identity && latest.current.epoch === epoch
  const execute = async (rpc: RoomOperationRpc, args: Record<string, unknown>, roomIds?: string[]) => {
    if (!auth.user || sessionActor !== auth.user.id || !sessionId || user?.id !== auth.user.id || !user?.tenant_id
      || user.status !== 'active' || user.account_locked || user.deleted_at || !current()) throw new RoomCommandError('identity_changed', 'Vui lòng đăng nhập lại để kiểm tra kết quả.')
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await submitRoomOperation(rpc, args, { signal: controller.signal, isCurrent: current, roomIds }) }
    finally { controllers.current.delete(controller) }
  }
  return Object.assign(execute, { isCurrent: current })
}
