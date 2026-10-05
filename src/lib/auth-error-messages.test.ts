import { describe, expect, it } from 'vitest'
import { getAuthErrorKey } from './auth-error-messages'

describe('getAuthErrorKey', () => {
  it('keeps invalid credentials separate from weak-password errors', () => {
    expect(getAuthErrorKey({ message: 'Invalid login credentials', code: 'invalid_credentials' })).toBe(
      'errors.invalidCredentials',
    )
    expect(getAuthErrorKey({ message: 'Password should be at least 6 characters' })).toBe(
      'errors.weakPassword',
    )
  })

  it('recognizes Supabase transport errors from metadata', () => {
    expect(getAuthErrorKey({ name: 'AuthRetryableFetchError', message: 'Request failed' })).toBe(
      'errors.networkError',
    )
    expect(getAuthErrorKey({ code: 'ERR_CONNECTION_REFUSED', message: 'Request failed' })).toBe(
      'errors.networkError',
    )
  })

  it('does not classify an ordinary password message as a network error', () => {
    expect(getAuthErrorKey('Invalid password')).toBe('errors.unknown')
  })
})
