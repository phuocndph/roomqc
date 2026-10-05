import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

export interface CheckoutRoomItem {
  roomId: string
  roomNumber: string
  guestName: string | null
  expectedTime: string | null // HH:MM
}

export interface MissingRoomItem {
  roomId: string
  roomNumber: string
  missingCount: number
}

export interface RejectedTaskItem {
  taskId: string
  roomNumber: string | null
  assigneeName: string | null
  rejectedAt: string | null
}

export interface UrgentTaskItem {
  taskId: string
  roomNumber: string | null
  title: string
  status: string
}

export interface ActionBuckets {
  checkoutNotCleaned: CheckoutRoomItem[]   // phòng đã checkout/đang dirty + booking hôm nay
  missingItems: MissingRoomItem[]          // top phòng thiếu đồ (chưa có khách)
  rejectedQc: RejectedTaskItem[]           // task QC bị từ chối 7 ngày
  urgent: UrgentTaskItem[]                 // task priority urgent đang mở
}

const DIRTY_SET = new Set(['vacant_dirty', 'cleaning', 'occupied_dirty', 'check_out'])
const OCCUPIED_SET = new Set(['occupied', 'occupied_clean', 'occupied_dirty', 'dnd', 'sleep_out', 'service_refused'])

/**
 * 4 bucket "Cần xử lý ngay" cho cockpit Trưởng buồng phòng.
 */
export function useRoomsNeedingActionToday(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()

  const query = useQuery<ActionBuckets>({
    queryKey: ['hk-action-buckets', tenantId, hotelId],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()

      const [roomsRes, bookingsTodayRes, rejectedRes, urgentRes] = await Promise.all([
        supabase.rpc('get_rooms_filtered', {
          p_tenant_id: tenantId!,
          p_hotel_id: hotelId!,
          p_floor: null,
          p_room_type: null,
          p_status: null,
          p_search: null,
          p_missing_items_only: false,
        }),
        supabase
          .from('room_bookings')
          .select('id, room_id, guest_name, expected_check_out_time, status, check_out_date')
          .eq('tenant_id', tenantId!)
          .eq('hotel_id', hotelId!)
          .eq('check_out_date', today)
          .in('status', ['checked_out', 'checked_in']),
        supabase
          .from('housekeeping_tasks')
          .select('id, status, updated_at, room:rooms(room_number), assigned_user:users!housekeeping_tasks_assigned_to_fkey(full_name)')
          .eq('tenant_id', tenantId!)
          .eq('hotel_id', hotelId!)
          .eq('status', 'rejected')
          .gte('updated_at', sevenDaysAgo)
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase
          .from('housekeeping_tasks')
          .select('id, status, priority, title, room:rooms(room_number)')
          .eq('tenant_id', tenantId!)
          .eq('hotel_id', hotelId!)
          .eq('priority', 'urgent')
          .in('status', ['todo', 'in_progress', 'pending', 'assigned'])
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      if (roomsRes.error) throw roomsRes.error
      if (bookingsTodayRes.error) throw bookingsTodayRes.error
      if (rejectedRes.error) throw rejectedRes.error
      if (urgentRes.error) throw urgentRes.error

      const rooms = (roomsRes.data || []) as Array<{
        id: string
        room_number: string
        status: string
        missing_items: number | null
      }>
      const roomMap = new Map(rooms.map((r) => [r.id, r]))

      // 1) Checkout chưa dọn: booking hôm nay + room đang dirty/cleaning
      const checkoutNotCleaned: CheckoutRoomItem[] = []
      for (const b of bookingsTodayRes.data || []) {
        const room = roomMap.get(b.room_id as string)
        if (!room) continue
        if (!DIRTY_SET.has(room.status)) continue
        checkoutNotCleaned.push({
          roomId: room.id,
          roomNumber: room.room_number,
          guestName: b.guest_name,
          expectedTime: (b.expected_check_out_time || '').slice(0, 5) || null,
        })
      }
      checkoutNotCleaned.sort((a, b) => (a.expectedTime || '99').localeCompare(b.expectedTime || '99'))

      // 2) Thiếu đồ: phòng không có khách + missing > 0, top 8
      const missingItems: MissingRoomItem[] = rooms
        .filter((r) => !OCCUPIED_SET.has(r.status) && (r.missing_items || 0) > 0)
        .sort((a, b) => (b.missing_items || 0) - (a.missing_items || 0))
        .slice(0, 8)
        .map((r) => ({ roomId: r.id, roomNumber: r.room_number, missingCount: r.missing_items || 0 }))

      // 3) QC không đạt
      const rejectedQc: RejectedTaskItem[] = (rejectedRes.data || []).map((t: any) => ({
        taskId: t.id,
        roomNumber: t.room?.room_number ?? null,
        assigneeName: t.assigned_user?.full_name ?? null,
        rejectedAt: t.updated_at,
      }))

      // 4) Task khẩn
      const urgent: UrgentTaskItem[] = (urgentRes.data || []).map((t: any) => ({
        taskId: t.id,
        roomNumber: t.room?.room_number ?? null,
        title: t.title,
        status: t.status,
      }))

      return { checkoutNotCleaned, missingItems, rejectedQc, urgent }
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const channel = supabase
      .channel(`hk-buckets-${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-action-buckets', tenantId, hotelId] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-action-buckets', tenantId, hotelId] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `hotel_id=eq.${hotelId}` }, () =>
        qc.invalidateQueries({ queryKey: ['hk-action-buckets', tenantId, hotelId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, hotelId, qc])

  return query
}
