import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { format } from 'date-fns'

export interface MaintenanceCostByType {
  type: string
  cost: number
  count: number
  percentage: number
}

export interface MaintenanceMonthlyTrend {
  month: string
  requests: number
  completed: number
  cost: number
}

export interface MaintenanceRecurringIssue {
  issue: string
  count: number
  avg_time: number
  total_cost: number
}

export interface MaintenanceReportData {
  summary: {
    total_requests: number
    completed: number
    in_progress: number
    pending: number
    total_cost: number
    avg_cost: number
  }
  cost_by_type: MaintenanceCostByType[]
  monthly_trend: MaintenanceMonthlyTrend[]
  recurring_issues: MaintenanceRecurringIssue[]
}

export function useMaintenanceReport(dateRange: { start: Date; end: Date }) {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()

  return useQuery({
    queryKey: [
      'maintenance-report',
      tenantId,
      isAllHotelsMode ? 'all' : selectedHotel?.id,
      format(dateRange.start, 'yyyy-MM-dd'),
      format(dateRange.end, 'yyyy-MM-dd'),
    ],
    queryFn: async (): Promise<MaintenanceReportData> => {
      if (!tenantId) {
        return {
          summary: { total_requests: 0, completed: 0, in_progress: 0, pending: 0, total_cost: 0, avg_cost: 0 },
          cost_by_type: [],
          monthly_trend: [],
          recurring_issues: [],
        }
      }

      const { data, error } = await supabase.rpc('get_maintenance_report', {
        p_tenant_id: tenantId,
        p_hotel_id: isAllHotelsMode ? null : (selectedHotel?.id || null),
        p_start_date: format(dateRange.start, 'yyyy-MM-dd'),
        p_end_date: format(dateRange.end, 'yyyy-MM-dd'),
      })

      if (error) throw error
      return data as unknown as MaintenanceReportData
    },
    enabled: !!tenantId && (isAllHotelsMode || !!selectedHotel?.id),
    staleTime: 5 * 60 * 1000,
  })
}
