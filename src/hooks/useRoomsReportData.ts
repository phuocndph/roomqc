import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'

export interface RoomStats {
  total: number
  vacant: number
  occupied: number
  cleaning: number
  maintenance: number
  check_in: number
  check_out: number
}

export interface UtilizationByType {
  room_type_id: string
  room_type: string
  total: number
  occupied: number
  vacant: number
  rate: number
  base_price: number
  revenue: number
  bookings_count: number
}

export interface OccupancyStats {
  total_room_nights: number
  total_revenue: number
  total_bookings: number
  available_room_nights: number
  occupancy_rate: number
  avg_revenue_per_room: number
  avg_revenue_per_booking: number
}

export interface RevenueByRoom {
  room_id: string
  room_number: string
  room_type: string
  total_bookings: number
  total_revenue: number
  occupancy_days: number
}

export interface CheckStats {
  total_checks: number
  avg_score: number
  issues_found: number
  daily_checks: number
  checkout_checks: number
  checkin_checks: number
}

export interface Deficiency {
  room_id: string
  room_number: string
  room_type: string
  missing_count: number
  damaged_count: number
  lost_count: number
  total_issues: number
  last_check_date: string
}

export interface TopIssue {
  item_name: string
  item_id: string
  issue_type: 'missing' | 'damaged' | 'lost'
  count: number
  unit_price: number
  total_value: number
}

export interface StaffPerformance {
  user_id: string
  user_name: string
  checks_count: number
  avg_score: number
  issues_found: number
}

export interface ChecksByType {
  week_start: string
  daily: number
  checkout: number
  checkin: number
  total: number
}

export interface OccupancyTrend {
  date: string
  occupancy_rate: number
  room_nights_sold: number
  revenue: number
}

export interface PeriodComparison {
  current_period: {
    occupancy_rate: number
    total_revenue: number
    total_bookings: number
    avg_score: number
  }
  previous_period: {
    occupancy_rate: number
    total_revenue: number
    total_bookings: number
    avg_score: number
  }
  changes: {
    occupancy_rate_change: number
    revenue_change: number
    bookings_change: number
    score_change: number
  }
}

export interface RoomsReportData {
  roomStats: RoomStats
  utilizationByType: UtilizationByType[]
  occupancyStats: OccupancyStats
  revenueByRoom: RevenueByRoom[]
  checkStats: CheckStats
  deficiencies: Deficiency[]
  topIssues: TopIssue[]
  staffPerformance: StaffPerformance[]
  checksByType: ChecksByType[]
  occupancyTrend: OccupancyTrend[]
  periodComparison: PeriodComparison | null
}

export interface DateRange {
  start: Date
  end: Date
}

export function useRoomsReportData(dateRange: DateRange) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  const hotelId = isAllHotelsMode ? null : selectedHotel?.id || null

  // Fetch room stats and utilization
  const roomStatsQuery = useQuery({
    queryKey: ['rooms-report-stats', tenantId, hotelId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase.rpc('get_rooms_report_stats', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })

      if (error) throw error
      return data as unknown as {
        room_stats: RoomStats
        utilization_by_type: UtilizationByType[]
        occupancy_stats: OccupancyStats
        revenue_by_room: RevenueByRoom[]
      }
    },
    enabled: !!tenantId,
    staleTime: 60000,
  })

  // Fetch room checks report
  const checksReportQuery = useQuery({
    queryKey: ['rooms-checks-report', tenantId, hotelId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const { data, error } = await supabase.rpc('get_room_checks_report', {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })

      if (error) throw error
      return data as unknown as {
        check_stats: CheckStats
        deficiencies: Deficiency[]
        top_issues: TopIssue[]
        staff_performance: StaffPerformance[]
        checks_by_type: ChecksByType[]
      }
    },
    enabled: !!tenantId,
    staleTime: 60000,
  })

  // Fetch real daily occupancy trend from bookings
  const dailyTrendQuery = useQuery({
    queryKey: ['daily-occupancy-trend', tenantId, hotelId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')
      const { data, error } = await supabase.rpc('get_daily_occupancy_trend' as any, {
        p_tenant_id: tenantId,
        p_hotel_id: hotelId,
        p_start_date: dateRange.start.toISOString().split('T')[0],
        p_end_date: dateRange.end.toISOString().split('T')[0],
      })
      if (error) throw error
      return (data as any[]) || []
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = roomStatsQuery.isLoading || checksReportQuery.isLoading || dailyTrendQuery.isLoading
  const error = roomStatsQuery.error || checksReportQuery.error || dailyTrendQuery.error

  const occupancyTrend: OccupancyTrend[] = (dailyTrendQuery.data ?? []).map((row: any) => ({
    date: row.date,
    occupancy_rate: Number(row.occupancy_rate) || 0,
    room_nights_sold: Number(row.room_nights_sold) || 0,
    revenue: Number(row.revenue) || 0,
  }))

  // No real previous period data available - set to null so UI hides this section
  const periodComparison: PeriodComparison | null = null


  const data: RoomsReportData | null = roomStatsQuery.data && checksReportQuery.data
    ? {
        roomStats: roomStatsQuery.data.room_stats || {
          total: 0,
          vacant: 0,
          occupied: 0,
          cleaning: 0,
          maintenance: 0,
          check_in: 0,
          check_out: 0,
        },
        utilizationByType: roomStatsQuery.data.utilization_by_type || [],
        occupancyStats: roomStatsQuery.data.occupancy_stats || {
          total_room_nights: 0,
          total_revenue: 0,
          total_bookings: 0,
          available_room_nights: 0,
          occupancy_rate: 0,
          avg_revenue_per_room: 0,
          avg_revenue_per_booking: 0,
        },
        revenueByRoom: roomStatsQuery.data.revenue_by_room || [],
        checkStats: checksReportQuery.data.check_stats || {
          total_checks: 0,
          avg_score: 0,
          issues_found: 0,
          daily_checks: 0,
          checkout_checks: 0,
          checkin_checks: 0,
        },
        deficiencies: checksReportQuery.data.deficiencies || [],
        topIssues: checksReportQuery.data.top_issues || [],
        staffPerformance: checksReportQuery.data.staff_performance || [],
        checksByType: checksReportQuery.data.checks_by_type || [],
        occupancyTrend,
        periodComparison,
      }
    : null

  return {
    data,
    isLoading,
    error,
    refetch: () => {
      roomStatsQuery.refetch()
      checksReportQuery.refetch()
    },
  }
}
