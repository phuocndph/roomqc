import { describe, expect, it } from 'vitest'
import { validateMobileEnvironment } from '../../../scripts/mobile-config.mjs'

const production = {
  VITE_ROOMQC_PUBLIC_WEB_URL: 'https://app.roomqc.com',
  VITE_SUPABASE_URL: 'https://data.roomqc.com',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_real_public_key',
  VITE_ROOMQC_CLUSTER_ORIGINS: 'https://data.roomqc.com',
}
describe('mobile endpoint release gates', () => {
  it('accepts public HTTPS endpoints and public keys', () => {
    expect(validateMobileEnvironment(production).localDevelopment).toBe(false)
  })
  it.each(['http://data.roomqc.com', 'https://localhost', 'https://127.0.0.1:54321', 'https://10.0.2.2', 'https://api.your-domain.com', 'https://user:password@data.roomqc.com', 'https://data.roomqc.com/path'])('blocks a bad release endpoint %s', endpoint => {
    expect(() => validateMobileEnvironment({ ...production, VITE_SUPABASE_URL: endpoint, VITE_ROOMQC_CLUSTER_ORIGINS: '' })).toThrow()
  })
  it('blocks a hidden HTTP cluster even when the default backend is HTTPS', () => {
    expect(() => validateMobileEnvironment({ ...production, VITE_ROOMQC_CLUSTER_ORIGINS: 'https://data.roomqc.com,http://10.0.2.2:54321' })).toThrow()
  })
  it('rejects secret keys and legacy service JWTs', () => {
    for (const key of ['sb_secret_admin', `header.${btoa(JSON.stringify({ role: 'service_role' }))}.sig`]) {
      expect(() => validateMobileEnvironment({ ...production, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow()
    }
  })
  it('rejects user access tokens and unknown key formats', () => {
    for (const key of ['unknown-key', `header.${btoa(JSON.stringify({ role: 'authenticated' }))}.sig`]) {
      expect(() => validateMobileEnvironment({ ...production, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow()
    }
    const anon = `header.${btoa(JSON.stringify({ role: 'anon' }))}.sig`
    expect(validateMobileEnvironment({ ...production, VITE_SUPABASE_PUBLISHABLE_KEY: anon }).localDevelopment).toBe(false)
  })
  it('requires a deliberate local mode for emulator endpoints', () => {
    const emulator = { ...production, VITE_SUPABASE_URL: 'http://10.0.2.2:54321', VITE_ROOMQC_CLUSTER_ORIGINS: '', VITE_ROOMQC_PUBLIC_WEB_URL: 'http://10.0.2.2:8082' }
    expect(() => validateMobileEnvironment(emulator)).toThrow()
    expect(validateMobileEnvironment(emulator, { local: true }).localDevelopment).toBe(true)
    expect(() => validateMobileEnvironment({ ...emulator, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }, { local: true })).toThrow('phone itself')
  })
})
