import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'

interface PendingDistribution {
  room_id: string
  count: number
}

export function usePendingRoomDistributions() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['pending-room-distributions', selectedHotel?.id, isAllHotelsMode],
    queryFn: async () => {
      // Get distribution_order_rooms with status pending or delivered
      let query = supabase
        .from('distribution_order_rooms')
        .select(`
          room_id,
          status,
          distribution_orders!distribution_order_rooms_distribution_order_id_fkey(hotel_id, status)
        `)
        .in('status', ['pending', 'delivered'])
        .neq('distribution_orders.status', 'cancelled')

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('distribution_orders.hotel_id', selectedHotel.id)
      }

      const { data, error } = await query

      if (error) throw error

      // Group by room_id and count
      const countMap = new Map<string, number>()
      data?.forEach((item) => {
        const current = countMap.get(item.room_id) || 0
        countMap.set(item.room_id, current + 1)
      })

      return countMap
    },
    staleTime: 30000, // 30 seconds
  })
}
