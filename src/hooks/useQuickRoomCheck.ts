import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { useRoomOperationExecutor } from './useRoomOperationExecutor'
import { roomOperationErrorMessage } from '@/lib/room-operation-client'
import { ROOM_STATUS_META_V2 } from '@/lib/roomStatus'
import { mapDbError } from '@/lib/dbErrors'
import { getFriendlyError } from '@/lib/errorMessage'
import { resolveRoomCheckPhotoUrls } from '@/lib/roomCheckPhotos'

export type QuickCheckType = 'daily' | 'periodic'

export interface LastRoomCheck {
  id: string
  check_type: string
  checked_at: string
  checked_by: string
  checker_name: string
  cleanliness_score: number | null
  items_complete: boolean | null
  photos: string[] | null
  notes: string | null
  issues_count: number
  qc_status: string | null
}

/**
 * Lấy lần kiểm phòng gần nhất — phục vụ Context Card.
 */
export function useLastRoomCheck(roomId: string | undefined) {
  return useQuery({
    queryKey: ['last-room-check', roomId],
    enabled: !!roomId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_last_room_check', { _room_id: roomId! })
      if (error) throw error
      const row = data?.[0] ?? null
      return row ? ({ ...row, photos: await resolveRoomCheckPhotoUrls(row.photos) } as LastRoomCheck) : null
    },
  })
}

interface QuickCheckParams {
  roomId: string
  checkType: QuickCheckType
  notes?: string
  photos?: string[]
}

/**
 * Hoàn tất nhanh "Phòng OK hoàn toàn" — gọi RPC perform_quick_room_check.
 * Audit log + tenant guard + photo evidence được xử lý server-side.
 */
export function useQuickRoomCheck(scopeRoomId = '') {
  const qc = useQueryClient()
  const execute = useRoomOperationExecutor(scopeRoomId)
  const mutation = useMutation({
    onMutate: () => ({ current: execute.isCurrent }),
    mutationFn: async ({ roomId, checkType, notes, photos }: QuickCheckParams) => {
      const { data } = await execute('perform_quick_room_check', {
        _room_id: roomId,
        _check_type: checkType,
        _notes: notes ?? null,
        _photos: photos && photos.length > 0 ? photos : [],
      })
      return data as unknown as { check_id: string; room_id: string; old_status: string; new_status: string }
    },
    onSuccess: (data, _variables, scope) => {
      if (!scope?.current()) return
      toast({
        title: 'Đã lưu lần kiểm nhanh',
        description: `${data.old_status === data.new_status ? 'Trạng thái phòng giữ nguyên' : 'Trạng thái phòng'}: ${ROOM_STATUS_META_V2[data.new_status]?.label ?? data.new_status}`,
      })
      qc.invalidateQueries({ queryKey: ['rooms'] })
      qc.invalidateQueries({ queryKey: ['room', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-checks', data.room_id] })
      qc.invalidateQueries({ queryKey: ['room-last-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['last-room-check', data.room_id] })
      qc.invalidateQueries({ queryKey: ['housekeeping-tasks'] })
    },
    onError: (err: Error, _variables, scope) => {
      if (!scope?.current()) return
      toast({
        title: 'Không thể xác nhận nhanh',
        description: roomOperationErrorMessage(err),
        variant: 'destructive',
      })
    },
  })
  return Object.assign(mutation, { isCurrent: execute.isCurrent })
}
