import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportTargetClient } from '@/lib/report-targets'
import { reportTargetFixture, targetRevision } from '@/test/report-target-fixture'
import { emailActor, emailHotel, emailOther, emailOtherSession, emailSession, emailTenant, emailToken } from '@/test/email-auth-fixture'

const state = vi.hoisted(() => ({ session: null as { access_token: string; user: { id: string } } | null,
  user: null as Record<string, unknown> | null, authUser: null as { id: string } | null,
  hotel: '', all: false, get: vi.fn(), success: vi.fn(), error: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture', workspace: null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: state.session, user: state.authUser }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.user, tenantId: state.user?.tenant_id }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: state.hotel ? { id: state.hotel } : null, isAllHotelsMode: state.all }) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }))
import { useReportTargets } from './useReportTargets'
import { roomCommandRuntimeScope } from '@/lib/room-transition-client'

let f: ReturnType<typeof reportTargetFixture>
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); f = reportTargetFixture()
  state.session = f.state.session; state.authUser = { id: emailActor }; state.hotel = emailHotel; state.all = false
  state.user = { id: emailActor, tenant_id: emailTenant, status: 'active', updated_at: 'v1' }
  runtime.supabaseUrl = 'https://owned.roomqc.invalid'; runtime.supabasePublishableKey = 'public-fixture'
  state.get.mockImplementation(async () => ({ data: { session: state.session }, error: null }))
  vi.stubGlobal('fetch', f.http)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(cache, 'invalidateQueries')
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, invalidate, ...renderHook(({ kind, month, allow }) => useReportTargets(kind, month, allow),
    { wrapper, initialProps: { kind: 'financial' as 'financial' | 'monthly', month: '2026-10-01', allow: true } }) }
}
const ready = async (h: ReturnType<typeof setup>) => waitFor(() => {
  expect(h.result.current.data?.version).toBe(1); expect(h.result.current.pendingReady).toBe(true)
})
const mutations = () => f.http.mock.calls.filter(x => String(x[0]).endsWith('/replace_report_targets'))
describe('target hook authority, scope and recovery', () => {
  it('reads native scoped RPC and saves all metrics once', async () => {
    const h = setup(); await ready(h)
    await act(async () => { await h.result.current.save({ adr: 123.45, occupancy: 0 }, targetRevision()) })
    await waitFor(() => expect(h.result.current.data?.values.occupancy).toBe(0))
    expect(mutations()).toHaveLength(1); expect(localStorage.length).toBe(0); expect(state.success).toHaveBeenCalledTimes(1)
    const keys = JSON.stringify(h.cache.getQueryCache().getAll().map(q => q.queryKey))
    expect(keys).toContain(emailActor); expect(keys).toContain(emailTenant); expect(keys).not.toContain(emailToken())
  })
  it.each(['actor', 'session', 'hotel', 'runtime', 'authority'] as const)('changes cache identity for %s', async field => {
    const h = setup(); await ready(h); const previous = h.result.current.scope
    if (field === 'actor') { state.session = { access_token: emailToken(emailOther), user: { id: emailOther } }; state.authUser = { id: emailOther }; state.user!.id = emailOther }
    if (field === 'session') state.session = { access_token: emailToken(emailActor, emailOtherSession), user: { id: emailActor } }
    if (field === 'hotel') state.hotel = emailOther
    if (field === 'runtime') runtime.supabaseUrl = 'https://other.roomqc.invalid'
    if (field === 'authority') state.user!.updated_at = 'v2'
    h.rerender({ kind: 'financial', month: '2026-10-01', allow: true })
    expect(h.result.current.scope).not.toBe(previous)
    expect(h.result.current.data).toBeUndefined()
  })
  it.each(['signed-out', 'profile-mismatch', 'locked', 'inactive', 'hotel-missing'] as const)('masks retained data and old save callbacks for %s', async mode => {
    const h = setup(); await ready(h); const save = h.result.current.save
    if (mode === 'signed-out') { state.session = null; state.authUser = null }
    if (mode === 'profile-mismatch') state.user!.id = emailOther
    if (mode === 'locked') state.user!.account_locked = true
    if (mode === 'inactive') state.user!.status = 'inactive'
    if (mode === 'hotel-missing') state.hotel = ''
    h.rerender({ kind: 'financial', month: '2026-10-01', allow: true })
    expect(h.result.current.data).toBeUndefined(); expect(h.result.current.scopeEnabled).toBe(false)
    await expect(save({}, targetRevision())).rejects.toMatchObject({ code: 'identity_changed' }); expect(mutations()).toHaveLength(0)
  })
  it('monthly targets never fetch an all-hotel scope', () => {
    state.all = true; const h = setup(); h.rerender({ kind: 'monthly', month: '2026-10-01', allow: true })
    expect(h.result.current.scopeEnabled).toBe(false)
    expect(f.http.mock.calls.filter(x => JSON.parse(String(x[1]?.body)).p_kind === 'monthly')).toHaveLength(0)
  })
  it('financial tenant-wide reads keep null scope and show server denial', async () => {
    state.all = true; f.state.readStatus = 403; const h = setup()
    await waitFor(() => expect(h.result.current.error).toBeTruthy())
    expect(h.result.current.data).toBeUndefined(); expect(h.result.current.notice).toContain('quyền')
    expect(JSON.parse(String(f.http.mock.calls[0][1]?.body)).p_hotel_id).toBeNull()
  })
  it('a failed refetch hides previously cached data', async () => {
    const h = setup(); await ready(h); f.state.readStatus = 403
    await act(async () => { await h.result.current.refetch() })
    await waitFor(() => expect(h.result.current.error).toBeTruthy())
    expect(h.result.current.data).toBeUndefined()
  })
  it('single flight blocks synchronous double clicks', async () => {
    const h = setup(); await ready(h)
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'replace_report_targets' ? gate : undefined
    let first!: Promise<unknown>, second!: Promise<unknown>
    act(() => { first = h.result.current.save({}, targetRevision()); second = h.result.current.save({}, targetRevision()).catch(e => e) })
    expect(await second).toMatchObject({ code: 'flow_busy' })
    await waitFor(() => expect(mutations()).toHaveLength(1))
    await act(async () => { release(); await first })
    expect(state.success).toHaveBeenCalledTimes(1)
  })
  it('hotel A→B→A cannot accept the old completion, toast or cache invalidation', async () => {
    const h = setup(); await ready(h); const oldScope = h.result.current.scope
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'replace_report_targets' ? gate : undefined
    let saved!: Promise<unknown>
    act(() => { saved = h.result.current.save({}, targetRevision()).catch(e => e) })
    await waitFor(() => expect(mutations()).toHaveLength(1))
    state.hotel = emailOther; h.rerender({ kind: 'financial', month: '2026-10-01', allow: true })
    state.hotel = emailHotel; h.rerender({ kind: 'financial', month: '2026-10-01', allow: true }); await ready(h)
    expect(h.result.current.scope).not.toBe(oldScope); expect(h.result.current.isSaving).toBe(false)
    await act(async () => { release(); expect(await saved).toMatchObject({ code: 'identity_changed' }) })
    expect(h.result.current.pending).toHaveLength(1); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled()
    expect(h.invalidate).not.toHaveBeenCalled()
    await act(async () => { await h.result.current.recover() })
    expect(mutations()).toHaveLength(1); expect(state.success).toHaveBeenCalledTimes(1)
  })
  it('unmount leaves a committed but unobserved command for the next mount', async () => {
    const h = setup(); await ready(h)
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'replace_report_targets' ? gate : undefined
    let p!: Promise<unknown>; act(() => { p = h.result.current.save({}, targetRevision()).catch(e => e) })
    await waitFor(() => expect(mutations()).toHaveLength(1)); h.unmount()
    release(); expect(await p).toMatchObject({ code: 'identity_changed' }); expect(localStorage.length).toBe(1)
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled()
    const next = setup(); await ready(next); expect(next.result.current.pending).toHaveLength(1)
    await act(async () => { await next.result.current.recover() }); expect(localStorage.length).toBe(0)
  })
  it('sees another tab pending and fetches current state rather than replacing it with an old receipt', async () => {
    const h = setup(); await ready(h)
    const external = createReportTargetClient({ ...f.deps, storage: () => localStorage })
    f.state.lose = 'after'
    const context = { actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, runtime: roomCommandRuntimeScope() }
    await expect(external.save(context, { kind: 'financial', month: '2026-10-01', hotelId: emailHotel }, { adr: 10 }, targetRevision())).rejects.toThrow()
    f.state.lose = 'none'; f.state.values = { adr: 999 }; f.state.counter++
    act(() => window.dispatchEvent(new StorageEvent('storage')))
    expect(h.result.current.pending).toHaveLength(1)
    await act(async () => { await h.result.current.recover() })
    await waitFor(() => expect(h.result.current.data?.values.adr).toBe(999))
    expect(f.state.effects).toBe(1); expect(h.result.current.pending).toEqual([])
  })
  it('cancels a stale command, refetches current values and distinguishes cancellation from a saved result', async () => {
    const h = setup(); await ready(h); f.state.counter = 1
    await act(async () => { await expect(h.result.current.save({ adr: 9 }, targetRevision())).rejects.toMatchObject({ code: 'stale_revision' }) })
    expect(h.result.current.pending).toHaveLength(1)
    await act(async () => { expect((await h.result.current.cancel()).state).toBe('cancelled') })
    await waitFor(() => expect(h.result.current.pending).toHaveLength(0))
    expect(f.state.effects).toBe(0); expect(state.success).toHaveBeenCalledWith(expect.stringContaining('Đã hủy'))
    expect(h.invalidate).toHaveBeenCalledWith({ queryKey: ['report-targets'] })
  })
  it('unknown cancellation keeps pending until a remount can recover the cancelled receipt', async () => {
    const h = setup(); await ready(h); f.state.lose = 'before'
    await act(async () => { await expect(h.result.current.save({}, targetRevision())).rejects.toThrow() })
    f.state.cancelLose = 'after'
    await act(async () => { await expect(h.result.current.cancel()).rejects.toThrow() })
    expect(localStorage.length).toBe(1); expect(state.success).not.toHaveBeenCalled(); h.unmount()
    f.state.cancelLose = 'none'; const next = setup(); await ready(next)
    await act(async () => { expect((await next.result.current.recover()).state).toBe('cancelled') })
    expect(f.state.cancellations).toBe(1); expect(f.state.effects).toBe(0); expect(localStorage.length).toBe(0)
  })
  it('cancellation completed after A→B→A cannot toast or invalidate the new scope', async () => {
    const h = setup(); await ready(h); f.state.lose = 'before'
    await act(async () => { await expect(h.result.current.save({}, targetRevision())).rejects.toThrow() })
    state.success.mockClear(); state.error.mockClear(); h.invalidate.mockClear()
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'cancel_report_target_command' ? gate : undefined
    let p!: Promise<unknown>; act(() => { p = h.result.current.cancel().catch(e => e) })
    await waitFor(() => expect(f.state.cancellations).toBe(1))
    state.hotel = emailOther; h.rerender({ kind: 'financial', month: '2026-10-01', allow: true })
    state.hotel = emailHotel; h.rerender({ kind: 'financial', month: '2026-10-01', allow: true }); await ready(h)
    await act(async () => { release(); expect(await p).toMatchObject({ code: 'identity_changed' }) })
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(1)
  })
})
