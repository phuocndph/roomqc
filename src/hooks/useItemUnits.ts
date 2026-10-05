import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface ItemUnit {
  id: string
  tenant_id: string
  name: string
  code: string
  symbol?: string
  type: 'count' | 'weight' | 'volume' | 'length'
  base_unit_id?: string
  conversion_factor?: number
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export const useItemUnits = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['item-units', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('item_units')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name')

      if (error) throw error
      return data as ItemUnit[]
    },
    enabled: !!tenantId,
  })
}

export const useCreateItemUnit = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (unit: Partial<ItemUnit>) => {
      const { data, error } = await supabase
        .from('item_units')
        .insert([{ ...unit, tenant_id: tenantId } as any])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-units'] })
      toast.success('Unit created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create unit')
    },
  })
}
