import { beforeEach, describe, expect, it, vi } from 'vitest'
import { announcementScope, confirmDismissal, isAnnouncementDismissed, pendingDismissals, rememberDismissal, subscribeDismissals } from './announcement-state'

let scope: string
beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  scope = announcementScope(crypto.randomUUID(), 'tenant')
})

describe('durable announcement acknowledgement', () => {
  it('survives module reloads, retries only unsynced IDs and deduplicates closes', async () => {
    rememberDismissal(scope, 'promo')
    rememberDismissal(scope, 'promo')
    expect(pendingDismissals(scope)).toEqual(['promo'])
    vi.resetModules()
    const fresh = await import('./announcement-state')
    expect(fresh.isAnnouncementDismissed(scope, 'promo')).toBe(true)
    expect(fresh.pendingDismissals(scope)).toEqual(['promo'])
    fresh.confirmDismissal(scope, 'promo')
    expect(fresh.pendingDismissals(scope)).toEqual([])
    expect(fresh.isAnnouncementDismissed(scope, 'promo')).toBe(true)
  })

  it('isolates accounts and tenants on the same browser', () => {
    const a = announcementScope('A', 'tenant-A')
    rememberDismissal(a, 'promo')
    expect(isAnnouncementDismissed(announcementScope('B', 'tenant-A'), 'promo')).toBe(false)
    expect(isAnnouncementDismissed(announcementScope('A', 'tenant-B'), 'promo')).toBe(false)
  })

  it('keeps the dialog closed when browser storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded') })
    rememberDismissal(scope, 'promo')
    expect(isAnnouncementDismissed(scope, 'promo')).toBe(true)
    confirmDismissal(scope, 'promo')
    expect(pendingDismissals(scope)).toEqual([])
  })

  it('ignores damaged storage and broadcasts local/tab changes', () => {
    localStorage.setItem(`roomqc:announcement-dismissals:v1:${scope}`, 'broken JSON')
    expect(isAnnouncementDismissed(scope, 'promo')).toBe(false)
    const listener = vi.fn()
    const unsubscribe = subscribeDismissals(listener)
    rememberDismissal(scope, 'promo')
    expect(listener).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new StorageEvent('storage', { key: `roomqc:announcement-dismissals:v1:${scope}` }))
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
})
