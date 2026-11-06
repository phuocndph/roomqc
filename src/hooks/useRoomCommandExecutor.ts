import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { roomCommandRuntimeScope, submitRoomTransition } from '@/lib/room-transition-client'
import { RoomCommandError, type RoomCommandInput } from '@/lib/room-transition-command'

export function useRoomCommandExecutor() {
  const auth = useAuth(), { user } = useUser()
  let sessionId: string | null = null
  try { sessionId = staffInvitationSession(auth.session).sessionId } catch { /* No coherent active identity. */ }
  const identity = JSON.stringify([roomCommandRuntimeScope(), auth.user?.id, sessionId, user?.tenant_id,
    user?.status, user?.account_locked, user?.deleted_at, user?.updated_at])
  const latest = useRef({ identity, epoch: 0 }), mounted = useRef(true), controllers = useRef(new Set<AbortController>())
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  const epoch = latest.current.epoch
  useEffect(() => {
    mounted.current = true; const active = controllers.current
    return () => { mounted.current = false; for (const controller of active) controller.abort(); active.clear() }
  }, [identity])
  const current = () => mounted.current && latest.current.identity === identity && latest.current.epoch === epoch
  const execute = async (input: RoomCommandInput) => {
    if (!auth.user || !sessionId || !user?.tenant_id || !current()) throw new RoomCommandError('identity_changed', 'Vui lòng đăng nhập lại.')
    const controller = new AbortController(); controllers.current.add(controller)
    try { return await submitRoomTransition(input, { signal: controller.signal, isCurrent: current }) }
    finally { controllers.current.delete(controller) }
  }
  return Object.assign(execute, { isCurrent: current })
}
