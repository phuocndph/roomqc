import { useMemo } from 'react'
import { useOperationsFinancialReport } from './useOperationsFinancialReport'
import { useLaborCost, type LaborCostResult } from './useLaborCost'
import { useFinancialTargets, type TargetMetric } from './useFinancialTargets'
import { isSameMonth } from 'date-fns'
import type { OperationsReport } from '@/lib/operations-report'
import type { DateRange } from '@/types/reports.types'
import { computeDerivedKpis, runOperationsAdvisor, type KpiSnapshot, type Finding } from '@/lib/operationsAdvisor'

export interface OperationsInsightsData {
  snapshot: KpiSnapshot
  derived: ReturnType<typeof computeDerivedKpis>
  ruleFindings: Finding[]
  dateRange: DateRange
  daily: { date: string; revenue: number; cost: number }[]
  invalidCheckoutDates: number
  recognitionTimezone: string
  monthlyTargetsApplicable: boolean
}

export function buildOperationsInsights(report: OperationsReport, labor: LaborCostResult,
  targets: Partial<Record<TargetMetric, number>>, dateRange: DateRange): OperationsInsightsData {
  const { current: c, previous: p, year_ago: y } = report
  const snapshot: KpiSnapshot = {
    periodDays: c.period_days, totalRooms: report.capacity.total_rooms,
    netRevenue: c.recognized_revenue, roomNetRevenue: c.room.netRevenue, noShowFees: c.no_show.retainedAmount,
    grossRevenue: c.room.totalRevenue,
    extraRevenue: c.room.surcharges.serviceCharges + c.room.surcharges.extraCharges,
    totalCost: c.cost_summary.total_cost + labor.total_labor_cost,
    costBreakdown: { purchase: c.cost_summary.purchase_cost, laundry: c.cost_summary.laundry_cost,
      maintenance: c.cost_summary.maintenance_cost, labor: labor.total_labor_cost },
    roomNightsSold: c.checkout_room_nights, occupiedRoomDays: c.occupied_room_days, bookingsCount: c.earned_checkout_count,
    invalidCheckoutDates: c.invalid_checkout_dates_count,
    prevNetRevenue: p.recognized_revenue, prevBookingsCount: p.earned_checkout_count,
    prevRoomNightsSold: p.checkout_room_nights, prevOccupiedRoomDays: p.occupied_room_days, prevPeriodDays: p.period_days,
    yoyNetRevenue: y.recognized_revenue, yoyRoomNightsSold: y.checkout_room_nights,
    yoyOccupiedRoomDays: y.occupied_room_days, yoyPeriodDays: y.period_days,
    laborByDepartment: labor.by_department, targets,
  }
  return { snapshot, derived: computeDerivedKpis(snapshot), ruleFindings: runOperationsAdvisor(snapshot), dateRange,
    daily: report.daily.map(d => ({ date: d.date, revenue: d.recognized_revenue, cost: d.total_cost })),
    invalidCheckoutDates: c.invalid_checkout_dates_count, recognitionTimezone: report.recognition_timezone,
    monthlyTargetsApplicable: dateRange.start.getDate() === 1 && isSameMonth(dateRange.start, dateRange.end) }
}

/** Financial current/previous/YoY and room denominators come from one server snapshot. */
export function useOperationsInsights(dateRange: DateRange) {
  const operations = useOperationsFinancialReport(dateRange)
  const labor = useLaborCost(dateRange)
  const applicable = dateRange.start.getDate() === 1 && isSameMonth(dateRange.start, dateRange.end)
  const targets = useFinancialTargets(dateRange.start, applicable)
  const error = operations.error || labor.error || (applicable ? targets.error : null)
  const pending = operations.isPending || labor.isPending || (applicable && targets.isPending)
  const data = useMemo(() => {
    if (error || pending || !operations.data || !labor.data || (applicable && !targets.data)) return undefined
    return buildOperationsInsights(operations.data, labor.data, applicable ? targets.data! : {}, dateRange)
  }, [error, pending, operations.data, labor.data, targets.data, applicable, dateRange])
  return { data, error, isError: !!error, isLoading: !error && (pending || !data),
    isFetching: !error && (operations.isFetching || labor.isFetching || (applicable && targets.isFetching)) }
}

export interface AiAdvice {
  title: string
  description: string
  action: string
  priority: 'high' | 'medium' | 'low'
  impactVnd?: number
}

export { useOperationsAdvice } from './useOperationsAdvice'
