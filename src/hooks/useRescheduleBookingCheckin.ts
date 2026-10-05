import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapDbError } from '@/lib/dbErrors'

interface Input {
  bookingId: string
  newCheckInDate: string // yyyy-MM-dd
  newCheckOutDate: string
  reason?: string
}

/** Dời ngày check-in cho booking confirmed (giữ phòng, không huỷ). */
export function useRescheduleBookingCheckin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ bookingId, newCheckInDate, newCheckOutDate, reason }: Input) => {
      const { data, error } = await supabase.rpc('reschedule_booking_checkin', {
        _booking_id: bookingId,
        _new_check_in_date: newCheckInDate,
        _new_check_out_date: newCheckOutDate,
        _reason: reason ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overdue-checkins'] })
      qc.invalidateQueries({ queryKey: ['all-bookings'] })
      qc.invalidateQueries({ queryKey: ['booking-stats'] })
      qc.invalidateQueries({ queryKey: ['group-booking'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['room-bookings'] })
      qc.invalidateQueries({ queryKey: ['room-availability-window'] })
      toast.success('Đã dời ngày check-in')
    },
    onError: (err: any) => toast.error(mapDbError(err?.message ?? String(err))),
  })
}
