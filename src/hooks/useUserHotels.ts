import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface UserHotel {
  user_id: string
  hotel_id: string
  assigned_at: string | null
  assigned_by: string | null
  can_create_managers: boolean
  can_create_staff: boolean
  can_view_reports: boolean
  can_export_data: boolean
  can_approve_requests: boolean
  hotel?: {
    id: string
    name: string
    code: string
    status: string
  }
}

export function useUserHotels(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-hotels', userId],
    queryFn: async () => {
      if (!userId) return []
      
      const { data, error } = await supabase
        .from('user_hotels')
        .select(`
          *,
          hotel:hotels(id, name, code, status)
        `)
        .eq('user_id', userId)
      
      if (error) throw error
      return data as UserHotel[]
    },
    enabled: !!userId,
  })
}
