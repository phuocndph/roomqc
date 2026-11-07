import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
const state = vi.hoisted(() => ({ actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', runtime: 'runtime-a',
  hotel: 'hotel-a', all: false, locked: false, rpc: vi.fn(), options: null as any }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (o: unknown) => { state.options = o; return {} } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenant, user: { id: state.actor, status: 'active', account_locked: state.locked } }) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: {} }) }))
vi.mock('@/lib/staff-invitation', () => ({ staffInvitationSession: () => ({ actorId: state.actor, sessionId: state.session }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotel }, isAllHotelsMode: state.all }) }))
import { useLaborCost } from './useLaborCost'
const range = { start: new Date(2026, 9, 15, 0), end: new Date(2026, 9, 15, 23, 59) }
const payload = () => ({ total_labor_cost: 240000, by_department: { other: 240000 },
  method: 'shift_start_duration_wage_estimate', is_estimate: true, period_start: '2026-10-15', period_end: '2026-10-15',
  recognition_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
beforeEach(() => { Object.assign(state, { actor: 'actor-a', session: 'session-a', tenant: 'tenant-a', runtime: 'runtime-a',
  hotel: 'hotel-a', all: false, locked: false }); state.rpc.mockReset() })
const query = () => state.options.queryFn({ signal: new AbortController().signal })

describe('scoped aggregate labor estimate', () => {
  it('sends local days/timezone without tenant and preserves estimate metadata', async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: payload(), error: null }); state.rpc.mockReturnValue({ abortSignal })
    renderHook(() => useLaborCost(range)); expect(await query()).toEqual(payload())
    expect(state.rpc).toHaveBeenCalledWith('get_labor_cost_scoped', { p_start_date: '2026-10-15', p_end_date: '2026-10-15',
      p_timezone: expect.any(String), p_hotel_id: 'hotel-a' }); expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })
  it.each(['actor', 'session', 'tenant', 'runtime', 'hotel'] as const)('partitions the cache by %s', field => {
    const { rerender } = renderHook(() => useLaborCost(range)); const key = state.options.queryKey
    state[field] += '-other'; rerender(); expect(state.options.queryKey).not.toEqual(key)
  })
  it('disables locked accounts and lets the server scope all hotels', async () => {
    state.locked = true; const { rerender } = renderHook(() => useLaborCost(range)); expect(state.options.enabled).toBe(false)
    state.locked = false; state.all = true; rerender(); state.rpc.mockReturnValue({ abortSignal: async () => ({ data: payload(), error: null }) })
    await query(); expect(state.rpc.mock.calls[0][1].p_hotel_id).toBeUndefined()
  })
  it.each(['hotel', 'session'] as const)('rejects a late result after %s changes away and back', async field => {
    let resolve!: (v: unknown) => void; state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { rerender } = renderHook(() => useLaborCost(range)); const pending = query()
    const rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi')
    const old = state[field]; state[field] = 'other'; rerender(); state[field] = old; rerender()
    resolve({ data: payload(), error: null }); await rejection
  })
  it('rejects results after unmount and abort', async () => {
    let resolve!: (v: unknown) => void; state.rpc.mockReturnValue({ abortSignal: () => new Promise(r => { resolve = r }) })
    const { unmount } = renderHook(() => useLaborCost(range)); const pending = query()
    const rejection = expect(pending).rejects.toThrow('phạm vi báo cáo đã thay đổi'); unmount(); resolve({ data: payload(), error: null }); await rejection
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: payload(), error: null }) })
    renderHook(() => useLaborCost(range)); const c = new AbortController(); c.abort()
    await expect(state.options.queryFn({ signal: c.signal })).rejects.toThrow('Đã hủy')
  })
  it.each([null, {}, { ...payload(), total_labor_cost: '0' }, { ...payload(), is_estimate: false },
    { ...payload(), by_department: { other: '240000' } }, { ...payload(), period_end: '2026-10-16' }])('rejects unsupported or wrong-period payload %#', async data => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data, error: null }) }); renderHook(() => useLaborCost(range))
    await expect(query()).rejects.toThrow('phiên bản máy chủ')
  })
  it('preserves a real zero but never converts a server denial into zero', async () => {
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: { ...payload(), total_labor_cost: 0, by_department: {} }, error: null }) })
    renderHook(() => useLaborCost(range)); expect((await query()).total_labor_cost).toBe(0)
    state.rpc.mockReturnValue({ abortSignal: async () => ({ data: null, error: new Error('LABOR_DENIED') }) }); await expect(query()).rejects.toThrow('LABOR_DENIED')
  })
})
