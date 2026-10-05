import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import type { StaffStatusType } from './useStaffStatus'
import {
  getPresenceState,
  isOnShift,
  PRESENCE_SORT_ORDER,
  type StaffPresenceState,
} from '@/lib/staffPresence'

export interface OnShiftStaffMember {
  id: string
  full_name: string
  avatar_url: string | null
  email: string | null
  phone: string | null
  user_level_code: string | null
  position_name: string | null
  telegram_username: string | null
  telegram_chat_id: string | null
  shift_start_at: string | null
  last_seen_at: string | null
  // Status tracking fields
  status: StaffStatusType
  current_activity: string | null
  current_location: string | null
  // Unified presence (new)
  presence_state: StaffPresenceState
}

export function useOnShiftStaffList(hotelId: string | undefined) {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  // Realtime: invalidate khi có thay đổi shift của bất kỳ ai trong tenant
  useEffect(() => {
    if (!tenantId || !hotelId) return
    const channel = supabase
      .channel(`on-shift-staff-list-${hotelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_status',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['on-shift-staff-list', hotelId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, hotelId, queryClient])

  return useQuery({
    queryKey: ['on-shift-staff-list', hotelId],
    queryFn: async () => {
      if (!hotelId) return []

      // Get all users assigned to this hotel with their info
      const { data: userHotels, error: uhError } = await supabase
        .from('user_hotels')
        .select(`
          user_id,
          user:users!user_hotels_user_id_fkey(
            id, full_name, avatar_url, email, phone, user_level_code,
            telegram_username,
            position:positions(name),
            telegram_connections(chat_id, is_active)
          )
        `)
        .eq('hotel_id', hotelId)

      if (uhError) throw uhError

      const userIds = userHotels?.map(uh => uh.user_id).filter(Boolean) || []
      if (userIds.length === 0) return []

      const { data: statuses, error: statusError } = await supabase
        .from('staff_status')
        .select('user_id, shift_start_at, shift_end_at, status, current_activity, current_location, last_seen_at')
        .in('user_id', userIds)

      if (statusError) throw statusError

      const statusMap = new Map(statuses?.map(s => [s.user_id, s]) || [])

      // Filter only staff "on shift" theo định nghĩa mới (loại ca treo + status offline)
      const onShiftStaff: OnShiftStaffMember[] = (userHotels || [])
        .filter(item => item.user)
        .map(item => {
          const user = item.user as any
          const status = statusMap.get(item.user_id)
          const activeConnection = user.telegram_connections?.find((tc: any) => tc.is_active)
          const presence_state = getPresenceState(status || null)

          return {
            id: user.id,
            full_name: user.full_name || 'Không tên',
            avatar_url: user.avatar_url,
            email: user.email,
            phone: user.phone,
            user_level_code: user.user_level_code,
            position_name: user.position?.name || null,
            telegram_username: user.telegram_username || null,
            telegram_chat_id: activeConnection?.chat_id || null,
            shift_start_at: status?.shift_start_at || null,
            last_seen_at: status?.last_seen_at || null,
            status: (status?.status as StaffStatusType) || 'offline',
            current_activity: status?.current_activity || null,
            current_location: status?.current_location || null,
            presence_state,
            _status: status,
          } as OnShiftStaffMember & { _status: any }
        })
        .filter(s => isOnShift((s as any)._status || null))
        .map(({ _status, ...rest }: any) => rest)

      // Sort: available → busy → offline-heartbeat; trong nhóm sort theo tên
      return onShiftStaff.sort((a, b) => {
        const diff = PRESENCE_SORT_ORDER[a.presence_state] - PRESENCE_SORT_ORDER[b.presence_state]
        if (diff !== 0) return diff
        return a.full_name.localeCompare(b.full_name, 'vi')
      })
    },
    enabled: !!hotelId,
    staleTime: 30 * 1000,
  })
}
