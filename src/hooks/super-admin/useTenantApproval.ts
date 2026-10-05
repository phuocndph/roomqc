import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface PendingTenant {
  tenant_id: string
  tenant_name: string
  owner_name: string
  owner_email: string
  created_at: string
  subscription_tier: string
}

export function usePendingTenants() {
  return useQuery({
    queryKey: ['pending-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_tenants' as any)
      
      if (error) throw error
      return data as PendingTenant[]
    },
  })
}

export function useApproveTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tenantId, adminId }: { tenantId: string; adminId: string }) => {
      const { data, error } = await supabase.rpc('approve_tenant' as any, {
        p_tenant_id: tenantId,
        p_admin_id: adminId,
      })

      if (error) throw error
      return data
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success('Đã phê duyệt doanh nghiệp thành công')
        queryClient.invalidateQueries({ queryKey: ['pending-tenants'] })
        queryClient.invalidateQueries({ queryKey: ['tenants'] })
      } else {
        toast.error(data.error || 'Không thể phê duyệt')
      }
    },
    onError: (error: Error) => {
      toast.error('Lỗi: ' + error.message)
    },
  })
}

export function useRejectTenant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      tenantId, 
      adminId, 
      reason 
    }: { 
      tenantId: string
      adminId: string
      reason: string 
    }) => {
      const { data, error } = await supabase.rpc('reject_tenant' as any, {
        p_tenant_id: tenantId,
        p_admin_id: adminId,
        p_reason: reason,
      })

      if (error) throw error
      return data
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast.success('Đã từ chối doanh nghiệp')
        queryClient.invalidateQueries({ queryKey: ['pending-tenants'] })
        queryClient.invalidateQueries({ queryKey: ['tenants'] })
      } else {
        toast.error(data.error || 'Không thể từ chối')
      }
    },
    onError: (error: Error) => {
      toast.error('Lỗi: ' + error.message)
    },
  })
}
