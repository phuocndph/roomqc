import type { UsageMode } from '@/hooks/useUsageMode'

// W1-D3 (07/11/2026): a module hidden by usage_mode is also closed by URL.
// Keep this table in step with the `minMode` values in Sidebar navigation.
// Each entry matches the path itself and everything below it.
const MODE_ROUTES: Array<{ prefix: string; minMode: UsageMode; exact?: boolean }> = [
  { prefix: '/rooms/standards', minMode: 'standard' },
  { prefix: '/inventory', minMode: 'standard' },
  { prefix: '/items', minMode: 'standard' },
  { prefix: '/settings/warehouses', minMode: 'standard' },
  { prefix: '/vendors', minMode: 'standard' },
  { prefix: '/purchase-orders', minMode: 'standard' },
  { prefix: '/laundry', minMode: 'standard' },
  { prefix: '/maintenance', minMode: 'standard' },
  // Staff management only; /staff/housekeeping is the housekeeper's own task
  // screen and stays open in every mode.
  { prefix: '/staff', minMode: 'standard', exact: true },
  { prefix: '/staff/shift-handover', minMode: 'standard' },
  { prefix: '/reports', minMode: 'standard' },
  { prefix: '/settings/users', minMode: 'standard' },
  { prefix: '/settings/hotel-policy', minMode: 'standard' },
  { prefix: '/settings/fixed-costs', minMode: 'standard' },
  { prefix: '/settings/business', minMode: 'standard' },
  { prefix: '/settings/pricing', minMode: 'standard' },
  { prefix: '/settings/usage', minMode: 'standard' },
  { prefix: '/settings/workflows', minMode: 'full' },
]

const LEVEL: Record<UsageMode, number> = { homestay: 0, standard: 1, full: 2 }

/** The lowest usage mode that may open `pathname`, or null when every mode may. */
export function requiredModeForPath(pathname: string): UsageMode | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  let best: { len: number; minMode: UsageMode } | null = null
  for (const r of MODE_ROUTES) {
    const hit = r.exact ? path === r.prefix : path === r.prefix || path.startsWith(r.prefix + '/')
    if (hit && (!best || r.prefix.length > best.len)) best = { len: r.prefix.length, minMode: r.minMode }
  }
  return best?.minMode ?? null
}

export function isPathAllowedInMode(pathname: string, mode: UsageMode): boolean {
  const required = requiredModeForPath(pathname)
  return !required || LEVEL[mode] >= LEVEL[required]
}

export const OUTSIDE_MODE_MESSAGE = 'Tính năng này không có trong chế độ đang dùng'
