import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeAuthStorage } from './auth-storage'
const secure = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }))
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: secure, KeychainAccess: { whenUnlockedThisDeviceOnly: 1 } }))
beforeEach(() => vi.clearAllMocks())
describe('native session storage', () => {
  it('keeps tokens in device-only secure storage and disables cloud sync', async () => {
    await nativeAuthStorage.setItem('workspace-a', 'session')
    expect(secure.set).toHaveBeenCalledWith('roomqc-auth:workspace-a', 'session', false, false, 1)
    secure.get.mockResolvedValue('session')
    expect(await nativeAuthStorage.getItem('workspace-a')).toBe('session')
    expect(secure.get).toHaveBeenCalledWith('roomqc-auth:workspace-a', false, false)
    await nativeAuthStorage.removeItem('workspace-a')
    expect(secure.remove).toHaveBeenCalledWith('roomqc-auth:workspace-a', false)
  })
  it('does not silently fall back to plaintext if Keychain fails', async () => {
    secure.get.mockRejectedValue(new Error('Keychain unavailable'))
    await expect(nativeAuthStorage.getItem('workspace-a')).rejects.toThrow('Keychain unavailable')
    secure.set.mockRejectedValue(new Error('Keystore unavailable'))
    await expect(nativeAuthStorage.setItem('workspace-a', 'session')).rejects.toThrow('Keystore unavailable')
  })
  it('rejects corrupted session types', async () => {
    secure.get.mockResolvedValue({ access_token: 'unexpected object' })
    await expect(nativeAuthStorage.getItem('workspace-a')).rejects.toThrow('không hợp lệ')
  })
})
