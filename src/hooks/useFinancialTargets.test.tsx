import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ report: null as null | Record<string, unknown>, error: null as Error | null, hook: vi.fn() }))
vi.mock('./useReportTargets', () => ({ useReportTargets: (...args: unknown[]) => { state.hook(...args); return { data: state.report, error: state.error } } }))
import { useFinancialTargets } from './useFinancialTargets'
import { useMonthlyTarget } from './useFixedExpenses'
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('./useUser', () => ({ useUser: () => ({}) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({}) }))
beforeEach(() => { state.report = { values: { adr: 123.45 }, review_required: false }; state.error = null; state.hook.mockClear() })
describe('target consumer adapters', () => {
  it('financial adapter keeps selected month and decimals', () => {
    const { result } = renderHook(() => useFinancialTargets(new Date(2026, 9, 14)))
    expect(state.hook).toHaveBeenCalledWith('financial', '2026-10-01', true)
    expect(result.current.data).toEqual({ adr: 123.45 })
  })
  it('keeps an inapplicable range disabled', () => {
    renderHook(() => useFinancialTargets(new Date(2026, 9, 1), false)); expect(state.hook).toHaveBeenCalledWith('financial', '2026-10-01', false)
  })
  it('legacy review is an explicit error and never a partial target set', () => {
    state.report!.review_required = true
    const { result } = renderHook(() => useFinancialTargets(new Date(2026, 9, 1)))
    expect(result.current.error).toMatchObject({ code: 'review_required' }); expect(result.current.data).toBeUndefined()
    expect(result.current.report).toBe(state.report)
  })
  it('server denial remains an error', () => {
    state.report = null; state.error = new Error('DENIED')
    const { result } = renderHook(() => useFinancialTargets(new Date(2026, 9, 1)))
    expect(result.current.error).toBe(state.error); expect(result.current.data).toBeUndefined()
  })
  it('monthly adapter preserves zero and distinguishes unset from loading', () => {
    state.report = { values: { revenue_target: 0, occupancy_target: 0 } }
    const h = renderHook(() => useMonthlyTarget(new Date(2026, 9, 14)))
    expect(state.hook).toHaveBeenCalledWith('monthly', '2026-10-01')
    expect(h.result.current.data).toEqual({ revenue_target: 0, occupancy_target: 0 })
    state.report = { values: {} }; h.rerender(); expect(h.result.current.data).toEqual({ revenue_target: null, occupancy_target: null })
    state.report = null; h.rerender(); expect(h.result.current.data).toBeUndefined()
  })
  it('monthly legacy review never becomes an unset or zero target', () => {
    state.report = { values: {}, review_required: true }
    const { result } = renderHook(() => useMonthlyTarget(new Date(2026, 9, 1)))
    expect(result.current.data).toBeUndefined(); expect(result.current.error).toMatchObject({ code: 'review_required' })
  })
})
