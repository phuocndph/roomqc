import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { logActivity } from '@/lib/activityLogger'
import type { RoomCheckLeanConfig } from './useRoomCheckLeanConfig'

/**
 * Cập nhật hotels.settings.room_check (merge JSONB).
 * Chỉ Owner / Manager có quyền manage settings nên được dùng.
 */
export function useUpdateRoomCheckLeanConfig() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      hotelId,
      patch,
    }: {
      hotelId: string
      patch: Partial<RoomCheckLeanConfig>
    }) => {
      // Đọc current settings + tên hotel để merge và log audit
      const { data: row, error: readErr } = await supabase
        .from('hotels')
        .select('name, settings')
        .eq('id', hotelId)
        .maybeSingle()
      if (readErr) throw readErr

      const current = (row?.settings as any) ?? {}
      const oldRoomCheck = (current.room_check ?? {}) as Record<string, unknown>
      const newRoomCheck = { ...oldRoomCheck, ...patch }
      const newSettings = {
        ...current,
        room_check: newRoomCheck,
      }

      const { error } = await supabase
        .from('hotels')
        .update({ settings: newSettings })
        .eq('id', hotelId)
      if (error) throw error

      // Audit log — chỉ ghi các key thực sự thay đổi
      const changedKeys = Object.keys(patch).filter(
        (k) => (oldRoomCheck as any)[k] !== (patch as any)[k],
      )
      if (changedKeys.length) {
        const oldValues: Record<string, unknown> = {}
        const newValues: Record<string, unknown> = {}
        for (const k of changedKeys) {
          oldValues[k] = (oldRoomCheck as any)[k]
          newValues[k] = (patch as any)[k]
        }
        try {
          await logActivity({
            action: 'updated',
            entityType: 'hotel_room_check_settings',
            entityId: hotelId,
            entityName: row?.name || 'Khách sạn',
            description: `Cập nhật cấu hình kiểm tra phòng: ${changedKeys.join(', ')}`,
            oldValues,
            newValues,
          })
        } catch (logErr) {
          console.warn('[useUpdateRoomCheckLeanConfig] audit log failed', logErr)
        }
      }

      return newRoomCheck as RoomCheckLeanConfig
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['room-check-lean-config', vars.hotelId] })
      qc.invalidateQueries({ queryKey: ['hotels'] })
      toast.success('Đã cập nhật cấu hình kiểm tra phòng')
    },
    onError: (err: any) => {
      console.error('[useUpdateRoomCheckLeanConfig]', err)
      toast.error('Không lưu được cấu hình. Vui lòng thử lại.')
    },
  })
}
