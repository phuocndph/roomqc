import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
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
  /** Owner/Super Admin có thể bỏ qua validate transition */
  force?: boolean
}

interface TransitionResult {
  room_id: string
  from: string
  to: string
  legacy_status: string
}

/**
 * Bảng map lỗi RPC (UPPER_SNAKE) sang thông điệp tiếng Việt.
 */
function mapRpcError(message: string): string {
  if (message.includes('NOT_AUTHENTICATED')) return 'Vui lòng đăng nhập lại.'
  if (message.includes('TENANT_READ_ONLY')) return 'Tài khoản đang ở chế độ chỉ đọc. Vui lòng gia hạn để tiếp tục thao tác.'
  if (message.includes('ROOM_NOT_FOUND')) return 'Không tìm thấy phòng. Có thể đã bị xóa.'
  if (message.includes('TENANT_MISMATCH')) return 'Phòng không thuộc tenant của bạn.'
  if (message.includes('INVALID_TRANSITION')) return 'Không thể chuyển trạng thái này từ trạng thái hiện tại.'
  if (message.includes('FORCE_REQUIRES_OWNER')) return 'Chỉ Chủ khách sạn mới có quyền ép chuyển trạng thái.'
  if (message.includes('PERMISSION_DENIED_FOR_TRANSITION')) return 'Bạn không có quyền thực hiện chuyển trạng thái này.'
  if (message.includes('DND_UNTIL_MUST_BE_FUTURE')) return 'Thời điểm gỡ DND phải ở tương lai.'
  if (message.includes('OOS_UNTIL_MUST_BE_FUTURE')) return 'Thời điểm gỡ OOS phải ở tương lai.'
  return message || 'Lỗi không xác định khi chuyển trạng thái phòng.'
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

  return useMutation<TransitionResult, Error, RoomTransitionInput>({
    mutationFn: async ({ roomId, toStatus, reason, dndUntil, oosUntil, force }) => {
      const { data, error } = await supabase.rpc('transition_room_status', {
        _room_id: roomId,
        _to_status: toStatus,
        _reason: reason ?? undefined,
        _dnd_until: dndUntil ?? undefined,
        _oos_until: oosUntil ?? undefined,
        _force: force ?? false,
      })

      if (error) throw new Error(mapRpcError(error.message))
      return data as unknown as TransitionResult
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room', vars.roomId] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      queryClient.invalidateQueries({ queryKey: ['room-detail', vars.roomId] })
      queryClient.invalidateQueries({ queryKey: ['audit-log'] })

      toast({
        title: 'Đã cập nhật trạng thái',
        description: `Phòng chuyển sang "${ROOM_STATUS_META_V2[vars.toStatus].label}".`,
      })
    },
    onError: (error) => {
      toast({
        title: 'Không cập nhật được trạng thái',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
