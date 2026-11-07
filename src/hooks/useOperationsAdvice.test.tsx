import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOperationsAdviceClient } from '@/lib/operations-advice-client'
import { adviceFixture, adviceScope, deferredAdvice } from '@/test/operations-advice-fixture'
import { emailActor, emailHotel, emailOther, emailOtherSession, emailSession, emailTenant, emailToken } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ session: null as { access_token: string; user: { id: string } } | null,
  user: null as Record<string, unknown> | null, authUser: null as { id: string } | null,
  hotel: '', all: false, view: true, permissionLoading: false, get: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: null as null | { workspace: { tenantId: string }; cluster: { id: string } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: state.session, user: state.authUser }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.user, tenantId: state.user?.tenant_id }) }))
vi.mock('./usePermission', () => ({ useHasPermission: () => ({ hasPermission: state.view, isLoading: state.permissionLoading }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: state.hotel ? { id: state.hotel } : null, isAllHotelsMode: state.all }) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
import { useOperationsAdvice } from './useOperationsAdvice'
import { buildOperationsInsights, type OperationsInsightsData } from './useOperationsInsights'
import { operationsFixture, operationsRange, operationsRequest } from './operations-report.test-fixture'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'
let f: ReturnType<typeof adviceFixture>, locks: PropertyDescriptor | undefined
const data = () => buildOperationsInsights(operationsFixture({ ...operationsRequest(), timezone: 'Asia/Ho_Chi_Minh' }), { total_labor_cost: 20, by_department: {}, method: 'shift_start_duration_wage_estimate',
  is_estimate: true, period_start: '2026-10-01', period_end: '2026-10-02', recognition_timezone: 'Asia/Ho_Chi_Minh' }, {}, operationsRange)
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); f = adviceFixture(); state.session = f.state.session; state.authUser = { id: emailActor }
  state.hotel = emailHotel; state.all = false; state.view = true; state.permissionLoading = false
  state.user = { id: emailActor, tenant_id: emailTenant, status: 'active', updated_at: 'v1' }
  runtime.supabaseUrl = 'https://owned.roomqc.invalid'; runtime.supabasePublishableKey = 'public-fixture'; runtime.workspace = null
  state.get.mockImplementation(async () => ({ data: { session: state.session }, error: null })); vi.stubGlobal('fetch', f.http)
  locks = Object.getOwnPropertyDescriptor(navigator, 'locks')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name, _options, run) => f.lock(name, () => run({ name })) } })
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); if (locks) Object.defineProperty(navigator, 'locks', locks); else Reflect.deleteProperty(navigator, 'locks') })
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, ...renderHook(({ insights }) => useOperationsAdvice(insights), { wrapper, initialProps: { insights: data() as OperationsInsightsData | undefined } }) }
}
const ready = async (h: ReturnType<typeof setup>) => waitFor(() => expect(h.result.current.pendingReady).toBe(true))
describe('manual advice hook identity and recovery', () => {
  it('explicit closure clears pending only after the terminal receipt and does not generate again', async () => {
    const h = setup(); await ready(h); f.state.generateState = 'unknown'; f.state.canClose = true
    await act(async () => { await h.result.current.generate() })
    expect(h.result.current.pending).not.toBeNull()
    await act(async () => { await h.result.current.close() })
    expect(h.result.current.receipt?.state).toBe('closed_unknown'); expect(h.result.current.pending).toBeNull()
    expect(h.result.current.data).toEqual([]); expect(f.state.effects).toBe(1); expect(f.state.closureEffects).toBe(1)
  })
  it('closing too early preserves pending and shows the safe server message', async () => {
    const h = setup(); await ready(h); f.state.generateState = 'unknown'
    await act(async () => { await h.result.current.generate() })
    await act(async () => { await expect(h.result.current.close()).rejects.toMatchObject({ code: 'still_processing' }) })
    expect(h.result.current.pending).not.toBeNull(); expect(h.result.current.notice).toContain('thời hạn xử lý')
    expect(f.state.effects).toBe(1); expect(f.state.closureEffects).toBe(0)
  })
  it('mount, rerender, focus, storage notification and query invalidation cannot generate', async () => {
    const h = setup(); await ready(h); h.rerender({ insights: data() })
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new StorageEvent('storage')) })
    await act(async () => { await h.cache.invalidateQueries() })
    expect(f.http).not.toHaveBeenCalled(); expect(h.result.current.data).toEqual([])
  })
  it('manual click sends only scope/key and releases validated data', async () => {
    const h = setup(); await ready(h); await act(async () => { await h.result.current.generate() })
    expect(h.result.current.data).toHaveLength(3); expect(h.result.current.pending).toBeNull()
    expect(f.state.calls).toEqual([expect.objectContaining({ action: 'generate', start: '2026-10-01', end: '2026-10-02', hotel: emailHotel, timezone: 'Asia/Ho_Chi_Minh' })])
    expect(JSON.stringify(f.state.calls)).not.toContain('snapshot')
  })
  it('synchronous double-click is a single flight', async () => {
    const h = setup(); await ready(h); const gate = deferredAdvice(); f.state.beforeReply = () => gate.wait
    let first!: Promise<unknown>, second!: Promise<unknown>
    act(() => { first = h.result.current.generate(); second = h.result.current.generate().catch(e => e) })
    expect(await second).toMatchObject({ code: 'flow_busy' }); await waitFor(() => expect(f.state.calls).toHaveLength(1))
    await act(async () => { gate.release(); await first }); expect(f.state.effects).toBe(1)
  })
  it.each(['actor', 'session', 'hotel', 'period', 'runtime', 'public-key', 'authority', 'source', 'permission'] as const)('masks completed data immediately after %s changes', async mode => {
    const h = setup(); await ready(h); await act(async () => { await h.result.current.generate() }); const previous = h.result.current.scope
    let insights = data()
    if (mode === 'actor') { state.session = { access_token: emailToken(emailOther), user: { id: emailOther } }; state.authUser = { id: emailOther }; state.user!.id = emailOther }
    if (mode === 'session') state.session = { access_token: emailToken(emailActor, emailOtherSession), user: { id: emailActor } }
    if (mode === 'hotel') state.hotel = emailOther
    if (mode === 'period') insights = { ...insights, dateRange: { ...insights.dateRange, end: new Date(2026, 9, 3) } }
    if (mode === 'runtime') runtime.supabaseUrl = 'https://other.roomqc.invalid'
    if (mode === 'public-key') runtime.supabasePublishableKey = 'other-public-key'
    if (mode === 'authority') state.user!.updated_at = 'v2'
    if (mode === 'source') insights = { ...insights, invalidCheckoutDates: 1 }
    if (mode === 'permission') state.view = false
    h.rerender({ insights }); expect(h.result.current.scope).not.toBe(previous); expect(h.result.current.data).toEqual([])
    expect(f.state.calls).toHaveLength(1)
  })
  it.each(['signed-out', 'mismatch', 'inactive', 'locked', 'hotel-missing', 'permission-loading', 'source-failure', 'wrong-workspace'] as const)('disables old callbacks for %s', async mode => {
    const h = setup(); await ready(h); const old = h.result.current.generate
    let insights: OperationsInsightsData | undefined = data()
    if (mode === 'signed-out') { state.session = null; state.authUser = null }
    if (mode === 'mismatch') state.user!.id = emailOther
    if (mode === 'inactive') state.user!.status = 'inactive'
    if (mode === 'locked') state.user!.account_locked = true
    if (mode === 'hotel-missing') state.hotel = ''
    if (mode === 'permission-loading') state.permissionLoading = true
    if (mode === 'source-failure') insights = undefined
    if (mode === 'wrong-workspace') runtime.workspace = { workspace: { tenantId: emailOther }, cluster: { id: 'other' } }
    h.rerender({ insights }); expect(h.result.current.scopeEnabled).toBe(false)
    await expect(old()).rejects.toMatchObject({ code: 'identity_changed' }); expect(f.http).not.toHaveBeenCalled()
  })
  it('A→B→A cannot accept an old completion; pending recovers only on explicit lookup', async () => {
    const h = setup(); await ready(h); const gate = deferredAdvice(); f.state.beforeReply = () => gate.wait
    let pending!: Promise<unknown>; act(() => { pending = h.result.current.generate().catch(e => e) })
    await waitFor(() => expect(f.state.calls).toHaveLength(1))
    state.hotel = emailOther; h.rerender({ insights: data() }); state.hotel = emailHotel; h.rerender({ insights: data() }); await ready(h)
    await act(async () => { gate.release(); expect(await pending).toMatchObject({ code: 'identity_changed' }) })
    expect(h.result.current.data).toEqual([]); expect(h.result.current.pending).not.toBeNull(); expect(h.result.current.notice).toBeNull()
    f.state.beforeReply = null; await act(async () => { await h.result.current.lookup() }); expect(h.result.current.data).toHaveLength(3); expect(f.state.effects).toBe(1)
  })
  it('unmount retains an unobserved completion; remount does not automatically send or lookup', async () => {
    const h = setup(); await ready(h); const gate = deferredAdvice(); f.state.beforeReply = () => gate.wait
    let pending!: Promise<unknown>; act(() => { pending = h.result.current.generate().catch(e => e) })
    await waitFor(() => expect(f.state.calls).toHaveLength(1)); h.unmount(); gate.release(); expect(await pending).toMatchObject({ code: 'identity_changed' })
    const next = setup(); await ready(next); expect(next.result.current.pending).not.toBeNull(); expect(f.state.calls).toHaveLength(1)
    f.state.beforeReply = null; await act(async () => { await next.result.current.lookup() }); expect(next.result.current.data).toHaveLength(3)
  })
  it('same actor relogin recovers the old key with a fresh session', async () => {
    const h = setup(); await ready(h); f.state.loss = 'after'
    await act(async () => { await expect(h.result.current.generate()).rejects.toThrow() })
    const id = h.result.current.pending!.request.command_id; state.session = { access_token: emailToken(emailActor, emailOtherSession), user: { id: emailActor } }
    h.rerender({ insights: data() }); await ready(h); expect(h.result.current.pending?.context.sessionId).toBe(emailSession)
    f.state.loss = 'none'; await act(async () => { expect((await h.result.current.lookup()).command_id).toBe(id) }); expect(f.state.effects).toBe(1)
  })
  it('storage events expose another tab pending without network or a new key', async () => {
    const h = setup(); await ready(h); const c = createOperationsAdviceClient(f.deps); f.state.loss = 'before'
    await expect(c.generate({ actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, runtime: roomCommandRuntimeScope() }, { ...adviceScope, end: '2026-10-02' })).rejects.toThrow()
    act(() => window.dispatchEvent(new StorageEvent('storage'))); expect(h.result.current.pending).not.toBeNull(); expect(f.state.calls).toHaveLength(1)
    f.state.loss = 'none'; await act(async () => { await h.result.current.lookup() }); expect(h.result.current.receipt?.state).toBe('not_found'); expect(f.state.effects).toBe(0)
    await act(async () => { await h.result.current.cancel() }); expect(h.result.current.receipt?.state).toBe('cancelled'); expect(h.result.current.pending).toBeNull()
  })
  it('unknown stays pending and explicit resume does not resend', async () => {
    const h = setup(); await ready(h); f.state.generateState = 'unknown'
    await act(async () => { await h.result.current.generate(); await h.result.current.resume() })
    expect(h.result.current.receipt?.state).toBe('unknown'); expect(h.result.current.pending).not.toBeNull(); expect(f.state.effects).toBe(1)
    expect(f.state.calls.filter(c => c.action === 'generate')).toHaveLength(1)
  })
  it('server denial on lookup hides previous data, preserves pending and shows a safe notice', async () => {
    const h = setup(); await ready(h); f.state.loss = 'after'; await act(async () => { await expect(h.result.current.generate()).rejects.toThrow() })
    f.state.loss = 'none'; f.state.status = 403
    await act(async () => { await expect(h.result.current.lookup()).rejects.toMatchObject({ code: 'permission_denied' }) })
    expect(h.result.current.data).toEqual([]); expect(h.result.current.notice).toContain('quyền'); expect(h.result.current.pending).not.toBeNull()
  })
})
