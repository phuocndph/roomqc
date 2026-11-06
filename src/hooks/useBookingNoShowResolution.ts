import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from './useUser'
import { supabase } from '@/integrations/supabase/client'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
import { staffInvitationSession } from '@/lib/staff-invitation'
import { parseNoShowDepositResolution } from '@/lib/room-operation-command'

export function useBookingNoShowResolution(bookingId: string, enabled: boolean) {
  const auth = useAuth(), { user } = useUser()
  let sessionId: string | null = null
  try { const s = staffInvitationSession(auth.session); if (s.actorId === auth.user?.id) sessionId = s.sessionId } catch { /* No active identity. */ }
  return useQuery({
    queryKey: ['booking-no-show-resolution', roomCommandRuntimeScope(), auth.user?.id, sessionId, user?.tenant_id,
      user?.updated_at, bookingId],
    enabled: enabled && !!sessionId && user?.id === auth.user?.id && user?.status === 'active' && !user?.account_locked && !user?.deleted_at,
    retry: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_booking_no_show_resolution', { p_booking_id: bookingId }).abortSignal(signal)
      if (error) throw new Error('Không thể đọc quyết định xử lý cọc bằng quyền hiện tại.')
      return data === null ? null : parseNoShowDepositResolution(data, bookingId)
    },
  })
}
