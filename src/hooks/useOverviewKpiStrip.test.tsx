import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ query: null as any, call: vi.fn() }))
vi.mock('@/hooks/useOperationsFinancialReport', () => ({ useOperationsFinancialReport: (...args: unknown[]) => { state.call(...args); return state.query } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
import { overviewMetrics, useOverviewKpiStrip } from './useOverviewKpiStrip'
import { operationsFixture, operationsRange } from './operations-report.test-fixture'
const period = { current: operationsRange, previous: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) }, days: 2, label: 'custom' }
beforeEach(() => { state.call.mockReset(); state.query = { data: operationsFixture(), error: null, isPending: false, scopeEnabled: true } })
describe('overview aggregate consumers', () => {
  it('uses explicit current/previous once for metrics and chart', () => {
    const { result } = renderHook(() => useOverviewKpiStrip(period)); expect(state.call).toHaveBeenCalledTimes(1)
    expect(state.call).toHaveBeenCalledWith(period.current, period.previous)
    expect(result.current.data).toMatchObject({ netRevenue: { value: 150, previous: 80 }, profit: { value: 100, previous: 70 },
      cost: { value: 50 }, debt: { value: 100 }, revpar: { value: 6 }, occupancy: { value: 10 } })
    expect(result.current.chart).toEqual([{ date: '2026-10-01', revenue: 150, cost: 50 }, { date: '2026-10-02', revenue: 0, cost: 0 }])
  })
  it('uses each period length for occupancy and room-only RevPAR', () => {
    const r = operationsFixture(); r.previous.period_days = 1; r.previous.occupied_room_days = 1; r.previous.room.pendingRevenue = 37
    const k = overviewMetrics(r); expect(k.occupancy.delta).toBe(0); expect(k.revpar.previous).toBe(8); expect(k.debt.previous).toBe(37)
    expect(k.netRevenue.value).toBe(150); expect(k.revpar.value).toBe(6)
  })
  it('does not invent a zero report while sources are pending or denied', () => {
    state.query = { ...state.query, data: undefined, isPending: true }; const { result, rerender } = renderHook(() => useOverviewKpiStrip(period))
    expect(result.current.data).toBeUndefined(); expect(result.current.chart).toBeUndefined(); expect(result.current.loading).toBe(true)
    state.query = { ...state.query, error: new Error('DENIED'), isPending: false }; rerender()
    expect(result.current.error?.message).toBe('DENIED'); expect(result.current.data).toBeUndefined()
  })
  it('handles an empty registered inventory and exposes invalid date counts', () => {
    const r = operationsFixture(); r.capacity.total_rooms = 0; r.current.invalid_checkout_dates_count = 1
    expect(overviewMetrics(r)).toMatchObject({ occupancy: { value: 0 }, revpar: { value: 0 }, invalidCheckoutDates: 1 })
  })
})
