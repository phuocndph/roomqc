import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useHotelContext } from '@/contexts/HotelContext'
import type { FloorPlanData } from '@/types/rooms.types'

export function useFloorPlan() {
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id
  
  return useQuery({
    queryKey: ['floor-plan', hotelId],
    queryFn: async () => {
      if (!hotelId) throw new Error('No hotel selected')
      
      const { data, error } = await supabase
        .rpc('get_floor_plan', {
          p_hotel_id: hotelId,
        })
      
      if (error) throw error
      return data as FloorPlanData
    },
    enabled: !!hotelId,
  })
}
