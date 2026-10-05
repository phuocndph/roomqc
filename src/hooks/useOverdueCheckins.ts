import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useQueryClient } from '@tanstack/react-query'

export interface OverdueCheckin {
  id: string
  tenant_id: string
  hotel_id: string
  room_id: string
  guest_name: string
  guest_phone: string | null
  check_in_date: string
  check_out_date: string
  expected_check_in_time: string | null
  status: string
  deposit_amount: number | null
  total_amount: number | null
  booking_group_id: string | null
  hours_overdue: number
}

/**
 * Booking đã quá giờ check-in (status confirmed, qua ngày hoặc qua expected_check_in_time).
 * Truy vấn view `v_overdue_checkins` (RLS theo room_bookings).
 */
export function useOverdueCheckins() {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const qc = useQueryClient()
  const tenantId = tenant?.id
  const hotelId = selectedHotel?.id

  const query = useQuery({
    queryKey: ['overdue-checkins', tenantId, hotelId, isAllHotelsMode],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<OverdueCheckin[]> => {
      let q = supabase
        .from('v_overdue_checkins' as any)
        .select(
          'id, tenant_id, hotel_id, room_id, guest_name, guest_phone, check_in_date, check_out_date, expected_check_in_time, status, deposit_amount, total_amount, booking_group_id, hours_overdue',
        )
        .eq('tenant_id', tenantId!)
        .order('hours_overdue', { ascending: false })

      if (!isAllHotelsMode && hotelId) q = q.eq('hotel_id', hotelId)

      const { data, error } = await q
      if (error) {
        console.error('useOverdueCheckins error', error)
        return []
      }
      return ((data as any) || []) as OverdueCheckin[]
    },
  })

  // Realtime invalidate khi room_bookings đổi
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`overdue-checkins-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_bookings' },
        () => qc.invalidateQueries({ queryKey: ['overdue-checkins'] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, qc])

  return query
}

export function useOverdueCheckinsCount() {
  const { data } = useOverdueCheckins()
  return data?.length ?? 0
}
