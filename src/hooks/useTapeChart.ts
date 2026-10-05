import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'

export interface TapeChartRoom {
  id: string
  room_number: string
  floor: number
  room_type: string
  status: string
  base_price: number | null
  max_guests: number | null
  bed_type: string | null
}

export interface TapeChartBooking {
  id: string
  room_id: string
  guest_name: string
  guest_phone: string | null
  guest_count: number | null
  check_in_date: string
  check_out_date: string
  expected_check_in_time: string | null
  expected_check_out_time: string | null
  actual_check_in: string | null
  actual_check_out: string | null
  status: 'confirmed' | 'checked_in' | 'checked_out'
  payment_status: string | null
  booking_source: string | null
  booking_group_id: string | null
  total_amount: number | null
  amount_paid: number | null
  deposit_amount: number | null
  notes: string | null
}

export type RoomBlockType = 'ooo' | 'oos' | 'vip_hold' | 'maintenance' | 'other'

export interface RoomBlock {
  id: string
  room_id: string
  start_date: string
  end_date: string
  block_type: RoomBlockType
  reason: string | null
  created_at: string
  created_by: string | null
}

export interface TapeChartData {
  start_date: string
  days: number
  rooms: TapeChartRoom[]
  bookings: TapeChartBooking[]
  room_blocks: RoomBlock[]
}

export function useTapeChart(startDate: string, days: number) {
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id
  const queryClient = useQueryClient()
  const key = ['tape-chart', hotelId, startDate, days] as const

  useEffect(() => {
    if (!hotelId) return
    const channel = supabase
      .channel(`tape-chart-${hotelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` },
        () => queryClient.invalidateQueries({ queryKey: ['tape-chart', hotelId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `hotel_id=eq.${hotelId}` },
        () => queryClient.invalidateQueries({ queryKey: ['tape-chart', hotelId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_blocks', filter: `hotel_id=eq.${hotelId}` },
        () => queryClient.invalidateQueries({ queryKey: ['tape-chart', hotelId] })
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [hotelId, queryClient])

  return useQuery({
    queryKey: key,
    enabled: !!hotelId,
    staleTime: 30_000,
    queryFn: async (): Promise<TapeChartData> => {
      const { data, error } = await supabase.rpc('get_tape_chart' as any, {
        p_hotel_id: hotelId!,
        p_start_date: startDate,
        p_days: days,
      })
      if (error) throw error
      const d = data as any
      return {
        start_date: d.start_date,
        days: d.days,
        rooms: d.rooms || [],
        bookings: d.bookings || [],
        room_blocks: d.room_blocks || [],
      }
    },
  })
}
