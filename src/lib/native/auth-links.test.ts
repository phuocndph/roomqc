import { afterEach, describe, expect, it, vi } from 'vitest'
import { authRedirectUrl, parseNativeAuthLink } from './auth-links'

const native = vi.hoisted(() => ({ enabled: false }))
vi.mock('./platform', () => ({ isNativeApp: () => native.enabled }))
afterEach(() => { native.enabled = false; vi.unstubAllGlobals() })

describe('native authentication redirects', () => {
  it('keeps existing web auth callbacks and workspace routing', () => {
    vi.stubGlobal('window', { location: { origin: 'https://app.roomqc.com', pathname: '/app/anthuy/auth/login' } })
    expect(authRedirectUrl('/auth/callback', '/rooms')).toBe('https://app.roomqc.com/app/anthuy/auth/callback?next=%2Frooms')
  })
  it('uses a native PKCE callback scoped to the current workspace', () => {
    native.enabled = true
    vi.stubGlobal('window', { location: { origin: 'capacitor://localhost', pathname: '/app/anthuy/auth/login' } })
    expect(authRedirectUrl('/auth/callback', '//evil.invalid')).toBe('com.roomqc.app://auth/callback?workspace=anthuy')
    expect(authRedirectUrl('/auth/change-password')).toBe('com.roomqc.app://auth/change-password?workspace=anthuy')
  })
  it('accepts only the code and safe in-workspace destination', () => {
    expect(parseNativeAuthLink('com.roomqc.app://auth/callback?code=abc&workspace=anthuy&next=%2Frooms')).toEqual({
      code: 'abc', workspace: 'anthuy', error: false, route: '/auth/callback?next=%2Frooms',
    })
    expect(parseNativeAuthLink('com.roomqc.app://auth/change-password?code=abc')?.route).toBe('/auth/change-password')
  })
  it.each([
    'https://evil.invalid/auth/callback?code=abc',
    'com.roomqc.app://evil/callback?code=abc',
    'com.roomqc.app://user@auth/callback?code=abc',
    'com.roomqc.app://auth/rooms?code=abc',
    'com.roomqc.app://auth/callback#access_token=token&refresh_token=token',
    'com.roomqc.app://auth/callback?access_token=token',
    'com.roomqc.app://auth/callback?code=abc&workspace=',
    'com.roomqc.app://auth/callback?code=abc&workspace=ab--cd',
    'com.roomqc.app://auth/callback?code=abc&workspace=anthuy&next=%2Fapp%2Fother%2Frooms',
    'com.roomqc.app://auth/callback?code=abc&next=%2Fapp%2Fother%2Frooms',
    'com.roomqc.app://auth/callback?code=abc&next=%2F%2Fevil.invalid',
    'com.roomqc.app://auth/callback?code=abc&next=%2F%252e%252e%2Frooms',
    'com.roomqc.app://auth/callback?code=abc&code=other',
    'com.roomqc.app://auth/callback?code=a%00b',
  ])('rejects unsafe or unsupported deep link %s', value => {
    expect(parseNativeAuthLink(value)).toBeNull()
  })
})
