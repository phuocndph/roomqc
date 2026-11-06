import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useRoomOperationExecutor } from './useRoomOperationExecutor'
import { roomOperationErrorMessage } from '@/lib/room-operation-client'

/**
 * Hoàn tác một quick check vừa gửi (cửa sổ 10 phút).
 * Soft delete: status → 'undone', không xoá row.
 */
export function useUndoQuickRoomCheck(scopeCheckId = '') {
  const qc = useQueryClient()
  const execute = useRoomOperationExecutor(scopeCheckId)
  const mutation = useMutation({
    onMutate: () => ({ current: execute.isCurrent }),
    mutationFn: async ({
      checkId,
      reason,
    }: {
      checkId: string
      reason?: string
    }) => {
      const { data } = await execute('undo_quick_room_check', {
        _check_id: checkId,
        _reason: reason ?? null,
      })
      return data as unknown as { check_id: string; status: string; room_id: string }
    },
    onSuccess: (data, _variables, scope) => {
      if (!scope?.current()) return
      toast.success('Đã hoàn tác lần kiểm.', { description: 'Trạng thái phòng không được hoàn nguyên bởi thao tác này.' })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['last-room-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-last-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (err: Error, _variables, scope) => { if (scope?.current()) toast.error(roomOperationErrorMessage(err)) },
  })
  return Object.assign(mutation, { isCurrent: execute.isCurrent })
}
