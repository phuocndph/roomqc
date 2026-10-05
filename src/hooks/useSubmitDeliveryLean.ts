import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { mapDbError } from '@/lib/dbErrors'

export interface DeliveryActualItem {
  /** distribution_order_items.id */
  item_id: string
  quantity_actual: number
  notes?: string | null
}

export interface SubmitDeliveryLeanParams {
  roomId: string
  distributionOrderRoomId: string
  /** Bỏ trống => xác nhận giao đủ (forward sang confirm_delivery_from_room_check) */
  itemsActual?: DeliveryActualItem[]
  notes?: string | null
  photos?: string[]
  taskId?: string | null
}

/**
 * Lean Delivery — gửi 1 RPC atomic:
 *  - Insert room_check (check_type='delivery', check_mode='lean')
 *  - Forward sang confirm_warehouse_delivery / confirm_delivery_from_room_check
 *    để cộng tồn + đổi trạng thái đơn distribution_order_rooms
 *  - Đóng task (nếu có)
 *  - Ghi audit log
 *
 * Phase 1: hook sẵn cho Phase 3 wire UI.
 */
export function useSubmitDeliveryLean() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: SubmitDeliveryLeanParams) => {
      const { data, error } = await supabase.rpc('submit_delivery_lean' as any, {
        _room_id: p.roomId,
        _distribution_order_room_id: p.distributionOrderRoomId,
        _items_actual: p.itemsActual ? (p.itemsActual as any) : null,
        _notes: p.notes ?? null,
        _photos: p.photos ?? [],
        _task_id: p.taskId ?? null,
      })
      if (error) throw new Error(mapDbError(error.message))
      return data as {
        check_id: string
        room_id: string
        distribution_order_room_id: string
        confirm: any
      }
    },
    onSuccess: (data) => {
      toast.success('Đã xác nhận giao kho cho phòng.')
      try {
        localStorage.removeItem(`room-delivery-${data.room_id}`)
      } catch { /* draft cleanup is best effort */ }
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['distribution-orders'] })
      qc.invalidateQueries({ queryKey: ['distribution-order', data.distribution_order_room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
