import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface RoomAuditEntry {
  id: number
  action: string
  actor_id: string | null
  actor_role: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  context: Record<string, unknown> | null
  created_at: string
  actor_name?: string | null
}

/**
 * Lấy lịch sử state transitions của 1 phòng từ bảng audit_log.
 * Loại bỏ các record được cron tự sinh khi không có thay đổi thật
 * (lift_expired_dnd_oos với count = 0).
 */
export function useRoomAuditLog(roomId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ['audit-log', 'rooms', roomId, limit],
    queryFn: async () => {
      if (!roomId) return [] as RoomAuditEntry[]

      const { data, error } = await supabase
        .from('audit_log')
        .select('id, action, actor_id, actor_role, old_data, new_data, context, created_at')
        .eq('table_name', 'rooms')
        .eq('record_id', roomId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Lấy thông tin user để hiển thị tên
      const actorIds = Array.from(
        new Set((data || []).map((r) => r.actor_id).filter(Boolean) as string[]),
      )
      let userMap = new Map<string, string>()
      if (actorIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', actorIds)
        userMap = new Map(
          (users || []).map((u) => [u.id, u.full_name || u.email || u.id.slice(0, 8)]),
        )
      }

      return (data || [])
        .map((r) => ({
          ...r,
          old_data: r.old_data as Record<string, unknown> | null,
          new_data: r.new_data as Record<string, unknown> | null,
          context: r.context as Record<string, unknown> | null,
          actor_name: r.actor_id ? userMap.get(r.actor_id) ?? null : null,
        }))
        .filter((r) => {
          // Lọc bỏ cron tick không có thay đổi
          const ctx = r.context || {}
          if (
            ctx.cron === 'lift_expired_dnd_oos' &&
            (ctx.dnd_lifted ?? 0) === 0 &&
            (ctx.oos_lifted ?? 0) === 0
          ) {
            return false
          }
          return true
        }) as RoomAuditEntry[]
    },
    enabled: !!roomId,
    staleTime: 30_000,
  })
}
