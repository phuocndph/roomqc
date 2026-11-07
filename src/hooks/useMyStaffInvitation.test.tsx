import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emailActor, emailSession, emailOtherSession, emailTenant, emailHotel, emailInvitation, emailToken } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ user: null as { id: string } | null,
  session: null as { access_token: string; user: { id: string } } | null, get: vi.fn(), request: vi.fn() }))
const config = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: { cluster: { id: 'cluster-a' }, workspace: { id: 'workspace-a', tenantId: '66666666-6666-4666-8666-666666666666', routingVersion: 1 } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: config }))
import { useMyStaffInvitation } from './useMyStaffInvitation'
import { staffInvitationQueryKey } from '@/lib/staff-invitation-client'

function reply(options: RequestInit) {
  const token = (options.headers as Record<string, string>).Authorization.split(' ')[1]
  const claims = JSON.parse(atob(token.split('.')[1]))
  return new Response(JSON.stringify({ version: 1, actor_id: claims.sub, session_id: claims.session_id,
    invitation_id: emailInvitation, tenant_id: emailTenant, hotel_id: emailHotel,
    invitation: { id: emailInvitation, name: 'Owned staff', tenantId: emailTenant, hotelId: emailHotel,
      passwordReady: true, expired: false, revoked: false } }))
}
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: emailActor }; state.session = { access_token: emailToken(), user: state.user }
  config.workspace.workspace.id = 'workspace-a'; config.workspace.cluster.id = 'cluster-a'
  state.get.mockImplementation(async () => ({ data: { session: state.session }, error: null }))
  state.request.mockImplementation(async (_url: string, options: RequestInit) => reply(options)); vi.stubGlobal('fetch', state.request)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup(enabled = true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, ...renderHook(({ enabled }) => useMyStaffInvitation(enabled), { wrapper, initialProps: { enabled } }) }
}

it('queries the complete invitation with a scoped actor/native-session key', async () => {
  const f = setup(); await waitFor(() => expect(f.result.current.data?.id).toBe(emailInvitation))
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailSession))).toMatchObject({ tenantId: emailTenant, hotelId: emailHotel })
  expect(state.request).toHaveBeenCalledTimes(1)
})
it('hides retained invitation data when profile loading disables the query', async () => {
  const f = setup(); await waitFor(() => expect(f.result.current.data).toBeTruthy())
  f.rerender({ enabled: false })
  expect(f.result.current.data).toBeNull(); expect(f.result.current.isLoading).toBe(false); expect(f.result.current.isError).toBe(false)
})
it('does not make requests before enable or without an Auth user', async () => {
  const f = setup(false); expect(state.request).not.toHaveBeenCalled()
  state.user = null; state.session = null; f.rerender({ enabled: true })
  expect(f.result.current.data).toBeUndefined(); expect(state.request).not.toHaveBeenCalled()
})
it('uses a new cache entry for another session of the same user', async () => {
  const f = setup(); await waitFor(() => expect(f.result.current.data).toBeTruthy())
  state.session = { access_token: emailToken(emailActor, emailOtherSession), user: { id: emailActor } }; f.rerender({ enabled: true })
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(f.result.current.data).toBeTruthy())
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailOtherSession))).toBeTruthy()
})
it('does not reuse another workspace cache even when actor, tenant and invitation match', async () => {
  const f = setup(); await waitFor(() => expect(f.result.current.data).toBeTruthy())
  const previous = staffInvitationQueryKey(emailActor, emailSession)
  config.workspace.workspace.id = 'workspace-b'; f.rerender({ enabled: true })
  await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2)); await waitFor(() => expect(f.result.current.data).toBeTruthy())
  expect(previous).not.toEqual(staffInvitationQueryKey(emailActor, emailSession))
})
it('aborts an old session query and cannot publish its late response into the new session', async () => {
  let release!: () => void
  state.request.mockImplementationOnce(async (_url: string, options: RequestInit) => {
    await new Promise<void>(r => { release = r }); return reply(options)
  })
  const f = setup(); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1))
  const oldSignal = state.request.mock.calls[0][1].signal as AbortSignal
  state.session = { access_token: emailToken(emailActor, emailOtherSession), user: { id: emailActor } }; f.rerender({ enabled: true })
  await waitFor(() => expect(f.result.current.data).toBeTruthy()); expect(oldSignal.aborted).toBe(true)
  await act(async () => release())
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailSession))).toBeUndefined()
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailOtherSession))).toBeTruthy()
})
