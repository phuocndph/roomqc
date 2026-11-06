import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn(), resend: vi.fn(), verifyOtp: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }))
const invoke = vi.hoisted(() => vi.fn())
const factory = vi.hoisted(() => vi.fn(() => ({ auth, functions: { invoke } })))
vi.mock('@supabase/supabase-js', () => ({ createClient: factory }))
vi.mock('./runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-test', workspace: { workspace: { tenantId: 'tenant-1' } } } }))
vi.mock('./native/auth-links', () => ({ authRedirectUrl: (path: string) => `com.roomqc.app://${path}` }))
import { createEmailAuthFlow } from './email-auth'

beforeEach(() => {
  vi.clearAllMocks()
  auth.updateUser.mockResolvedValue({ error: null }); auth.signOut.mockResolvedValue({ error: null })
})
describe('Auth-owned email verification', () => {
  it('accepts a resent recovery OTP for an invitation and still requires server acceptance', async () => {
    const flow = createEmailAuthFlow()
    auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: new Error('not invite') })
      .mockResolvedValueOnce({ data: { session: {}, user: { email: 'user@example.test' } }, error: null })
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null })
    await flow.verify('invite', 'user@example.test', '123456')
    expect(auth.verifyOtp).toHaveBeenLastCalledWith({type:'recovery',email:'user@example.test',token:'123456'})
    await flow.finish('invite','Secret!123')
    expect(invoke).toHaveBeenCalledWith('staff-invitations',expect.any(Object))
  })

  it('keeps OTP sessions isolated from the app session and does not use custom reset functions', async () => {
    const flow = createEmailAuthFlow()
    expect(factory).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, detectSessionInUrl: false }) }))
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    await flow.send('recovery', ' User@Example.test ')
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.test', expect.objectContaining({ redirectTo: expect.any(String) }))
    expect(invoke).not.toHaveBeenCalled()
  })
  it('requires verification before password changes and rejects mismatched identities', async () => {
    const flow = createEmailAuthFlow()
    await expect(flow.finish('recovery', 'Secret!123')).rejects.toThrow('xác minh')
    expect(auth.updateUser).not.toHaveBeenCalled()
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { email: 'other@example.test' } }, error: null })
    await expect(flow.verify('invite', 'user@example.test', '123456')).rejects.toThrow('Mã không hợp lệ')
    await expect(flow.finish('invite', 'Secret!123')).rejects.toThrow('xác minh')
  })
  it('retries invitation acceptance after a transient failure without setting the same password twice', async () => {
    const flow = createEmailAuthFlow()
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { email: 'user@example.test' } }, error: null })
    await flow.verify('invite', 'user@example.test', '123456')
    invoke.mockResolvedValueOnce({ data: null, error: new Error('network') }).mockResolvedValueOnce({ data: { success: true }, error: null })
    await expect(flow.finish('invite', 'Secret!123')).rejects.toThrow('quyền truy cập chưa được cấp')
    await flow.finish('invite', 'Secret!123')
    expect(auth.updateUser).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenLastCalledWith('staff-invitations', { body: { action: 'accept', tenantId: 'tenant-1' } })
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
  it('clears verification after completing recovery and revokes refresh sessions', async () => {
    const flow = createEmailAuthFlow()
    auth.verifyOtp.mockResolvedValue({ data: { session: {}, user: { email: 'user@example.test' } }, error: null })
    await flow.verify('recovery', 'user@example.test', '123456')
    await flow.finish('recovery', 'Secret!123')
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    await expect(flow.finish('recovery', 'Secret!456')).rejects.toThrow('xác minh')
  })
})
