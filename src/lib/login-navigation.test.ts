import { describe, expect, it } from 'vitest'
import { loginNextPath } from './login-navigation'
describe('login return path', () => {
  it('returns the platform operator to the console without a workspace slug', () => {
    expect(loginNextPath('', '/admin/login')).toBe('/super-admin')
    expect(loginNextPath('?next=%2Fsuper-admin%2Finfrastructure', '/admin/login')).toBe('/super-admin/infrastructure')
  })
  it.each(['https://other.invalid', '//other.invalid', '/%2fother.invalid', '/app/other/dashboard'])('does not escape a customer workspace through %s', next => {
    expect(loginNextPath('?next='+encodeURIComponent(next), '/app/hotel-a/auth/login')).toBeNull()
  })
  it('keeps customer routing and internal destinations', () => {
    expect(loginNextPath('', '/auth/login')).toBeNull()
    expect(loginNextPath('?next=%2Fbookings', '/app/hotel-a/auth/login')).toBe('/bookings')
    expect(loginNextPath('', '/app/hotel-a/admin/login')).toBeNull()
  })
})
