import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { triggerRoomCheckoutNotification } from '@/hooks/useNotificationTriggers'
import { useUser } from '@/hooks/useUser'
import type { RoomStatus } from '@/types/rooms.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function useBulkApplyStandards() {
  const queryClient = useQueryClient()
  const { user } = useUser()

  return useMutation({
    mutationFn: async ({
      roomIds,
      onProgress,
    }: {
      roomIds: string[]
      onProgress?: (current: number, total: number) => void
    }) => {
      let totalAdded = 0
      let totalUpdated = 0
      const failedRooms: string[] = []
      const skippedRooms: string[] = []

      for (let i = 0; i < roomIds.length; i++) {
        const roomId = roomIds[i]
        onProgress?.(i + 1, roomIds.length)
        try {
          const { data, error } = await supabase.rpc('apply_room_standards', {
            p_room_id: roomId,
            p_user_id: user?.id,
          })
          if (error) throw error
          const result = data as { added?: number; updated?: number; skipped?: boolean } | null
          if (result?.skipped) {
            skippedRooms.push(roomId)
          } else {
            totalAdded += result?.added ?? 0
            totalUpdated += result?.updated ?? 0
          }
        } catch (err) {
          console.error('Apply standards failed for room', roomId, err)
          failedRooms.push(roomId)
        }
      }

      return {
        total: roomIds.length,
        success: roomIds.length - failedRooms.length,
        totalAdded,
        totalUpdated,
        failedRooms,
        skippedRooms,
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })

      const parts: string[] = []
      parts.push(`${result.success}/${result.total} phòng`)
      if (result.totalAdded > 0) parts.push(`${result.totalAdded} thêm mới`)
      if (result.totalUpdated > 0) parts.push(`${result.totalUpdated} cập nhật`)
      if (result.failedRooms.length > 0) parts.push(`${result.failedRooms.length} thất bại`)

      toast({
        title: result.failedRooms.length > 0 ? 'Hoàn tất với cảnh báo' : 'Áp dụng tiêu chuẩn thành công',
        description: parts.join(' · '),
        variant: result.failedRooms.length > 0 ? 'destructive' : 'default',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi áp dụng tiêu chuẩn',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useBulkDeleteRooms() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roomIds: string[]) => {
      // Check if any room has items or checks
      const { data: roomItems } = await supabase
        .from('room_items')
        .select('room_id')
        .in('room_id', roomIds)

      const { data: roomChecks } = await supabase
        .from('room_checks')
        .select('room_id')
        .in('room_id', roomIds)

      const roomsWithItems = new Set(roomItems?.map(ri => ri.room_id) || [])
      const roomsWithChecks = new Set(roomChecks?.map(rc => rc.room_id) || [])
      
      const blockedRooms = roomIds.filter(
        id => roomsWithItems.has(id) || roomsWithChecks.has(id)
      )

      if (blockedRooms.length > 0) {
        throw new Error(`${blockedRooms.length} phòng có dữ liệu liên quan và không thể xóa`)
      }

      const { error } = await supabase
        .from('rooms')
        .delete()
        .in('id', roomIds)

      if (error) throw error
      return roomIds.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })
      toast({
        title: 'Xóa thành công',
        description: `Đã xóa ${count} phòng`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi xóa phòng',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}

export function useBulkUpdateRoomStatus() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async ({ roomIds, status }: { roomIds: string[]; status: RoomStatus }) => {
      // State Machine v2: notification trigger khi chuyển sang vacant_dirty (sau checkout)
      // hoặc các status legacy 'check_out'/'cleaning' để backward compat.
      const isCheckoutLike = status === 'vacant_dirty' || status === 'check_out' || status === 'cleaning'

      let roomsData: Array<{ id: string; room_number: string; hotel_id: string }> = []
      if (isCheckoutLike) {
        const { data } = await supabase
          .from('rooms')
          .select('id, room_number, hotel_id')
          .in('id', roomIds)
        roomsData = data || []
      }

      // State Machine v2: gọi RPC từng phòng để có audit log + kiểm transition.
      // Lỗi INVALID_TRANSITION/PERMISSION_DENIED được gom lại thay vì throw cả batch.
      const failures: Array<{ roomId: string; reason: string }> = []
      for (const id of roomIds) {
        const { error } = await supabase.rpc('transition_room_status', {
          _room_id: id,
          _to_status: status as RoomStatus,
          _reason: 'Cập nhật hàng loạt (bulk action)',
        })
        if (error) failures.push({ roomId: id, reason: error.message })
      }
      if (failures.length === roomIds.length) {
        throw new Error(failures[0]?.reason || 'Không cập nhật được trạng thái')
      }
      if (failures.length > 0) {
        console.warn('[useBulkRoomActions] Một số phòng không chuyển được:', failures)
      }
      return { count: roomIds.length, status, roomsData, isCheckoutLike }
    },
    onSuccess: ({ count, status, roomsData, isCheckoutLike }) => {
      // Send notification for each room transitioned to vacant_dirty (post-checkout)
      if (isCheckoutLike && tenantId) {
        roomsData.forEach(room => {
          if (room.hotel_id) {
            triggerRoomCheckoutNotification({
              tenantId,
              hotelId: room.hotel_id,
              roomId: room.id,
              roomNumber: room.room_number,
            }).catch(err => console.error('Bulk checkout notification error:', err))
          }
        })
      }

      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['room-stats'] })
      queryClient.invalidateQueries({ queryKey: ['floor-plan'] })

      // Label tiếng Việt cho cả status v2 lẫn legacy
      const statusLabels: Partial<Record<RoomStatus, string>> = {
        // v2
        vacant_clean: 'Trống – đã dọn',
        vacant_inspected: 'Trống – đã QC',
        vacant_dirty: 'Trống – chưa dọn',
        occupied_clean: 'Đang ở – đã dọn',
        occupied_dirty: 'Đang ở – cần dọn',
        dnd: 'Không làm phiền',
        service_refused: 'Khách từ chối dọn',
        sleep_out: 'Khách ngủ ngoài',
        skipper: 'Khách bỏ trốn',
        out_of_order: 'Phòng hỏng',
        out_of_service: 'Tạm ngừng',
        // legacy aliases
        vacant: 'Trống',
        occupied: 'Có khách',
        cleaning: 'Đang dọn',
        maintenance: 'Bảo trì',
        check_in: 'Check-in',
        check_out: 'Check-out',
      }
      toast({
        title: 'Cập nhật thành công',
        description: `Đã cập nhật ${count} phòng sang "${statusLabels[status] ?? status}"`,
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Lỗi cập nhật',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    },
  })
}
