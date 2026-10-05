import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface UserLevel {
  id: string
  code: string
  name: string
  hierarchy_level: number
  description: string
}

export function useUserLevels() {
  return useQuery({
    queryKey: ['user-levels'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_levels' as any) as any

      if (error) throw error
      return data as UserLevel[]
    },
    staleTime: Infinity, // User levels rarely change
  })
}

export function useAvailableUserLevels() {
  return useQuery({
    queryKey: ['available-user-levels'],
    queryFn: async () => {
      // Fetch all levels and filter super_admin on client side
      const { data, error } = await supabase.rpc('get_user_levels' as any) as any

      if (error) throw error
      const allLevels = data as UserLevel[]
      return allLevels.filter(level => level.code !== 'super_admin')
    },
    staleTime: Infinity,
  })
}
