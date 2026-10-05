import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { useToast } from '@/components/ui/use-toast'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import type { 
  TransactionWithDetails, 
  InventoryFilters,
  CreateInboundData,
  CreateOutboundData
} from '@/types/inventory.types'
import { getFriendlyError } from '@/lib/errorMessage'

// Translate UI-friendly category keys to canonical DB values (Sprint 1)
const INBOUND_CATEGORY_MAP: Record<string, string> = {
  purchase: 'purchase',
  return: 'return',
  return_to_stock: 'return_to_stock',
  laundry: 'laundry_return',
  laundry_return: 'laundry_return',
  other: 'other_in',
  other_in: 'other_in',
}

const OUTBOUND_CATEGORY_MAP: Record<string, string> = {
  staff_assign: 'staff_assign',
  laundry: 'laundry_send',
  laundry_send: 'laundry_send',
  maintenance: 'maintenance',
  disposal: 'disposal',
  warehouse_release: 'warehouse_release',
  adjustment: 'adjustment_out',
  adjustment_out: 'adjustment_out',
  other: 'other_out',
  other_out: 'other_out',
}

export function useInventoryTransactions(
  filters: InventoryFilters = {},
  page = 1,
  pageSize = 25
) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  
  return useQuery({
    queryKey: ['inventory-transactions', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, filters, page, pageSize],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      
      const { data, error } = await supabase.rpc('get_inventory_transactions_filtered', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : (selectedHotel?.id || null),
        p_transaction_type: filters.transaction_type || null,
        p_category_id: filters.category_id || null,
        p_created_by: filters.created_by || null,
        p_date_from: filters.date_from?.toISOString().split('T')[0] || null,
        p_date_to: filters.date_to?.toISOString().split('T')[0] || null,
        p_search: filters.search || null,
        p_page: page,
        p_page_size: pageSize,
      })
      
      if (error) throw error
      
      const transactions = data as TransactionWithDetails[]
      const total = transactions[0]?.total_count || 0
      
      return {
        transactions,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    },
    enabled: !!tenant?.id,
  })
}

export function useInventoryTransaction(transactionId: string | undefined) {
  return useQuery({
    queryKey: ['inventory-transaction', transactionId],
    queryFn: async () => {
      if (!transactionId) throw new Error('No transaction ID')
      
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          item:items(
            id, code, name, unit_price,
            category:item_categories(name, color),
            item_images(id, url, is_primary, display_order)
          ),
          created_by_user:users!inventory_transactions_created_by_fkey(
            id, full_name, avatar_url
          )
        `)
        .eq('id', transactionId)
        .single()
      
      if (error) throw error
      return data
    },
    enabled: !!transactionId,
  })
}

export function useCreateInboundTransaction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { tenant } = useTenant()
  const { user } = useUser()
  const { selectedHotel } = useHotelContext()
  
  return useMutation({
    mutationFn: async (data: CreateInboundData) => {
      if (!tenant?.id || !selectedHotel?.id || !user?.id) {
        throw new Error('Missing required data')
      }
      
      const canonicalCategory = INBOUND_CATEGORY_MAP[data.transaction_category] || data.transaction_category

      const { data: result, error } = await supabase.rpc('create_inbound_transaction', {
        p_tenant_id: tenant.id,
        p_hotel_id: selectedHotel.id,
        p_transaction_category: canonicalCategory,
        p_from_location: data.from_location,
        p_to_location: data.to_location,
        p_created_by: user.id,
        p_items: data.items as any,
        p_related_type: data.related_type || null,
        p_related_id: data.related_id || null,
        p_documents: data.documents || null,
        p_photos: data.photos || null,
        p_notes: data.notes || null,
        p_to_warehouse_id: data.to_warehouse_id || null,
      })
      
      if (error) throw error
      
      const response = result as unknown as { 
        success: boolean
        error?: string
        total_items?: number
        total_value?: number
      }
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create transaction')
      }
      
      return response
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      
      toast({
        title: 'Thành công',
        description: `Đã nhập ${result.total_items} loại hàng, tổng giá trị ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(result.total_value)}`,
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

export function useCreateOutboundTransaction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { tenant } = useTenant()
  const { user } = useUser()
  const { selectedHotel } = useHotelContext()
  
  return useMutation({
    mutationFn: async (data: CreateOutboundData) => {
      if (!tenant?.id || !selectedHotel?.id || !user?.id) {
        throw new Error('Missing required data')
      }
      
      const canonicalCategory = OUTBOUND_CATEGORY_MAP[data.transaction_category] || data.transaction_category

      const { data: result, error } = await supabase.rpc('create_outbound_transaction', {
        p_tenant_id: tenant.id,
        p_hotel_id: selectedHotel.id,
        p_transaction_category: canonicalCategory,
        p_from_location: data.from_location,
        p_to_location: data.to_location,
        p_created_by: user.id,
        p_items: data.items as any,
        p_related_type: data.related_type || null,
        p_related_id: data.related_id || null,
        p_recipient_name: data.recipient_name || null,
        p_recipient_signature: data.recipient_signature || null,
        p_documents: data.documents || null,
        p_photos: data.photos || null,
        p_notes: data.notes || null,
        p_from_warehouse_id: data.from_warehouse_id || null,
      })
      
      if (error) throw error
      
      const response = result as unknown as { 
        success: boolean
        error?: string
        total_items?: number
        total_value?: number
        low_stock_items?: string[]
      }
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create transaction')
      }
      
      return response
    },
    onSuccess: (result: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      
      // Trigger workflow for low stock items
      if (result.low_stock_items && result.low_stock_items.length > 0 && tenant?.id) {
        for (const itemName of result.low_stock_items) {
          triggerWorkflow({
            triggerType: WorkflowTriggerTypes.INVENTORY_LOW_STOCK,
            eventData: {
              item_name: itemName,
              alert_type: 'below_minimum',
            },
            tenantId: tenant.id,
            hotelId: selectedHotel?.id,
          }).catch(err => console.error('[triggerWorkflow] inventory_low_stock error:', err))
        }
      }
      
      let description = `Đã xuất ${result.total_items} loại hàng`
      
      if (result.low_stock_items && result.low_stock_items.length > 0) {
        description += `\n⚠️ Cảnh báo: ${result.low_stock_items.join(', ')} đã xuống dưới mức tối thiểu`
      }
      
      toast({
        title: 'Thành công',
        description,
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

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  
  return useMutation({
    mutationFn: async (transactionId: string) => {
      // Use RPC to delete transaction AND reverse inventory changes
      const { data, error } = await supabase.rpc('delete_inventory_transaction', {
        p_transaction_id: transactionId
      })
      
      if (error) throw error
      
      const result = data as { success: boolean; error?: string }
      
      if (!result.success) {
        throw new Error(result.error || 'Không thể hủy giao dịch')
      }
      
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      
      toast({
        title: 'Thành công',
        description: 'Đã hủy giao dịch và hoàn nguyên số lượng tồn kho',
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
