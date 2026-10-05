import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'

export interface FloorPlanBooking {
  id: string
  guest_name: string | null
  guest_count: number | null
  guest_phone?: string | null
  actual_check_in?: string | null
  check_in_date: string
  check_out_date?: string
  expected_check_in_time?: string | null
  expected_check_out_time?: string | null
  booking_source?: string | null
  booking_group_id?: string | null
  total_amount?: number | null
  amount_paid?: number | null
  deposit_amount?: number | null
  status: string
}

export interface FloorPlanRoom {
  id: string
  room_number: string
  room_type: string
  status: string
  open_tasks?: number
  open_hk_tasks?: number
  open_maintenance?: number
  current_booking: FloorPlanBooking | null
  next_booking: FloorPlanBooking | null
}

export type FloorPlanLiveData = Record<string, FloorPlanRoom[]>

export function useFloorPlanLive() {
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()
  const hotelId = selectedHotel?.id

  const query = useQuery({
    queryKey: ['floor-plan-live', hotelId],
    queryFn: async (): Promise<FloorPlanLiveData> => {
      if (!hotelId) return {}
      const { data, error } = await supabase.rpc('get_floor_plan_live', { p_hotel_id: hotelId })
      if (error) throw error
      return ((data as unknown) as FloorPlanLiveData) || {}
    },
    enabled: !!hotelId,
    staleTime: 30_000,
  })

  // Realtime invalidation
  useEffect(() => {
    if (!hotelId) return
    let t: ReturnType<typeof setTimeout> | null = null
    const invalidate = () => {
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['floor-plan-live', hotelId] })
      }, 400)
    }
    const channel = supabase
      .channel(`floor-plan:${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `hotel_id=eq.${hotelId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_bookings', filter: `hotel_id=eq.${hotelId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'housekeeping_tasks', filter: `hotel_id=eq.${hotelId}` }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests', filter: `hotel_id=eq.${hotelId}` }, invalidate)
      .subscribe()
    return () => {
      if (t) clearTimeout(t)
      supabase.removeChannel(channel)
    }
  }, [hotelId, queryClient])

  return query
}
