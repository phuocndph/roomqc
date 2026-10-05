import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'

export interface PendingDeliveryItem {
  id: string
  item_id: string
  item_name: string
  item_code: string
  quantity: number
  status: string
}

export interface PendingDelivery {
  room_order_id: string
  distribution_order_id: string
  order_code: string
  batch_number: number
  stop_status: string
  created_at: string
  items: PendingDeliveryItem[]
}

export function usePendingDeliveriesForRoom(roomId: string | undefined) {
  return useQuery({
    queryKey: ['pending-deliveries', roomId],
    queryFn: async (): Promise<PendingDelivery[]> => {
      if (!roomId) return []

      // Get pending distribution_order_rooms for this room
      // Use explicit FK reference because there are 2 FKs to distribution_orders
      const { data: roomOrders, error: roomOrdersError } = await supabase
        .from('distribution_order_rooms')
        .select(`
          id,
          distribution_order_id,
          batch_number,
          stop_status,
          created_at,
          distribution_orders!distribution_order_rooms_distribution_order_id_fkey (
            id,
            order_code,
            status
          )
        `)
        .eq('room_id', roomId)
        .in('stop_status', ['pending', 'received'])
        .order('created_at', { ascending: true })

      if (roomOrdersError) {
        console.error('Error fetching pending deliveries:', roomOrdersError)
        throw roomOrdersError
      }

      if (!roomOrders || roomOrders.length === 0) return []

      // Get items for each room order
      const roomOrderIds = roomOrders.map(ro => ro.id)
      const { data: orderItems, error: itemsError } = await supabase
        .from('distribution_order_items')
        .select(`
          id,
          distribution_order_room_id,
          item_id,
          quantity,
          status,
          items!inner (
            id,
            name,
            code
          )
        `)
        .in('distribution_order_room_id', roomOrderIds)
        .neq('status', 'confirmed')

      if (itemsError) {
        console.error('Error fetching order items:', itemsError)
        throw itemsError
      }

      // Group items by room_order_id
      const itemsByRoomOrder = (orderItems || []).reduce((acc, item) => {
        const key = item.distribution_order_room_id
        if (!acc[key]) acc[key] = []
        acc[key].push({
          id: item.id,
          item_id: item.item_id,
          item_name: (item.items as any).name,
          item_code: (item.items as any).code,
          quantity: item.quantity,
          status: item.status,
        })
        return acc
      }, {} as Record<string, PendingDeliveryItem[]>)

      // Build final result - filter by order status in memory since we can't use !inner with explicit FK
      return roomOrders
        .filter(ro => {
          const order = ro.distribution_orders as any
          return order && ['in_progress', 'released'].includes(order.status)
        })
        .map(ro => ({
          room_order_id: ro.id,
          distribution_order_id: ro.distribution_order_id,
          order_code: (ro.distribution_orders as any).order_code,
          batch_number: ro.batch_number || 1,
          stop_status: ro.stop_status || 'pending',
          created_at: ro.created_at || '',
          items: itemsByRoomOrder[ro.id] || [],
        }))
        .filter(d => d.items.length > 0)
    },
    enabled: !!roomId,
    staleTime: 30000, // 30 seconds
  })
}

export function useConfirmDeliveryFromRoomCheck() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ roomOrderId }: { roomOrderId: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data, error } = await supabase.rpc('confirm_delivery_from_room_check', {
        p_room_order_id: roomOrderId,
        p_confirmed_by: user.id,
      })

      if (error) throw error
      
      if (data && typeof data === 'object' && 'success' in data) {
        if (!data.success) {
          throw new Error((data as any).error || 'Failed to confirm delivery')
        }
      }

      return data
    },
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['pending-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['room'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })

      toast({
        title: 'Xác nhận nhận hàng thành công',
        description: `Đã cập nhật ${(data as any)?.items_updated || 0} items vào phòng`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi xác nhận nhận hàng',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
