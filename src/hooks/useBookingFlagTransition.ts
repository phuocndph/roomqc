import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRoomOperationExecutor } from './useRoomOperationExecutor'
import { roomOperationErrorMessage } from '@/lib/room-operation-client'

export type BookingFlagStatus =
  | 'checked_in'
  | 'sleep_out'
  | 'skipper'

interface Input {
  bookingId: string
  toStatus: BookingFlagStatus
  reason?: string
  amountOwed?: number
  roomId?: string
}

/** Cờ lưu trú dùng command, receipt và cơ chế phục hồi chung. */
export function useBookingFlagTransition(viewScope = '') {
  const qc = useQueryClient()
  const execute = useRoomOperationExecutor(viewScope)

  return useMutation({
    mutationFn: async ({ bookingId, toStatus, reason, amountOwed, roomId }: Input) => {
      const { data } = await execute('transition_booking_flag', {
        p_booking_id: bookingId, p_to_status: toStatus, p_reason: reason ?? null, p_amount_owed: amountOwed ?? null,
      }, roomId ? [roomId] : [])
      return data.booking
    },
    onSuccess: (_d, vars) => {
      if (!execute.isCurrent()) return
      qc.invalidateQueries({ queryKey: ['room-bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      const labels: Record<BookingFlagStatus, string> = {
        checked_in: 'Đã đưa booking về Đang ở',
        sleep_out: 'Đã đánh dấu Khách ngủ ngoài',
        skipper: 'Đã đánh dấu Khách bỏ trốn',
      }
      toast.success(labels[vars.toStatus] ?? 'Đã cập nhật booking')
    },
    onError: err => { if (execute.isCurrent()) toast.error(roomOperationErrorMessage(err)) },
  })
}
