import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

interface Subordinate {
  id: string
  full_name: string
  email: string
  user_level_code: string
  created_at: string
  subordinate_count: number
}

export function useSubordinates(userId?: string) {
  return useQuery({
    queryKey: ['subordinates', userId],
    queryFn: async () => {
      if (!userId) return []
      
      const { data, error } = await supabase
        .rpc('get_user_subordinates' as any, {
          p_user_id: userId
        }) as any

      if (error) throw error
      return data as Subordinate[]
    },
    enabled: !!userId,
  })
}

export function useHasSubordinates(userId?: string) {
  return useQuery({
    queryKey: ['has-subordinates', userId],
    queryFn: async () => {
      if (!userId) return false
      
      const { data, error } = await supabase
        .rpc('user_has_subordinates' as any, {
          p_user_id: userId
        }) as any

      if (error) throw error
      return data as boolean
    },
    enabled: !!userId,
  })
}