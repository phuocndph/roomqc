import { describe, expect, it } from 'vitest'
import { isPathAllowedInMode, requiredModeForPath } from './usageModeRoutes'

describe('W1-D3 usage mode routes', () => {
  it('closes standard modules for homestay, including deep links', () => {
    for (const p of ['/inventory', '/inventory/adjustments', '/laundry/batches', '/reports/finance', '/settings/pricing', '/rooms/standards', '/staff']) {
      expect(isPathAllowedInMode(p, 'homestay')).toBe(false)
      expect(isPathAllowedInMode(p, 'standard')).toBe(true)
    }
  })
  it('keeps core homestay screens open', () => {
    for (const p of ['/', '/bookings', '/rooms', '/rooms/abc/check', '/housekeeping', '/my-tasks', '/staff/housekeeping', '/settings/hotels', '/settings/room-check', '/chat']) {
      expect(isPathAllowedInMode(p, 'homestay')).toBe(true)
    }
  })
  it('automation needs full mode', () => {
    expect(requiredModeForPath('/settings/workflows')).toBe('full')
    expect(isPathAllowedInMode('/settings/workflows', 'standard')).toBe(false)
    expect(isPathAllowedInMode('/settings/workflows', 'full')).toBe(true)
  })
  it('does not treat similar prefixes as the same module', () => {
    expect(requiredModeForPath('/itemsx')).toBeNull()
    expect(requiredModeForPath('/staffing')).toBeNull()
    expect(requiredModeForPath('/inventory/')).toBe('standard')
  })
})
