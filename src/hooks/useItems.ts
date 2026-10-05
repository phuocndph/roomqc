import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from './use-toast'
import type { ItemWithCategory, ItemFilters } from '@/types/items.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useItems(
  filters: ItemFilters = {},
  page: number = 1,
  pageSize: number = 25
) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()
  
  // Subscribe to realtime changes
  useEffect(() => {
    if (!tenantId) return
    
    const channel = supabase
      .channel(`items-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          // Invalidate queries to refetch data
          queryClient.invalidateQueries({ queryKey: ['items'] })
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenantId, queryClient])
  
  return useQuery({
    queryKey: ['items', tenantId, selectedHotel?.id, isAllHotelsMode, filters, page, pageSize],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      
      // Use selectedHotel from HotelContext, or null for "All Hotels" mode
      const hotelIdToFilter = isAllHotelsMode ? null : (filters.hotelId || selectedHotel?.id || null)
      
      const { data, error } = await supabase.rpc('get_items_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelIdToFilter,
        p_category_id: filters.categoryId || null,
        p_stock_status: filters.stockStatus || null,
        p_status: filters.status || 'active',
        p_search: filters.search || null,
        p_warehouse_id: filters.warehouseId || null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })
      
      if (error) {
        console.error('Error fetching items:', error)
        throw error
      }
      
      // Return empty result if no data
      if (!data || data.length === 0) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        }
      }
      
      const items = data as unknown as ItemWithCategory[]
      const total = Number(data[0]?.total_count) || 0
      
      // Fetch images only if there are items (non-blocking, run in background)
      const itemIds = items.map(item => item.id)
      
      // Start image fetch but don't await - attach images after
      Promise.resolve(
        supabase
          .from('item_images')
          .select('item_id, url, is_primary')
          .in('item_id', itemIds)
          .eq('is_primary', true)
      ).then(({ data: images }) => {
        if (images) {
          const imageMap = new Map(images.map(img => [img.item_id, img]))
          items.forEach(item => {
            const img = imageMap.get(item.id)
            item.item_images = img ? [img as any] : []
          })
          // Trigger re-render by updating cache
          queryClient.setQueryData(
            ['items', tenantId, selectedHotel?.id, isAllHotelsMode, filters, page, pageSize],
            { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
          )
        }
      }).catch(err => console.error('Error fetching images (non-critical):', err))
      
      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    enabled: !!tenantId,
    retry: 2,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
    placeholderData: (prev) => prev,
  })
}

export function useItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      if (!itemId) throw new Error('No item ID')
      
      // Fetch main item data with images and category
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select(`
          *,
          item_images (
            id,
            url,
            file_name,
            file_size,
            is_primary,
            display_order
          ),
          item_categories (
            id,
            name,
            color,
            icon
          ),
          hotels (
            id,
            name,
            code
          )
        `)
        .eq('id', itemId)
        .single()
      
      if (itemError) throw itemError
      if (!item) return null
      
      // Sort images by display_order and primary first
      if (item.item_images) {
        item.item_images = item.item_images.sort((a: any, b: any) => {
          if (a.is_primary) return -1
          if (b.is_primary) return 1
          return a.display_order - b.display_order
        })
      }
      
      // Fetch recent transactions
      const { data: transactions } = await supabase
        .from('inventory_transactions')
        .select(`
          id,
          transaction_code,
          transaction_type,
          transaction_category,
          quantity,
          transaction_date,
          created_by,
          users!inventory_transactions_created_by_fkey (
            full_name
          )
        `)
        .eq('item_id', itemId)
        .order('transaction_date', { ascending: false })
        .limit(10)
      
      // Fetch room allocations
      const { data: roomAllocations } = await supabase
        .from('room_items')
        .select(`
          id,
          quantity,
          condition,
          assigned_at,
          last_checked_at,
          room_id,
          rooms (
            id,
            room_number,
            room_type
          )
        `)
        .eq('item_id', itemId)
        .order('assigned_at', { ascending: false })
        .limit(20)
      
      // Fetch recent room checks (last 30 days) to count issues per room
      const issuesByRoom: Record<string, number> = {}
      if (roomAllocations && roomAllocations.length > 0) {
        const roomIds = roomAllocations.map(r => r.room_id)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        const { data: checks } = await supabase
          .from('room_checks')
          .select('room_id, items_damaged, items_lost')
          .in('room_id', roomIds)
          .gte('checked_at', thirtyDaysAgo)
        
        if (checks) {
          for (const check of checks) {
            const damaged = (check.items_damaged as any[]) || []
            const lost = (check.items_lost as any[]) || []
            const allIssues = [...damaged, ...lost]
            for (const issue of allIssues) {
              if (issue?.item_id === itemId) {
                issuesByRoom[check.room_id] = (issuesByRoom[check.room_id] || 0) + 1
              }
            }
          }
        }
      }
      
      // Format the response to match ItemDetailPage expectations
      return {
        item,
        category: item.item_categories,
        hotel: item.hotels,
        recent_transactions: transactions?.map(t => ({
          ...t,
          created_by_name: t.users?.full_name || 'Unknown'
        })) || [],
        room_allocations: roomAllocations?.map(ra => ({
          ...ra,
          room_number: ra.rooms?.room_number,
          room_type: ra.rooms?.room_type,
          recent_issues_count: issuesByRoom[ra.room_id] || 0,
        })) || []
      }
    },
    enabled: !!itemId,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()
  
  return useMutation({
    mutationFn: async (data: any) => {
      const { data: item, error } = await supabase
        .from('items')
        .insert(data)
        .select()
        .single()
      
      if (error) throw error
      return item
    },
    onSuccess: async (item) => {
      // Invalidate items queries for the specific hotel
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['check-quota'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      
      // Check if low stock and trigger notification
      if (item.quantity_in_stock !== undefined && 
          item.minimum_stock !== undefined &&
          item.quantity_in_stock <= item.minimum_stock &&
          user?.id && tenantId) {
        const { triggerLowStockAlert } = await import('./useNotificationTriggers')
        await triggerLowStockAlert({
          tenantId,
          hotelId: item.hotel_id,
          itemName: item.name,
          currentStock: item.quantity_in_stock,
          minimumStock: item.minimum_stock,
          itemId: item.id,
          triggeredByUserId: user.id,
        })
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã thêm tài sản mới',
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

export function useUpdateItem() {
  const queryClient = useQueryClient()
  const { user, tenantId } = useUser()
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { data: item, error } = await supabase
        .from('items')
        .update(data)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return item
    },
    onSuccess: async (item, variables) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['item', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      
      // Check if low stock and trigger notification
      if (item.quantity_in_stock !== undefined && 
          item.minimum_stock !== undefined &&
          item.quantity_in_stock <= item.minimum_stock &&
          user?.id && tenantId) {
        const { triggerLowStockAlert } = await import('./useNotificationTriggers')
        await triggerLowStockAlert({
          tenantId,
          hotelId: item.hotel_id,
          itemName: item.name,
          currentStock: item.quantity_in_stock,
          minimumStock: item.minimum_stock,
          itemId: item.id,
          triggeredByUserId: user.id,
        })
      }
      
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật tài sản',
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

export function useDeleteItems() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  
  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { data, error } = await supabase.rpc('bulk_delete_items', {
        p_item_ids: itemIds,
        p_user_id: user?.id,
      })
      
      if (error) throw error
      return data
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      
      if (result.failed_count > 0) {
        toast({
          title: 'Hoàn thành với lỗi',
          description: `Đã xóa ${result.deleted_count} items. ${result.failed_count} items không thể xóa.`,
        })
      } else {
        toast({
          title: 'Thành công',
          description: `Đã xóa ${result.deleted_count} items`,
        })
      }
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
