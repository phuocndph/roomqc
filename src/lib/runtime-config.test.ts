import { describe, expect, it } from 'vitest'
import { isServiceRoleKey } from './runtime-config'

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
