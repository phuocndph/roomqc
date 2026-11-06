import { useQuery, type QueryClient } from '@tanstack/react-query'
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

export const USER_MODULE_PERMISSIONS_KEY = 'user-module-permissions'

/**
 * Effective permissions drive what navigation (Sidebar, MobileSidebar,
 * MobileBottomNav, "More" page) exposes. A revoked grant must disappear
 * without waiting for a long cache window, so the summary is always treated
 * as stale and re-read whenever a consumer mounts, the window regains focus
 * or the network reconnects. Background refetches keep the previous data, so
 * this does not flash the fail-closed loading skeleton.
 */
export const userModulePermissionsQueryOptions = {
  staleTime: 0,
  gcTime: 10 * 60 * 1000,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
}

export function useUserModulePermissions() {
  const { user } = useUser()

  return useQuery({
    queryKey: [USER_MODULE_PERMISSIONS_KEY, user?.id],
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
    ...userModulePermissionsQueryOptions,
  })
}

/**
 * Invalidate every cached view of effective permissions after a change that
 * can alter them (direct grants, role grants, user level). Without a userId
 * every user's summary is invalidated, which is required for role-wide edits.
 */
export function invalidateEffectivePermissions(queryClient: QueryClient, userId?: string) {
  queryClient.invalidateQueries({ queryKey: [USER_MODULE_PERMISSIONS_KEY] })
  if (userId) {
    queryClient.invalidateQueries({ queryKey: ['route-permission', userId] })
    queryClient.invalidateQueries({ queryKey: ['check-permission', userId] })
  } else {
    queryClient.invalidateQueries({ queryKey: ['route-permission'] })
    queryClient.invalidateQueries({ queryKey: ['check-permission'] })
  }
}
