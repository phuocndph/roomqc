import { describe, expect, it } from 'vitest'
import { invitationTarget, readStaffInvitationBody, verifiedStaffInvitationContext } from '../../supabase/functions/_shared/email/staff-invitation-context'

const actor = '11111111-1111-4111-8111-111111111111'
const session = '22222222-2222-4222-8222-222222222222'
const user = { id: actor, email_confirmed_at: '2026-10-22T00:00:00Z' }
const token = (claims: unknown) => 'e30.' + btoa(JSON.stringify(claims)).replace(/=/g, '') + '.fixture'

describe('verified invitation correlation and bounded request', () => {
  it('correlates the already Auth-verified bearer without using metadata for authority', () => {
    expect(verifiedStaffInvitationContext(token({ sub: actor, session_id: session, user_metadata: { role: 'owner' } }), user))
      .toEqual({ actorId: actor, sessionId: session })
  })
  it.each([null, '', 'not-a-token', token({ sub: session, session_id: session }), token({ sub: actor }),
    token({ sub: actor, session_id: 'invalid' }), 'x'.repeat(16385)])('rejects missing or mismatched session correlation %s', value => {
    expect(() => verifiedStaffInvitationContext(value, user)).toThrow('Phiên nhận lời mời')
  })
  it('requires verified email even when a bearer contains a session', () => {
    expect(() => verifiedStaffInvitationContext(token({ sub: actor, session_id: session }), { id: actor })).toThrow('Phiên nhận lời mời')
  })
  it('accepts optional targets but rejects malformed target identifiers', () => {
    expect(invitationTarget(undefined)).toBeNull(); expect(invitationTarget(null)).toBeNull()
    expect(invitationTarget(actor)).toBe(actor)
    for (const value of ['', [], {}, 1, 'tenant-1']) expect(() => invitationTarget(value)).toThrow('không hợp lệ')
  })
  it('reads only a JSON object and returns a safe client error', async () => {
    const request = (body: string) => new Request('https://fixture.invalid', { method: 'POST', body })
    await expect(readStaffInvitationBody(request('{"action":"mine"}'))).resolves.toEqual({ action: 'mine' })
    for (const body of ['null', '[]', 'invalid', 'true']) {
      await expect(readStaffInvitationBody(request(body))).rejects.toMatchObject({ status: 400, message: 'Nội dung yêu cầu không hợp lệ.' })
    }
    await expect(readStaffInvitationBody(request(JSON.stringify({ value: 'x'.repeat(16384) })))).rejects.toMatchObject({ status: 413 })
  })
})
