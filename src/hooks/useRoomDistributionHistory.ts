import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export interface RoomDistributionHistoryItem {
  order_id: string
  order_code: string
  order_status: string
  room_status: string
  room_order_id: string
  total_items: number
  total_quantity: number
  delivered_at: string | null
  confirmed_at: string | null
  confirmed_by_name: string | null
  assigned_to_name: string | null
  rejection_reason: string | null
  created_at: string
  items: {
    item_id: string
    item_name: string
    item_code: string
    quantity: number
    quantity_confirmed: number
    status: string
  }[]
}

export function useRoomDistributionHistory(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-distribution-history', roomId],
    queryFn: async () => {
      if (!roomId) return []
      
      // Get distribution order rooms for this room with all details
      const { data: roomOrders, error } = await supabase
        .from('distribution_order_rooms')
        .select(`
          id,
          status,
          confirmed_at,
          confirmed_by,
          delivered_at,
          rejection_reason,
          created_at,
          distribution_orders!distribution_order_rooms_distribution_order_id_fkey (
            id,
            order_code,
            status,
            created_at,
            assigned_to,
            users:assigned_to (full_name)
          ),
          confirmed_by_user:confirmed_by (full_name),
          distribution_order_items (
            id,
            item_id,
            quantity,
            quantity_confirmed,
            status,
            items (
              id,
              name,
              code
            )
          )
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) throw error
      
      return (roomOrders || []).map((ro: any) => ({
        order_id: ro.distribution_orders.id,
        order_code: ro.distribution_orders.order_code,
        order_status: ro.distribution_orders.status,
        room_status: ro.status,
        room_order_id: ro.id,
        total_items: ro.distribution_order_items?.length || 0,
        total_quantity: ro.distribution_order_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0,
        delivered_at: ro.delivered_at,
        confirmed_at: ro.confirmed_at,
        confirmed_by_name: ro.confirmed_by_user?.full_name || null,
        assigned_to_name: ro.distribution_orders.users?.full_name || null,
        rejection_reason: ro.rejection_reason,
        created_at: ro.created_at || ro.distribution_orders.created_at,
        items: (ro.distribution_order_items || []).map((i: any) => ({
          item_id: i.item_id,
          item_name: i.items?.name || '',
          item_code: i.items?.code || '',
          quantity: i.quantity,
          quantity_confirmed: i.quantity_confirmed || 0,
          status: i.status
        }))
      })) as RoomDistributionHistoryItem[]
    },
    enabled: !!roomId
  })
}

export function useConfirmRoomDelivery() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      roomOrderId, 
      confirmedBy 
    }: { 
      roomOrderId: string
      confirmedBy: string
    }) => {
      const { data, error } = await supabase
        .rpc('confirm_room_delivery' as any, {
          p_room_order_id: roomOrderId,
          p_confirmed_by: confirmedBy
        })
      
      if (error) throw error
      const result = data as any
      if (!result?.success) throw new Error(result?.error || 'Failed to confirm')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['room-distribution-history'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['room-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      toast.success('Đã xác nhận giao hàng')
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message)
    }
  })
}

export function useBatchConfirmDeliveries() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      roomOrderIds, 
      confirmedBy 
    }: { 
      roomOrderIds: string[]
      confirmedBy: string
    }) => {
      const { data, error } = await supabase
        .rpc('batch_confirm_room_deliveries' as any, {
          p_room_order_ids: roomOrderIds,
          p_confirmed_by: confirmedBy
        })
      
      if (error) throw error
      return data as { success: boolean; success_count: number; failed_count: number; errors: string[] }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['room-distribution-history'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['room-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      
      if (data.success) {
        toast.success(`Đã xác nhận ${data.success_count} đơn hàng`)
      } else {
        toast.warning(`Xác nhận ${data.success_count} thành công, ${data.failed_count} thất bại`)
      }
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message)
    }
  })
}

export function useRejectRoomDelivery() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      distributionOrderRoomId, 
      rejectedBy, 
      rejectionReason 
    }: { 
      distributionOrderRoomId: string
      rejectedBy: string
      rejectionReason: string 
    }) => {
      const { data, error } = await supabase
        .rpc('reject_room_delivery' as any, {
          p_distribution_order_room_id: distributionOrderRoomId,
          p_rejected_by: rejectedBy,
          p_rejection_reason: rejectionReason
        })
      
      if (error) throw error
      const result = data as any
      if (!result?.success) throw new Error(result?.error || 'Failed to reject')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['room-distribution-history'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success('Đã từ chối giao hàng')
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message)
    }
  })
}

export function useUndoRoomDelivery() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      distributionOrderRoomId, 
      performedBy 
    }: { 
      distributionOrderRoomId: string
      performedBy: string
    }) => {
      const { data, error } = await supabase
        .rpc('undo_room_delivery_confirmation' as any, {
          p_distribution_order_room_id: distributionOrderRoomId,
          p_performed_by: performedBy
        })
      
      if (error) throw error
      const result = data as any
      if (!result?.success) throw new Error(result?.error || 'Failed to undo')
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['room-distribution-history'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['room-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success('Đã hoàn tác xác nhận giao hàng')
    },
    onError: (error) => {
      toast.error('Lỗi: ' + (error as Error).message)
    }
  })
}
