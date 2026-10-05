import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from './use-toast'
import type { CategoryWithStats, CategoryFormData } from '@/types/items.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useCategories() {
  const { tenantId, hotelId: userHotelId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()
  const effectiveHotelId = isAllHotelsMode ? null : (selectedHotel?.id ?? userHotelId ?? null)
  
  // Subscribe to real-time changes on items and item_categories tables
  useEffect(() => {
    if (!tenantId) return

    const channel = supabase
      .channel('categories-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['categories'] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_categories' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['categories'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
  
  return useQuery({
    queryKey: ['categories', tenantId, effectiveHotelId, isAllHotelsMode],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase
        .rpc('get_categories_with_stats', {
          p_tenant_id: tenantId,
          p_hotel_id: effectiveHotelId,
        })

      if (error) throw error
      return data as CategoryWithStats[]
    },
    enabled: !!tenantId,
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  
  return useMutation({
    mutationFn: async (data: CategoryFormData) => {
      if (!tenantId) {
        throw new Error('Thiếu tenant_id. Vui lòng đăng nhập lại hoặc tạo tenant từ trang System Test.')
      }
      if (!selectedHotel?.id) {
        throw new Error('Vui lòng chọn khách sạn trước khi tạo danh mục.')
      }
      
      const { data: category, error } = await supabase
        .from('item_categories')
        .insert({
          ...data,
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
        })
        .select()
        .single()
      
      if (error) throw error
      return category
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast({
        title: 'Thành công',
        description: 'Đã thêm danh mục mới',
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

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      const { data: category, error } = await supabase
        .from('item_categories')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return category
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật danh mục',
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

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (categoryId: string) => {
      // Check if category has items
      const { count } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId)
      
      if (count && count > 0) {
        throw new Error(`Không thể xóa danh mục có ${count} items`)
      }
      
      const { error } = await supabase
        .from('item_categories')
        .delete()
        .eq('id', categoryId)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toast({
        title: 'Thành công',
        description: 'Đã xóa danh mục',
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
