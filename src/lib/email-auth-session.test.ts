import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { clearIsolatedEmailSession } from './email-auth-session'

const uid = '11111111-1111-4111-8111-111111111111'
const sid = '22222222-2222-4222-8222-222222222222'
const token = btoa('{}') + '.' + btoa(JSON.stringify({ sub: uid, session_id: sid, exp: Math.floor(Date.now() / 1000) + 3600 })) + '.fixture'
const user = { id: uid, email: 'fixture@roomqc.invalid', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } })

async function fixture(mode: 'ended' | 'unavailable' | 'invalid-request' | 'lookup-unavailable' | 'lookup-live' = 'ended') {
  const calls: string[] = []
  const client = createClient('http://owned.roomqc.invalid', 'owned-public', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'email-session-fixture-' + mode },
    global: { fetch: async (input, options) => {
      const url = String(input); calls.push(url)
      if (url.endsWith('/verify')) return json({ access_token: token, refresh_token: 'owned-refresh', token_type: 'bearer', expires_in: 3600, user })
      if (url.includes('/logout?scope=local')) {
        expect(options?.method).toBe('POST')
        if (mode === 'unavailable') return json({ message: 'unavailable' }, 503)
        if (mode === 'invalid-request') return json({ code: 'validation_failed', msg: 'invalid' }, 422)
        return json({ code: 'session_not_found', msg: 'Session does not exist' }, 403)
      }
      if (url.endsWith('/user')) {
        if (mode === 'lookup-unavailable') return json({ message: 'unavailable' }, 503)
        if (mode === 'lookup-live') return json(user)
        return json({ code: 'session_not_found', msg: 'Session does not exist' }, 403)
      }
      throw new Error('Unexpected fixture request')
    } },
  })
  const verification = await client.auth.verifyOtp({ email: user.email, token: '123456', type: 'invite' })
  expect(verification.error).toBeNull(); expect(verification.data.session).toBeTruthy()
  return { client, calls }
}

describe('isolated email session cleanup with the actual Auth SDK', () => {
  it('clears a locally retained session after native logout without treating the error as global logout proof', async () => {
    const f = await fixture()
    const result = await clearIsolatedEmailSession(f.client.auth)
    expect(result.error).toBeNull()
    expect((await f.client.auth.getSession()).data.session).toBeNull()
    expect(f.calls.filter(x => x.includes('/logout?'))).toHaveLength(1)
    expect(f.calls.at(-1)).toContain('/user')
  })

  it.each(['unavailable', 'invalid-request', 'lookup-unavailable', 'lookup-live'] as const)('does not hide %s or claim the SDK copy is cleared', async mode => {
    const f = await fixture(mode)
    const result = await clearIsolatedEmailSession(f.client.auth)
    expect(result.error).toBeTruthy()
    expect((await f.client.auth.getSession()).data.session).toBeTruthy()
    if (mode === 'unavailable' || mode === 'invalid-request') expect(f.calls.some(x => x.endsWith('/user'))).toBe(false)
  })
})
