import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useActiveAnnouncements, useDismissAnnouncement } from './useActiveAnnouncements'
import { announcementScope, isAnnouncementDismissed, pendingDismissals, rememberDismissal } from '@/lib/announcement-state'

const state = vi.hoisted(() => ({
  user: { id: '', tenant_id: 'tenant' },
  subscriptionReady: true,
  readError: null as null | { message: string },
  insert: vi.fn(),
  getUser: vi.fn(),
  reads: vi.fn(),
  channels: [] as Array<{ on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }>,
}))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: state.user }) }))
vi.mock('@/hooks/useSubscription', () => ({
  useTenantSubscription: () => ({ data: { subscription_status: 'trial' }, isSuccess: state.subscriptionReady }),
}))
vi.mock('@/lib/userAccess', () => ({ isTenantOwner: () => true, isManager: () => false, isStaff: () => false }))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: state.getUser },
    channel: () => {
      const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
      state.channels.push(channel)
      return channel
    },
    removeChannel: vi.fn(async () => ({ error: null })),
    from: (table: string) => ({
      insert: state.insert,
      select: () => {
        state.reads(table)
        const response = table === 'announcements'
          ? { data: [{ id: 'promo', kind: 'promo_popup', placement: 'popup_center', audience: 'trial_only' }], error: null }
          : { data: [], error: state.readError }
        const query = Object.assign(Promise.resolve(response), {
          eq: () => query, or: () => query, order: () => query,
        })
        return query
      },
    }),
  },
}))

let sequence = 0
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  localStorage.clear()
  state.user = { id: `hook-user-${sequence++}`, tenant_id: 'tenant' }
  state.subscriptionReady = true
  state.readError = null
  state.insert.mockReset().mockResolvedValue({ error: null })
  state.getUser.mockReset().mockImplementation(async () => ({ data: { user: { id: state.user.id } }, error: null }))
  state.reads.mockClear()
  state.channels = []
})
afterEach(cleanup)

describe('announcement server/local acknowledgement', () => {
  it('does not read until subscription eligibility is known', async () => {
    state.subscriptionReady = false
    const view = renderHook(() => useActiveAnnouncements(), { wrapper: wrapper() })
    expect(state.reads).not.toHaveBeenCalled()
    expect(view.result.current.isSuccess).toBe(false)
    state.subscriptionReady = true
    view.rerender()
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(view.result.current.data).toHaveLength(1)
  })

  it('fails closed if dismissal history cannot be read', async () => {
    state.readError = { message: 'offline' }
    const { result } = renderHook(() => useActiveAnnouncements(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isSuccess).toBe(false)
  })

  it('persists synchronously, avoids duplicate clicks and retains pending state after API failure', async () => {
    state.insert.mockResolvedValue({ error: { code: 'NETWORK', message: 'offline' } })
    const { result } = renderHook(() => useDismissAnnouncement(), { wrapper: wrapper() })
    const scope = announcementScope(state.user.id, state.user.tenant_id)
    act(() => {
      result.current.mutate('promo')
      result.current.mutate('promo')
      expect(isAnnouncementDismissed(scope, 'promo')).toBe(true)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(state.insert).toHaveBeenCalledTimes(1)
    expect(pendingDismissals(scope)).toEqual(['promo'])
    const active = renderHook(() => useActiveAnnouncements(), { wrapper: wrapper() })
    await waitFor(() => expect(active.result.current.isSuccess).toBe(true))
    expect(active.result.current.data).toEqual([])
    state.insert.mockResolvedValue({ error: null })
    // NativeAppBridge reports Android network recovery through this manager,
    // without relying on browser online events in the WebView.
    act(() => { onlineManager.setOnline(false); onlineManager.setOnline(true) })
    await waitFor(() => expect(pendingDismissals(scope)).toEqual([]))
  })

  it('treats duplicate primary-key inserts as already acknowledged', async () => {
    state.insert.mockResolvedValue({ error: { code: '23505', message: 'localized message' } })
    const { result } = renderHook(() => useDismissAnnouncement(), { wrapper: wrapper() })
    act(() => result.current.mutate('promo'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(pendingDismissals(announcementScope(state.user.id, state.user.tenant_id))).toEqual([])
  })

  it('does not send a queued acknowledgement using another account identity', async () => {
    const scope = announcementScope(state.user.id, state.user.tenant_id)
    rememberDismissal(scope, 'promo')
    state.getUser.mockResolvedValue({ data: { user: { id: 'another-user' } }, error: null })
    renderHook(() => useActiveAnnouncements(), { wrapper: wrapper() })
    await waitFor(() => expect(state.getUser).toHaveBeenCalled())
    expect(state.insert).not.toHaveBeenCalled()
    expect(pendingDismissals(scope)).toEqual(['promo'])
  })

  it('flushes pending state only once when multiple slots mount', async () => {
    const scope = announcementScope(state.user.id, state.user.tenant_id)
    rememberDismissal(scope, 'promo')
    renderHook(() => {
      useActiveAnnouncements()
      useActiveAnnouncements('popup_center')
      return useActiveAnnouncements('top_banner')
    }, { wrapper: wrapper() })
    await waitFor(() => expect(pendingDismissals(scope)).toEqual([]))
    expect(state.insert).toHaveBeenCalledTimes(1)
  })

  it('shares one realtime channel across multiple consumers', async () => {
    const client = wrapper()
    const view = renderHook(() => {
      useActiveAnnouncements()
      useActiveAnnouncements('popup_center')
      return useActiveAnnouncements('top_banner')
    }, { wrapper: client })
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true))
    expect(state.channels).toHaveLength(1)
    expect(state.channels[0].on).toHaveBeenCalledTimes(1)
    view.unmount()
    await waitFor(() => expect(state.channels).toHaveLength(1))
  })
})
