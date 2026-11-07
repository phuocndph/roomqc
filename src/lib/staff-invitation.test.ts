import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaffInvitationClient, parseInvitationAcceptance, staffInvitationSession } from './staff-invitation'
import { emailAuthFixture, emailActor, emailOther, emailSession, emailOtherSession, emailTenant, emailHotel, emailInvitation, emailToken } from '@/test/email-auth-fixture'

const target = { id: emailInvitation, tenantId: emailTenant, hotelId: emailHotel }
const expected = { actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, hotelId: emailHotel, invitationId: emailInvitation }
const receipt = () => ({ version: 1, actor_id: emailActor, session_id: emailSession, tenant_id: emailTenant,
  hotel_id: emailHotel, invitation_id: emailInvitation, success: true, status: 'accepted', idempotent: false, accepted_at: '2026-10-22T01:01:00Z' })
const gate = () => { let release!: () => void; const promise = new Promise<void>(r => { release = r }); return { promise, release } }
function fixture() {
  const f = emailAuthFixture()
  f.state.session = { access_token: emailToken(), user: { ...f.state.user } }
  return { ...f, client: createStaffInvitationClient(f.deps) }
}
afterEach(() => vi.useRealTimers())

describe('captured invitation target and versioned receipts', () => {
  it('requires full receipt and returns only normalized fields', () => {
    expect(parseInvitationAcceptance(receipt(), expected)).toEqual({ invitationId: emailInvitation, tenantId: emailTenant,
      hotelId: emailHotel, acceptedAt: '2026-10-22T01:01:00Z', idempotent: false })
  })
  it.each([['version', 2], ['actor_id', emailOther], ['session_id', emailOtherSession], ['tenant_id', emailOther],
    ['hotel_id', emailOther], ['invitation_id', emailOther], ['success', false], ['status', 'pending'],
    ['idempotent', undefined], ['accepted_at', 'invalid']] as const)('rejects mismatched or incomplete %s', (field, value) => {
    expect(() => parseInvitationAcceptance({ ...receipt(), [field]: value }, expected)).toThrow('Chưa xác nhận')
  })
  it('never treats a success boolean or array as acceptance', () => {
    for (const value of [null, [], { success: true }, { success: true, tenant_id: emailTenant }]) {
      expect(() => parseInvitationAcceptance(value, expected)).toThrow('Chưa xác nhận')
    }
  })
  it('rejects local actor/session mismatches before dispatch', async () => {
    const f = fixture()
    expect(() => staffInvitationSession({ access_token: emailToken(emailOther), user: { id: emailActor } })).toThrow('Phiên')
    await expect(f.client.mine(emailOther)).rejects.toMatchObject({ code: 'identity_changed' })
    await expect(f.client.mine(emailActor, { sessionId: emailOtherSession })).rejects.toMatchObject({ code: 'identity_changed' })
    await expect(f.client.accept(emailActor, { ...target, tenantId: emailOther })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.calls).toHaveLength(0)
  })
  it('reads a complete pending invitation and validates all status variants', async () => {
    const f = fixture()
    await expect(f.client.mine(emailActor)).resolves.toMatchObject(target)
    await expect(f.client.status(emailActor, target)).resolves.toEqual({ status: 'pending', expired: false })
    f.state.invitationRevoked = true
    await expect(f.client.status(emailActor, target)).resolves.toEqual({ status: 'revoked', expired: false })
    f.state.invitationRevoked = false; f.state.accepted = true
    await expect(f.client.status(emailActor, target)).resolves.toMatchObject({ status: 'accepted', receipt: { invitationId: emailInvitation } })
    expect(f.state.puts).toBe(0); expect(f.state.accepts).toBe(0)
  })
  it('captures endpoint/key/tenant and uses the initiating bearer even after same-session refresh', async () => {
    const f = fixture()
    f.deps.endpoint = 'https://not-used.invalid'; f.deps.publishableKey = 'not-used'; f.deps.tenantId = emailOther
    f.state.onAccept = () => { f.state.session!.access_token = emailToken(emailActor, emailSession, { refreshed: true }) }
    await expect(f.client.accept(emailActor, target)).resolves.toMatchObject({ invitationId: emailInvitation })
    expect(f.state.calls[0]).toMatchObject({ url: 'https://owned.roomqc.invalid/functions/v1/staff-invitations',
      body: { action: 'accept', invitationId: emailInvitation, tenantId: emailTenant },
      options: { cache: 'no-store', credentials: 'omit', redirect: 'error', headers: { apikey: 'public-fixture', Authorization: 'Bearer ' + emailToken() } } })
  })
  it('fences another same-user session during the response', async () => {
    const f = fixture(); f.state.onAccept = () => { f.state.session!.access_token = emailToken(emailActor, emailOtherSession) }
    await expect(f.client.accept(emailActor, target)).rejects.toMatchObject({ code: 'identity_changed' })
  })
  it('single-flights acceptance while leaving read-only status available', async () => {
    const f = fixture(), block = gate(), entered = gate()
    f.state.onAccept = () => { entered.release(); return block.promise }
    const first = f.client.accept(emailActor, target); await entered.promise
    await expect(f.client.accept(emailActor, target)).rejects.toMatchObject({ code: 'flow_busy' })
    await expect(f.client.status(emailActor, target)).resolves.toMatchObject({ status: 'pending' })
    block.release(); await first; expect(f.state.accepts).toBe(1)
  })
  it('rejects externally aborted or replaced context without publishing a late result', async () => {
    const f = fixture(), block = gate(), entered = gate(), controller = new AbortController()
    f.state.onAccept = () => { entered.release(); return block.promise }
    const request = f.client.accept(emailActor, target, { signal: controller.signal }); await entered.promise
    controller.abort(); const rejected = expect(request).rejects.toMatchObject({ code: 'identity_changed' }); block.release(); await rejected
    await expect(f.client.mine(emailActor, { isCurrent: () => false })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.calls[0].options.signal?.aborted).toBe(true)
  })
  it('does not accept a late response after its own timeout even if a transport ignores abort', async () => {
    vi.useFakeTimers(); const f = fixture(), block = gate(), entered = gate()
    f.state.onAccept = () => { entered.release(); return block.promise }
    const request = f.client.accept(emailActor, target); await entered.promise
    await vi.advanceTimersByTimeAsync(20000)
    const rejected = expect(request).rejects.toMatchObject({ code: 'invitation_unconfirmed' }); block.release(); await rejected
  })
  it.each([new Response('private transport detail', { status: 503 }), new Response('[]'),
    new Response('{broken'), new Response(JSON.stringify({ value: 'x'.repeat(16384) }))])('bounds/parses replies and hides private errors', async reply => {
    const f = fixture(), client = createStaffInvitationClient({ ...f.deps, fetch: vi.fn(async () => reply) })
    await expect(client.accept(emailActor, target)).rejects.toMatchObject({ code: 'invitation_unconfirmed' })
  })
  it('captures invitation fields before the first async boundary', async () => {
    const f = fixture(), selected = { ...target }, block = gate(), original = f.deps.getSession
    const client = createStaffInvitationClient({ ...f.deps, getSession: async () => { await block.promise; return original() } })
    const request = client.accept(emailActor, selected); selected.id = emailOther; selected.hotelId = emailOther
    block.release(); await expect(request).resolves.toMatchObject({ invitationId: emailInvitation, hotelId: emailHotel })
  })
})
