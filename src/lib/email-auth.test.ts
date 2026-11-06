import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailAuthFixture, emailTenant, emailInvitation } from '@/test/email-auth-fixture'

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), resend: vi.fn(), verifyOtp: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), getSession: vi.fn() }))
const invoke = vi.hoisted(() => vi.fn())
const factory = vi.hoisted(() => vi.fn(() => ({ auth, functions: { invoke } })))
const config = vi.hoisted(() => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-test', workspace: { workspace: { tenantId: '66666666-6666-4666-8666-666666666666' } } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: factory }))
vi.mock('./runtime-config', () => ({ runtimeConfig: config }))
vi.mock('./native/auth-links', () => ({ authRedirectUrl: (path: string) => `com.roomqc.app://${path}` }))
import { createEmailAuthFlow } from './email-auth'

let fixture: ReturnType<typeof emailAuthFixture>
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  config.supabaseUrl = 'http://127.0.0.1:54321'; config.workspace.workspace.tenantId = emailTenant
  fixture = emailAuthFixture()
  auth.verifyOtp.mockImplementation(fixture.deps.verifyOtp)
  auth.getSession.mockImplementation(fixture.deps.getSession)
  auth.signOut.mockImplementation(fixture.deps.clearSession)
  auth.resetPasswordForEmail.mockResolvedValue({ error: null }); auth.resend.mockResolvedValue({ error: null })
  vi.stubGlobal('fetch', fixture.deps.fetch)
})
afterEach(() => vi.unstubAllGlobals())

describe('Auth-owned email verification runtime adapter', () => {
  it('accepts a resent recovery OTP for invitation and still calls server acceptance with a captured token', async () => {
    const flow = createEmailAuthFlow()
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('not invite') })
    await flow.verify('invite', 'user@example.test', '123456')
    expect(auth.verifyOtp).toHaveBeenLastCalledWith({ type: 'recovery', email: 'user@example.test', token: '123456' })
    await flow.finish('invite', 'OwnedNew!123')
    expect(fixture.state.accepts).toBe(1); expect(fixture.state.puts).toBe(1)
    expect(invoke).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('keeps OTP sessions isolated from the app and uses Auth reset, not custom reset functions', async () => {
    const flow = createEmailAuthFlow()
    expect(factory).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    await flow.send('recovery', ' User@Example.test ')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.test', { redirectTo: 'com.roomqc.app:///auth/change-password' })
    expect(invoke).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('requires verification before password changes and rejects mismatched identities', async () => {
    const flow = createEmailAuthFlow()
    await expect(flow.finish('recovery', 'NotSent!123')).rejects.toThrow('xác minh')
    fixture.state.user.email = 'other@example.test'
    await expect(flow.verify('invite', 'user@example.test', '123456')).rejects.toThrow('Mã không hợp lệ')
    await expect(flow.finish('invite', 'NotSent!123')).rejects.toThrow('xác minh')
    expect(fixture.state.puts).toBe(0)
  })

  it('retries invitation acceptance after transient failure without setting password twice', async () => {
    const flow = createEmailAuthFlow()
    await flow.verify('invite', 'user@example.test', '123456')
    fixture.state.failAccept = true
    await expect(flow.finish('invite', 'OwnedNew!123')).rejects.toMatchObject({ code: 'invitation_pending' })
    fixture.state.failAccept = false
    await expect(flow.check('invite')).resolves.toMatchObject({ completion: 'previous' })
    expect(fixture.state.puts).toBe(1); expect(fixture.state.accepts).toBe(2)
    expect(fixture.state.calls.find(c => c.body?.action === 'accept')?.body).toEqual({ action: 'accept', tenantId: emailTenant, invitationId: emailInvitation })
  })

  it('clears verification after recovery and explicitly requests global refresh-session revocation', async () => {
    const flow = createEmailAuthFlow()
    await flow.verify('recovery', 'user@example.test', '123456')
    await flow.finish('recovery', 'OwnedNew!123')
    expect(fixture.state.calls.at(-1)?.url).toBe('http://127.0.0.1:54321/auth/v1/logout?scope=global')
    await expect(flow.finish('recovery', 'NotSent!456')).rejects.toThrow('xác minh')
  })

  it('captures target/tenant and signup resend redirect instead of following a later workspace change', async () => {
    const flow = createEmailAuthFlow()
    config.supabaseUrl = 'http://not-used.invalid'; config.workspace.workspace.tenantId = 'wrong-tenant'
    await flow.verify('invite', 'user@example.test', '123456')
    await flow.finish('invite', 'OwnedNew!123')
    expect(fixture.state.calls.every(c => c.url.startsWith('http://127.0.0.1:54321/'))).toBe(true)
    expect(fixture.state.calls.find(c => c.body?.action === 'accept')?.body?.tenantId).toBe(emailTenant)
    const resend = createEmailAuthFlow()
    await resend.send('signup', ' User@Example.test ')
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@example.test', options: { emailRedirectTo: 'com.roomqc.app:///auth/callback' } })
  })

  it('disposes only the isolated local SDK session and rejects later work', async () => {
    const flow = createEmailAuthFlow()
    await flow.verify('invite', 'user@example.test', '123456')
    await flow.dispose(); await flow.dispose()
    expect(auth.signOut).toHaveBeenCalledTimes(2)
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
    await expect(flow.finish('invite', 'NotSent!123')).rejects.toMatchObject({ code: 'identity_changed' })
  })
})
