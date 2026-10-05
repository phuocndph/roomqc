import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

export type IssueResolution = 'charge_guest' | 'waive' | 'internal'
export type IssueListKey = 'items_damaged' | 'items_lost'

export interface RoomCheckItem {
  item_id?: string
  item_name?: string
  item_code?: string
  item_type?: string
  quantity?: number
  damage_type?: 'repairable' | 'replacement_needed'
  damage_cost?: number
  reason?: string
  resolution?: IssueResolution
}

/**
 * Cập nhật một item trong JSONB array (items_damaged hoặc items_lost) của room_checks.
 * Sử dụng read-modify-write vì supabase-js không hỗ trợ jsonb_set trực tiếp.
 */
export function useUpdateRoomCheckItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      roomCheckId,
      listKey,
      itemIndex,
      patch,
    }: {
      roomCheckId: string
      listKey: IssueListKey
      itemIndex: number
      patch: Partial<RoomCheckItem>
    }) => {
      const { data: current, error: fetchError } = await supabase
        .from('room_checks')
        .select(`id, ${listKey}`)
        .eq('id', roomCheckId)
        .single()

      if (fetchError) throw fetchError

      const list = Array.isArray((current as any)?.[listKey])
        ? [...((current as any)[listKey] as any[])]
        : []
      if (itemIndex < 0 || itemIndex >= list.length) {
        throw new Error('Item không tồn tại')
      }

      list[itemIndex] = { ...list[itemIndex], ...patch }

      const { error: updateError } = await supabase
        .from('room_checks')
        .update({ [listKey]: list as any })
        .eq('id', roomCheckId)

      if (updateError) throw updateError
      return { roomCheckId, listKey, itemIndex, patch }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-issues'] })
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Không thể cập nhật sự cố')
    },
  })
}

/**
 * Đồng bộ phụ thu damage_charges của booking từ các item có resolution = charge_guest.
 */
export function useSyncBookingDamageCharges() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      bookingId,
      damageCharges,
      damageItems,
    }: {
      bookingId: string
      damageCharges: number
      damageItems: any[]
    }) => {
      // Lấy booking hiện tại để tính lại total_amount
      const { data: booking, error: fetchError } = await supabase
        .from('room_bookings')
        .select('id, total_amount, damage_charges, payment_status, amount_paid, deposit_amount')
        .eq('id', bookingId)
        .single()

      if (fetchError) throw fetchError

      const oldDamage = booking.damage_charges || 0
      const newTotal = (booking.total_amount || 0) - oldDamage + damageCharges

      // Nếu đã paid mà có thêm phụ thu → đẩy về partial
      let newPaymentStatus = booking.payment_status
      const totalPaid = (booking.amount_paid || 0) + (booking.deposit_amount || 0)
      if (newTotal > totalPaid && totalPaid > 0) {
        newPaymentStatus = 'partial'
      } else if (newTotal <= totalPaid && totalPaid > 0) {
        newPaymentStatus = 'paid'
      }

      const { error: updateError } = await supabase
        .from('room_bookings')
        .update({
          damage_charges: damageCharges,
          damage_items: damageItems as any,
          total_amount: newTotal,
          payment_status: newPaymentStatus,
        })
        .eq('id', bookingId)

      if (updateError) throw updateError
      return { bookingId, damageCharges, newTotal }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['booking-detail', data.bookingId] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking-issues'] })
      toast.success(`Đã đồng bộ phụ thu: ${new Intl.NumberFormat('vi-VN').format(data.damageCharges)} ₫`)
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Không thể đồng bộ phụ thu')
    },
  })
}
