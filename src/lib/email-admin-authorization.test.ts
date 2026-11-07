import { describe, expect, it, vi } from 'vitest'
import { HttpError, requireEmailAdministrator, verifiedEmailAdministratorContext } from '../../supabase/functions/_shared/email/authorization'

const user = { id: 'owned-admin-fixture', email_confirmed_at: '2026-10-19T00:00:00Z' }
const active = { is_super_admin: true, status: 'active', account_locked: false, deleted_at: null }
const dependencies = () => ({
  verifyUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
  loadProfile: vi.fn().mockResolvedValue({ data: active, error: null }),
  verifyAdministratorSession: vi.fn().mockResolvedValue({ data: user.id, error: null }),
})
describe('server email administrator live authorization', () => {
  it('requires a verified confirmed Auth user before reading profile', async () => {
    const d = dependencies()
    await expect(requireEmailAdministrator(null, d)).rejects.toMatchObject({ status: 401 })
    expect(d.verifyUser).not.toHaveBeenCalled(); expect(d.loadProfile).not.toHaveBeenCalled()
    for (const result of [{ data: { user: null }, error: null }, { data: { user }, error: new Error('revoked') },
      { data: { user: { ...user, email_confirmed_at: null, user_metadata: { is_super_admin: true } } }, error: null }]) {
      d.verifyUser.mockResolvedValueOnce(result)
      await expect(requireEmailAdministrator('synthetic-token', d)).rejects.toMatchObject({ status: 401 })
    }
    expect(d.loadProfile).not.toHaveBeenCalled()
  })
  it('rejects deleted, locked, inactive, non-admin or unreadable profiles', async () => {
    for (const profile of [{ ...active, deleted_at: '2026-10-19T00:00:00Z' }, { ...active, deleted_at: undefined },
      { ...active, account_locked: true }, { ...active, status: 'inactive' }, { ...active, is_super_admin: false }, null]) {
      const d = dependencies(); d.loadProfile.mockResolvedValueOnce({ data: profile, error: null })
      await expect(requireEmailAdministrator('synthetic-token', d)).rejects.toMatchObject({ status: 403 })
    }
    const d = dependencies(); d.loadProfile.mockResolvedValueOnce({ data: active, error: new Error('database-secret') })
    await expect(requireEmailAdministrator('synthetic-token', d)).rejects.toThrow(HttpError)
    await expect(requireEmailAdministrator('synthetic-token', { ...d, loadProfile: async () => ({ data: null, error: 'database-secret' }) }))
      .rejects.not.toThrow('database-secret')
  })
  it('revalidates every action and binds profile lookup to Auth identity', async () => {
    const d = dependencies()
    expect(await requireEmailAdministrator('synthetic-token', d)).toEqual(user)
    expect(d.loadProfile).toHaveBeenCalledWith(user.id)
    d.loadProfile.mockResolvedValueOnce({ data: { ...active, is_super_admin: false }, error: null })
    await expect(requireEmailAdministrator('synthetic-token', d)).rejects.toMatchObject({ status: 403 })
    expect(d.verifyUser).toHaveBeenCalledTimes(2); expect(d.loadProfile).toHaveBeenCalledTimes(2)
    expect(d.verifyAdministratorSession).toHaveBeenCalledTimes(1)
  })
  it('requires a live matching session even while the signed JWT and profile remain valid', async () => {
    for (const result of [{ data: null, error: null }, { data: 'other-admin', error: null },
      { data: user.id, error: new Error('private-session-diagnostic') }]) {
      const d = dependencies(); d.verifyAdministratorSession.mockResolvedValueOnce(result)
      await expect(requireEmailAdministrator('synthetic-token', d)).rejects.toMatchObject({ status: 403 })
      expect(d.verifyAdministratorSession).toHaveBeenCalledWith('synthetic-token')
    }
  })
})

describe('verified email administrator context extraction (not JWT authentication)', () => {
  const actorId = '11111111-1111-4111-8111-111111111111'
  const sessionId = '22222222-2222-4222-8222-222222222222'
  const token = (claims: unknown) => 'verified-by-caller.' + btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') + '.signature'
  it('binds the parsed session to the independently verified Auth user', () => {
    expect(verifiedEmailAdministratorContext(token({ sub: actorId, session_id: sessionId }), actorId))
      .toEqual({ actorId, sessionId })
  })
  it('rejects malformed, missing, oversized or wrong-user context with sanitized 403', () => {
    for (const value of [null, '', 'not-a-jwt', 'a.@@@.b', 'a.' + 'x'.repeat(17000) + '.b',
      token(null), token({}), token({ sub: sessionId, session_id: sessionId }),
      token({ sub: actorId, session_id: 123 }), token({ sub: actorId, session_id: 'not-a-uuid' })]) {
      expect(() => verifiedEmailAdministratorContext(value, actorId)).toThrow(HttpError)
      try { verifiedEmailAdministratorContext(value, actorId) } catch (error) {
        expect(error).toMatchObject({ status: 403 })
      }
    }
    expect(() => verifiedEmailAdministratorContext(token({ sub: actorId, session_id: sessionId }), 'unverified-user'))
      .toThrow(HttpError)
  })
  it('ignores user metadata and cannot derive the verified identity from claims', () => {
    const forged = token({ sub: sessionId, session_id: sessionId, user_metadata: { is_super_admin: true, actorId } })
    expect(() => verifiedEmailAdministratorContext(forged, actorId)).toThrow(HttpError)
  })
})
