import { differenceInCalendarDays, format, parseISO, subDays, subYears } from 'date-fns'
import { operationsMethods, type OperationsReport, type OperationsReportRequest, type OperationsPeriod } from '@/lib/operations-report'

export const operationsRange = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 2, 23, 59) }
export function operationsRequest(): OperationsReportRequest {
  return { start: '2026-10-01', end: '2026-10-02', previousStart: '2026-09-29', previousEnd: '2026-09-30',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
}
export function operationsFixture(request = operationsRequest()): OperationsReport {
  function period(start: string, end: string, net: number, fee: number, purchase: number, laundry = 0, maintenance = 0): OperationsPeriod {
    return { period_start: start, period_end: end, period_days: differenceInCalendarDays(parseISO(end), parseISO(start)) + 1,
      room: { totalRevenue: 200, paidRevenue: 100, pendingRevenue: 100, refundedRevenue: 0, bookingsCount: 2,
        paidBookingsCount: 1, averageBookingValue: 100, netRevenue: net, otaCommission: 20, discountAmount: 0, vatAmount: 0,
        surcharges: { earlyCheckin: 0, lateCheckout: 0, damageCharges: 0, serviceCharges: 10, extraCharges: 5, total: 15 } },
      no_show: { retainedAmount: fee, refundDueAmount: 5, resolutionsCount: 1, cashMovement: 0 },
      cost_summary: { purchase_cost: purchase, laundry_cost: laundry, maintenance_cost: maintenance, total_cost: purchase + laundry + maintenance },
      recognized_revenue: net + fee, net_profit: net + fee - purchase - laundry - maintenance,
      earned_checkout_count: 2, checkout_room_nights: 3, occupied_room_days: 2, invalid_checkout_dates_count: 0 }
  }
  const current = period(request.start, request.end, 120, 30, 10, 15, 25)
  const previous = period(request.previousStart, request.previousEnd, 80, 0, 10)
  const yearAgo = period(format(subYears(parseISO(request.start), 1), 'yyyy-MM-dd'), format(subYears(parseISO(request.end), 1), 'yyyy-MM-dd'), 100, 20, 10)
  return { version: 1, recognition_timezone: request.timezone, capacity: { total_rooms: 10, method: 'current_registered_rooms', is_estimate: true },
    methods: { ...operationsMethods }, current, previous, year_ago: yearAgo,
    daily: Array.from({ length: current.period_days }, (_, i) => ({ date: format(subDays(parseISO(request.start), -i), 'yyyy-MM-dd'),
      room_net_revenue: i === 0 ? 120 : 0, no_show_fees: i === 0 ? 30 : 0, recognized_revenue: i === 0 ? 150 : 0,
      refund_due: i === 0 ? 5 : 0, purchase_cost: i === 0 ? 10 : 0, laundry_cost: i === 0 ? 15 : 0,
      maintenance_cost: i === 0 ? 25 : 0, total_cost: i === 0 ? 50 : 0, net_profit: i === 0 ? 100 : 0 })) }
}
