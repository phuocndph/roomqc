import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { triggerWorkflow, WorkflowTriggerTypes } from '@/lib/triggerWorkflow'
import type {
  DistributionBatch,
  RouteDetail,
  HandoverBatchResponse,
  ReceiveBatchResponse,
  DeliverStopResponse,
  MarkCannotAccessResponse,
  RetryStopResponse,
  ReturnToStockResponse,
  HandoverStopResponse,
  CloseRouteResponse,
  ShiftCode,
  ExceptionType,
} from '@/types/route-batch.types'

// ===== QUERIES =====

/**
 * Fetch batches for a specific route/order
 */
export function useRouteBatches(orderId: string | undefined) {
  return useQuery({
    queryKey: ['route-batches', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID')

      const { data, error } = await supabase
        .from('distribution_order_batches')
        .select('*')
        .eq('distribution_order_id', orderId)
        .order('batch_number', { ascending: true })

      if (error) throw error
      return data as DistributionBatch[]
    },
    enabled: !!orderId,
  })
}

/**
 * Get route detail with batches computed
 */
export function useRouteDetail(orderId: string | undefined) {
  return useQuery({
    queryKey: ['route-detail', orderId],
    queryFn: async () => {
      if (!orderId) throw new Error('No order ID')

      // Fetch order detail using existing RPC
      const { data: orderData, error: orderError } = await supabase.rpc(
        'get_distribution_order_detail',
        { p_order_id: orderId }
      )
      if (orderError) throw orderError
      if (!orderData) throw new Error('Order not found')

      // Fetch tenant_id and hotel_id separately (RPC might not return these)
      const { data: orderMeta } = await supabase
        .from('distribution_orders')
        .select('tenant_id, hotel_id')
        .eq('id', orderId)
        .single()

      // Fetch batches with user names
      const { data: batchData, error: batchError } = await supabase
        .from('distribution_order_batches')
        .select(`
          *,
          handed_over_by_user:users!distribution_order_batches_handed_over_by_fkey(full_name),
          received_by_user:users!distribution_order_batches_received_by_fkey(full_name)
        `)
        .eq('distribution_order_id', orderId)
        .order('batch_number', { ascending: true })
      if (batchError) throw batchError

      // Parse and transform the data
      const parsedOrder = orderData as Record<string, unknown>
      const rooms = (parsedOrder.rooms || []) as Array<Record<string, unknown>>

      // Map rooms to stops with proper typing
      const stops = rooms.map((room) => ({
        id: room.id as string,
        distribution_order_id: room.distribution_order_id as string,
        room_id: room.room_id as string,
        room_number: room.room_number as string,
        floor: room.floor as number,
        batch_number: (room.batch_number as number) || 1,
        status: room.status as string,
        stop_status: (room.stop_status as string) || 'pending',
        exception_type: room.exception_type as string | null,
        exception_reason: room.exception_reason as string | null,
        delivered_at: room.delivered_at as string | null,
        delivered_by: room.delivered_by as string | null,
        delivered_by_name: room.delivered_by_name as string | null,
        confirmed_at: room.confirmed_at as string | null,
        confirmed_by_name: room.confirmed_by_name as string | null,
        returned_at: room.returned_at as string | null,
        handover_to_order_id: room.handover_to_order_id as string | null,
        handover_at: room.handover_at as string | null,
        items: (room.items || []) as Array<{
          id: string
          item_id: string
          item_name: string
          item_code: string
          quantity: number
          quantity_confirmed: number
          status: string
        }>,
      }))

      // Map batches with user names
      const batches = (batchData || []).map((batch) => ({
        ...batch,
        handed_over_by_name: batch.handed_over_by_user?.full_name || null,
        received_by_name: batch.received_by_user?.full_name || null,
      })) as DistributionBatch[]

      return {
        id: parsedOrder.id as string,
        order_code: parsedOrder.order_code as string,
        status: parsedOrder.status as string,
        floor: parsedOrder.floor as number | null,
        shift_date: parsedOrder.shift_date as string,
        shift_code: parsedOrder.shift_code as string,
        batch_size: (parsedOrder.batch_size as number) || 10,
        total_rooms: parsedOrder.total_rooms as number,
        total_items: parsedOrder.total_items as number,
        rooms_completed: parsedOrder.rooms_completed as number,
        assigned_to: parsedOrder.assigned_to as string | null,
        assigned_to_name: parsedOrder.assigned_to_name as string | null,
        created_by: parsedOrder.created_by as string,
        created_by_name: parsedOrder.created_by_name as string,
        released_at: parsedOrder.released_at as string | null,
        released_by: parsedOrder.released_by as string | null,
        started_at: parsedOrder.started_at as string | null,
        completed_at: parsedOrder.completed_at as string | null,
        created_at: parsedOrder.created_at as string,
        notes: parsedOrder.notes as string | null,
        tenant_id: orderMeta?.tenant_id,
        hotel_id: orderMeta?.hotel_id,
        batches,
        stops,
      } as RouteDetail
    },
    enabled: !!orderId,
  })
}

// ===== MUTATIONS =====

/**
 * Storekeeper hands over a batch - now with stock check and adjustment support
 */
export interface HandoverBatchResult {
  success: boolean
  error?: string
  insufficient_items?: InsufficientItem[]
  batch_id?: string
  order_id?: string
  transaction_id?: string
}

export function useHandoverBatch() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ 
      batchId,
      adjustments,
      silent,
    }: { 
      batchId: string
      adjustments?: ItemAdjustment[]
      silent?: boolean
    }): Promise<HandoverBatchResult & { _silent?: boolean }> => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('handover_batch', {
        p_batch_id: batchId,
        p_actor_id: user.id,
        p_adjustments: adjustments ? JSON.stringify(adjustments) : null,
      })

      if (error) throw error
      
      const response = data as unknown as HandoverBatchResult
      
      // Check if RPC returned a business logic error (insufficient stock)
      if (!response.success && response.error === 'INSUFFICIENT_STOCK') {
        return {
          success: false,
          error: 'INSUFFICIENT_STOCK',
          insufficient_items: response.insufficient_items as InsufficientItem[],
        }
      }
      
      if (!response.success) {
        throw new Error(response.error || 'Unknown error')
      }
      
      return { ...response, _silent: silent }
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['route-batches'] })
        queryClient.invalidateQueries({ queryKey: ['route-detail'] })
        queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
        queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
        queryClient.invalidateQueries({ queryKey: ['items'] })
        queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
        queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
        if (!result._silent) {
          toast.success('Đã giao hàng cho nhân viên thành công')
        }
      }
      // If not success (INSUFFICIENT_STOCK), don't show toast - caller will handle
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể giao batch')
    },
  })
}

/**
 * Assignee receives a batch
 */
export function useReceiveBatch() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('receive_batch', {
        p_batch_id: batchId,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as ReceiveBatchResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      toast.success('Đã nhận batch thành công')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể nhận batch')
    },
  })
}

/**
 * Assignee delivers items to a room (stop)
 */
export function useDeliverStop() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      roomOrderId,
      roomInfo,
    }: {
      roomOrderId: string
      // Deprecated: signature mới của deliver_stop không nhận items_confirmed.
      // Số lượng được lấy từ distribution_order_items.quantity_actual (đã set ở RoomCheck).
      itemsConfirmed?: { item_id: string; quantity_confirmed: number }[]
      roomInfo?: {
        room_id: string
        room_number: string
        hotel_id?: string
        tenant_id?: string
        order_code?: string
        room_order_id?: string
        items?: { item_name: string; quantity: number }[]
      }
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      // roomOrderId = distribution_order_room.id (= p_stop_id ở RPC mới)
      const { data, error } = await supabase.rpc('deliver_stop', {
        p_stop_id: roomOrderId,
        p_actor_id: user.id,
      })

      if (error) throw error
      // Return an object combining the RPC result with roomInfo
      const rpcResult = data as unknown as DeliverStopResponse
      return { 
        success: rpcResult?.success ?? true,
        roomOrderId,
        roomInfo 
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['room-items'] })
      queryClient.invalidateQueries({ queryKey: ['room-distribution-history'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      // Không báo success ở đây - sẽ báo khi hoàn tất Room Check

      // Trigger workflow to auto-create delivery confirmation task
      if (result.roomInfo?.tenant_id) {
        triggerWorkflow({
          triggerType: WorkflowTriggerTypes.DELIVERY_STOP_COMPLETED,
          eventData: {
            room_order_id: result.roomOrderId,
            room_id: result.roomInfo.room_id,
            room_number: result.roomInfo.room_number,
            order_code: result.roomInfo.order_code,
            items: result.roomInfo.items,
            item_count: result.roomInfo.items?.length || 0,
          },
          tenantId: result.roomInfo.tenant_id,
          hotelId: result.roomInfo.hotel_id,
        }).catch(err => console.error('Workflow trigger failed:', err))
      }
    },
    onError: (error: Error) => {
      const originalMessage = error.message || ''
      
      // Map technical errors to Vietnamese user-friendly messages
      const DELIVER_STOP_ERROR_MESSAGES: Record<string, string> = {
        'Stop not found': 'Không tìm thấy phòng này trong phiếu',
        'Room order not found': 'Không tìm thấy thông tin phòng',
        'Order not in progress': 'Phiếu chưa ở trạng thái đang giao - vui lòng xác nhận nhận hàng trước',
        'You are not assigned to this order': 'Bạn không được phân công cho phiếu này',
        'You are not assigned to this route': 'Bạn không được phân công cho phiếu này',
        'Batch not received yet': 'Hàng chưa được xác nhận nhận - vui lòng xác nhận nhận hàng trước',
        'Batch not ready for delivery': 'Hàng chưa sẵn sàng để giao',
        'Stop already processed': 'Phòng này đã được xử lý rồi',
        'Stop already delivered': 'Phòng này đã được giao rồi',
      }
      
      let translatedMessage = 'Không thể giao hàng'
      for (const [key, value] of Object.entries(DELIVER_STOP_ERROR_MESSAGES)) {
        if (originalMessage.includes(key)) {
          translatedMessage = value
          break
        }
      }
      
      toast.error(translatedMessage)
    },
  })
}

/**
 * Mark a stop as cannot access
 */
export function useMarkCannotAccess() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      roomOrderId,
      exceptionType,
      exceptionReason,
    }: {
      roomOrderId: string
      exceptionType: ExceptionType
      exceptionReason?: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('mark_cannot_access', {
        p_room_order_id: roomOrderId,
        p_exception_type: exceptionType,
        p_exception_reason: exceptionReason || null,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as MarkCannotAccessResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      toast.success('Đã đánh dấu phòng không vào được')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể đánh dấu phòng')
    },
  })
}

/**
 * Retry a cannot_access stop
 */
export function useRetryStop() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ roomOrderId }: { roomOrderId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('retry_stop', {
        p_room_order_id: roomOrderId,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as RetryStopResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      toast.success('Đã đưa phòng về trạng thái chờ giao')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể retry')
    },
  })
}

/**
 * Return items to stock (required before handover)
 */
export function useReturnToStock() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ roomOrderId }: { roomOrderId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('return_to_stock_for_stop', {
        p_room_order_id: roomOrderId,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as ReturnToStockResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success('Đã trả hàng về kho')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể trả hàng về kho')
    },
  })
}

/**
 * Handover stop and create next route
 */
export function useHandoverStop() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      roomOrderId,
      nextShiftCode,
      nextAssigneeId,
    }: {
      roomOrderId: string
      nextShiftCode: ShiftCode
      nextAssigneeId?: string
    }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('handover_stop_create_next_route', {
        p_room_order_id: roomOrderId,
        p_next_shift_code: nextShiftCode,
        p_next_assignee_id: nextAssigneeId || null,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as HandoverStopResponse
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      toast.success(`Đã bàn giao và tạo route ${result.next_order_code}`)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể bàn giao')
    },
  })
}

/**
 * Close route when 100% complete
 */
export function useCloseRoute() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ orderId }: { orderId: string }) => {
      if (!user?.id) throw new Error('User not authenticated')

      const { data, error } = await supabase.rpc('close_route_if_complete', {
        p_order_id: orderId,
        p_actor_id: user.id,
      })

      if (error) throw error
      return data as unknown as CloseRouteResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      toast.success('Đã đóng route thành công')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể đóng route')
    },
  })
}

/**
 * Employee confirms receipt of all items for the order (deducts inventory)
 */
export interface InsufficientItem {
  item_id: string
  item_name: string
  item_code: string
  required: number
  available: number
  shortage: number
}

export interface ItemAdjustment {
  item_id: string
  quantity_actual: number
}

interface ConfirmReceiveResponse {
  success: boolean
  order_id?: string
  message?: string
  error?: string
  insufficient_items?: InsufficientItem[]
}

export interface ConfirmReceiveResult {
  success: boolean
  error?: string
  insufficient_items?: InsufficientItem[]
}

// Vietnamese error messages mapping
const CONFIRM_RECEIVE_ERROR_MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: 'Không tìm thấy phiếu giao hàng',
  INVALID_STATUS: 'Phiếu chưa được giao từ kho hoặc đã được xác nhận rồi',
  INSUFFICIENT_STOCK: 'Không đủ hàng trong kho để giao',
  ADJUSTMENT_EXCEEDS_STOCK: 'Số lượng điều chỉnh vượt quá tồn kho',
  NOT_ASSIGNEE: 'Bạn không phải là người được phân công nhận hàng',
}

export function useConfirmReceiveOrder() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ 
      orderId,
      silent,
    }: { 
      orderId: string
      silent?: boolean
    }): Promise<ConfirmReceiveResult & { _silent?: boolean }> => {
      if (!user?.id) throw new Error('Chưa đăng nhập')

      const { data, error } = await supabase.rpc('confirm_receive_order', {
        p_order_id: orderId,
        p_actor_id: user.id,
        p_adjustments: null, // Explicitly pass null to avoid ambiguous function call
      })

      if (error) {
        // Map Supabase error to Vietnamese
        const errorMessage = error.message || ''
        if (errorMessage.includes('Could not choose')) {
          throw new Error('Lỗi hệ thống, vui lòng thử lại sau')
        }
        throw new Error('Có lỗi xảy ra, vui lòng thử lại')
      }
      
      const response = data as unknown as ConfirmReceiveResponse
      
      if (!response.success) {
        const errorCode = response.error || ''
        const message = CONFIRM_RECEIVE_ERROR_MESSAGES[errorCode] || response.message || 'Có lỗi xảy ra, vui lòng thử lại'
        throw new Error(message)
      }
      
      return { success: true, _silent: silent }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['route-batches'] })
      queryClient.invalidateQueries({ queryKey: ['route-detail'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['distribution-order-detail'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['warehouse-stock'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses-with-stats'] })
      if (!result._silent) {
        toast.success('Đã xác nhận nhận hàng thành công')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Không thể xác nhận nhận hàng')
    },
  })
}