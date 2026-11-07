import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPublicUrl, getPublicBaseUrl } from './getPublicUrl'

afterEach(() => vi.unstubAllGlobals())
function at(origin: string, pathname: string) {
  vi.stubGlobal('window', { location: { origin, pathname } })
}
describe('public links preserve workspace and public origin', () => {
  it('keeps legacy payment links unchanged', () => {
    at('https://roomqc.com', '/bookings')
    expect(buildPublicUrl('/payment-qr/payment-A')).toBe('https://roomqc.com/payment-qr/payment-A')
  })
  it('keeps workspace links on the same origin, not an Auth Bridge redirect', () => {
    at('https://roomqc.com', '/app/anthuy/bookings')
    expect(getPublicBaseUrl()).toBe('https://roomqc.com/app/anthuy')
    expect(new URL(getPublicBaseUrl()).origin).toBe(window.location.origin)
    expect(buildPublicUrl('/payment-qr/payment-A')).toBe('https://roomqc.com/app/anthuy/payment-qr/payment-A')
    expect(buildPublicUrl('/scan-document/session-A')).toBe('https://roomqc.com/app/anthuy/scan-document/session-A')
  })
  it('preserves the workspace when bypassing a preview Auth Bridge', () => {
    at('https://1234-abcd.lovableproject.com', '/app/anthuy/rooms')
    expect(buildPublicUrl('/payment-qr/payment-A')).toBe('https://id-preview--1234-abcd.lovable.app/app/anthuy/payment-qr/payment-A')
  })
  it('rejects links to another business', () => {
    at('https://roomqc.com', '/app/anthuy/rooms')
    expect(() => buildPublicUrl('/app/another/rooms')).toThrow()
  })
})
