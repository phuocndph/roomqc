import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { getPresenceState, type StaffPresenceState } from '@/lib/staffPresence'

export type StaffStatusType = 'available' | 'busy' | 'break' | 'offline'

export interface StaffStatus {
  id: string
  user_id: string
  tenant_id: string
  status: StaffStatusType
  current_location: string | null
  current_activity: string | null
  current_activity_type: string | null
  last_seen_at: string
  shift_start_at: string | null
  shift_end_at: string | null
  created_at: string
  updated_at: string
}

export interface StaffWithStatus {
  id: string
  full_name: string
  email: string
  phone: string | null
  avatar_url: string | null
  position_name: string | null
  user_level_code: string | null
  hotel_id: string | null
  hotel_name: string | null
  status: StaffStatusType
  current_location: string | null
  current_activity: string | null
  current_activity_type: string | null
  last_seen_at: string | null
  telegram_username: string | null
  telegram_chat_id: string | null
  shift_start_at: string | null
  shift_end_at: string | null
  /** Derived unified presence (single source of truth) */
  presence_state: StaffPresenceState
}

export function useStaffStatus() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['staff-status', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      // Fetch users with their status and telegram connection
      let usersQuery = supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          phone,
          avatar_url,
          role,
          user_level_code,
          hotel_id,
          telegram_username,
          hotels!users_hotel_id_fkey(name),
          telegram_connections(chat_id, is_active)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .order('full_name')

      if (!isAllHotelsMode && selectedHotel?.id) {
        usersQuery = usersQuery.eq('hotel_id', selectedHotel.id)
      }

      const { data: users, error: usersError } = await usersQuery

      if (usersError) throw usersError

      // Fetch staff status
      const { data: statuses, error: statusError } = await supabase
        .from('staff_status')
        .select('*')
        .eq('tenant_id', tenantId)

      if (statusError) throw statusError

      // Combine users with their status
      const statusMap = new Map(statuses?.map(s => [s.user_id, s]) || [])

      const staffWithStatus: StaffWithStatus[] = (users || []).map(user => {
        const status = statusMap.get(user.id)
        // Get active telegram connection's chat_id (tolerant: fallback if is_active is null)
        const telegramConnections = (user as any).telegram_connections as Array<{ chat_id: string; is_active: boolean | null }> | null
        // Priority: is_active === true > first available connection with chat_id
        const activeTelegramConnection = telegramConnections?.find(tc => tc.is_active === true) 
          || telegramConnections?.find(tc => tc.chat_id)
        
        return {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
          position_name: user.role, // Use role field as position name
          user_level_code: user.user_level_code,
          hotel_id: user.hotel_id,
          hotel_name: (user.hotels as any)?.name || null,
          status: (status?.status as StaffStatusType) || 'offline',
          current_location: status?.current_location || null,
          current_activity: status?.current_activity || null,
          current_activity_type: status?.current_activity_type || null,
          last_seen_at: status?.last_seen_at || null,
          telegram_username: (user as any).telegram_username || null,
          telegram_chat_id: activeTelegramConnection?.chat_id || null,
          shift_start_at: status?.shift_start_at || null,
          shift_end_at: status?.shift_end_at || null,
          presence_state: getPresenceState({
            shift_start_at: status?.shift_start_at,
            shift_end_at: status?.shift_end_at,
            status: status?.status,
            last_seen_at: status?.last_seen_at,
          }),
        }
      })

      return staffWithStatus
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  })

  // Heartbeat: update last_seen_at every 15 minutes for current user
  // (Tăng từ 5 → 15 phút để giảm 67% lượng write + realtime broadcast.
  //  Không chuyển sang Presence để giữ tương thích với báo cáo SQL đọc last_seen_at.)
  const { user } = useUser()
  useEffect(() => {
    if (!user?.id || !tenantId) return

    // Chỉ heartbeat khi tab visible
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      supabase
        .from('staff_status')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .then()
    }

    beat()
    const interval = setInterval(beat, 15 * 60 * 1000) // 15 minutes

    return () => clearInterval(interval)
  }, [user?.id, tenantId])

  // Subscribe to realtime changes (gộp 1 channel + visibility pause)
  // NOTE: Bỏ listener telegram_connections vì bảng không có tenant_id → trước đây
  // nhận event toàn platform, gây refetch sai tenant + load chậm. Telegram cập nhật
  // qua visibility refetch + staleTime là đủ.
  useEffect(() => {
    if (!tenantId) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let invalidateTimer: ReturnType<typeof setTimeout> | null = null

    // Debounce 300ms để gộp burst event (5 update/200ms → 1 lần refetch)
    const scheduleInvalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer)
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['staff-status', tenantId] })
      }, 300)
    }

    const subscribe = () => {
      if (channel) return
      channel = supabase
        .channel(`staff-status-${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'staff_status',
            filter: `tenant_id=eq.${tenantId}`,
          },
          scheduleInvalidate
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: `tenant_id=eq.${tenantId}`,
          },
          scheduleInvalidate
        )
        .subscribe()
    }
    const unsubscribe = () => {
      if (invalidateTimer) { clearTimeout(invalidateTimer); invalidateTimer = null }
      if (channel) { supabase.removeChannel(channel); channel = null }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        queryClient.invalidateQueries({ queryKey: ['staff-status', tenantId] })
      } else { unsubscribe() }
    }
    if (document.visibilityState === 'visible') subscribe()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [tenantId, queryClient])

  return query
}

export function useUpdateMyStatus() {
  const { user, tenantId } = useUser()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newStatus: StaffStatusType) => {
      if (!user?.id || !tenantId) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('staff_status')
        .upsert({
          user_id: user.id,
          tenant_id: tenantId,
          status: newStatus,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-status'] })
    },
  })
}

/**
 * Presence-based stats. Đếm theo `presence_state` (single source of truth)
 * thay vì cột `status` thô để dot/badge luôn khớp với dropdown giao việc.
 */
export interface StaffPresenceStats {
  available: number   // on_shift_available
  busy: number        // on_shift_busy
  disconnected: number // on_shift_offline (đang trong ca + mất heartbeat)
  off_shift: number   // not_on_shift + shift_stale
  total: number
}

export function useStaffStatusStats(staffList: StaffWithStatus[] | undefined): StaffPresenceStats {
  const stats: StaffPresenceStats = {
    available: 0,
    busy: 0,
    disconnected: 0,
    off_shift: 0,
    total: 0,
  }

  if (!staffList) return stats

  staffList.forEach(staff => {
    stats.total++
    switch (staff.presence_state) {
      case 'on_shift_available': stats.available++; break
      case 'on_shift_busy': stats.busy++; break
      case 'on_shift_offline': stats.disconnected++; break
      case 'shift_stale':
      case 'not_on_shift':
      default: stats.off_shift++; break
    }
  })

  return stats
}

