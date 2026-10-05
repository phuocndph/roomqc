import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export interface QcStaffStat {
  user_id: string
  full_name: string | null
  hotel_id: string | null
  total_completed: number
  approved_count: number
  rework_count: number
  pending_count: number
  rework_rate_pct: number | null
}

export interface QcFloorStat {
  hotel_id: string | null
  floor: number | null
  total_tasks: number
  rework_tasks: number
  pending_tasks: number
  rework_rate_pct: number | null
}

/** Thống kê QC theo nhân viên (N ngày gần nhất) */
export function useQcStaffStats(days = 30) {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id ?? null

  return useQuery({
    queryKey: ['qc-staff-stats', tenantId, hotelId, days],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_qc_staff_stats', {
        _tenant_id: tenantId,
        _hotel_id: hotelId,
        _days: days,
      })
      if (error) throw error
      const rows = (data ?? []) as QcStaffStat[]
      return rows
        .map((r) => ({ ...r, total_completed: Number(r.total_completed), rework_count: Number(r.rework_count), pending_count: Number(r.pending_count), approved_count: Number(r.approved_count) }))
        .sort((a, b) => (b.rework_rate_pct ?? 0) - (a.rework_rate_pct ?? 0))
    },
  })
}

/** Thống kê QC theo tầng (N ngày gần nhất) */
export function useQcFloorStats(days = 30) {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id ?? null

  return useQuery({
    queryKey: ['qc-floor-stats', tenantId, hotelId, days],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_qc_floor_stats', {
        _tenant_id: tenantId,
        _hotel_id: hotelId,
        _days: days,
      })
      if (error) throw error
      const rows = (data ?? []) as QcFloorStat[]
      return rows
        .map((r) => ({ ...r, total_tasks: Number(r.total_tasks), rework_tasks: Number(r.rework_tasks), pending_tasks: Number(r.pending_tasks) }))
        .sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0))
    },
  })
}

/** Danh sách task bị rework của 1 nhân viên (drill-down) */
export function useStaffReworkTasks(userId: string | null, days = 30) {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id ?? null

  return useQuery({
    queryKey: ['qc-staff-rework-tasks', tenantId, hotelId, userId, days],
    enabled: !!tenantId && !!userId,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      let q = supabase
        .from('housekeeping_tasks')
        .select(`
          id, status, task_type, priority, rework_count, rejection_reason,
          rejected_at, awaiting_review_at, created_at, room_id, hotel_id,
          room:rooms!housekeeping_tasks_room_id_fkey(room_number, floor)
        `)
        .eq('tenant_id', tenantId!)
        .eq('assigned_to', userId!)
        .gte('created_at', since)
        .or('status.eq.rejected_rework,rework_count.gt.0')
        .order('rejected_at', { ascending: false, nullsFirst: false })
        .limit(100)
      if (hotelId) q = q.eq('hotel_id', hotelId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

export interface QcDailyTrend {
  day: string
  total_tasks: number
  rework_tasks: number
  rework_rate_pct: number | null
}

/** Trend rework theo từng ngày (N ngày gần nhất) */
export function useQcDailyTrend(days = 30) {
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id ?? null

  return useQuery({
    queryKey: ['qc-daily-trend', tenantId, hotelId, days],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_qc_daily_trend', {
        _tenant_id: tenantId,
        _hotel_id: hotelId,
        _days: days,
      })
      if (error) throw error
      return ((data ?? []) as QcDailyTrend[]).map((r) => ({
        ...r,
        total_tasks: Number(r.total_tasks),
        rework_tasks: Number(r.rework_tasks),
      }))
    },
  })
}
