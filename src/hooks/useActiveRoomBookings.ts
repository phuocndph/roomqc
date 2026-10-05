import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

export interface ActiveBooking {
  id: string
  room_id: string
  guest_name: string
  guest_count: number | null
  check_out_date: string // YYYY-MM-DD
  expected_check_out_time: string | null // HH:MM:SS
  actual_check_in: string | null
  booking_group_id: string | null
}

/**
 * Lấy danh sách booking đang `checked_in` cho hotel hiện tại,
 * trả về Map<room_id, ActiveBooking>. Realtime invalidate khi room_bookings thay đổi.
 */
export function useActiveRoomBookings(hotelId?: string | null) {
  const { user } = useUser()
  const tenantId = user?.tenant_id
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['active-room-bookings', tenantId, hotelId],
    enabled: !!tenantId && !!hotelId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_bookings')
        .select('id, room_id, guest_name, guest_count, check_out_date, expected_check_out_time, actual_check_in, booking_group_id')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('status', 'checked_in')


      if (error) throw error
      const map = new Map<string, ActiveBooking>()
      for (const row of (data || []) as ActiveBooking[]) {
        // Nếu cùng phòng có >1 booking active (lạ), giữ cái checkout sớm nhất
        const existing = map.get(row.room_id)
        if (!existing) {
          map.set(row.room_id, row)
        } else {
          const a = `${existing.check_out_date}T${existing.expected_check_out_time ?? '12:00:00'}`
          const b = `${row.check_out_date}T${row.expected_check_out_time ?? '12:00:00'}`
          if (b < a) map.set(row.room_id, row)
        }
      }
      return map
    },
  })

  useEffect(() => {
    if (!tenantId || !hotelId) return
    const channel = supabase
      .channel(`active-bookings-${hotelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` },
        () => qc.invalidateQueries({ queryKey: ['active-room-bookings', tenantId, hotelId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, hotelId, qc])

  return query
}

/**
 * Tính phút còn lại đến giờ trả phòng. Âm = đã quá giờ.
 */
export function minutesUntilCheckout(b: Pick<ActiveBooking, 'check_out_date' | 'expected_check_out_time'>, now = new Date()): number {
  const time = b.expected_check_out_time || '12:00:00'
  // Build local datetime
  const dt = new Date(`${b.check_out_date}T${time}`)
  return Math.round((dt.getTime() - now.getTime()) / 60000)
}

/**
 * Format HH:MM từ "HH:MM:SS"
 */
export function formatCheckoutTime(time: string | null | undefined): string {
  if (!time) return '12:00'
  return time.slice(0, 5)
}
