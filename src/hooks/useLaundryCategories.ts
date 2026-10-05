import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface LaundryCategory {
  id: string
  tenant_id: string
  name: string
  code: string
  description?: string
  price_per_kg?: number
  price_per_item?: number
  standard_turnaround_hours: number
  express_turnaround_hours?: number
  express_surcharge?: number
  require_count_verification: boolean
  require_weight_verification: boolean
  display_order: number
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export const useLaundryCategories = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['laundry-categories', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('laundry_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order')

      if (error) throw error
      return data as LaundryCategory[]
    },
    enabled: !!tenantId,
  })
}

export const useCreateLaundryCategory = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (category: Partial<LaundryCategory>) => {
      const { data, error } = await supabase
        .from('laundry_categories')
        .insert([{ ...category, tenant_id: tenantId } as any])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laundry-categories'] })
      toast.success('Category created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create category')
    },
  })
}
