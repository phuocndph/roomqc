import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'

export const useTenant = () => {
  const { tenantId } = useUser()

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: async () => {
      if (!tenantId) return null

      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,      // 5 minutes - tenant info rarely changes
    gcTime: 10 * 60 * 1000,         // 10 minutes
    refetchOnWindowFocus: false,
  })

  return {
    tenant,
    isLoading,
    error,
  }
}
