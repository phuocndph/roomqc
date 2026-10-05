import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

interface MaintenanceDashboardStats {
  total: number
  totalLast30Days: number
  inProgress: number
  completed: number
  completedLast30Days: number
  completionRate: number
  avgTime: number
  costLast30Days: number
  mttr: number
  mtbf: number
  firstTimeFixRate: number
}

interface MaintenanceDashboardResult {
  stats: MaintenanceDashboardStats
  activeRequests: any[]
  recentCompletions: any[]
}

const emptyStats = (): MaintenanceDashboardStats => ({
  total: 0,
  totalLast30Days: 0,
  inProgress: 0,
  completed: 0,
  completedLast30Days: 0,
  completionRate: 0,
  avgTime: 0,
  costLast30Days: 0,
  mttr: 0,
  mtbf: 0,
  firstTimeFixRate: 0,
})

function buildDashboardFromRows(rows: any[]): MaintenanceDashboardResult {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const completed = rows.filter((row) => row.status === 'completed')
  const active = rows.filter((row) => !['completed', 'cancelled'].includes(row.status))
  const completedLast30Days = completed.filter((row) => row.completed_at && new Date(row.completed_at).getTime() >= cutoff)
  const totalLast30Days = rows.filter((row) => row.created_at && new Date(row.created_at).getTime() >= cutoff)
  const durations = completed
    .filter((row) => row.completed_at && row.reported_at)
    .map((row) => (new Date(row.completed_at).getTime() - new Date(row.reported_at).getTime()) / 3_600_000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0)
  const avgTime = durations.length ? Number((durations.reduce((sum, hours) => sum + hours, 0) / durations.length).toFixed(1)) : 0
  const costLast30Days = completedLast30Days.reduce((sum, row) => sum + Number(row.actual_cost || 0), 0)
  const stats: MaintenanceDashboardStats = {
    ...emptyStats(),
    total: rows.length,
    totalLast30Days: totalLast30Days.length,
    inProgress: active.length,
    completed: completed.length,
    completedLast30Days: completedLast30Days.length,
    completionRate: rows.length ? Math.round((completed.length / rows.length) * 100) : 0,
    avgTime,
    costLast30Days,
    mttr: avgTime,
  }

  const grouped = {
    urgent: active.filter((row) => row.priority === 'urgent'),
    high: active.filter((row) => row.priority === 'high'),
    medium: active.filter((row) => row.priority === 'medium'),
    low: active.filter((row) => row.priority === 'low'),
  }

  return {
    stats,
    activeRequests: grouped,
    recentCompletions: completed.slice().sort((a, b) => {
      return new Date(b.completed_at || b.updated_at || 0).getTime() - new Date(a.completed_at || a.updated_at || 0).getTime()
    }).slice(0, 10),
  }
}

export function useMaintenanceDashboard() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: ['maintenance-dashboard', tenantId, isAllHotelsMode ? 'all' : selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return null
      if (!isAllHotelsMode && !selectedHotel?.id) return null

      const loadRowsFallback = async () => {
        let query: any = supabase
          .from('maintenance_requests')
          .select('*, room:rooms(id, room_number, floor, room_type), item:items(id, code, name)')
          .eq('tenant_id', tenantId)
          .order('reported_at', { ascending: false })
          .limit(5000)
        if (!isAllHotelsMode && selectedHotel?.id) query = query.eq('hotel_id', selectedHotel.id)
        const { data: rows, error: rowsError } = await query
        if (rowsError) throw rowsError
        return buildDashboardFromRows((rows || []) as any[])
      }

      const { data, error } = await supabase.rpc('get_maintenance_dashboard', {
        p_tenant_id: tenantId,
        p_hotel_id: isAllHotelsMode ? null : selectedHotel?.id || null,
      })

      // Older local databases may not have the RPC deployed, or may return a
      // stale zero snapshot. Use the same source as the request list instead
      // of silently rendering an all-zero dashboard.
      if (error) return loadRowsFallback()

      const result = data as unknown as {
        stats: MaintenanceDashboardStats
        activeRequests: any[]
        recentCompletions: any[]
      }

      if (!result?.stats) return loadRowsFallback()

      if (result.stats.total === 0) {
        const fallback = await loadRowsFallback()
        if (fallback.stats.total > 0) return fallback
      }

      // Group active requests by priority for backward compatibility
      const activeRequests = result.activeRequests || []
      const grouped = {
        urgent: activeRequests.filter((r: any) => r.priority === 'urgent'),
        high: activeRequests.filter((r: any) => r.priority === 'high'),
        medium: activeRequests.filter((r: any) => r.priority === 'medium'),
        low: activeRequests.filter((r: any) => r.priority === 'low'),
      }

      return {
        stats: result.stats,
        activeRequests: grouped,
        recentCompletions: result.recentCompletions || [],
      }
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 60 * 1000, // 1 minute
  })
}
