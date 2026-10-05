import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'

export interface ItemCategory {
  id: string
  tenant_id: string
  hotel_id?: string
  name: string
  name_en?: string
  code?: string
  description?: string
  icon?: string
  color?: string
  parent_id?: string
  level: number
  min_stock_level?: number
  max_stock_level?: number
  reorder_point?: number
  preferred_vendor_id?: string
  depreciable: boolean
  depreciation_rate?: number
  useful_life_months?: number
  track_serial_numbers: boolean
  require_inspection: boolean
  sort_order: number
  status: 'active' | 'inactive'
  default_item_type?: 'linen' | 'consumable' | 'equipment' | 'furniture'
  created_at: string
  updated_at: string
  _count?: {
    items: number
    subcategories: number
  }
}

export const useItemCategories = () => {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()

  // Subscribe to real-time changes (filter tenant + visibility pause)
  useEffect(() => {
    if (!tenantId) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    const subscribe = () => {
      if (channel) return
      channel = supabase
        .channel(`item-categories-${tenantId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'item_categories', filter: `tenant_id=eq.${tenantId}` },
          () => queryClient.invalidateQueries({ queryKey: ['item-categories'] })
        )
        .subscribe()
    }
    const unsubscribe = () => { if (channel) { supabase.removeChannel(channel); channel = null } }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        queryClient.invalidateQueries({ queryKey: ['item-categories'] })
      } else { unsubscribe() }
    }
    if (document.visibilityState === 'visible') subscribe()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [tenantId, queryClient])

  return useQuery({
    queryKey: ['item-categories', tenantId, selectedHotel?.id, isAllHotelsMode],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      let query: any = supabase
        .from('item_categories')
        .select('*')
        .eq('tenant_id', tenantId)
      
      // Filter by hotel unless in "All Hotels" mode
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      query = query.order('sort_order')

      const { data, error } = await query

      if (error) throw error
      return data as ItemCategory[]
    },
    enabled: !!tenantId,
  })
}

export const useCreateItemCategory = () => {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()

  return useMutation({
    mutationFn: async (category: Partial<ItemCategory>) => {
      if (!selectedHotel?.id) {
        throw new Error('Vui lòng chọn khách sạn trước khi tạo danh mục')
      }
      
      const { data, error } = await supabase
        .from('item_categories')
        .insert([{ 
          ...category, 
          tenant_id: tenantId,
          hotel_id: selectedHotel.id 
        } as any])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-categories'] })
      toast.success('Category created successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create category')
    },
  })
}

export const useUpdateItemCategory = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ItemCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from('item_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-categories'] })
      toast.success('Category updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update category')
    },
  })
}

export const useDeleteItemCategory = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('item_categories')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-categories'] })
      toast.success('Category deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete category')
    },
  })
}

export const useUpdateCategoryOrder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (categories: Array<{ id: string; sort_order: number }>) => {
      const updates = categories.map(({ id, sort_order }) =>
        supabase
          .from('item_categories')
          .update({ sort_order })
          .eq('id', id)
      )

      await Promise.all(updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-categories'] })
    },
  })
}
