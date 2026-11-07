import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { financialReportPeriod } from '@/lib/financial-report'
import { useReportScope } from './useReportScope'
import type { DateRange } from '@/types/reports.types'

export interface LaborCostResult {
  total_labor_cost: number
  by_department: Record<string, number>
  method: 'shift_start_duration_wage_estimate'
  is_estimate: true
  period_start: string
  period_end: string
  recognition_timezone: string
}

/** Aggregate estimate only: recorded shifts × configured wage, never paid payroll. */
export function useLaborCost(dateRange: DateRange) {
  const period = financialReportPeriod(dateRange)
  const scope = useReportScope(JSON.stringify(period))
  return useQuery({
    queryKey: ['labor-cost', ...scope.key],
    enabled: scope.enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<LaborCostResult> => {
      const assertCurrent = scope.capture()
      const { data, error } = await supabase.rpc('get_labor_cost_scoped', {
        p_start_date: period.start, p_end_date: period.end, p_timezone: period.timezone,
        p_hotel_id: scope.hotelId,
      }).abortSignal(signal)
      if (error) throw error
      if (signal.aborted) throw new Error('Đã hủy tải báo cáo.')
      assertCurrent()
      const report = data as unknown as LaborCostResult | null
      if (!report || !Number.isFinite(report.total_labor_cost)
        || !report.by_department || Array.isArray(report.by_department)
        || typeof report.by_department !== 'object'
        || !Object.values(report.by_department).every(Number.isFinite)
        || report.method !== 'shift_start_duration_wage_estimate' || report.is_estimate !== true
        || report.period_start !== period.start || report.period_end !== period.end
        || report.recognition_timezone !== period.timezone) {
        throw new Error('Báo cáo nhân sự chưa sẵn sàng. Vui lòng kiểm tra phiên bản máy chủ.')
      }
      return report
    },
  })
}
