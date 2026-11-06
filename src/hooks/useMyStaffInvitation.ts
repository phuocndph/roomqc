import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'

export function useMyStaffInvitation(enabled: boolean) {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['my-staff-invitation', user?.id], enabled: enabled && !!user,
    retry: 1, staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('staff-invitations', { body: { action: 'mine' } })
      if (error) throw new Error('Không thể kiểm tra lời mời tài khoản.')
      return data.invitation as { id: string; name: string; passwordReady: boolean; expired: boolean; revoked?: boolean } | null
    },
  })
  // React Query retains cached data when disabled. Once the profile exists,
  // an old pending-invitation result must not block normal app navigation.
  return { ...query, data: enabled ? query.data : null, isLoading: enabled && query.isLoading, isError: enabled && query.isError }
}
