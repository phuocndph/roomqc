import { useOperationsFinancialReport } from './useOperationsFinancialReport'
import { computeDelta, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'
import type { OperationsReport } from '@/lib/operations-report'

export interface OverviewKpi { value: number; previous: number; delta: number }

export function overviewMetrics(report: OperationsReport) {
  const { current: c, previous: p, capacity } = report
  const metric = (value: number, previous: number): OverviewKpi => ({ value, previous, delta: computeDelta(value, previous) })
  const ratio = (n: number, days: number) => capacity.total_rooms > 0 ? n / (capacity.total_rooms * days) : 0
  const occupancy = metric(ratio(c.occupied_room_days, c.period_days) * 100, ratio(p.occupied_room_days, p.period_days) * 100)
  occupancy.delta = occupancy.value - occupancy.previous
  return {
    netRevenue: metric(c.recognized_revenue, p.recognized_revenue),
    profit: metric(c.net_profit, p.net_profit),
    cost: metric(c.cost_summary.total_cost, p.cost_summary.total_cost),
    debt: metric(c.room.pendingRevenue, p.room.pendingRevenue),
    occupancy,
    revpar: metric(ratio(c.room.netRevenue, c.period_days), ratio(p.room.netRevenue, p.period_days)),
    invalidCheckoutDates: c.invalid_checkout_dates_count,
  }
}

/** One server snapshot for six metrics and the selected period's daily chart. */
export function useOverviewKpiStrip(period: PeriodRangeWithPrevious) {
  const query = useOperationsFinancialReport(period.current, period.previous)
  return {
    data: query.data ? overviewMetrics(query.data) : undefined,
    chart: query.data?.daily.map(d => ({ date: d.date, revenue: d.recognized_revenue, cost: d.total_cost })),
    loading: query.scopeEnabled && query.isPending,
    error: query.error,
    scopeEnabled: query.scopeEnabled,
  }
}
