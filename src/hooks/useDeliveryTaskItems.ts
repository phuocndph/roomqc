import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface DeliveryTaskItem {
  id: string
  item_id: string
  item_name: string
  item_code: string
  quantity: number
}

export interface DeliveryTaskData {
  roomOrderId: string
  orderCode: string
  items: DeliveryTaskItem[]
}

/**
 * Fetch delivery items for a housekeeping task linked to a distribution_order_room
 */
export function useDeliveryTaskItems(distributionOrderRoomId: string | null | undefined) {
  return useQuery({
    queryKey: ['delivery-task-items', distributionOrderRoomId],
    queryFn: async (): Promise<DeliveryTaskData | null> => {
      if (!distributionOrderRoomId) return null

      // Get the distribution_order_room with order info
      const { data: roomOrder, error: roomOrderError } = await supabase
        .from('distribution_order_rooms')
        .select(`
          id,
          distribution_order_id,
          distribution_orders!distribution_order_rooms_distribution_order_id_fkey (
            order_code
          )
        `)
        .eq('id', distributionOrderRoomId)
        .single()

      if (roomOrderError || !roomOrder) {
        console.error('Error fetching room order:', roomOrderError)
        return null
      }

      // Get items for this room order
      const { data: items, error: itemsError } = await supabase
        .from('distribution_order_items')
        .select(`
          id,
          item_id,
          quantity,
          items!inner (
            id,
            name,
            code
          )
        `)
        .eq('distribution_order_room_id', distributionOrderRoomId)

      if (itemsError) {
        console.error('Error fetching items:', itemsError)
        return null
      }

      const order = roomOrder.distribution_orders as any

      return {
        roomOrderId: roomOrder.id,
        orderCode: order?.order_code || '',
        items: (items || []).map((item) => ({
          id: item.id,
          item_id: item.item_id,
          item_name: (item.items as any).name,
          item_code: (item.items as any).code,
          quantity: item.quantity,
        })),
      }
    },
    enabled: !!distributionOrderRoomId,
    staleTime: 60000, // 1 minute
  })
}
