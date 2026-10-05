import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { startOfDay } from 'date-fns'
import type { HousekeepingTaskWithDetails } from '@/types/housekeeping.types'

export function useCompletedTasksToday() {
  const { user } = useUser()
  const userId = user?.id
  const { selectedHotel } = useHotelContext()

  return useQuery({
    queryKey: ['completed-tasks-today', userId, selectedHotel?.id],
    queryFn: async () => {
      if (!userId) return []

      const todayStart = startOfDay(new Date()).toISOString()

      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          *,
          room:rooms(id, room_number, floor, room_type)
        `)
        .eq('assigned_to', userId)
        .eq('status', 'completed')
        .gte('completed_at', todayStart)
        .order('completed_at', { ascending: false })

      if (selectedHotel?.id) {
        q = q.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await q
      if (error) throw error
      return data as unknown as HousekeepingTaskWithDetails[]
    },
    enabled: !!userId,
  })
}
