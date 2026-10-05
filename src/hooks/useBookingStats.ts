import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTenant } from '@/hooks/useTenant'
import { format, startOfDay, endOfDay } from 'date-fns'

export interface BookingStats {
  totalRooms: number
  occupiedRooms: number
  vacantRooms: number
  checkInsToday: number
  checkOutsToday: number
  todayRevenue: number
  projectedRevenue: number
  occupancyRate: number
}

export interface TodayCheckout {
  id: string
  guest_name: string
  guest_phone: string | null
  room_number: string
  room_id: string
  check_out_date: string
  room_price: number
  extra_charges: number
  total_amount: number
  payment_status: string
}

export interface TodayCheckin {
  id: string
  guest_name: string
  guest_phone: string | null
  room_number: string
  room_id: string
  check_in_date: string
  guest_count: number
}

export function useBookingStats() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { tenant } = useTenant()
  const hotelId = selectedHotel?.id
  const tenantId = tenant?.id
  const today = format(new Date(), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['booking-stats', hotelId, isAllHotelsMode, today],
    queryFn: async (): Promise<BookingStats> => {
      // Run all 5 queries in parallel
      let roomsQuery = supabase.from('rooms').select('id', { count: 'exact' }).eq('tenant_id', tenantId)
      if (!isAllHotelsMode && hotelId) {
        roomsQuery = roomsQuery.eq('hotel_id', hotelId)
      }

      let occupiedQuery = supabase
        .from('room_bookings')
        .select('id, room_price, extra_charges, total_amount', { count: 'exact' })
        .eq('status', 'checked_in')
        .eq('tenant_id', tenantId)
      if (!isAllHotelsMode && hotelId) {
        occupiedQuery = occupiedQuery.eq('hotel_id', hotelId)
      }

      let checkInQuery = supabase
        .from('room_bookings')
        .select('id', { count: 'exact' })
        .eq('status', 'confirmed')
        .eq('check_in_date', today)
        .eq('tenant_id', tenantId)
      if (!isAllHotelsMode && hotelId) {
        checkInQuery = checkInQuery.eq('hotel_id', hotelId)
      }

      let checkOutQuery = supabase
        .from('room_bookings')
        .select('id, total_amount, payment_status', { count: 'exact' })
        .eq('status', 'checked_in')
        .eq('check_out_date', today)
        .eq('tenant_id', tenantId)
      if (!isAllHotelsMode && hotelId) {
        checkOutQuery = checkOutQuery.eq('hotel_id', hotelId)
      }

      // Revenue from booking_payments (actual money received today)
      let revenueQuery = supabase
        .from('booking_payments')
        .select('amount')
        .eq('payment_status', 'completed')
        .eq('tenant_id', tenantId)
        .gte('paid_at', startOfDay(new Date()).toISOString())
        .lte('paid_at', endOfDay(new Date()).toISOString())
      if (!isAllHotelsMode && hotelId) {
        revenueQuery = revenueQuery.eq('hotel_id', hotelId)
      }

      const [roomsResult, occupiedResult, checkInResult, checkOutResult, revenueResult] = await Promise.all([
        roomsQuery,
        occupiedQuery,
        checkInQuery,
        checkOutQuery,
        revenueQuery,
      ])

      const totalRooms = roomsResult.count
      const occupiedRooms = occupiedResult.count
      const occupiedBookings = occupiedResult.data
      const checkInsToday = checkInResult.count
      const checkOutsToday = checkOutResult.count
      const paidPayments = revenueResult.data

      const todayRevenue = paidPayments?.reduce((sum, b) => sum + (b.amount || 0), 0) || 0

      // Projected revenue = currently occupied bookings
      const projectedRevenue = occupiedBookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0

      const total = totalRooms || 0
      const occupied = occupiedRooms || 0
      const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0

      return {
        totalRooms: total,
        occupiedRooms: occupied,
        vacantRooms: total - occupied,
        checkInsToday: checkInsToday || 0,
        checkOutsToday: checkOutsToday || 0,
        todayRevenue,
        projectedRevenue,
        occupancyRate,
      }
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useTodayCheckouts() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { tenant } = useTenant()
  const hotelId = selectedHotel?.id
  const tenantId = tenant?.id
  const today = format(new Date(), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['today-checkouts', hotelId, isAllHotelsMode, today],
    queryFn: async (): Promise<TodayCheckout[]> => {
      let query = supabase
        .from('room_bookings')
        .select(`
          id,
          guest_name,
          guest_phone,
          room_id,
          check_out_date,
          room_price,
          extra_charges,
          total_amount,
          payment_status,
          room:rooms(room_number)
        `)
        .eq('status', 'checked_in')
        .eq('check_out_date', today)
        .eq('tenant_id', tenantId)
        .order('check_out_date', { ascending: true })

      if (!isAllHotelsMode && hotelId) {
        query = query.eq('hotel_id', hotelId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching today checkouts:', error)
        return []
      }

      return (data || []).map((b: any) => ({
        id: b.id,
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        room_number: b.room?.room_number || '',
        room_id: b.room_id,
        check_out_date: b.check_out_date,
        room_price: b.room_price || 0,
        extra_charges: b.extra_charges || 0,
        total_amount: b.total_amount || 0,
        payment_status: b.payment_status || 'pending',
      }))
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  })
}

export function useTodayCheckins() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { tenant } = useTenant()
  const hotelId = selectedHotel?.id
  const tenantId = tenant?.id
  const today = format(new Date(), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['today-checkins', hotelId, isAllHotelsMode, today],
    queryFn: async (): Promise<TodayCheckin[]> => {
      let query = supabase
        .from('room_bookings')
        .select(`
          id,
          guest_name,
          guest_phone,
          room_id,
          check_in_date,
          guest_count,
          room:rooms(room_number)
        `)
        .eq('status', 'confirmed')
        .eq('check_in_date', today)
        .eq('tenant_id', tenantId)
        .order('check_in_date', { ascending: true })

      if (!isAllHotelsMode && hotelId) {
        query = query.eq('hotel_id', hotelId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching today checkins:', error)
        return []
      }

      return (data || []).map((b: any) => ({
        id: b.id,
        guest_name: b.guest_name,
        guest_phone: b.guest_phone,
        room_number: b.room?.room_number || '',
        room_id: b.room_id,
        check_in_date: b.check_in_date,
        guest_count: b.guest_count,
      }))
    },
    enabled: !!tenantId,
    staleTime: 60 * 1000,
  })
}
