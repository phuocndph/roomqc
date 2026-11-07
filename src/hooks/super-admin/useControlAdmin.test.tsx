import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlCluster, controlSession } from '@/test/control-admin-fixture'
import { emailActor, emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'
const auth = vi.hoisted(() => ({ session: null as ReturnType<typeof controlSession> | null, user: null as { id: string } | null,
  profile: null as Record<string, unknown> | null, get: vi.fn(), request: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key-a', workspace: null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: auth.session, user: auth.user, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: auth.profile, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: auth.get } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/lib/workspace', () => ({ controlRequest: auth.request }))
import { controlAdminClient, useControlAdmin } from './useControlAdmin'
beforeEach(() => {
  vi.clearAllMocks(); auth.session = controlSession(); auth.user = { id: emailActor }
  auth.profile = { id: emailActor, status: 'active', user_level_code: 'super_admin', updated_at: 'v1' }
  runtime.supabaseUrl = 'https://cluster-a.example.test'; runtime.supabasePublishableKey = 'public-key-a'
  auth.get.mockImplementation(async () => ({ data: { session: auth.session }, error: null }))
  auth.request.mockResolvedValue({ items: [controlCluster()], nextCursor: null })
})
afterEach(() => cleanup())
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, ...renderHook(({ target, allow }) => useControlAdmin(['clusters', target],
    (actor, options) => controlAdminClient.clusters(actor, {}, options), allow), { wrapper, initialProps: { target: 'A', allow: true } }) }
}
describe('control admin session-scoped reads', () => {
  it('loads actual client data without a token in query cache keys', async () => {
    const h = setup(); await waitFor(() => expect(h.result.current.data?.items).toHaveLength(1))
    expect(JSON.stringify(h.cache.getQueryCache().getAll().map(query => query.queryKey))).not.toContain(emailToken())
  })
  it.each(['logout', 'other-profile', 'staff', 'locked', 'inactive', 'deleted', 'disabled'])('masks cached data and stops dispatch on %s', async mode => {
    const h = setup(); await waitFor(() => expect(h.result.current.data).toBeDefined())
    const count = auth.request.mock.calls.length, oldRefetch = h.result.current.refetch
    if (mode === 'logout') { auth.user = null; auth.session = null }
    if (mode === 'other-profile') auth.profile!.id = emailOther
    if (mode === 'staff') auth.profile!.user_level_code = 'staff'
    if (mode === 'locked') auth.profile!.account_locked = true
    if (mode === 'inactive') auth.profile!.status = 'inactive'
    if (mode === 'deleted') auth.profile!.deleted_at = '2026-10-28T00:00:00Z'
    h.rerender({ target: 'A', allow: mode !== 'disabled' })
    expect(h.result.current.data).toBeUndefined(); expect(h.result.current.enabled).toBe(false)
    await act(async () => { await oldRefetch() }); expect(auth.request).toHaveBeenCalledTimes(count)
  })
  it('A to B to A cannot revive an old query callback', async () => {
    const h = setup(); await waitFor(() => expect(h.result.current.data).toBeDefined()); const old = h.result.current.refetch
    h.rerender({ target: 'B', allow: true }); h.rerender({ target: 'A', allow: true })
    await waitFor(() => expect(h.result.current.data).toBeDefined()); const count = auth.request.mock.calls.length
    await act(async () => { await old() }); expect(auth.request).toHaveBeenCalledTimes(count)
  })
  it('hides a previous successful response when the server later denies the read', async () => {
    const h = setup(); await waitFor(() => expect(h.result.current.data).toBeDefined())
    auth.request.mockRejectedValue(new Error('denied'))
    await act(async () => { await h.result.current.refetch() })
    await waitFor(() => expect(h.result.current.message).toContain('Không thể tải dữ liệu'))
    expect(h.result.current.data).toBeUndefined()
  })
  it.each(['session', 'runtime', 'public-key'])('ignores an old response after %s changes', async mode => {
    let release!: (data: unknown) => void
    auth.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const h = setup(); await waitFor(() => expect(auth.request).toHaveBeenCalledTimes(1))
    if (mode === 'session') auth.session!.access_token = emailToken(emailActor, emailOtherSession)
    if (mode === 'runtime') runtime.supabaseUrl = 'https://cluster-b.example.test'
    if (mode === 'public-key') runtime.supabasePublishableKey = 'public-key-b'
    h.rerender({ target: 'A', allow: true })
    await waitFor(() => expect(auth.request.mock.calls.length).toBe(2))
    await act(async () => { release({ items: [controlCluster({ id: 'old-cluster' })], nextCursor: null }) })
    await waitFor(() => expect(h.result.current.data?.items[0].id).toBe('local-a'))
  })
})
