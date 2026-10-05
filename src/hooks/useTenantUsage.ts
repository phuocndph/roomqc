import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface TenantUsage {
  id: string
  tenant_id: string
  current_hotels_count: number
  current_users_count: number
  current_rooms_count: number
  current_items_count: number
  current_storage_bytes: number
  peak_hotels_count: number
  peak_users_count: number
  peak_storage_bytes: number
  last_calculated_at: string
  updated_at: string
}

export interface QuotaCheck {
  canAdd: boolean
  currentUsage: number
  limit: number | null
  resourceType: string
}

// Fetch tenant usage statistics
export function useTenantUsage() {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['tenant-usage', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .from('tenant_usage')
        .select('*')
        .eq('tenant_id', tenant.id)
        .single()
      
      if (error) throw error
      return data as TenantUsage
    },
    enabled: !!tenant?.id,
  })
}

// Check if tenant can add a resource
export function useCheckQuota(resourceType: 'hotel' | 'user' | 'room' | 'item' | 'storage') {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['check-quota', tenant?.id, resourceType],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('check_tenant_can_add', {
          p_tenant_id: tenant.id,
          p_resource_type: resourceType,
        })
      
      if (error) throw error
      return data as boolean
    },
    enabled: !!tenant?.id,
    staleTime: 0, // Always fresh to reflect latest subscription changes
    gcTime: 0, // Don't cache
  })
}

// Update tenant usage (recalculate)
export function useUpdateTenantUsage() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  
  return useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { error } = await supabase
        .rpc('update_tenant_usage', {
          p_tenant_id: tenant.id,
        })
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-usage', tenant?.id] })
      toast({
        title: 'Đã cập nhật',
        description: 'Thống kê sử dụng đã được cập nhật',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

// Calculate storage used
export function useCalculateStorage() {
  const { tenant } = useTenant()
  
  return useQuery({
    queryKey: ['tenant-storage', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase
        .rpc('calculate_tenant_storage', {
          p_tenant_id: tenant.id,
        })
      
      if (error) throw error
      return data as number
    },
    enabled: !!tenant?.id,
  })
}

// Helper to format storage size
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

// Helper to calculate usage percentage
export function calculateUsagePercentage(current: number, limit: number | null): number {
  if (limit === null) return 0 // Unlimited
  if (limit === 0) return 100
  return Math.min(Math.round((current / limit) * 100), 100)
}
