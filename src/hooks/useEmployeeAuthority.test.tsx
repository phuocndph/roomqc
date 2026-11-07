import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorityFixture, actor, target, tenant, hotel, hotel2, context } from '@/test/employee-authority-fixture'
import { createEmployeeAuthorityClient } from '@/lib/employee-authority'
import { emailOtherSession, emailToken } from '@/test/email-auth-fixture'

const state = vi.hoisted(() => ({ session: null as { access_token: string; user: { id: string } } | null,
  authUser: null as { id: string } | null, user: null as Record<string, unknown> | null,
  get: vi.fn(), success: vi.fn(), error: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: { cluster: { id: 'a' }, workspace: { id: 'w-a', tenantId: '', routingVersion: 1 } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: state.session, user: state.authUser }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.user }) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }))
import { employeeAuthorityRuntimeScope, useEmployeeAuthority } from './useEmployeeAuthority'

let fixture: ReturnType<typeof authorityFixture>
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); fixture = authorityFixture()
  state.session = fixture.state.session; state.authUser = { id: actor }
  state.user = { id: actor, tenant_id: tenant, user_level_code: 'tenant_owner', hotel_id: hotel, status: 'active' }
  state.get.mockImplementation(async () => ({ data: { session: state.session }, error: null }))
  runtime.workspace.cluster.id = 'a'; runtime.workspace.workspace.id = 'w-a'; runtime.workspace.workspace.tenantId = tenant
  runtime.workspace.workspace.routingVersion = 1; runtime.supabaseUrl = 'https://owned.roomqc.invalid'
  vi.stubGlobal('fetch', fixture.http)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(cache, 'invalidateQueries')
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, invalidate, ...renderHook(({ id, allowed, revision }) => useEmployeeAuthority(id, allowed, revision),
    { wrapper, initialProps: { id: target, allowed: true, revision: 'v1' } }) }
}
const ready = async (f: ReturnType<typeof setup>) => waitFor(() => {
  expect(f.result.current.data?.target_id).toBe(target); expect(f.result.current.pendingReady).toBe(true)
})
const grants = [{ module: 'rooms', action: 'update', enabled: true }]
const mutationCount = () => fixture.http.mock.calls.filter(x => String(x[0]).endsWith('/replace_employee_authority')).length

describe('employee authority hook with strict HTTP client', () => {
  it('uses the native-session and runtime-scoped read model; saves once and invalidates effective permission reads', async () => {
    const f = setup(); await ready(f)
    const keys = JSON.stringify(f.cache.getQueryCache().getAll().map(x => x.queryKey))
    expect(keys).toContain(actor); expect(keys).toContain(tenant); expect(keys).toContain(target); expect(keys).not.toContain(emailToken())
    await act(async () => { await f.result.current.save('grants', grants, '5') })
    expect(mutationCount()).toBe(1); expect(state.success).toHaveBeenCalledTimes(1)
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ['user-permissions-with-source'] })
    expect(localStorage.length).toBe(0)
  })
  it('rejects a synchronous second click before React rerenders', async () => {
    const f = setup(); await ready(f); const base = fixture.http.getMockImplementation()!
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
    fixture.http.mockImplementation(async (url, options) => {
      const reply = await base(url, options); if (String(url).endsWith('/replace_employee_authority')) await gate; return reply
    })
    let first!: Promise<unknown>, second!: Promise<unknown>
    act(() => { first = f.result.current.save('grants', grants, '5'); second = f.result.current.save('grants', grants, '5').catch(e => e) })
    expect(await second).toMatchObject({ code: 'flow_busy' })
    await waitFor(() => expect(mutationCount()).toBe(1))
    await act(async () => { release(); await first })
    expect(state.success).toHaveBeenCalledTimes(1)
  })
  it.each(['signed-out', 'profile-mismatch', 'locked', 'inactive', 'staff', 'tenant-mismatch'])('hides data and suppresses old callbacks after %s', async mode => {
    const f = setup(); await ready(f); const save = f.result.current.save, calls = fixture.http.mock.calls.length
    if (mode === 'signed-out') { state.session = null; state.authUser = null }
    if (mode === 'profile-mismatch') state.user!.id = hotel2
    if (mode === 'locked') state.user!.account_locked = true
    if (mode === 'inactive') state.user!.status = 'inactive'
    if (mode === 'staff') state.user!.user_level_code = 'staff'
    if (mode === 'tenant-mismatch') runtime.workspace.workspace.tenantId = hotel2
    f.rerender({ id: target, allowed: true, revision: 'v1' })
    expect(f.result.current.data).toBeUndefined(); expect(f.result.current.isReady).toBe(false)
    await expect(save('grants', grants, '5')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(fixture.http).toHaveBeenCalledTimes(calls); expect(state.success).not.toHaveBeenCalled()
  })
  it.each(['session', 'workspace', 'routing', 'authority', 'target', 'target-revision'])('changes the editor scope when %s changes', async mode => {
    const f = setup(); await ready(f); const scope = f.result.current.scope
    if (mode === 'session') state.session = { access_token: emailToken(actor, emailOtherSession), user: { id: actor } }
    if (mode === 'workspace') runtime.workspace.workspace.id = 'w-b'
    if (mode === 'routing') runtime.workspace.workspace.routingVersion++
    if (mode === 'authority') state.user!.user_level_code = 'manager'
    f.rerender({ id: mode === 'target' ? hotel2 : target, allowed: true, revision: mode === 'target-revision' ? 'v2' : 'v1' })
    expect(f.result.current.scope).not.toBe(scope)
    await waitFor(() => expect(f.result.current.data?.target_id).toBe(mode === 'target' ? hotel2 : target))
  })
  it('returning to the same target has a fresh epoch, no stuck saving, and no stale toast/cache mutation', async () => {
    const f = setup(); await ready(f); const originalScope = f.result.current.scope, base = fixture.http.getMockImplementation()!
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
    fixture.http.mockImplementation(async (url, options) => {
      const response = await base(url, options); if (String(url).endsWith('/replace_employee_authority')) await gate; return response
    })
    let saved!: Promise<unknown>
    act(() => { saved = f.result.current.save('grants', grants, '5').catch(e => e) })
    await waitFor(() => expect(mutationCount()).toBe(1))
    expect(f.result.current.isSaving).toBe(true)
    f.rerender({ id: hotel2, allowed: true, revision: 'v1' })
    f.rerender({ id: target, allowed: true, revision: 'v1' }); await ready(f)
    expect(f.result.current.scope).not.toBe(originalScope); expect(f.result.current.isSaving).toBe(false)
    expect(f.result.current.pending.grants).toHaveLength(1)
    await act(async () => { release(); expect(await saved).toMatchObject({ code: 'identity_changed' }) })
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled()
    expect(f.result.current.notice).toBeNull()
    await act(async () => { await f.result.current.recover('grants') })
    expect(state.success).toHaveBeenCalledTimes(1); expect(mutationCount()).toBe(1)
  })
  it('sees a pending command from another tab and recovers it through result lookup', async () => {
    const f = setup(); await ready(f)
    fixture.state.loseWrite = true
    const client = createEmployeeAuthorityClient({ ...fixture.deps, storage: () => localStorage })
    await expect(client.save({ ...context, runtime: employeeAuthorityRuntimeScope() }, target, 'grants', grants, '5')).rejects.toThrow()
    act(() => window.dispatchEvent(new StorageEvent('storage')))
    expect(f.result.current.pending.grants).toHaveLength(1)
    await act(async () => { await f.result.current.recover('grants') })
    expect(f.result.current.pending.grants).toEqual([]); expect(mutationCount()).toBe(1)
  })
  it.each(['save', 'recover'])('refetches without a success notice after terminal cancellation through %s, then permits a fresh save', async mode => {
    const f = setup(); await ready(f); const base = fixture.http.getMockImplementation()!
    const reads = () => fixture.http.mock.calls.filter(x => String(x[0]).endsWith('/get_employee_authority_configuration')).length
    const beforeReads = reads()
    fixture.state.loseCancellation = mode === 'recover'
    fixture.http.mockImplementation((url, options) => String(url).endsWith('/replace_employee_authority')
      ? Promise.resolve(new Response('{}', { status: 400 })) : base(url, options))
    await act(async () => {
      await expect(f.result.current.save('grants', grants, '5')).rejects.toMatchObject({
        code: mode === 'recover' ? 'outcome_unknown' : 'command_cancelled',
      })
    })
    if (mode === 'recover') {
      expect(f.result.current.pending.grants).toHaveLength(1)
      await act(async () => { await expect(f.result.current.recover('grants')).rejects.toMatchObject({ code: 'command_cancelled' }) })
    }
    await waitFor(() => expect(reads()).toBeGreaterThan(beforeReads))
    expect(f.result.current.isSaving).toBe(false); expect(f.result.current.pending.grants).toEqual([])
    expect(f.result.current.data?.grants).toEqual(fixture.state.configuration.grants)
    expect(f.result.current.data?.versions.grants).toBe('5')
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).toHaveBeenCalled()
    expect(f.result.current.notice).toContain('chưa được áp dụng')
    fixture.http.mockImplementation(base)
    await act(async () => { await f.result.current.save('grants', grants, '5') })
    expect(fixture.state.committed?.request_id).not.toBe(fixture.state.cancelled?.request_id)
    expect(state.success).toHaveBeenCalledTimes(1); expect(f.result.current.notice).toBeNull()
  })
})
