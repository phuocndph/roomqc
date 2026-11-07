import { describe, expect, it, vi } from 'vitest'
import { manageStaffInvitation, StaffInvitationDeliveryNotStarted } from '../../supabase/functions/_shared/email/staff-invitation-management'

const actor = '11111111-1111-4111-8111-111111111111', session = '22222222-2222-4222-8222-222222222222'
const tenant = '33333333-3333-4333-8333-333333333333', hotel = '44444444-4444-4444-8444-444444444444'
const id = '55555555-5555-4555-8555-555555555555', position = '66666666-6666-4666-8666-666666666666'
const recipient = '77777777-7777-4777-8777-777777777777', at = '2026-10-22T01:02:03.123456+00:00'
const context = { actorId: actor, sessionId: session }
const create = { tenantId: tenant, hotelId: hotel, positionId: position, email: 'staff@roomqc.invalid', fullName: 'Owned Staff', userLevelCode: 'staff' }
function fixture() {
  const invitation = { id, tenant_id: tenant, hotel_id: hotel, email: create.email, full_name: create.fullName,
    status: 'pending', auth_user_id: null as string | null, sent_at: null as string | null }
  const state = { error: null as { code: string; message: string } | null,
    change: (_action: string, data: Record<string, unknown>) => data }
  const rpc = vi.fn(async (action: string) => {
    const row = { ...invitation }
    if (['reserve', 'finish'].includes(action)) row.sent_at = at
    if (action === 'finish') row.auth_user_id = recipient
    if (action === 'revoke') row.status = 'revoked'
    return { data: state.change(action, { version: 1, actor_id: actor, session_id: session, tenant_id: tenant, success: true, invitation: row,
      previous_sent_at: null, invitations: [], idempotent: false }), error: state.error }
  })
  const send = vi.fn(async () => recipient)
  return { invitation, state, rpc, send, run: (action: unknown, body: Record<string, unknown> = { id }) => manageStaffInvitation(action, body, context, { rpc, send }) }
}
describe('staff invitation management: verified transactional boundaries and bounded delivery', () => {
  it('creates, reserves, sends and confirms before reporting success without exposing native identity', async () => {
    const f = fixture(), result = await f.run('create', { ...create, email: ' STAFF@roomqc.invalid ', fullName: ' Owned Staff ' })
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['create', 'reserve', 'finish'])
    expect(f.rpc).toHaveBeenNthCalledWith(1, 'create', { ...create, email: create.email, fullName: create.fullName, reportsTo: null })
    expect(f.rpc).toHaveBeenLastCalledWith('finish', { id, reservedAt: at, authUserId: recipient })
    expect(result).toMatchObject({ version: 1, actor_id: actor, session_id: session, tenant_id: tenant,
      hotel_id: hotel, invitation_id: id, success: true, status: 'invited', invitation: { id } })
    expect(JSON.stringify(result)).not.toContain(recipient)
    expect(f.send).toHaveBeenCalledTimes(1)
  })
  it('resends without creating another invitation', async () => {
    const f = fixture()
    await expect(f.run('resend')).resolves.toMatchObject({ status: 'invited' })
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['reserve', 'finish'])
  })
  it('revokes with the transactional receipt and never sends', async () => {
    const f = fixture()
    await expect(f.run('revoke')).resolves.toMatchObject({ invitation_id: id, tenant_id: tenant, hotel_id: hotel, status: 'revoked' })
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['revoke']); expect(f.send).not.toHaveBeenCalled()
  })
  it('lists only through the live-session RPC', async () => {
    const f = fixture()
    await expect(f.run('list', {})).resolves.toMatchObject({ invitations: [] })
    expect(f.rpc).toHaveBeenCalledWith('list', {}); expect(f.send).not.toHaveBeenCalled()
  })
  it('passes exact tenant and selected hotel expectations to the live list transaction', async () => {
    const f = fixture()
    await f.run('list', { tenantId: tenant, hotelId: hotel })
    expect(f.rpc).toHaveBeenCalledWith('list', { tenantId: tenant, hotelId: hotel })
  })
  it('passes a bounded keyset cursor to the live transaction without sending email', async () => {
    const f = fixture(), cursor = { createdAt: at, id }
    await f.run('list', { tenantId: tenant, hotelId: hotel, pageSize: 50, cursor })
    expect(f.rpc).toHaveBeenCalledWith('list', { tenantId: tenant, hotelId: hotel, pageSize: 50, cursor })
    expect(f.send).not.toHaveBeenCalled()
  })
  it.each([
    { pageSize: 100, cursor: null }, { pageSize: 50 }, { pageSize: 50, cursor: {} },
    { pageSize: 50, cursor: { createdAt: 'infinity', id } },
    { pageSize: 50, cursor: { createdAt: at, id: 'bad' } }, { cursor: null },
  ])('rejects malformed paging input before RPC %s', async delta => {
    const f = fixture()
    await expect(f.run('list', delta)).rejects.toMatchObject({ status: 400 })
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('rejects a receipt for another tenant before send', async () => {
    const f = fixture(); f.state.change = (_action, data) => ({ ...data, tenant_id: recipient })
    await expect(f.run('resend', { id, tenantId: tenant })).rejects.toMatchObject({ status: 503 })
    expect(f.send).not.toHaveBeenCalled()
  })
  it.each(['finish', 'reserve', 'release', 'accept', null, {}, 1])('does not expose internal operation %s', async action => {
    const f = fixture(); await expect(f.run(action)).rejects.toMatchObject({ status: 400 })
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled()
  })
  it.each([
    { tenantId: '' }, { hotelId: null }, { positionId: {} }, { reportsTo: 'other' }, { email: 'bad' },
    { email: 'a'.repeat(255) + '@roomqc.invalid' }, { fullName: 'a' }, { fullName: 'a'.repeat(151) }, { userLevelCode: 'tenant_owner' },
  ])('rejects malformed creation before dispatch %s', async delta => {
    const f = fixture(); await expect(f.run('create', { ...create, ...delta })).rejects.toMatchObject({ status: 400 })
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it.each(['', null, 'invalid', {}])('requires an exact management invitation ID %s', async value => {
    const f = fixture(); await expect(f.run('resend', { id: value })).rejects.toMatchObject({ status: 400 })
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it.each([
    ['42501', 'private authority failure', 403], ['P0001', 'INVITATION_SEND_COOLDOWN', 429],
    ['P0001', 'private conflict', 409], ['22P02', 'private parse error', 400], ['XX000', 'private database details', 503],
  ])('uses safe error mapping for %s', async (code, message, status) => {
    const f = fixture(); f.state.error = { code: String(code), message: String(message) }
    await expect(f.run('resend')).rejects.toMatchObject({ status })
    await f.run('resend').catch(error => expect(error.message).not.toContain('private'))
    expect(f.send).not.toHaveBeenCalled()
  })
  it.each([
    { version: 2 }, { actor_id: recipient }, { session_id: recipient }, { success: false },
    { invitation: { id: recipient } },
  ])('rejects incomplete or mismatched receipts %s', async delta => {
    const f = fixture(); f.state.change = (_action, data) => ({ ...data, ...delta })
    await expect(f.run('resend')).rejects.toMatchObject({ status: 503 }); expect(f.send).not.toHaveBeenCalled()
  })
  it('does not follow a switched target after create', async () => {
    const f = fixture(); f.state.change = (action, data) => action === 'reserve'
      ? { ...data, invitation: { ...f.invitation, id, tenant_id: recipient, sent_at: at } } : data
    await expect(f.run('create', create)).rejects.toMatchObject({ status: 503 }); expect(f.send).not.toHaveBeenCalled()
  })
  it('releases only the exact failed send reservation', async () => {
    const f = fixture(); f.send.mockRejectedValue(new StaffInvitationDeliveryNotStarted('private provider details'))
    await expect(f.run('resend')).rejects.toMatchObject({ status: 503 })
    expect(f.rpc).toHaveBeenLastCalledWith('release', { id, reservedAt: at, previousSentAt: null })
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['reserve', 'release'])
  })
  it('does not release or resend when the post-send completion is uncertain', async () => {
    const f = fixture(); f.state.change = (action, data) => { if (action === 'finish') throw new Error('owned response loss'); return data }
    await expect(f.run('resend')).rejects.toThrow('owned response loss')
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['reserve', 'finish']); expect(f.send).toHaveBeenCalledTimes(1)
  })
  it('keeps the reservation when a transport error may hide a committed send', async () => {
    const f = fixture(); f.send.mockRejectedValue(new TypeError('private network failure'))
    await expect(f.run('resend')).rejects.toMatchObject({ status: 503 })
    expect(f.rpc.mock.calls.map(x => x[0])).toEqual(['reserve']); expect(f.send).toHaveBeenCalledTimes(1)
  })
  it('never claims success for a wrong post-send recipient', async () => {
    const f = fixture(); f.state.change = (action, data) => action === 'finish'
      ? { ...data, invitation: { ...f.invitation, sent_at: at, auth_user_id: position } } : data
    await expect(f.run('resend')).rejects.toMatchObject({ status: 503 })
    expect(f.rpc.mock.calls.map(x => x[0])).not.toContain('release'); expect(f.send).toHaveBeenCalledTimes(1)
  })
})
