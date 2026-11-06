import { useQuery } from '@tanstack/react-query'
import { addDays, format, subDays } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import { readAllPages } from '@/lib/readAllPages'
import type { BookingWithRoom } from '@/pages/bookings/BookingsPage'

export interface BookingListFilters {
  tenantId?: string
  hotelId?: string
  allHotels: boolean
  status: string
  dateRange: '7d' | '30d' | '90d' | 'all'
}

export async function fetchBookingList(filters: BookingListFilters, signal?: AbortSignal) {
  const { tenantId, hotelId, allHotels, status, dateRange } = filters
  if (!tenantId || (!allHotels && !hotelId)) throw new Error('Vui lòng chọn khách sạn trước khi xem đặt phòng')
  // Compute dates once for all pages, even if a long read crosses midnight.
  const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
  const fromDate = format(subDays(new Date(), days), 'yyyy-MM-dd')
  const toDate = format(addDays(new Date(), 30), 'yyyy-MM-dd')
  const active = ['checked_in', 'conflict', 'overdue', 'overdue_checkin'].includes(status)
  return readAllPages<BookingWithRoom>((from, to) => {
    let query = supabase.from('room_bookings')
      .select('*, room:rooms(room_number, room_type, floor, status)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('check_in_date', { ascending: false }).order('id', { ascending: true })
    if (!allHotels) query = query.eq('hotel_id', hotelId)
    if (status === 'conflict' || status === 'overdue') query = query.eq('status', 'checked_in')
    else if (status === 'overdue_checkin') query = query.eq('status', 'confirmed')
    else if (status !== 'all') query = query.eq('status', status)
    if (!active && dateRange !== 'all') {
      query = status === 'all'
        ? query.or(`and(check_in_date.gte.${fromDate},check_in_date.lte.${toDate}),status.eq.checked_in`)
        : query.gte('check_in_date', fromDate).lte('check_in_date', toDate)
    }
    query = query.range(from, to)
    return (signal ? query.abortSignal(signal) : query).returns<BookingWithRoom[]>()
  }, { signal })
}

export function useBookingList(filters: BookingListFilters) {
  return useQuery({
    queryKey: ['all-bookings', filters.tenantId, filters.allHotels ? 'all' : filters.hotelId, filters.status, filters.dateRange],
    queryFn: ({ signal }) => fetchBookingList(filters, signal),
    enabled: !!filters.tenantId && (filters.allHotels || !!filters.hotelId),
    staleTime: 30_000,
  })
}
