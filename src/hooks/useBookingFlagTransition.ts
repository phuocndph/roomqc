import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'

export type BookingFlagStatus =
  | 'checked_in'
  | 'sleep_out'
  | 'skipper'
  | 'checked_out'
  | 'cancelled'
  | 'no_show'

interface Input {
  bookingId: string
  toStatus: BookingFlagStatus
  reason?: string
  amountOwed?: number
}

/** Hook gọi RPC `transition_booking_status` cho FO flip sleep_out / skipper. */
export function useBookingFlagTransition() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingId, toStatus, reason, amountOwed }: Input) => {
      const { data, error } = await supabase.rpc('transition_booking_status', {
        _booking_id: bookingId,
        _to_status: toStatus,
        _reason: reason ?? null,
        _amount_owed: amountOwed ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['room-bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      const labels: Record<BookingFlagStatus, string> = {
        checked_in: 'Đã đưa booking về Đang ở',
        sleep_out: 'Đã đánh dấu Khách ngủ ngoài',
        skipper: 'Đã đánh dấu Khách bỏ trốn',
        checked_out: 'Đã trả phòng',
        cancelled: 'Đã hủy booking',
        no_show: 'Đã đánh dấu No-show',
      }
      toast.success(labels[vars.toStatus] ?? 'Đã cập nhật booking')
    },
    onError: (err: any) => toast.error(mapDbError(err)),
  })
}
