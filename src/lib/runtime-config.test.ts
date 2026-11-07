import { describe, expect, it } from 'vitest'
import { isServiceRoleKey, isPublishableKey } from './runtime-config'

describe('isServiceRoleKey', () => {
  it('rejects new secret key prefixes', () => {
    expect(isServiceRoleKey('sb_secret_example')).toBe(true)
  })

  it('rejects legacy JWT service-role keys', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role' }))
    expect(isServiceRoleKey(`header.${payload}.signature`)).toBe(true)
  })

  it('allows publishable and anon JWT keys', () => {
    const payload = btoa(JSON.stringify({ role: 'anon' }))
    expect(isServiceRoleKey(`header.${payload}.signature`)).toBe(false)
    expect(isServiceRoleKey('sb_publishable_example')).toBe(false)
  })
})

describe('isPublishableKey', () => {
  const anon = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'anon' })).replace(/=/g, '')}.signature`
  it('accepts individual public keys', () => {
    expect(isPublishableKey(anon)).toBe(true)
    expect(isPublishableKey('sb_publishable_example')).toBe(true)
  })
  it('rejects interpolated PowerShell objects and private JWTs', () => {
    expect(isPublishableKey(`@{publishableKey=${anon}; jwtSecret=private}.publishableKey`)).toBe(false)
    expect(isPublishableKey(JSON.stringify({ publishableKey: anon, serviceKey: 'private' }))).toBe(false)
    expect(isPublishableKey(`eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: 'service_role' })).replace(/=/g, '')}.signature`)).toBe(false)
    expect(isPublishableKey('sb_secret_private')).toBe(false)
    expect(isPublishableKey('')).toBe(false)
  })
})
