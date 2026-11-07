import { KeychainAccess, SecureStorage } from '@aparajita/capacitor-secure-storage'

/** Tokens and PKCE verifiers stay in Keychain / Android Keystore encrypted storage.
 * Fail closed on storage errors; never fall back to plaintext storage on native. */
export const nativeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const value = await SecureStorage.get(`roomqc-auth:${key}`, false, false)
    if (value !== null && typeof value !== 'string') throw new Error('Phiên đăng nhập lưu trên thiết bị không hợp lệ. Vui lòng đăng nhập lại.')
    return value as string | null
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStorage.set(`roomqc-auth:${key}`, value, false, false, KeychainAccess.whenUnlockedThisDeviceOnly)
  },
  async removeItem(key: string): Promise<void> {
    await SecureStorage.remove(`roomqc-auth:${key}`, false)
  },
}
