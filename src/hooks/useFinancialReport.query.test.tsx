import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
  hotel: 'hotel-a', all: false, runtime: 'runtime-a', locked: false, deleted: null as string | null,
  rpc: vi.fn(), options: null as any }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => { state.options = options; return {} } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenant, user: { id: state.actor,
  status: state.status, account_locked: state.locked, deleted_at: state.deleted, updated_at: 'version-a' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel }, isAllHotelsMode: state.all }) }))
import { useFinancialReport } from './useReports'
import { financialFixture } from './financial-report.test-fixture'

const range = { start: new Date(2026, 9, 1, 0, 0), end: new Date(2026, 9, 31, 23, 59) }
beforeEach(() => { Object.assign(state, { actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
  hotel: 'hotel-a', all: false, runtime: 'runtime-a', locked: false, deleted: null }); state.rpc.mockReset() })
const result = () => ({ ...financialFixture(), recognition_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })

describe('scoped financial report query', () => {
  it('sends local calendar days and timezone to an abortable scoped RPC without a caller-selected tenant', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: result(), error: null }); state.rpc.mockReturnValue({ abortSignal })
    renderHook(() => useFinancialReport(range))
    const signal = new AbortController().signal
    await state.options.queryFn({ signal })
    expect(state.rpc).toHaveBeenCalledWith('get_financial_report_scoped', {
      p_start_date: '2026-10-01', p_end_date: '2026-10-31', p_timezone: expect.any(String), p_hotel_id: 'hotel-a', p_for_export: false })
    expect(abortSignal).toHaveBeenCalledWith(signal)
  })
  it.each(['actor', 'session', 'tenant', 'runtime', 'hotel'] as const)('partitions the cache by %s', field => {
    const { rerender } = renderHook(() => useFinancialReport(range)); const first = state.options.queryKey
    state[field] += '-changed'; rerender(); expect(state.options.queryKey).not.toEqual(first)
  })
  it('does not fetch for a locked, deleted or inactive profile', () => {
    const { rerender } = renderHook(() => useFinancialReport(range)); expect(state.options.enabled).toBe(true)
    state.locked = true; rerender(); expect(state.options.enabled).toBe(false)
    state.locked = false; state.deleted = '2026-10-27'; rerender(); expect(state.options.enabled).toBe(false)
    state.deleted = null; state.status = 'inactive'; rerender(); expect(state.options.enabled).toBe(false)
  })
  it('aggregates only the hotels allowed by the server in all-hotel mode', async () => {
    state.all = true; state.rpc.mockReturnValue({ abortSignal: async () => ({ data: result(), error: null }) })
    renderHook(() => useFinancialReport(range)); await state.options.queryFn({ signal: new AbortController().signal })
    expect(state.rpc.mock.calls[0][1].p_hotel_id).toBeUndefined()
  })
  it.each(['hotel', 'session'] as const)('rejects an old result after %s changes away and back', async field => {
    let resolve!: (value: unknown) => void
    state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { rerender } = renderHook(() => useFinancialReport(range))
    const pending = state.options.queryFn({ signal: new AbortController().signal })
    const rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi')
    const old = state[field]; state[field] = 'other'; rerender(); state[field] = old; rerender()
    resolve({ data: result(), error: null }); await rejection
  })
  it('rejects an aborted result', async () => {
    const controller = new AbortController(); controller.abort()
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: result(), error: null }) })
    renderHook(() => useFinancialReport(range))
    await expect(state.options.queryFn({ signal: controller.signal })).rejects.toThrow('Đã hủy')
  })
  it('keeps denied and unsupported responses as errors rather than a zero financial report', async () => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: new Error('DENIED') }) })
    renderHook(() => useFinancialReport(range))
    await expect(state.options.queryFn({ signal: new AbortController().signal })).rejects.toThrow('DENIED')
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: { summary: {} }, error: null }) })
    await expect(state.options.queryFn({ signal: new AbortController().signal })).rejects.toThrow('phiên bản máy chủ')
  })
})
