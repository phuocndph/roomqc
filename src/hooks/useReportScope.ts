import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from './useUser'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'

/** A result or download belongs to one login, runtime, hotel and selection. */
export function useReportScope(selection = '') {
  const auth = useAuth()
  const { user, tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  let sessionId: string | null = null
  try {
    const session = staffInvitationSession(auth.session)
    if (session.actorId === auth.user?.id) sessionId = session.sessionId
  } catch { /* Incomplete sessions cannot fetch or export. */ }
  const runtime = roomCommandRuntimeScope()
  const hotelId = isAllHotelsMode ? undefined : selectedHotel?.id
  const key = [runtime, auth.user?.id, sessionId, tenantId, user?.id, user?.updated_at,
    user?.status, user?.account_locked, user?.deleted_at, isAllHotelsMode, hotelId, selection]
  const identity = JSON.stringify(key)
  const latest = useRef({ identity, epoch: 0 })
  const mounted = useRef(true)
  if (latest.current.identity !== identity) latest.current = { identity, epoch: latest.current.epoch + 1 }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; latest.current.epoch += 1 }
  }, [])
  const enabled = !!tenantId && user?.id === auth.user?.id && !!sessionId && user?.status === 'active'
    && !user.account_locked && !user.deleted_at && (isAllHotelsMode || !!hotelId)

  const capture = () => {
    const epoch = latest.current.epoch
    const assertCurrent = () => {
      if (!enabled || !mounted.current || latest.current.identity !== identity
        || latest.current.epoch !== epoch || roomCommandRuntimeScope() !== runtime) {
        throw new Error('Phiên hoặc phạm vi báo cáo đã thay đổi. Vui lòng tải lại.')
      }
    }
    assertCurrent()
    return assertCurrent
  }
  return { key, hotelId, enabled, capture }
}
