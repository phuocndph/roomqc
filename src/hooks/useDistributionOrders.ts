import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from './useTenant'
import { useHotelContext } from '@/contexts/HotelContext'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import type { DistributionOrder, DistributionOrderDetail, CreateDistributionData, DistributionFilters } from '@/types/distribution.types'
import { 
  triggerDistributionOrderCreated, 
  triggerDistributionOrderCancelled 
} from './useNotificationTriggers'
import { useShiftGuardedMutation } from './useGuardedMutation'

export function useDistributionOrders(filters: DistributionFilters = {}, page = 1, pageSize = 25) {
  const { tenant } = useTenant()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['distribution-orders', tenant?.id, isAllHotelsMode ? 'all' : selectedHotel?.id, filters, page, pageSize],
    queryFn: async () => {
      if (!tenant?.id) throw new Error('No tenant')
      if (!isAllHotelsMode && !selectedHotel?.id) throw new Error('No hotel selected')

      const { data, error } = await supabase.rpc('get_distribution_orders_filtered', {
        p_tenant_id: tenant.id,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id,
        p_status: filters.status || null,
        p_assigned_to: filters.assigned_to || null,
        p_floor: null,
        p_shift_date: null,
        p_shift_code: null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      })

      if (error) throw error
      return {
        data: data as DistributionOrder[],
        totalCount: (data as DistributionOrder[])?.[0]?.total_count || 0,
      }
    },
    enabled: !!tenant?.id && (isAllHotelsMode || !!selectedHotel?.id),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useDistributionOrderDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['distribution-order-detail', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID')

      const { data, error } = await supabase.rpc('get_distribution_order_detail', {
        p_order_id: orderId,
      })

      if (error) throw error
      return data as unknown as DistributionOrderDetail
    },
    enabled: !!orderId,
  })
}

export function useCreateDistributionOrder() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { selectedHotel } = useHotelContext()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (data: CreateDistributionData) => {
      if (!tenant?.id || !selectedHotel?.id || !user?.id) {
        throw new Error('Missing required context')
      }

      const { data: result, error } = await supabase.rpc('create_distribution_order', {
        p_tenant_id: tenant.id,
        p_hotel_id: selectedHotel.id,
        p_created_by: user.id,
        p_assigned_to: data.assigned_to || null,
        p_rooms: data.rooms,
        p_notes: data.notes || null,
        p_auto_release: data.auto_release || false,
        p_supplement_request_ids: null,
      })

      if (error) throw error
      
      // Calculate totals for notification
      const totalRooms = data.rooms.length
      const totalItems = data.rooms.reduce((sum, room) => {
        return sum + room.items.reduce((itemSum, item) => itemSum + item.quantity, 0)
      }, 0)

      return { 
        ...(result as { success: boolean; order_id: string; order_code: string }),
        assigned_to: data.assigned_to,
        totalRooms,
        totalItems,
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success(`Tạo phiếu giao hàng ${result.order_code} thành công`)

      // Send notification to assigned staff
      if (tenant?.id && selectedHotel?.id && user?.id && result.assigned_to) {
        try {
          await triggerDistributionOrderCreated({
            tenantId: tenant.id,
            hotelId: selectedHotel.id,
            orderId: result.order_id,
            orderCode: result.order_code,
            assignedToUserId: result.assigned_to,
            createdByUserId: user.id,
            totalRooms: result.totalRooms,
            totalItems: result.totalItems,
          })
        } catch (e) {
          console.error('Failed to send notification:', e)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể tạo phiếu giao hàng')
    },
  })
}

// useCompleteRoomDelivery removed in distribution lifecycle v2 (1.1.15).
// The legacy `complete_room_delivery` RPC has been dropped; use
// `deliver_stop` + `close_route_if_complete` instead.

export function useCancelDistributionOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { tenant } = useTenant()

  return useMutation({
    mutationFn: async ({ orderId, orderCode, assignedToUserId }: { 
      orderId: string
      orderCode?: string
      assignedToUserId?: string | null 
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('cancel_distribution_order', {
        p_order_id: orderId,
        p_cancelled_by: user.id,
      })

      if (error) throw error
      return { 
        ...(data as { success: boolean; order_id: string }),
        orderCode,
        assignedToUserId,
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success('Đã hủy phiếu giao hàng')

      // Send notification to assigned staff
      if (tenant?.id && user?.id && result.assignedToUserId && result.orderCode) {
        try {
          await triggerDistributionOrderCancelled({
            tenantId: tenant.id,
            orderId: result.order_id,
            orderCode: result.orderCode,
            assignedToUserId: result.assignedToUserId,
            cancelledByUserId: user.id,
          })
        } catch (e) {
          console.error('Failed to send notification:', e)
        }
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể hủy phiếu giao hàng')
    },
  })
}

export function useConfirmWarehouseDelivery() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useShiftGuardedMutation(useMutation({
    mutationFn: async ({ roomOrderId }: { roomOrderId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('confirm_warehouse_delivery', {
        p_room_order_id: roomOrderId,
        p_delivered_by: user.id,
      })

      if (error) throw error
      return data as { success: boolean; room_order_id: string; new_status: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      toast.success('Đã xác nhận xuất kho thành công')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể xác nhận xuất kho')
    },
  }))
}

interface UpdateDistributionData {
  orderId: string
  assignedTo?: string
  notes?: string
  rooms?: {
    room_id: string
    items: { item_id: string; quantity: number }[]
  }[]
}

export function useUpdateDistributionOrder() {
  const queryClient = useQueryClient()
  const { tenant } = useTenant()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (data: UpdateDistributionData) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data: result, error } = await supabase.rpc('update_distribution_order', {
        p_order_id: data.orderId,
        p_assigned_to: data.assignedTo || null,
        p_notes: data.notes || null,
        p_rooms: data.rooms || null,
      })

      if (error) throw error
      return result as { success: boolean; order_id: string; old_assigned_to: string | null }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      toast.success('Cập nhật phiếu giao hàng thành công')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể cập nhật phiếu giao hàng')
    },
  })
}
