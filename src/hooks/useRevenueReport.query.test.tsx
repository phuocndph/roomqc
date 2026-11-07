import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
  hotel: 'hotel-a', all: false, runtime: 'runtime-a', rpc: vi.fn(), options: null as any }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => { state.options = options; return {} } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenant, user: { id: state.actor,
  tenant_id: state.tenant, status: state.status, account_locked: false, updated_at: 'version-a' } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel }, isAllHotelsMode: state.all }) }))
import { useRevenueReport } from './useRevenueReport'
import { reportFixture } from './revenue-report.test-fixture'

beforeEach(() => { Object.assign(state, { actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', status: 'active',
  hotel: 'hotel-a', all: false, runtime: 'runtime-a' }); state.rpc.mockReset() })
describe('server revenue query', () => {
  it('uses an abortable aggregate RPC with explicit calendar dates instead of a capped booking query', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: reportFixture(), error: null })
    state.rpc.mockReturnValue({ abortSignal })
    renderHook(() => useRevenueReport('custom', { start: new Date(2025, 0, 1), end: new Date(2026, 9, 31) }))
    const signal = new AbortController().signal
    await state.options.queryFn({ signal })
    expect(state.rpc).toHaveBeenCalledWith('get_revenue_report', expect.objectContaining({ p_hotel_id: 'hotel-a',
      p_period: 'custom', p_custom_start: '2025-01-01', p_custom_end: '2026-10-31', p_timezone: expect.any(String) }))
    expect(abortSignal).toHaveBeenCalledWith(signal)
  })
  it('separates cache by actor, session, tenant, runtime and hotel', () => {
    const { rerender } = renderHook(() => useRevenueReport('year'))
    const first = JSON.stringify(state.options.queryKey)
    for (const field of ['actor', 'session', 'tenant', 'runtime', 'hotel'] as const) {
      state[field] += '-changed'; rerender(); expect(JSON.stringify(state.options.queryKey)).not.toBe(first)
    }
  })
  it('rejects late results after identity changes even if the original identity returns', async () => {
    let resolve!: (value: unknown) => void
    state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { rerender } = renderHook(() => useRevenueReport())
    const pending = state.options.queryFn({ signal: new AbortController().signal })
    const rejection = expect(pending).rejects.toThrow('Phiên xem báo cáo đã thay đổi')
    state.session = 'session-b'; rerender(); state.session = 'session-a'; rerender()
    resolve({ data: reportFixture(), error: null }); await rejection
  })
  it('does not replace permission or server errors with a zero report', async () => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: new Error('DENIED') }) })
    renderHook(() => useRevenueReport())
    await expect(state.options.queryFn({ signal: new AbortController().signal })).rejects.toThrow('DENIED')
  })
  it('does not query inactive identities and uses assigned-only all-hotel aggregation', async () => {
    state.status = 'inactive'; const { rerender } = renderHook(() => useRevenueReport())
    expect(state.options.enabled).toBe(false)
    state.status = 'active'; state.all = true; rerender()
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: reportFixture(), error: null }) })
    await state.options.queryFn({ signal: new AbortController().signal })
    expect(state.rpc).toHaveBeenCalledWith('get_revenue_report', expect.objectContaining({ p_hotel_id: undefined }))
  })
})
