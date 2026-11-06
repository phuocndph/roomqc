import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emailAuthFixture, emailActor, emailSession, emailOtherSession, emailTenant, emailToken } from '@/test/email-auth-fixture'
const session = vi.hoisted(() => ({ get: vi.fn() }))
const config = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: { cluster: { id: 'cluster-a' }, workspace: { id: 'workspace-a', tenantId: '66666666-6666-4666-8666-666666666666', routingVersion: 1 } } }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: session.get } } }))
vi.mock('./runtime-config', () => ({ runtimeConfig: config }))
import { createRuntimeStaffInvitationClient, staffInvitationQueryKey, staffInvitationRuntimeScope } from './staff-invitation-client'
let fixture: ReturnType<typeof emailAuthFixture>
beforeEach(() => {
  vi.clearAllMocks(); config.supabaseUrl = 'https://owned.roomqc.invalid'; config.supabasePublishableKey = 'public-fixture'
  config.workspace.cluster.id = 'cluster-a'; config.workspace.workspace = { id: 'workspace-a', tenantId: emailTenant, routingVersion: 1 }
  fixture = emailAuthFixture(); fixture.state.session = { access_token: emailToken(), user: { ...fixture.state.user } }
  session.get.mockImplementation(fixture.deps.getSession); vi.stubGlobal('fetch', fixture.deps.fetch)
})
afterEach(() => vi.unstubAllGlobals())

it('uses the captured real runtime adapter and a complete authenticated mine response', async () => {
  await expect(createRuntimeStaffInvitationClient().mine(emailActor, { sessionId: emailSession })).resolves.toMatchObject({ tenantId: emailTenant })
  expect(fixture.state.calls[0].body).toEqual({ action: 'mine', tenantId: emailTenant })
})
it.each(['endpoint', 'cluster', 'workspace', 'tenant', 'revision', 'key'])('fences runtime %s changes before an old client dispatches', async field => {
  const client = createRuntimeStaffInvitationClient()
  if (field === 'endpoint') config.supabaseUrl = 'https://not-used.invalid'
  if (field === 'cluster') config.workspace.cluster.id = 'cluster-b'
  if (field === 'workspace') config.workspace.workspace.id = 'workspace-b'
  if (field === 'tenant') config.workspace.workspace.tenantId = emailActor
  if (field === 'revision') config.workspace.workspace.routingVersion++
  if (field === 'key') config.supabasePublishableKey = 'not-used'
  await expect(client.mine(emailActor)).rejects.toMatchObject({ code: 'identity_changed' })
  expect(session.get).not.toHaveBeenCalled(); expect(fixture.state.calls).toHaveLength(0)
})
it('query identity contains public scope and native session, never credentials', () => {
  const key = staffInvitationQueryKey(emailActor, emailSession)
  expect(key).not.toEqual(staffInvitationQueryKey(emailActor, emailOtherSession))
  expect(key[3]).toBe(staffInvitationRuntimeScope())
  expect(JSON.stringify(key)).not.toContain(emailToken()); expect(JSON.stringify(key)).not.toContain(config.supabasePublishableKey)
})
