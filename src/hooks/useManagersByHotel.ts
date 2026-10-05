import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'

interface Manager {
  id: string
  full_name: string
  email: string
}

export function useManagersByHotel(hotelId: string | null | undefined) {
  const { tenant } = useTenant()

  return useQuery({
    queryKey: ['managers-by-hotel', tenant?.id, hotelId],
    queryFn: async () => {
      if (!tenant?.id || !hotelId) {
        return []
      }

      // Get managers assigned to this hotel via user_hotels
      const { data, error } = await supabase
        .from('user_hotels')
        .select(`
          user:users!user_hotels_user_id_fkey(
            id,
            full_name,
            email,
            user_level_code
          )
        `)
        .eq('hotel_id', hotelId)

      if (error) throw error

      // Filter to only managers
      const managers = (data || [])
        .map(item => item.user)
        .filter((user): user is Manager & { user_level_code: string } => 
          user !== null &&
          (user.user_level_code === 'manager' || user.user_level_code === 'department_manager')
        )
        .map(user => ({
          id: user.id,
          full_name: user.full_name,
          email: user.email,
        }))

      return managers
    },
    enabled: !!tenant?.id && !!hotelId,
    // Don't keep previous data when hotel changes - prevents showing old managers
    placeholderData: undefined,
  })
}
