import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { mapLeanError } from '@/lib/roomCheckLeanErrors'

/**
 * Lean Room Check — submit chuẩn (1 RPC, atomic, conflict check).
 * Khác Quick Path: cho phép daily/periodic/checkin/checkout/maintenance,
 * nhận đầy đủ jsonb buckets từ form.
 */
export interface SubmitRoomCheckLeanParams {
  roomId: string
  checkType: 'daily' | 'periodic' | 'checkin' | 'checkout' | 'maintenance'
  startedAt: string
  notes?: string | null
  photos?: string[]
  itemsMissing?: any[]
  itemsDamaged?: any[]
  itemsLost?: any[]
  itemsConsumed?: any[]
  itemsReplaced?: any[]
  /** Đợt B: bucket linen gửi giặt */
  itemsSentToLaundry?: any[]
  taskId?: string | null
}

export function useSubmitRoomCheckLean() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: SubmitRoomCheckLeanParams) => {
      const { data, error } = await supabase.rpc('submit_room_check_lean', {
        _room_id: p.roomId,
        _check_type: p.checkType,
        _started_at: p.startedAt,
        _notes: p.notes ?? null,
        _photos: p.photos && p.photos.length ? p.photos : [],
        _items_missing: (p.itemsMissing ?? []) as any,
        _items_damaged: (p.itemsDamaged ?? []) as any,
        _items_lost: (p.itemsLost ?? []) as any,
        _items_consumed: (p.itemsConsumed ?? []) as any,
        _items_replaced: (p.itemsReplaced ?? []) as any,
        // _items_sent_to_laundry là tham số mới — chỉ truyền khi RPC support.
        // Cho phép bỏ qua an toàn nếu RPC chưa biết tham số (Postgres sẽ ignore khi
        // dùng named args và RPC chưa có default → server sẽ báo. Ta thử và fallback.)
        ...(p.itemsSentToLaundry && p.itemsSentToLaundry.length
          ? { _items_sent_to_laundry: p.itemsSentToLaundry as any }
          : {}),
        _task_id: p.taskId ?? null,
      } as any)
      if (error) {
        const m = mapLeanError(error.message)
        const e = new Error(m.message) as Error & { itemId?: string }
        e.itemId = m.itemId
        throw e
      }
      return data as {
        check_id: string
        room_id: string
        summary_ok_count: number
        summary_issue_count: number
        minibar_count: number
      }
    },
    onSuccess: (data) => {
      const issues = data.summary_issue_count
      toast.success(
        issues === 0
          ? 'Đã gửi kiểm phòng. Phòng sạch, không có sự cố.'
          : `Đã gửi kiểm phòng. Ghi nhận ${issues} sự cố.`
      )
      // Xoá draft localStorage
      try {
        localStorage.removeItem(`room-check-${data.room_id}`)
      } catch { /* draft cleanup is best effort */ }
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-last-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['last-room-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })
}

/**
 * Reopen room check (supervisor only).
 */
export function useReopenRoomCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ checkId, reason }: { checkId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('reopen_room_check', {
        _check_id: checkId,
        _reason: reason ?? null,
      })
      if (error) throw new Error(mapLeanError(error.message).message)
      return data as { check_id: string; status: string }
    },
    onSuccess: () => {
      toast.success('Đã mở lại bản kiểm phòng.')
      qc.invalidateQueries({ queryKey: ['room-checks'] })
      qc.invalidateQueries({ queryKey: ['last-room-check'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
