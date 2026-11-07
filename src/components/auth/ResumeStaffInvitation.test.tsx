import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emailActor, emailSession, emailOtherSession, emailTenant, emailHotel, emailInvitation, emailToken } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111' },
  session: null as { access_token: string; user: { id: string } } | null, accepted: false,
  signOut: vi.fn(), navigate: vi.fn(), profile: vi.fn(), client: { status: vi.fn(), accept: vi.fn() } }))
const config = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: { cluster: { id: 'cluster-a' }, workspace: { id: 'workspace-a', tenantId: '66666666-6666-4666-8666-666666666666', routingVersion: 1 } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: config }))
vi.mock('@/lib/staff-invitation-client', async original => ({ ...await original<typeof import('@/lib/staff-invitation-client')>(),
  createRuntimeStaffInvitationClient: () => state.client }))
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => state.navigate }))
import { ResumeStaffInvitation } from './ResumeStaffInvitation'
import { staffInvitationQueryKey } from '@/lib/staff-invitation-client'

const invitation = { id: emailInvitation, name: 'Owned staff', tenantId: emailTenant, hotelId: emailHotel,
  passwordReady: true, revoked: false, expired: false }
const receipt = { invitationId: emailInvitation, tenantId: emailTenant, hotelId: emailHotel,
  acceptedAt: '2026-10-22T01:01:00Z', idempotent: true }
const profile = { id: emailActor, tenant_id: emailTenant, hotel_id: emailHotel }
const userKey = () => ['user', emailActor, config.workspace.workspace.id]
const gate = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r }); return { promise, release } }
beforeEach(() => {
  vi.clearAllMocks(); state.accepted = false; state.session = { access_token: emailToken(), user: state.user }
  config.workspace.workspace.id = 'workspace-a'; config.workspace.cluster.id = 'cluster-a'
  state.client.status.mockImplementation(async () => state.accepted ? { status: 'accepted', receipt } : { status: 'pending', expired: false })
  state.client.accept.mockImplementation(async () => { state.accepted = true; return receipt })
  state.profile.mockResolvedValue(profile); state.signOut.mockResolvedValue(undefined)
})
afterEach(cleanup)
function setup(selected = invitation) {
  // The real parent observes the invitation query. Keep that cache alive in
  // this isolated component fixture without silently deleting the assertion data.
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  cache.setQueryData(userKey(), null); cache.setQueryData(staffInvitationQueryKey(emailActor, emailSession), invitation)
  function Page({ selected }: { selected: typeof invitation }) {
    useQuery({ queryKey: userKey(), queryFn: state.profile, staleTime: Infinity })
    return <ResumeStaffInvitation invitation={selected} />
  }
  const node = (next: typeof invitation) => <QueryClientProvider client={cache}><MemoryRouter><Page selected={next} /></MemoryRouter></QueryClientProvider>
  const view = render(node(selected))
  return { ...view, cache, replace: (next = selected) => view.rerender(node(next)) }
}
const click = () => fireEvent.click(screen.getByRole('button', { name: 'Nhận lời mời' }))

it('reads first, accepts exact target/session, refreshes profile and only then clears invitation/navigates', async () => {
  const block = gate(); state.profile.mockImplementation(async () => { await block.promise; return profile })
  const f = setup(); click(); await waitFor(() => expect(state.profile).toHaveBeenCalledTimes(1))
  expect(state.client.status).toHaveBeenCalledWith(emailActor, invitation, expect.objectContaining({ sessionId: emailSession }))
  expect(state.client.accept).toHaveBeenCalledTimes(1); expect(state.navigate).not.toHaveBeenCalled()
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailSession))).toEqual(invitation)
  await act(async () => block.release())
  await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/auth/callback', { replace: true }))
  expect(f.cache.getQueryData(userKey())).toEqual(profile)
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailSession))).toBeNull()
})
it('reconciles already accepted invitations on remount without another acceptance', async () => {
  state.accepted = true; setup(); click()
  await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1)); expect(state.client.accept).not.toHaveBeenCalled()
})
it('single-flights two clicks in the same render', async () => {
  const block = gate(); state.client.status.mockImplementationOnce(async () => { await block.promise; return { status: 'pending', expired: false } })
  setup(); const button = screen.getByRole('button', { name: 'Nhận lời mời' }); fireEvent.click(button); fireEvent.click(button)
  expect(state.client.status).toHaveBeenCalledTimes(1)
  await act(async () => block.release()); await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1))
  expect(state.client.accept).toHaveBeenCalledTimes(1)
})
it('checks a lost committed acceptance before retrying and never asks for a password', async () => {
  state.client.accept.mockImplementationOnce(async () => { state.accepted = true; throw new Error('Owned response loss') })
  setup(); click(); await screen.findByRole('alert')
  expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument(); expect(state.navigate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết quả / tiếp tục' }))
  await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1))
  expect(state.client.status).toHaveBeenCalledTimes(2); expect(state.client.accept).toHaveBeenCalledTimes(1)
})
it('does not mutate when status cannot be read and keeps private details out of the UI', async () => {
  state.client.status.mockRejectedValueOnce(new Error('private SQL detail'))
  setup(); click(); await screen.findByRole('alert')
  expect(screen.getByRole('alert')).not.toHaveTextContent('private SQL'); expect(state.client.accept).not.toHaveBeenCalled()
})
it.each(['revoked', 'expired'])('refuses a server-side %s invitation without acceptance', async condition => {
  state.client.status.mockResolvedValueOnce({ status: condition === 'revoked' ? 'revoked' : 'pending', expired: condition === 'expired' })
  setup(); click(); await screen.findByRole('alert'); expect(state.client.accept).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled()
})
it.each(['session', 'workspace', 'invitation', 'unmount'])('aborts and ignores an old %s response', async condition => {
  const block = gate(); state.client.status.mockImplementationOnce(async () => { await block.promise; return { status: 'pending', expired: false } })
  const f = setup(); click()
  const options = state.client.status.mock.calls[0][2]
  if (condition === 'session') state.session = { access_token: emailToken(emailActor, emailOtherSession), user: state.user }
  if (condition === 'workspace') config.workspace.workspace.id = 'workspace-b'
  if (condition === 'unmount') f.unmount()
  else f.replace(condition === 'invitation' ? { ...invitation, id: emailHotel } : invitation)
  await act(async () => block.release())
  expect(options.signal.aborted).toBe(true); expect(state.client.accept).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled()
})
it.each(['missing', 'wrong-tenant', 'error'])('does not route or clear invitation before a confirmed profile (%s)', async condition => {
  if (condition === 'error') state.profile.mockRejectedValueOnce(new Error('Owned profile unavailable'))
  else state.profile.mockResolvedValueOnce(condition === 'missing' ? null : { ...profile, tenant_id: emailHotel })
  const f = setup(); click(); await screen.findByRole('alert')
  expect(state.navigate).not.toHaveBeenCalled()
  expect(f.cache.getQueryData(staffInvitationQueryKey(emailActor, emailSession))).toEqual(invitation)
})
it.each(['revoked', 'expired'])('offers no accept/password link for an unavailable %s invitation', condition => {
  setup({ ...invitation, revoked: condition === 'revoked', expired: condition === 'expired' })
  expect(screen.queryByRole('button', { name: 'Nhận lời mời' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument(); expect(state.client.status).not.toHaveBeenCalled()
})
