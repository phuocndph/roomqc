import { describe, expect, it, vi } from 'vitest'
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
import { operationsReportRequest, validateOperationsReport, type OperationsReport } from './operations-report'
import { operationsFixture, operationsRange, operationsRequest } from '@/hooks/operations-report.test-fixture'

describe('operations report contract', () => {
  it('uses selected calendar dates and an explicit previous period of different length', () => {
    const request = operationsReportRequest(operationsRange, { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) })
    expect(request).toMatchObject({ start: '2026-10-01', end: '2026-10-02', previousStart: '2026-09-01', previousEnd: '2026-09-30' })
    expect(validateOperationsReport(operationsFixture(request), request).previous.period_days).toBe(30)
  })
  it('derives adjacent days and validates a one-day leap-year comparison', () => {
    const request = operationsReportRequest({ start: new Date(2024, 1, 29), end: new Date(2024, 1, 29, 23, 59) })
    const report = operationsFixture(request)
    expect(request.previousStart).toBe('2024-02-28')
    expect(validateOperationsReport(report, request).year_ago).toMatchObject({ period_start: '2023-02-28', period_end: '2023-02-28', period_days: 1 })
  })
  it('keeps 10,021 checkout rows summarized without any client row limit', () => {
    const r = operationsFixture(); r.current.room.bookingsCount = 10021; r.current.earned_checkout_count = 10021; r.current.checkout_room_nights = 10064
    expect(validateOperationsReport(r, operationsRequest()).current.earned_checkout_count).toBe(10021)
  })
  it.each([
    ['version', (r: any) => { r.version = 0 }], ['timezone', (r: any) => { r.recognition_timezone = 'wrong' }],
    ['current range', (r: any) => { r.current.period_start = '2026-09-01' }], ['previous range', (r: any) => { r.previous.period_end = '2026-09-29' }],
    ['year ago', (r: any) => { r.year_ago.period_days = 3 }], ['missing source', (r: any) => { delete r.current.no_show }],
    ['missing surcharge', (r: any) => { delete r.current.room.surcharges.serviceCharges }],
    ['non-finite', (r: any) => { r.previous.room.netRevenue = NaN }], ['null amount', (r: any) => { r.current.recognized_revenue = null }],
    ['string amount', (r: any) => { r.year_ago.cost_summary.total_cost = '10' }],
    ['fractional count', (r: any) => { r.current.occupied_room_days = 1.5 }], ['unsafe count', (r: any) => { r.current.checkout_room_nights = Number.MAX_SAFE_INTEGER + 1 }],
    ['capacity bound', (r: any) => { r.current.occupied_room_days = 21 }], ['invalid dates count', (r: any) => { r.current.invalid_checkout_dates_count = 3 }],
    ['unlabeled capacity', (r: any) => { r.capacity.is_estimate = false }], ['wrong recognition', (r: any) => { r.methods.cost = 'laundry_actual_return' }],
    ['fee counted as cash', (r: any) => { r.current.no_show.cashMovement = 30 }], ['headline mismatch', (r: any) => { r.current.recognized_revenue = 120 }],
    ['cost mismatch', (r: any) => { r.current.cost_summary.total_cost = 35 }], ['profit mismatch', (r: any) => { r.current.net_profit = 150 }],
    ['truncated daily', (r: any) => { r.daily.pop() }], ['duplicate daily', (r: any) => { r.daily[1].date = r.daily[0].date }],
    ['out-of-range daily', (r: any) => { r.daily[1].date = '2026-10-03' }], ['daily mismatch', (r: any) => { r.daily[0].total_cost = 0 }],
    ['consistent but incomplete daily totals', (r: any) => { Object.assign(r.daily[0], { room_net_revenue: 110, recognized_revenue: 140, net_profit: 90 }) }],
  ] as const)('rejects %s rather than reporting a successful zero', (_, mutate) => {
    const r = operationsFixture(); mutate(r); expect(() => validateOperationsReport(r, operationsRequest())).toThrow('phiên bản máy chủ')
  })
  it('rejects null and legacy payloads', () => {
    for (const r of [null, {}, { current: {} }]) expect(() => validateOperationsReport(r, operationsRequest())).toThrow('phiên bản máy chủ')
  })
  it('accepts a labeled reconciliation count without rewriting recognized money', () => {
    const r: OperationsReport = operationsFixture(); r.current.invalid_checkout_dates_count = 1
    expect(validateOperationsReport(r, operationsRequest()).current.recognized_revenue).toBe(150)
  })
})
