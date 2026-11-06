import { differenceInCalendarDays, format, parseISO, subDays, subYears } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import type { RevenueData, NoShowRevenueData } from '@/hooks/useRevenueReport'
import type { DateRange, FinancialReportData } from '@/types/reports.types'

export interface OperationsPeriod {
  period_start: string
  period_end: string
  period_days: number
  room: RevenueData
  no_show: NoShowRevenueData
  cost_summary: FinancialReportData['cost_summary']
  recognized_revenue: number
  net_profit: number
  earned_checkout_count: number
  checkout_room_nights: number
  occupied_room_days: number
  invalid_checkout_dates_count: number
}
export interface OperationsDay {
  date: string
  room_net_revenue: number
  no_show_fees: number
  recognized_revenue: number
  refund_due: number
  purchase_cost: number
  laundry_cost: number
  maintenance_cost: number
  total_cost: number
  net_profit: number
}
export const operationsMethods = {
  room_revenue: 'earned_checkout_calendar_date',
  recognized_revenue: 'room_net_plus_retained_no_show_fees',
  cost: 'purchase_transaction_laundry_delivery_maintenance_completion',
  adr: 'earned_checkout_cohort_nights_minimum_one',
  occupancy: 'recorded_stay_dates_unique_room_days_estimate',
  yoy: 'inclusive_calendar_endpoints_one_year_earlier',
  profit: 'before_labor_and_fixed_budget',
} as const
export interface OperationsReport {
  version: 1
  recognition_timezone: string
  capacity: { total_rooms: number; method: 'current_registered_rooms'; is_estimate: true }
  methods: typeof operationsMethods
  current: OperationsPeriod
  previous: OperationsPeriod
  year_ago: OperationsPeriod
  daily: OperationsDay[]
}

export function operationsReportRequest(current: DateRange, previous?: DateRange) {
  const days = differenceInCalendarDays(current.end, current.start) + 1
  const prior = previous ?? { start: subDays(current.start, days), end: subDays(current.start, 1) }
  const date = (d: Date) => format(d, 'yyyy-MM-dd')
  return { start: date(current.start), end: date(current.end),
    previousStart: date(prior.start), previousEnd: date(prior.end),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh' }
}
export type OperationsReportRequest = ReturnType<typeof operationsReportRequest> & { hotelId?: string }
const unsupported = () => new Error('Báo cáo vận hành chưa sẵn sàng. Vui lòng kiểm tra phiên bản máy chủ.')
const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-9
const numeric = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const count = (v: unknown): v is number => numeric(v) && Number.isSafeInteger(v) && v >= 0
function requireValid(ok: unknown): asserts ok { if (!ok) throw unsupported() }

/** Reject incomplete/truncated/mismatched reports instead of inventing zero. */
export function validateOperationsReport(value: unknown, request: OperationsReportRequest): OperationsReport {
  const r = value as OperationsReport | null
  requireValid(r && r.version === 1 && r.recognition_timezone === request.timezone
    && r.capacity?.method === 'current_registered_rooms' && r.capacity.is_estimate === true
    && count(r.capacity.total_rooms) && r.methods
    && Object.entries(operationsMethods).every(([k, v]) => r.methods[k as keyof typeof operationsMethods] === v))
  const windows = [
    [r.current, request.start, request.end], [r.previous, request.previousStart, request.previousEnd],
    [r.year_ago, format(subYears(parseISO(request.start), 1), 'yyyy-MM-dd'), format(subYears(parseISO(request.end), 1), 'yyyy-MM-dd')],
  ] as const
  for (const [p, start, end] of windows) {
    const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
    requireValid(p && p.period_start === start && p.period_end === end && p.period_days === days
      && days > 0 && days <= 3661 && p.room && p.room.surcharges && p.no_show && p.cost_summary)
    requireValid(['totalRevenue', 'paidRevenue', 'pendingRevenue', 'refundedRevenue', 'netRevenue',
      'otaCommission', 'discountAmount', 'vatAmount', 'averageBookingValue'].every(k => numeric(p.room[k as keyof RevenueData]))
      && ['earlyCheckin', 'lateCheckout', 'damageCharges', 'serviceCharges', 'extraCharges', 'total']
        .every(k => numeric(p.room.surcharges[k as keyof RevenueData['surcharges']]))
      && count(p.room.bookingsCount) && count(p.room.paidBookingsCount)
      && numeric(p.no_show.retainedAmount) && numeric(p.no_show.refundDueAmount)
      && count(p.no_show.resolutionsCount) && p.no_show.cashMovement === 0
      && ['purchase_cost', 'laundry_cost', 'maintenance_cost', 'total_cost'].every(k => numeric(p.cost_summary[k as keyof typeof p.cost_summary]))
      && numeric(p.recognized_revenue) && numeric(p.net_profit)
      && count(p.earned_checkout_count) && count(p.checkout_room_nights) && count(p.occupied_room_days)
      && count(p.invalid_checkout_dates_count) && p.invalid_checkout_dates_count <= p.earned_checkout_count
      && p.earned_checkout_count <= p.room.bookingsCount && p.occupied_room_days <= r.capacity.total_rooms * days)
    requireValid(close(p.recognized_revenue, p.room.netRevenue + p.no_show.retainedAmount)
      && close(p.cost_summary.total_cost, p.cost_summary.purchase_cost + p.cost_summary.laundry_cost + p.cost_summary.maintenance_cost)
      && close(p.net_profit, p.recognized_revenue - p.cost_summary.total_cost))
  }
  requireValid(Array.isArray(r.daily) && r.daily.length === r.current.period_days)
  const totals = { revenue: 0, cost: 0, room: 0, fees: 0, refund: 0, purchase: 0, laundry: 0, maintenance: 0 }
  r.daily.forEach((d, i) => {
    requireValid(d && d.date === format(subDays(parseISO(request.start), -i), 'yyyy-MM-dd')
      && ['room_net_revenue', 'no_show_fees', 'recognized_revenue', 'refund_due', 'purchase_cost', 'laundry_cost',
        'maintenance_cost', 'total_cost', 'net_profit'].every(k => numeric(d[k as keyof OperationsDay]))
      && close(d.recognized_revenue, d.room_net_revenue + d.no_show_fees)
      && close(d.total_cost, d.purchase_cost + d.laundry_cost + d.maintenance_cost)
      && close(d.net_profit, d.recognized_revenue - d.total_cost))
    totals.revenue += d.recognized_revenue; totals.cost += d.total_cost; totals.room += d.room_net_revenue
    totals.fees += d.no_show_fees; totals.refund += d.refund_due; totals.purchase += d.purchase_cost
    totals.laundry += d.laundry_cost; totals.maintenance += d.maintenance_cost
  })
  requireValid(close(totals.revenue, r.current.recognized_revenue) && close(totals.cost, r.current.cost_summary.total_cost)
    && close(totals.room, r.current.room.netRevenue) && close(totals.fees, r.current.no_show.retainedAmount)
    && close(totals.refund, r.current.no_show.refundDueAmount) && close(totals.purchase, r.current.cost_summary.purchase_cost)
    && close(totals.laundry, r.current.cost_summary.laundry_cost) && close(totals.maintenance, r.current.cost_summary.maintenance_cost))
  return r
}

export async function fetchOperationsReport(request: OperationsReportRequest, signal: AbortSignal) {
  const { data, error } = await supabase.rpc('get_operations_report_scoped', {
    p_start_date: request.start, p_end_date: request.end, p_timezone: request.timezone, p_hotel_id: request.hotelId,
    p_previous_start_date: request.previousStart, p_previous_end_date: request.previousEnd,
  }).abortSignal(signal)
  if (error) throw error
  if (signal.aborted) throw new Error('Đã hủy tải báo cáo.')
  return validateOperationsReport(data, request)
}
