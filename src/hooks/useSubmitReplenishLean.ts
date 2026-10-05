import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { mapDbError } from '@/lib/dbErrors'

export interface ReplenishLeanItem {
  item_id?: string | null
  item_name: string
  /** 'missing_replace' (mặc định) hoặc 'damaged_lost' */
  bucket?: 'missing_replace' | 'damaged_lost'
  /** UI action label, default 'replenish' */
  ui_action?: string
  sub_reason?: string | null
  qty?: number
  photos?: string[]
  notes?: string | null
  client_issue_id?: string
  extra?: Record<string, unknown>
}

export interface SubmitReplenishLeanParams {
  roomId: string
  items: ReplenishLeanItem[]
  cleaningRequested?: boolean
  notes?: string | null
  photos?: string[]
  taskId?: string | null
}

/**
 * Lean Replenish — gửi 1 RPC atomic:
 *  - Insert room_check (check_type='replenish', check_mode='lean')
 *  - Insert room_check_issues cho từng món bổ sung/thiếu
 *  - Đóng task (nếu có) qua transition_task_status
 *  - Ghi audit log
 *
 * Phase 1: chỉ hook + RPC; UI sẽ wire ở Phase 2.
 */
export function useSubmitReplenishLean() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: SubmitReplenishLeanParams) => {
      const { data, error } = await supabase.rpc('submit_replenish_lean' as any, {
        _room_id: p.roomId,
        _items: (p.items ?? []) as any,
        _cleaning_requested: !!p.cleaningRequested,
        _notes: p.notes ?? null,
        _photos: p.photos ?? [],
        _task_id: p.taskId ?? null,
      })
      if (error) throw new Error(mapDbError(error.message))
      return data as {
        check_id: string
        room_id: string
        issue_count: number
      }
    },
    onSuccess: (data) => {
      toast.success(
        data.issue_count === 0
          ? 'Đã ghi nhận bổ sung. Phòng đủ đồ.'
          : `Đã ghi nhận bổ sung. Có ${data.issue_count} món cần xử lý.`,
      )
      try {
        localStorage.removeItem(`room-replenish-${data.room_id}`)
      } catch { /* draft cleanup is best effort */ }
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
