import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { advicePolicyFixture, policyDraft } from '@/test/advice-policy-fixture'
import { emailActor, emailOther, emailTenant, emailToken } from '@/test/email-auth-fixture'

const auth = vi.hoisted(() => ({ session: null as null | { access_token: string; user: { id: string } },
  user: null as null | { id: string }, profile: null as null | Record<string, unknown>, get: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-test-key', workspace: null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: auth.session, user: auth.user, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: auth.profile, isLoading: false }) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: auth.get } } }))
import { useAdvicePolicy } from './useAdvicePolicy'

let f: ReturnType<typeof advicePolicyFixture>
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); f = advicePolicyFixture()
  auth.session = f.state.session; auth.user = { id: emailActor }
  auth.profile = { id: emailActor, status: 'active', user_level_code: 'super_admin', updated_at: 'v1' }
  auth.get.mockImplementation(async () => ({ data: { session: auth.session }, error: null }))
  runtime.supabaseUrl = 'https://cluster-a.example.test'; vi.stubGlobal('fetch', f.http)
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request:
    <T,>(key: string, o: { signal?: AbortSignal }, task: () => Promise<T>) => f.deps.lock(key, task) } })
})
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'locks') })
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, ...renderHook(({ tenant, active }) => useAdvicePolicy(tenant, active),
    { wrapper, initialProps: { tenant: emailTenant, active: true } }) }
}
const ready = (h: ReturnType<typeof setup>) => waitFor(() => { expect(h.result.current.data?.revision).toBe(0); expect(h.result.current.pendingReady).toBe(true) })
const writes = () => f.http.mock.calls.filter(x => String(x[0]).endsWith('/set_operations_advice_policy'))

describe('policy admin hook identity and recovery', () => {
  it('refetches current policy after a successful command without putting tokens in cache', async () => {
    const h = setup(); await ready(h)
    await act(async () => { await h.result.current.save(policyDraft(), 0) })
    await waitFor(() => expect(h.result.current.data?.revision).toBe(1))
    expect(writes()).toHaveLength(1); expect(localStorage.length).toBe(0)
    expect(JSON.stringify(h.cache.getQueryCache().getAll().map(x => x.queryKey))).not.toContain(emailToken())
  })
  it.each(['signed-out', 'other-profile', 'staff', 'locked', 'inactive', 'closed'] as const)('masks old data and rejects old callbacks for %s', async mode => {
    const h = setup(); await ready(h); const old = h.result.current.save
    if (mode === 'signed-out') { auth.user = null; auth.session = null }
    if (mode === 'other-profile') auth.profile!.id = emailOther
    if (mode === 'staff') auth.profile!.user_level_code = 'staff'
    if (mode === 'locked') auth.profile!.account_locked = true
    if (mode === 'inactive') auth.profile!.status = 'inactive'
    h.rerender({ tenant: emailTenant, active: mode !== 'closed' })
    expect(h.result.current.data).toBeUndefined(); expect(h.result.current.enabled).toBe(false)
    await expect(old(policyDraft(), 0)).rejects.toMatchObject({ code: 'identity_changed' }); expect(writes()).toHaveLength(0)
  })
  it('tenant A -> B -> A does not revive an old save callback', async () => {
    const h = setup(); await ready(h); const old = h.result.current.save, scope = h.result.current.scope
    h.rerender({ tenant: emailOther, active: true }); h.rerender({ tenant: emailTenant, active: true })
    expect(h.result.current.scope).not.toBe(scope)
    await expect(old(policyDraft(), 0)).rejects.toMatchObject({ code: 'identity_changed' }); expect(writes()).toHaveLength(0)
  })
  it('a late response from an old identity cannot show success or clear its pending record', async () => {
    const h = setup(); await ready(h)
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'set_operations_advice_policy' ? gate : undefined
    let saving!: Promise<unknown>
    act(() => { saving = h.result.current.save(policyDraft(), 0).catch(e => e) })
    await waitFor(() => expect(writes()).toHaveLength(1))
    auth.session = { access_token: emailToken(emailOther), user: { id: emailOther } }; auth.user = { id: emailOther }; auth.profile!.id = emailOther
    h.rerender({ tenant: emailTenant, active: true })
    await act(async () => { release(); expect(await saving).toMatchObject({ code: 'identity_changed' }) })
    expect(localStorage.length).toBe(1); expect(h.result.current.notice ?? '').not.toContain('Đã xác nhận lưu')
  })
  it('a failed refetch hides a previously visible policy', async () => {
    const h = setup(); await ready(h); f.state.readStatus = 403
    await act(async () => { await h.result.current.refetch() })
    await waitFor(() => expect(h.result.current.error).toBeTruthy())
    expect(h.result.current.data).toBeUndefined(); expect(h.result.current.notice).toContain('quyền')
  })
  it('an old successful receipt triggers a fresh read instead of replacing newer configuration', async () => {
    const h = setup(); await ready(h); f.state.loss = 'after'
    await act(async () => { await h.result.current.save(policyDraft(), 0).catch(() => {}) })
    f.state.loss = 'none'; f.state.revision = 4; f.state.policy = { ...policyDraft(), daily_limit: 99 }
    await act(async () => { await h.result.current.lookup() })
    await waitFor(() => expect(h.result.current.data?.revision).toBe(4))
    expect(h.result.current.data?.policy?.daily_limit).toBe(99); expect(f.state.effects).toBe(1)
  })
  it('single flight rejects a double click while preserving one durable command', async () => {
    const h = setup(); await ready(h)
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    f.state.beforeReply = rpc => rpc === 'set_operations_advice_policy' ? gate : undefined
    let first!: Promise<unknown>
    act(() => { first = h.result.current.save(policyDraft(), 0) })
    await waitFor(() => expect(writes()).toHaveLength(1))
    await expect(h.result.current.save(policyDraft(), 0)).rejects.toMatchObject({ code: 'flow_busy' })
    await act(async () => { release(); await first })
    expect(writes()).toHaveLength(1)
  })
})
