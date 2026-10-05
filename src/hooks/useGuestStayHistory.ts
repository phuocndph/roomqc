import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'

export interface GuestStayHistoryItem {
  id: string
  check_in_date: string
  check_out_date: string
  status: string
  total_amount: number | null
  room_number: string | null
}

/**
 * Lịch sử lưu trú theo phone hoặc guest_id_number (loại trừ booking hiện tại)
 */
export function useGuestStayHistory(
  excludeBookingId: string | undefined,
  guestPhone: string | null | undefined,
  guestIdNumber: string | null | undefined,
) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery({
    queryKey: ['guest-stay-history', tenantId, guestPhone, guestIdNumber, excludeBookingId],
    queryFn: async (): Promise<GuestStayHistoryItem[]> => {
      if (!tenantId || (!guestPhone && !guestIdNumber)) return []

      const filters: string[] = []
      if (guestPhone) filters.push(`guest_phone.eq.${guestPhone}`)
      if (guestIdNumber) filters.push(`guest_id_number.eq.${guestIdNumber}`)

      let query = supabase
        .from('room_bookings')
        .select('id, check_in_date, check_out_date, status, total_amount, room:rooms(room_number)')
        .eq('tenant_id', tenantId)
        .or(filters.join(','))
        .order('check_in_date', { ascending: false })
        .limit(20)

      if (excludeBookingId) {
        query = query.neq('id', excludeBookingId)
      }

      const { data, error } = await query
      if (error) {
        console.error('Error fetching guest stay history:', error)
        return []
      }

      return (data || []).map((b: any) => ({
        id: b.id,
        check_in_date: b.check_in_date,
        check_out_date: b.check_out_date,
        status: b.status,
        total_amount: b.total_amount,
        room_number: b.room?.room_number || null,
      }))
    },
    enabled: !!tenantId && !!(guestPhone || guestIdNumber),
  })
}
