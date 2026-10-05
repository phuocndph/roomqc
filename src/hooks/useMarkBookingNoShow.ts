import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'

interface Input {
  bookingId: string
  reason: string
  refundDeposit: boolean
}

/** Đánh dấu booking là No-Show (chỉ áp dụng cho booking confirmed đã quá giờ check-in). */
export function useMarkBookingNoShow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookingId, reason, refundDeposit }: Input) => {
      const { data, error } = await supabase.rpc('mark_booking_no_show', {
        _booking_id: bookingId,
        _reason: reason,
        _refund_deposit: refundDeposit,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overdue-checkins'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['room-bookings'] })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Đã đánh dấu khách No-Show')
    },
    onError: (err: any) => toast.error(mapDbError(err?.message ?? String(err))),
  })
}
