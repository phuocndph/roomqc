import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRoomOperationExecutor } from './useRoomOperationExecutor'
import { roomOperationErrorMessage } from '@/lib/room-operation-client'
import { parseNoShowDepositResolution } from '@/lib/room-operation-command'
import { formatCurrency } from '@/lib/utils'

interface Input {
  bookingId: string
  reason: string
  refundDeposit: boolean
  roomId?: string
}

/** Đánh dấu booking là No-Show (chỉ áp dụng cho booking confirmed đã quá giờ check-in). */
export function useMarkBookingNoShow(viewScope = '') {
  const qc = useQueryClient()
  const execute = useRoomOperationExecutor(viewScope)
  const mutation = useMutation({
    mutationFn: async ({ bookingId, reason, refundDeposit, roomId }: Input) => {
      const { data } = await execute('resolve_booking_no_show', {
        p_booking_id: bookingId, p_reason: reason, p_refund_deposit: refundDeposit,
      }, roomId ? [roomId] : [])
      return data
    },
    onSuccess: data => {
      if (!execute.isCurrent()) return
      for (const key of ['overdue-checkins', 'bookings', 'all-bookings', 'booking', 'booking-detail', 'room-bookings', 'rooms', 'booking-no-show-resolution', 'audit-log', 'revenue-report']) void qc.invalidateQueries({ queryKey: [key] })
      const resolution = parseNoShowDepositResolution(data.deposit_resolution)
      toast.success('Đã đánh dấu khách không đến', { description: resolution.refund_due_amount > 0
        ? `Cần hoàn cọc ${formatCurrency(resolution.refund_due_amount)} và đối soát riêng.`
        : resolution.retained_amount > 0 ? `Đã chuyển cọc ${formatCurrency(resolution.retained_amount)} thành phí no-show.` : undefined })
    },
    onError: err => { if (execute.isCurrent()) toast.error(roomOperationErrorMessage(err)) },
  })
  return Object.assign(mutation, { isCurrent: execute.isCurrent })
}
