import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ hotel: 'hotel-a', session: 'session-a', actor: 'actor-a', all: false,
  options: null as any, rpc: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (o: unknown) => { state.options = o; return {} } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a', user: { id: state.actor, status: 'active' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => 'runtime-a' }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: state.hotel ? { id: state.hotel } : null, isAllHotelsMode: state.all }) }))
import { useMonthlyExpenses } from './useMonthlyExpenses'
import { financialFixture } from './financial-report.test-fixture'

beforeEach(() => { Object.assign(state, { hotel: 'hotel-a', session: 'session-a', actor: 'actor-a', all: false }); state.rpc.mockReset()
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 15, 10)) })
afterEach(() => vi.useRealTimers())
function response(start = '2025-11-01', end = '2026-01-31') {
  const r = financialFixture()
  return { ...r, period_start: start, period_end: end, recognition_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    monthly_trend: [{ ...r.monthly_trend[0], month: '11/2025', purchase: 3, laundry: 4, maintenance: 5 },
      { ...r.monthly_trend[0], month: '12/2025' }, { ...r.monthly_trend[0], month: '01/2026' }] }
}
const query = () => state.options.queryFn({ signal: new AbortController().signal })

describe('calendar monthly cost source', () => {
  it('requests complete calendar months across years with year-bearing labels and server cost recognition', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: response(), error: null }); state.rpc.mockReturnValue({ abortSignal })
    renderHook(() => useMonthlyExpenses(3)); const data = await query()
    expect(state.rpc).toHaveBeenCalledWith('get_financial_report_scoped', { p_start_date: '2025-11-01',
      p_end_date: '2026-01-31', p_hotel_id: 'hotel-a', p_timezone: expect.any(String), p_for_export: false })
    expect(data.map((m: any) => m.month)).toEqual(['11/2025', '12/2025', '01/2026'])
    expect(data[0]).toEqual({ month: '11/2025', purchase: 3, laundry: 4, maintenance: 5, total: 12 })
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })
  it.each([0, -1, 1.5, 121, NaN, Infinity])('rejects invalid month count %s without calling the server', async months => {
    renderHook(() => useMonthlyExpenses(months)); await expect(query()).rejects.toThrow('từ 1 đến 120'); expect(state.rpc).not.toHaveBeenCalled()
  })
  it('does not treat a missing selected hotel as all hotels', () => {
    state.hotel = ''; const { rerender } = renderHook(() => useMonthlyExpenses(3)); expect(state.options.enabled).toBe(false)
    state.all = true; rerender(); expect(state.options.enabled).toBe(true)
  })
  it.each(['hotel', 'session', 'actor'] as const)('rejects a late result after %s changes away and back', async field => {
    let resolve!: (v: unknown) => void; state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { rerender } = renderHook(() => useMonthlyExpenses(3)); const key = state.options.queryKey
    const pending = query(), rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi')
    const old = state[field]; state[field] = 'other'; rerender(); expect(state.options.queryKey).not.toEqual(key)
    state[field] = old; rerender(); resolve({ data: response(), error: null }); await rejection
  })
  it('keeps denied and malformed reports as errors instead of zero expenses', async () => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: new Error('REPORT_DENIED') }) })
    renderHook(() => useMonthlyExpenses(3)); await expect(query()).rejects.toThrow('REPORT_DENIED')
    const bad = response(); bad.monthly_trend[0].purchase = NaN
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: bad, error: null }) }); await expect(query()).rejects.toThrow('không hợp lệ')
  })
})
