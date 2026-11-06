import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRoomCommandExecutor } from './useRoomCommandExecutor'
import type { RoomCommandResult } from '@/lib/room-transition-command'
import { toast } from '@/hooks/use-toast'
import { ROOM_STATUS_META_V2 } from '@/lib/roomStatus'
import type { RoomStatusV2 } from '@/types/rooms.types'
import { getFriendlyError } from '@/lib/errorMessage'

export interface RoomTransitionInput {
  roomId: string
  toStatus: RoomStatusV2
  reason?: string | null
  /** Hết hạn tự gỡ DND (ISO timestamp) */
  dndUntil?: string | null
  /** Hết hạn tự gỡ OOS (ISO timestamp) */
  oosUntil?: string | null
  /** Chủ khách sạn có thể bỏ qua validate transition */
  force?: boolean
}

/**
 * Hook chuẩn để chuyển trạng thái phòng theo state machine v2.
 * Thay thế cho mọi `update({ status })` thủ công ở client.
 *
 * - Gọi RPC `transition_room_status` (atomic, audit log, kiểm role).
 * - Map lỗi sang tiếng Việt.
 * - Tự invalidate các query liên quan.
 */
export function useRoomTransition() {
  const queryClient = useQueryClient()
  const execute = useRoomCommandExecutor()

  return useMutation<RoomCommandResult, Error, RoomTransitionInput>({
    mutationFn: execute,
    onSuccess: (data, vars) => {
      if (!execute.isCurrent()) return
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room', vars.roomId] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      queryClient.invalidateQueries({ queryKey: ['room-detail', vars.roomId] })
      queryClient.invalidateQueries({ queryKey: ['audit-log'] })

      toast({
        title: 'Đã cập nhật trạng thái',
        description: `Phòng ở trạng thái "${ROOM_STATUS_META_V2[data.to].label}".`,
      })
    },
    onError: (error) => {
      if (!execute.isCurrent()) return
      toast({
        title: 'Không cập nhật được trạng thái',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
