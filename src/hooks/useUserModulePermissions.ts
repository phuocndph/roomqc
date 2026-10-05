import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export interface PermissionSummary {
  module: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_export: boolean
  can_approve: boolean
  can_assign: boolean
  can_manage: boolean
}

export function useUserModulePermissions() {
  const { user } = useUser()
  
  return useQuery({
    queryKey: ['user-module-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      
      const { data, error } = await supabase.rpc(
        'get_user_permissions_summary' as any,
        { p_user_id: user.id }
      )
      
      if (error) throw error
      
      return (data || []) as unknown as PermissionSummary[]
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes - balance between performance and responsiveness for 100+ users
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  })
}
