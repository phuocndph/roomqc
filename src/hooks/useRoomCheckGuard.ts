import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { mapDbError } from '@/lib/dbErrors'

export interface RoomCheckContext {
  ok: true
  tenant_id: string
  hotel_id: string | null
  room_id: string
  task_id: string | null
  check_type: string
  is_manager: boolean
}

/**
 * Server-side validate ngữ cảnh trước khi mở RoomCheck UI.
 * Gọi RPC `validate_room_check_context` để bảo đảm:
 *  - User có tenant
 *  - Phòng/task tồn tại + thuộc đúng tenant
 *  - Staff chỉ mở task của mình; manager mở mọi task
 *  - check_type nằm trong tập hợp lệ
 *
 * Nếu RPC raise lỗi UPPER_SNAKE → mapDbError sang tiếng Việt cho UI.
 */
export function useRoomCheckGuard(params: {
  roomId: string | null | undefined
  checkType: string | null | undefined
  taskId?: string | null
}) {
  const { roomId, checkType, taskId } = params

  return useQuery<RoomCheckContext>({
    queryKey: ['room-check-guard', roomId, checkType, taskId ?? null],
    enabled: !!roomId && !!checkType,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('validate_room_check_context', {
        p_room_id: roomId!,
        p_check_type: checkType!,
        p_task_id: taskId || null,
      })

      if (error) throw new Error(mapDbError(error.message))
      return data as unknown as RoomCheckContext
    },
  })
}
