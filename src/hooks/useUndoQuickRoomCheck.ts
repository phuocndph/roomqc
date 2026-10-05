import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

function mapUndoError(msg: string): string {
  if (msg.includes('not_quick_check'))
    return 'Chỉ huỷ được lần kiểm nhanh.'
  if (msg.startsWith('undo_window_expired'))
    return 'Đã quá 10 phút, không thể hoàn tác. Vui lòng tạo lần kiểm mới.'
  if (msg.includes('newer_check_exists'))
    return 'Phòng đã có lần kiểm mới hơn. Không thể hoàn tác.'
  if (msg.includes('forbidden_role') || msg.includes('forbidden_tenant'))
    return 'Bạn không có quyền hoàn tác lần kiểm này.'
  if (msg.includes('check_not_found')) return 'Không tìm thấy bản kiểm.'
  return msg
}

/**
 * Hoàn tác một quick check vừa gửi (cửa sổ 10 phút).
 * Soft delete: status → 'undone', không xoá row.
 */
export function useUndoQuickRoomCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      checkId,
      reason,
    }: {
      checkId: string
      reason?: string
    }) => {
      const { data, error } = await supabase.rpc('undo_quick_room_check', {
        _check_id: checkId,
        _reason: reason ?? null,
      })
      if (error) throw new Error(mapUndoError(error.message))
      return data as { check_id: string; status: string; room_id: string }
    },
    onSuccess: (data) => {
      toast.success('Đã hoàn tác lần kiểm.')
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['last-room-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-last-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })
}
