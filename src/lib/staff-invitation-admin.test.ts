import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInvitationAdminClient, type InvitationAdminRow } from './staff-invitation-admin'
import { emailActor as actor, emailSession as session, emailOtherSession as other,
  emailTenant as tenant, emailHotel as hotel, emailInvitation as id, emailToken } from '@/test/email-auth-fixture'
const at = '2026-10-22T01:02:03.123456+00:00', context = { actorId: actor, sessionId: session, tenantId: tenant }
const target: InvitationAdminRow = { id, hotel_id: hotel, email: 'owned@roomqc.invalid', full_name: 'Owned Staff',
  user_level_code: 'staff', expires_at: at, sent_at: at, created_at: at }
const draft = { email: ' OWNED@roomqc.invalid ', fullName: ' Owned Staff ', userLevelCode: 'staff',
  hotelId: hotel, positionId: '77777777-7777-4777-8777-777777777777' }
const envelope = () => ({ version: 1, actor_id: actor, session_id: session, tenant_id: tenant })
const list = () => ({ ...envelope(), hotel_id: hotel, invitations: [{ ...target }] })
const send = () => ({ ...envelope(), success: true, status: 'invited', invitation_id: id, hotel_id: hotel,
  invitation: { id, email: target.email, full_name: target.full_name } })
const revoke = () => ({ ...envelope(), success: true, status: 'revoked', invitation_id: id, hotel_id: hotel, idempotent: false })
function setup() {
  const state = { nativeSession: session, current: true, runtime: true, response: list() as unknown, status: 200 }
  const get = vi.fn(async () => ({ data: { session: { access_token: emailToken(actor, state.nativeSession), user: { id: actor } } }, error: null }))
  const request = vi.fn(async (_url: string | URL | Request, _options?: RequestInit) => new Response(JSON.stringify(state.response), { status: state.status }))
  const client = createInvitationAdminClient({ endpoint: 'https://owned.roomqc.invalid/', publishableKey: 'public-fixture',
    path: '/auth/accept-invite', getSession: get, fetch: request, isRuntimeCurrent: () => state.runtime })
  return { state, get, request, client, options: { isCurrent: () => state.current } }
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())
describe('invitation management captured HTTP client', () => {
  it('requires a strict page receipt and echoes the captured cursor', async () => {
    const f = setup()
    f.state.response = { ...list(), page_size: 50, page_cursor: null, next_cursor: null }
    await expect(f.client.listPage(context, hotel)).resolves.toEqual({ rows: [target], nextCursor: null })
    expect(JSON.parse(f.request.mock.calls[0][1]!.body as string)).toMatchObject({ pageSize: 50, cursor: null })
  })
  it.each([
    { page_size: 100 }, { page_cursor: { createdAt: at, id } }, { next_cursor: undefined },
    { next_cursor: { createdAt: at, id } }, { invitations: Array.from({ length: 51 }, () => target) },
    { invitations: [target, target] }, { page_cursor: undefined },
  ])('rejects missing, stale or oversized page metadata %s', async delta => {
    const f = setup(); f.state.response = { ...list(), page_size: 50, page_cursor: null, next_cursor: null, ...delta }
    await expect(f.client.listPage(context, hotel)).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it('walks stable ties and preserves microseconds across page boundaries', async () => {
    const f = setup()
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...target,
      id: '99999999-9999-4999-8999-' + (100 - i).toString(16).padStart(12, '0') }))
    const last = { createdAt: rows[49].created_at, id: rows[49].id }
    f.state.response = { ...list(), invitations: rows, page_size: 50, page_cursor: null, next_cursor: last }
    await expect(f.client.listPage(context, hotel)).resolves.toEqual({ rows, nextCursor: last })
    const older = { ...target, created_at: '2026-10-22T01:02:03.123455+00:00' }
    f.state.response = { ...list(), invitations: [older], page_size: 50, page_cursor: last, next_cursor: null }
    await expect(f.client.listPage(context, hotel, last)).resolves.toEqual({ rows: [older], nextCursor: null })
  })
  it.each(['same', 'newer', 'order'])('rejects a repeated or out-of-order keyset page (%s)', async mode => {
    const f = setup(), after = { createdAt: at, id }
    const rows = mode === 'same' ? [target] : mode === 'newer'
      ? [{ ...target, created_at: '2026-10-22T01:02:03.123457+00:00' }]
      : [{ ...target, created_at: '2026-10-21T00:00:00Z' }, { ...target, id: other, created_at: at }]
    f.state.response = { ...list(), invitations: rows, page_size: 50, page_cursor: after, next_cursor: null }
    await expect(f.client.listPage(context, hotel, after)).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it('rejects malformed input cursor before dispatch without retaining a partial page', async () => {
    const f = setup()
    await expect(f.client.listPage(context, hotel, { createdAt: 'tomorrow', id })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('lists only the exact actor/session/tenant/hotel receipt and sends no cookies or redirects', async () => {
    const f = setup()
    await expect(f.client.list(context, hotel, f.options)).resolves.toEqual([target])
    expect(f.request).toHaveBeenCalledWith('https://owned.roomqc.invalid/functions/v1/staff-invitations', expect.objectContaining({
      cache: 'no-store', redirect: 'error', credentials: 'omit', body: JSON.stringify({ hotelId: hotel, action: 'list', tenantId: tenant }),
    }))
    expect(f.get).toHaveBeenCalledTimes(2)
  })
  it('requires explicit all-hotel acknowledgement from the server', async () => {
    const f = setup(); f.state.response = { ...list(), hotel_id: null }
    await expect(f.client.list(context, null)).resolves.toHaveLength(1)
  })
  it.each([
    { version: 2 }, { actor_id: other }, { session_id: other }, { tenant_id: other }, { hotel_id: other },
    { invitations: null }, { invitations: Array.from({ length: 101 }, () => target) }, { invitations: [target, target] },
    { invitations: [{ ...target, hotel_id: other }] }, { invitations: [{ ...target, user_level_code: 'tenant_owner' }] },
    { invitations: [{ ...target, expires_at: 'tomorrow' }] }, { invitations: [{ ...target, sent_at: undefined }] },
    { invitations: [{ ...target, created_at: null }] }, { invitations: [{ ...target, full_name: '' }] },
  ])('rejects malformed/mismatched list without a partial result %s', async delta => {
    const f = setup(); f.state.response = { ...list(), ...delta }
    await expect(f.client.list(context, hotel)).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it('uses the actual create-user alias with normalized draft and verifies exact target', async () => {
    const f = setup(); f.state.response = send()
    await expect(f.client.create(context, draft)).resolves.toEqual({ id, tenantId: tenant, hotelId: hotel, email: target.email, fullName: target.full_name })
    expect(f.request.mock.calls[0][0]).toBe('https://owned.roomqc.invalid/functions/v1/create-user')
    expect(JSON.parse(f.request.mock.calls[0][1]!.body as string)).toMatchObject({ action: 'create', tenantId: tenant,
      email: target.email, fullName: target.full_name, hotelId: hotel, path: '/auth/accept-invite' })
  })
  it.each([{ hotelId: null }, { positionId: null }, { userLevelCode: 'tenant_owner' }, { email: 'bad' }, { reportsTo: 'bad' }])('rejects invalid draft before dispatch %s', async delta => {
    const f = setup(); await expect(f.client.create(context, { ...draft, ...delta })).rejects.toMatchObject({ code: 'invalid_request' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it.each([{ success: false }, { status: 'pending' }, { invitation_id: other }, { hotel_id: other },
    { invitation: { id, email: 'other@roomqc.invalid', full_name: target.full_name } },
    { invitation: { id, email: target.email, full_name: 'Different person' } }])('does not accept a generic or wrong send receipt %s', async delta => {
    const f = setup(); f.state.response = { ...send(), ...delta }
    await expect(f.client.act(context, target, 'resend')).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.request).toHaveBeenCalledTimes(1)
  })
  it('revokes with the exact row and idempotent receipt', async () => {
    const f = setup(); f.state.response = revoke()
    await expect(f.client.act(context, target, 'revoke')).resolves.toEqual({ id, status: 'revoked', idempotent: false })
  })
  it.each([{ idempotent: undefined }, { invitation_id: other }, { hotel_id: other }, { status: 'accepted' }])('rejects incomplete revoke receipt %s', async delta => {
    const f = setup(); f.state.response = { ...revoke(), ...delta }
    await expect(f.client.act(context, target, 'revoke')).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it.each([[401, 'permission_denied'], [403, 'permission_denied'], [429, 'cooldown'], [409, 'conflict'],
    [400, 'invalid_request'], [503, 'outcome_unknown']])('maps status %s without echoing private errors or retrying', async (status, code) => {
    const f = setup(); f.state.status = Number(status); f.state.response = { error: 'private database/provider token' }
    const error = await f.client.act(context, target, 'resend').catch(x => x)
    expect(error.code).toBe(code); expect(error.message).not.toContain('private')
    expect(f.request).toHaveBeenCalledTimes(1)
  })
  it('does not dispatch with another native session for the same actor', async () => {
    const f = setup(); f.state.nativeSession = other
    await expect(f.client.list(context, hotel)).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('rejects a session change after headers/body before returning success', async () => {
    const f = setup(); f.state.response = send()
    f.get.mockImplementationOnce(async () => ({ data: { session: { access_token: emailToken(), user: { id: actor } } }, error: null }))
    f.state.nativeSession = other
    await expect(f.client.create(context, draft)).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.request).toHaveBeenCalledTimes(1)
  })
  it('allows refreshed tokens from the same native session', async () => {
    const f = setup(); await expect(f.client.list(context, hotel)).resolves.toHaveLength(1)
  })
  it('fails closed on runtime or captured selection change', async () => {
    const f = setup(); f.state.runtime = false
    await expect(f.client.list(context, hotel)).rejects.toMatchObject({ code: 'identity_changed' })
    f.state.runtime = true; f.state.current = false
    await expect(f.client.list(context, hotel, f.options)).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('enforces single-flight before Auth or request dispatch', async () => {
    const f = setup(); let release!: (x: Response) => void
    f.request.mockImplementationOnce(() => new Promise(r => { release = r }))
    const first = f.client.create(context, draft); await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1))
    await expect(f.client.act(context, target, 'revoke')).rejects.toMatchObject({ code: 'flow_busy' })
    release(new Response(JSON.stringify(send()))); await first
    expect(f.request).toHaveBeenCalledTimes(1)
  })
  it('aborts promptly even if transport ignores its signal; never resends on unknown outcome', async () => {
    const f = setup(), controller = new AbortController()
    f.request.mockImplementationOnce(() => new Promise(() => {}))
    const first = f.client.create(context, draft, { signal: controller.signal })
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledTimes(1)); controller.abort()
    await expect(first).rejects.toMatchObject({ code: 'identity_changed' })
    expect((f.request.mock.calls[0][1]!.signal as AbortSignal).aborted).toBe(true)
    expect(f.request).toHaveBeenCalledTimes(1)
  })
  it('bounds the internal deadline even when caller supplies no timeout', async () => {
    vi.useFakeTimers()
    const f = setup(); f.request.mockImplementationOnce(() => new Promise(() => {}))
    const outcome = f.client.create(context, draft).catch(x => x)
    await vi.advanceTimersByTimeAsync(20001)
    expect((await outcome).code).toBe('outcome_unknown'); expect(f.request).toHaveBeenCalledTimes(1)
  })
  it.each(['{', 'x'.repeat(131073)])('rejects invalid or oversized responses', async body => {
    const f = setup(); f.request.mockImplementationOnce(async () => new Response(body))
    await expect(f.client.list(context, hotel)).rejects.toBeTruthy()
  })
})
