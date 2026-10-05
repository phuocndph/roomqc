import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useUser } from '@/hooks/useUser'
import { useUserModulePermissions, type PermissionSummary } from '@/hooks/useUserModulePermissions'
import { usePendingTaskCount } from '@/hooks/useHousekeepingTasks'
import { usePendingCounts, type PendingCounts } from '@/hooks/usePendingCounts'
import { prefetchRoute } from '@/lib/route-prefetch'
import { useMobileNavPreferences } from '@/hooks/useMobileNavPreferences'
import { NAV_TABS_POOL, MAX_NAV_TABS, type NavTabDef, type PendingCountKey } from './mobileNavTabs'

export const MobileBottomNav = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, role } = useUser()
  const { data: modulePermissions } = useUserModulePermissions()
  const { data: pendingTaskCount = 0 } = usePendingTaskCount()
  const { data: pendingCounts } = usePendingCounts()
  const { selectedIds, isCustomized } = useMobileNavPreferences()

  // Hide MobileBottomNav khi đang trong room check (cần full screen)
  if (location.pathname.includes('/check')) return null

  const inventoryFormRoutes = [
    '/inventory/inbound/',
    '/inventory/outbound/',
    '/inventory/transfer/',
    '/inventory/adjustments/new',
    '/inventory/adjustments/',
  ]
  if (inventoryFormRoutes.some((p) => location.pathname.startsWith(p))) {
    const isList =
      location.pathname === '/inventory/adjustments' ||
      location.pathname === '/inventory/inbound' ||
      location.pathname === '/inventory/outbound' ||
      location.pathname === '/inventory/transfer'
    if (!isList) return null
  }

  const isPrivileged = role === 'super_admin' || role === 'owner'

  const hasModuleAccess = (modules?: string[]): boolean => {
    if (!modules || modules.length === 0) return true
    if (isPrivileged) return true
    if (!modulePermissions) return false
    return modules.some((module) => {
      const p = modulePermissions.find((x: PermissionSummary) => x.module === module)
      if (!p) return false
      return p.can_view || p.can_create || p.can_update || p.can_delete
    })
  }

  const tasksPath = user?.department === 'housekeeping' ? '/staff/housekeeping' : '/my-tasks'
  const withDynamicPath = (tab: NavTabDef): NavTabDef =>
    tab.id === 'tasks' ? { ...tab, path: tasksPath } : tab

  const homeTab = NAV_TABS_POOL.find((t) => t.pinned === 'start')!
  const moreTab = NAV_TABS_POOL.find((t) => t.pinned === 'end')!

  let middleTabs: NavTabDef[]
  if (isCustomized && selectedIds) {
    // Order theo selection của user, lọc lại theo permission
    middleTabs = selectedIds
      .map((id) => NAV_TABS_POOL.find((t) => t.id === id))
      .filter((t): t is NavTabDef => !!t && !t.pinned && hasModuleAccess(t.modules))
      .map(withDynamicPath)
  } else {
    // Default: filter pool theo permission, cắt còn MAX-2
    middleTabs = NAV_TABS_POOL
      .filter((t) => !t.pinned)
      .filter((t) => hasModuleAccess(t.modules))
      .slice(0, MAX_NAV_TABS - 2)
      .map(withDynamicPath)
  }

  const effectiveNavItems: NavTabDef[] = [homeTab, ...middleTabs, moreTab]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    if (path === '/more') return location.pathname === '/more'
    if (path === tasksPath) {
      return location.pathname.startsWith('/my-tasks') || location.pathname.startsWith('/staff/housekeeping')
    }
    return location.pathname.startsWith(path)
  }

  const getBadgeCount = (badgeKey?: PendingCountKey): number => {
    if (!badgeKey) return 0
    if (badgeKey === 'tasks') return pendingTaskCount
    if (!pendingCounts) return 0
    return (pendingCounts as PendingCounts)[badgeKey as keyof PendingCounts] || 0
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-16">
        {effectiveNavItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          const badgeCount = getBadgeCount(item.badgeKey)

          return (
            <button
              key={item.id}
              onPointerDown={() => prefetchRoute(item.path)}
              onClick={() => navigate(item.path)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] transition-all',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {active && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-full" />
              )}
              <div className="relative">
                <Icon className={cn('h-5 w-5', active && 'fill-primary/20')} />
                {badgeCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
                  >
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </Badge>
                )}
              </div>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
