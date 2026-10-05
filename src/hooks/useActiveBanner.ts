import { useCallback, useEffect, useState } from 'react'
import { useGracePeriod } from './useGracePeriod'
import { useReadOnlyMode } from './useReadOnlyMode'
import { useTenantUsage } from './useTenantUsage'
import { useTenantSubscription } from './useSubscription'
import { useActiveAnnouncements } from './announcements/useActiveAnnouncements'
import { useUser } from './useUser'
import { isTenantOwner, isManager } from '@/lib/userAccess'

/**
 * Loại banner toàn cục — sắp theo priority giảm dần.
 * Chỉ một banner duy nhất được hiển thị ở đầu trang tại một thời điểm
 * (ngoại trừ ShiftStatusBanner liên quan ca làm việc luôn hiện).
 */
export type ActiveBannerKind =
  | 'suspended'
  | 'grace_expired'
  | 'read_only'
  | 'quota_warning'
  | 'announcement'

const PRIORITY: ActiveBannerKind[] = [
  'suspended',
  'grace_expired',
  'read_only',
  'quota_warning',
  'announcement',
]

const DISMISS_STORAGE_KEY = 'active-banner-dismissed-v1'

// suspended không thể dismiss — user phải gia hạn để bỏ trạng thái này.
const NON_DISMISSIBLE: ReadonlySet<ActiveBannerKind> = new Set(['suspended'])

function readDismissed(): Set<ActiveBannerKind> {
  try {
    const raw = sessionStorage.getItem(DISMISS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as ActiveBannerKind[]
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function writeDismissed(set: Set<ActiveBannerKind>) {
  try {
    sessionStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {
    /* noop */
  }
}

interface UseActiveBannerResult {
  active: ActiveBannerKind | null
  dismiss: (kind: ActiveBannerKind) => void
  isDismissible: (kind: ActiveBannerKind) => boolean
}

export function useActiveBanner(): UseActiveBannerResult {
  const { user } = useUser()
  const { isGracePeriodExpired, isInGracePeriod } = useGracePeriod()
  const { isReadOnly } = useReadOnlyMode()
  const { data: usage } = useTenantUsage()
  const { data: subscription } = useTenantSubscription()
  const { data: announcements = [] } = useActiveAnnouncements()

  const [dismissed, setDismissed] = useState<Set<ActiveBannerKind>>(() => readDismissed())

  // Đồng bộ giữa các tab (sessionStorage thực ra mỗi tab tách riêng,
  // nhưng vẫn lắng nghe để an toàn).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISS_STORAGE_KEY) setDismissed(readDismissed())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const showSubscriptionBanner = isTenantOwner(user) || isManager(user)

  // ---- Tính trạng thái khả dụng cho từng banner ----
  const has: Record<ActiveBannerKind, boolean> = {
    suspended: showSubscriptionBanner && isGracePeriodExpired,
    grace_expired: showSubscriptionBanner && isInGracePeriod,
    read_only: isReadOnly,
    quota_warning: computeQuotaWarning(usage, subscription),
    announcement: announcements.some((a) => a.placement === 'top_banner'),
  }

  const active =
    PRIORITY.find((kind) => has[kind] && !dismissed.has(kind)) ?? null

  const dismiss = useCallback((kind: ActiveBannerKind) => {
    if (NON_DISMISSIBLE.has(kind)) return
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(kind)
      writeDismissed(next)
      return next
    })
  }, [])

  const isDismissible = useCallback(
    (kind: ActiveBannerKind) => !NON_DISMISSIBLE.has(kind),
    [],
  )

  return { active, dismiss, isDismissible }
}

function computeQuotaWarning(usage: any, subscription: any): boolean {
  if (!usage || !subscription?.subscription_plan) return false
  const plan = subscription.subscription_plan
  const checks: Array<[number | null | undefined, number | null | undefined]> = [
    [usage.current_hotels_count, plan.max_hotels],
    [usage.current_users_count, plan.max_users],
    [usage.current_rooms_count, plan.max_rooms],
    [usage.current_items_count, plan.max_items],
    [
      usage.current_storage_bytes != null
        ? usage.current_storage_bytes / 1024 ** 3
        : null,
      plan.max_storage_gb,
    ],
  ]
  return checks.some(([cur, max]) => {
    if (!max || cur == null) return false
    return (cur / max) * 100 >= 80
  })
}
