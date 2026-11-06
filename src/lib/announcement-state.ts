import { runtimeConfig } from './runtime-config'

type Dismissals = Record<string, 'pending' | 'synced'>
const PREFIX = 'roomqc:announcement-dismissals:v1:'
const EVENT = 'roomqc:announcement-dismissals-changed'
// If storage is blocked/full, still suppress repeats for the lifetime of this app.
const fallback = new Map<string, Dismissals>()

export function announcementScope(userId: string, tenantId?: string | null): string {
  return JSON.stringify([
    runtimeConfig.supabaseUrl,
    runtimeConfig.workspace?.workspace.id ?? tenantId ?? 'platform',
    userId,
  ])
}

function read(scope: string): Dismissals {
  const records: Dismissals = { ...fallback.get(scope) }
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + scope) || '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [id, state] of Object.entries(value)) {
        if ((state === 'pending' || state === 'synced') && records[id] !== 'synced') records[id] = state
      }
    }
  } catch { /* Use the in-memory fallback, never break the close button. */ }
  return records
}

function write(scope: string, records: Dismissals) {
  fallback.set(scope, records)
  try { localStorage.setItem(PREFIX + scope, JSON.stringify(records)) } catch { /* Session fallback above. */ }
  window.dispatchEvent(new Event(EVENT))
}

export function rememberDismissal(scope: string, id: string) {
  const records = read(scope)
  if (records[id]) return
  write(scope, { ...records, [id]: 'pending' })
}

export function confirmDismissal(scope: string, id: string) {
  const records = read(scope)
  if (records[id] === 'synced') return
  write(scope, { ...records, [id]: 'synced' })
}

export function isAnnouncementDismissed(scope: string, id: string) {
  return !!read(scope)[id]
}

export function pendingDismissals(scope: string) {
  return Object.entries(read(scope)).filter(([, status]) => status === 'pending').map(([id]) => id)
}

export function dismissalSnapshot(scope: string | null) {
  return scope ? JSON.stringify(read(scope)) : ''
}

export function subscribeDismissals(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) listener()
  }
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function promoPaused(scope: string) {
  try { return sessionStorage.getItem(`roomqc:promo-paused:${scope}`) === 'true' } catch { return false }
}

export function pausePromos(scope: string) {
  try { sessionStorage.setItem(`roomqc:promo-paused:${scope}`, 'true') } catch { /* Current host also tracks it. */ }
}
