import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

export interface ShiftHistoryRecord {
  id: string
  tenant_id: string
  user_id: string
  hotel_id: string | null
  start_at: string
  end_at: string
  duration_minutes: number
  notes: string | null
  created_at: string
  user?: {
    id: string
    full_name: string | null
    avatar_url: string | null
  }
  hotel?: {
    id: string
    name: string
  }
}

export interface ShiftHistoryFilters {
  userId?: string | null
  dateFrom?: Date | null
  dateTo?: Date | null
}

export interface ShiftHistoryStats {
  totalShifts: number
  totalMinutes: number
  totalHours: number
  averageMinutesPerShift: number
  averageHoursPerShift: number
  uniqueStaffCount: number
}

/**
 * Hook to fetch shift history with optional filters
 */
export function useShiftHistory(filters: ShiftHistoryFilters = {}) {
  const { tenantId } = useUser()

  return useQuery({
    queryKey: ['shift-history', tenantId, filters],
    queryFn: async () => {
      let query = supabase
        .from('shift_history')
        .select(`
          *,
          user:users!shift_history_user_id_fkey(id, full_name, avatar_url),
          hotel:hotels!shift_history_hotel_id_fkey(id, name)
        `)
        .eq('tenant_id', tenantId!)
        .order('start_at', { ascending: false })

      // Filter by user
      if (filters.userId) {
        query = query.eq('user_id', filters.userId)
      }

      // Filter by date range
      if (filters.dateFrom) {
        query = query.gte('start_at', filters.dateFrom.toISOString())
      }
      if (filters.dateTo) {
        // Set to end of day
        const endDate = new Date(filters.dateTo)
        endDate.setHours(23, 59, 59, 999)
        query = query.lte('start_at', endDate.toISOString())
      }

      // Đợt 3: giảm payload — 500 → 100 dòng/lần load (UI không cần nhiều hơn)
      const { data, error } = await query.limit(100)

      if (error) throw error
      return data as unknown as ShiftHistoryRecord[]
    },
    enabled: !!tenantId,
  })
}

/**
 * Hook to get shift history for current week (default view)
 */
export function useCurrentWeekShiftHistory() {
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })

  return useShiftHistory({
    dateFrom: weekStart,
    dateTo: weekEnd,
  })
}

/**
 * Hook to get shift history for current month
 */
export function useCurrentMonthShiftHistory() {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  return useShiftHistory({
    dateFrom: monthStart,
    dateTo: monthEnd,
  })
}

/**
 * Calculate statistics from shift history data
 */
export function calculateShiftStats(shifts: ShiftHistoryRecord[] | undefined): ShiftHistoryStats {
  if (!shifts || shifts.length === 0) {
    return {
      totalShifts: 0,
      totalMinutes: 0,
      totalHours: 0,
      averageMinutesPerShift: 0,
      averageHoursPerShift: 0,
      uniqueStaffCount: 0,
    }
  }

  const totalMinutes = shifts.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
  const uniqueUsers = new Set(shifts.map(s => s.user_id))

  return {
    totalShifts: shifts.length,
    totalMinutes,
    totalHours: Math.round(totalMinutes / 60 * 10) / 10,
    averageMinutesPerShift: Math.round(totalMinutes / shifts.length),
    averageHoursPerShift: Math.round(totalMinutes / shifts.length / 60 * 10) / 10,
    uniqueStaffCount: uniqueUsers.size,
  }
}

/**
 * Format duration in minutes to readable string
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  if (hours === 0) {
    return `${mins}p`
  }
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}p`
}
