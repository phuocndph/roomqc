import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { toast } from 'sonner'

export interface MaintenanceCategory {
  id: string
  tenant_id: string
  name: string
  code: string
  description?: string
  icon?: string
  color?: string
  default_assignee_id?: string
  default_priority: 'low' | 'medium' | 'high' | 'critical'
  sla_hours: number
  require_approval: boolean
  require_photos: boolean
  checklist_items?: string[]
  display_order: number
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export const useMaintenanceCategories = () => {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['maintenance-categories', tenantId],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .from('maintenance_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order')

      if (error) throw error
      return data as MaintenanceCategory[]
    },
    enabled: !!tenantId,
  })
}

export const useCreateMaintenanceCategory = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async (category: Partial<MaintenanceCategory>) => {
      const { data, error } = await supabase
        .from('maintenance_categories')
        .insert([{ ...category, tenant_id: tenantId } as any])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-categories'] })
      toast.success('Category created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create category')
    },
  })
}

export const useUpdateMaintenanceCategory = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MaintenanceCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from('maintenance_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-categories'] })
      toast.success('Category updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update category')
    },
  })
}
