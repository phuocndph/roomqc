import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active', hotel: 'hotel-a', all: false,
  runtime: 'runtime-a', locked: false, deleted: null as string | null, rpc: vi.fn(), options: null as any, cached: null as any, error: null as Error | null }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => { state.options = options; return { data: state.cached, error: state.error } } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenant, user: { id: state.actor, status: state.status,
  account_locked: state.locked, deleted_at: state.deleted, updated_at: 'v1' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel }, isAllHotelsMode: state.all }) }))
import { useOperationsFinancialReport } from './useOperationsFinancialReport'
import { operationsFixture, operationsRange, operationsRequest } from './operations-report.test-fixture'
const run = (signal = new AbortController().signal) => state.options.queryFn({ signal })
beforeEach(() => { Object.assign(state, { actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active', hotel: 'hotel-a', all: false,
  runtime: 'runtime-a', locked: false, deleted: null, cached: null, error: null }); state.rpc.mockReset() })

describe('scoped operations query', () => {
  it('passes calendar current/explicit previous, timezone and abort signal without tenant', async () => {
    const request = { ...operationsRequest(), previousStart: '2026-09-01' }
    const abortSignal = vi.fn().mockResolvedValue({ data: operationsFixture(request), error: null }); state.rpc.mockReturnValue({ abortSignal })
    renderHook(() => useOperationsFinancialReport(operationsRange, { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) }))
    const signal = new AbortController().signal; await run(signal)
    expect(state.rpc).toHaveBeenCalledWith('get_operations_report_scoped', { p_start_date: '2026-10-01', p_end_date: '2026-10-02',
      p_previous_start_date: '2026-09-01', p_previous_end_date: '2026-09-30', p_timezone: request.timezone, p_hotel_id: 'hotel-a' })
    expect(abortSignal).toHaveBeenCalledWith(signal)
  })
  it.each(['actor', 'session', 'tenant', 'runtime', 'hotel'] as const)('partitions by %s', field => {
    const { rerender } = renderHook(() => useOperationsFinancialReport(operationsRange)); const old = state.options.queryKey
    state[field] += '-changed'; rerender(); expect(state.options.queryKey).not.toEqual(old)
  })
  it('keys the explicit previous period as well as current', () => {
    const { rerender } = renderHook(({ previous }) => useOperationsFinancialReport(operationsRange, previous), { initialProps: { previous: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) } } })
    const old = state.options.queryKey; rerender({ previous: { start: new Date(2026, 8, 15), end: new Date(2026, 8, 30) } }); expect(state.options.queryKey).not.toEqual(old)
  })
  it('all-hotels delegates the allowed assignment set to the server', async () => {
    state.all = true; state.rpc.mockReturnValue({ abortSignal: async () => ({ data: operationsFixture(), error: null }) })
    renderHook(() => useOperationsFinancialReport(operationsRange)); await run(); expect(state.rpc.mock.calls[0][1].p_hotel_id).toBeUndefined()
  })
  it.each(['hotel', 'session', 'actor'] as const)('rejects late A→B→A after %s changes', async field => {
    let resolve!: (v: unknown) => void; state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { rerender } = renderHook(() => useOperationsFinancialReport(operationsRange)); const pending = run()
    const rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi')
    const old = state[field]; state[field] = 'other'; rerender(); state[field] = old; rerender()
    resolve({ data: operationsFixture(), error: null }); await rejection
  })
  it('rejects a result after unmount', async () => {
    let resolve!: (v: unknown) => void; state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { unmount } = renderHook(() => useOperationsFinancialReport(operationsRange)); const pending = run(); const rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi')
    unmount(); resolve({ data: operationsFixture(), error: null }); await rejection
  })
  it('rejects an aborted completed response', async () => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: operationsFixture(), error: null }) }); renderHook(() => useOperationsFinancialReport(operationsRange))
    const c = new AbortController(); c.abort(); await expect(run(c.signal)).rejects.toThrow('Đã hủy')
  })
  it('does not fetch or expose cached data after the profile is blocked', () => {
    state.cached = operationsFixture(); const { result, rerender } = renderHook(() => useOperationsFinancialReport(operationsRange))
    expect(result.current.data).toBe(state.cached); state.locked = true; rerender(); expect(state.options.enabled).toBe(false); expect(result.current.data).toBeUndefined()
    state.locked = false; state.status = 'inactive'; rerender(); expect(state.options.enabled).toBe(false)
    state.status = 'active'; state.deleted = '2026-10-27'; rerender(); expect(state.options.enabled).toBe(false)
  })
  it('does not expose cached success after denial and does not replace failure with zero', async () => {
    state.cached = operationsFixture(); state.error = new Error('DENIED'); state.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: state.error }) })
    const { result } = renderHook(() => useOperationsFinancialReport(operationsRange)); expect(result.current.data).toBeUndefined()
    await expect(run()).rejects.toThrow('DENIED')
  })
})
