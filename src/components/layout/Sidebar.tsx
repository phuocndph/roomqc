import { useState, useEffect, useMemo, Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useUser } from '@/hooks/useUser'
import { useTenant } from '@/hooks/useTenant'
import { useUserModulePermissions } from '@/hooks/useUserModulePermissions'
import { usePendingCounts, type PendingCounts } from '@/hooks/usePendingCounts'
import { useUsageMode, type UsageMode } from '@/hooks/useUsageMode'
import { prefetchRoute } from '@/lib/route-prefetch'
import {
  LayoutDashboard,
  Package,
  Hotel,
  Wind,
  Warehouse,
  FileText,
  Settings,
  Users,
  Building2,
  ChevronDown,
  Plus,
  List,
  Grid,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  DollarSign,
  Wrench,
  AlertCircle,
  TrendingUp,
  Shield,
  FolderTree,
  Bell,
  Briefcase,
  Zap,
  Tag,
  ShoppingCart,
  GitCompare,
  BarChart3,
  Inbox,
  CalendarDays,
  CreditCard,
  KeyRound,
  MessageCircle,
  HelpCircle,
  PackageSearch,
  Brain,
  History,
  ScrollText,
  CalendarRange,
  ShieldCheck,
  RefreshCw,
  ClipboardList,
  Shirt,
  Calculator,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { AppRole } from '@/types/database.types'
import logoRoomQc from '@/assets/logo-roomqc.png'

type PendingCountKey = keyof PendingCounts

interface NavItem {
  titleKey: string
  href?: string
  icon: React.ElementType
  badge?: string
  badgeKey?: PendingCountKey
  roles?: AppRole[]
  minMode?: UsageMode
  group?: string
  children?: Omit<NavItem, 'children'>[]
}

// Navigation for all roles (operational details)
const navigation: NavItem[] = [
  {
    titleKey: 'dashboard',
    href: '/',
    icon: LayoutDashboard,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'homestay',
  },
  {
    titleKey: 'bookings',
    icon: CalendarDays,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'homestay',
    children: [
      { titleKey: 'bookings', href: '/bookings', icon: CalendarDays, group: 'Đặt phòng' },
      { titleKey: 'guests', href: '/guests', icon: Users, group: 'Khách' },
      { titleKey: 'guestInvoices', href: '/guest-invoices', icon: FileText, group: 'Khách' },
      { titleKey: 'lostFound', href: '/lost-found', icon: PackageSearch, group: 'Khách' },
      { titleKey: 'stayRegistrations', href: '/legal/stay-registrations', icon: ClipboardList, group: 'Tiếp nhận' },
      { titleKey: 'pendingCharges', href: '/reception/pending-charges', icon: DollarSign, group: 'Tiếp nhận' },
    ],
  },
  {
    titleKey: 'rooms',
    icon: Hotel,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'homestay',
    children: [
      { titleKey: 'housekeepingOverview', href: '/housekeeping', icon: List, group: 'Quản lý phòng' },
      { titleKey: 'roomsList', href: '/rooms', icon: List, group: 'Quản lý phòng' },
      { titleKey: 'roomStandards', href: '/rooms/standards', icon: Settings, minMode: 'standard', group: 'Quản lý phòng' },
    ],
  },
  {
    titleKey: 'inventory',
    icon: Warehouse,
    badgeKey: 'inventoryTotal',
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'standard',
    children: [
      { titleKey: 'inventoryDashboard', href: '/inventory', icon: LayoutDashboard, group: 'Kho' },
      { titleKey: 'items', href: '/items', icon: Package, group: 'Tài sản' },
      { titleKey: 'categories', href: '/items/categories', icon: FolderTree, group: 'Tài sản' },
      { titleKey: 'transactions', href: '/inventory/transactions', icon: History, group: 'Vận hành kho' },
      { titleKey: 'inbound', href: '/inventory/inbound', icon: Package, group: 'Vận hành kho' },
      { titleKey: 'outbound', href: '/inventory/outbound', icon: Package, group: 'Vận hành kho' },
      { titleKey: 'transfer', href: '/inventory?tab=operations&sub=transfer', icon: GitCompare, group: 'Vận hành kho' },
      { titleKey: 'adjustments', href: '/inventory/adjustments', icon: ClipboardCheck, group: 'Vận hành kho' },
      { titleKey: 'distributions', href: '/inventory/distributions', icon: Package, group: 'Vận hành kho' },
      { titleKey: 'reorder', href: '/inventory/reorder', icon: Package, group: 'Phân tích' },
      { titleKey: 'deadStock', href: '/inventory/dead-stock', icon: BarChart3, group: 'Phân tích' },
      { titleKey: 'consumptionAnalytics', href: '/inventory/analytics', icon: BarChart3, group: 'Phân tích' },
      { titleKey: 'supplements', href: '/inventory?tab=settings&sub=supplements', icon: Package, group: 'Thiết lập' },
      { titleKey: 'warehouses', href: '/settings/warehouses', icon: Warehouse, minMode: 'standard', roles: ['owner', 'hotel_manager'], group: 'Thiết lập' },
      { titleKey: 'vendorsList', href: '/vendors', icon: Building2, group: 'Mua hàng' },
      { titleKey: 'compareVendors', href: '/vendors/compare', icon: GitCompare, group: 'Mua hàng' },
      { titleKey: 'purchaseOrders', href: '/purchase-orders', icon: ShoppingCart, group: 'Mua hàng' },
    ],
  },
  {
    titleKey: 'laundry',
    icon: Wind,
    badgeKey: 'laundryTotal',
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'standard',
    children: [
      { titleKey: 'laundryOverview', href: '/laundry', icon: LayoutDashboard, group: 'Vận hành' },
      { titleKey: 'laundryRequests', href: '/laundry?tab=requests', icon: Inbox, badgeKey: 'laundryRequests', group: 'Vận hành' },
      { titleKey: 'laundryBatches', href: '/laundry/batches', icon: Package, group: 'Vận hành' },
      { titleKey: 'laundryCompensation', href: '/laundry/compensation', icon: AlertCircle, group: 'Vận hành' },
      { titleKey: 'laundryVendors', href: '/laundry/vendors', icon: Building2, group: 'Nhà cung cấp' },
    ],
  },
  {
    titleKey: 'maintenance',
    icon: Wrench,
    badgeKey: 'maintenanceTotal',
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'standard',
    children: [
      { titleKey: 'maintenanceDashboard', href: '/maintenance', icon: LayoutDashboard },
      { titleKey: 'maintenanceRequests', href: '/maintenance/requests', icon: AlertCircle, badgeKey: 'maintenance' },
      { titleKey: 'recurringIssues', href: '/maintenance/recurring-issues', icon: TrendingUp },
    ],
  },
  {
    titleKey: 'staffManagement',
    icon: Users,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'standard',
    children: [
      { titleKey: 'staffList', href: '/staff', icon: Users, roles: ['owner', 'hotel_manager', 'department_manager'] },
      { titleKey: 'shiftHandoverReport', href: '/staff/shift-handover', icon: FileText, roles: ['owner', 'hotel_manager', 'department_manager'] },
    ],
  },
  {
    titleKey: 'reports',
    icon: BarChart3,
    roles: ['owner', 'hotel_manager', 'department_manager'],
    minMode: 'standard',
    children: [
      { titleKey: 'dailyReport', href: '/reports/daily', icon: CalendarDays },
      { titleKey: 'reportsDashboard', href: '/reports', icon: LayoutDashboard },
      { titleKey: 'financeReport', href: '/reports/finance', icon: TrendingUp },
      { titleKey: 'operationsReport', href: '/reports/operations', icon: Hotel },
      { titleKey: 'housekeepingReport', href: '/reports/housekeeping', icon: Wind },
      { titleKey: 'inventoryReport', href: '/reports/inventory', icon: Warehouse },
    ],
  },
  {
    titleKey: 'chat',
    href: '/chat',
    icon: MessageCircle,
    badgeKey: 'chatUnread' as PendingCountKey,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'homestay',
  },
  {
    titleKey: 'superAdmin',
    icon: Shield,
    roles: ['super_admin'],
    children: [
      { titleKey: 'adminDashboard', href: '/super-admin', icon: LayoutDashboard, group: 'Tổng quan' },
      { titleKey: 'tenants', href: '/super-admin/tenants', icon: Users, group: 'Tổng quan' },
      { titleKey: 'payments', href: '/super-admin/payments', icon: CreditCard, group: 'Tài chính' },
      { titleKey: 'promoCodes', href: '/super-admin/promo-codes', icon: Tag, group: 'Tài chính' },
      { titleKey: 'pricingPlans', href: '/super-admin/pricing', icon: DollarSign, group: 'Tài chính' },
      { titleKey: 'campaigns', href: '/super-admin/campaigns', icon: TrendingUp, group: 'Marketing' },
      { titleKey: 'reminders', href: '/super-admin/reminders', icon: Bell, group: 'Marketing' },
    ],
  },
  {
    titleKey: 'settings',
    icon: Settings,
    roles: ['owner', 'hotel_manager', 'department_manager', 'staff'],
    minMode: 'homestay',
    children: [
      // Tài khoản
      { titleKey: 'usersPermissions', href: '/settings/users', icon: Users, minMode: 'standard', group: 'Tài khoản' },
      { titleKey: 'changePassword', href: '/settings/change-password', icon: KeyRound, group: 'Tài khoản' },

      // Khách sạn & Pháp lý
      { titleKey: 'hotelsSettings', href: '/settings/hotels', icon: Building2, group: 'Khách sạn & Pháp lý' },
      { titleKey: 'hotelPolicy', href: '/settings/hotel-policy', icon: ScrollText, minMode: 'standard', group: 'Khách sạn & Pháp lý' },
      { titleKey: 'bcaConfig', href: '/settings/legal/stay-registration', icon: ShieldCheck, group: 'Khách sạn & Pháp lý' },

      // Thiết lập hệ thống
      { titleKey: 'categories', href: '/settings/categories', icon: Tag, group: 'Thiết lập hệ thống' },
      { titleKey: 'fixedCosts', href: '/settings/fixed-costs', icon: Calculator, minMode: 'standard', roles: ['owner'], group: 'Thiết lập hệ thống' },
      { titleKey: 'businessConfig', href: '/settings/business', icon: Briefcase, minMode: 'standard', group: 'Thiết lập hệ thống' },
      { titleKey: 'roomCheckSettings', href: '/settings/room-check', icon: ClipboardCheck, group: 'Thiết lập hệ thống' },
      { titleKey: 'automation', href: '/settings/workflows', icon: Zap, minMode: 'full', group: 'Thiết lập hệ thống' },

      // Bảng giá & Phụ thu
      { titleKey: 'pricingHub', href: '/settings/pricing', icon: DollarSign, minMode: 'standard', group: 'Bảng giá & Phụ thu' },

      // Thông báo
      { titleKey: 'notifications', href: '/settings/notifications', icon: Bell, group: 'Thông báo' },
      { titleKey: 'telegram', href: '/settings/telegram', icon: MessageCircle, group: 'Thông báo' },

      // Thanh toán & Gói
      { titleKey: 'subscription', href: '/settings/subscription', icon: CreditCard, group: 'Thanh toán & Gói' },
      { titleKey: 'usage', href: '/settings/usage', icon: BarChart3, minMode: 'standard', group: 'Thanh toán & Gói' },
      { titleKey: 'sepayReconciliation', href: '/finance/reconciliation', icon: RefreshCw, roles: ['super_admin', 'owner'], group: 'Thanh toán & Gói' },

      // Hệ thống
      { titleKey: 'generalSettings', href: '/settings/general', icon: Settings, group: 'Hệ thống' },
      { titleKey: 'aiSettings', href: '/settings/ai', icon: Brain, group: 'Hệ thống' },
      { titleKey: 'auditLog', href: '/settings/audit-log', icon: History, group: 'Hệ thống' },
    ],
  },

]

// Map navigation titles to permission modules
const NAVIGATION_MODULE_MAP: Record<string, string> = {
  'dashboard': 'dashboard',
  'inventory': 'inventory,items,vendors,purchase_orders',
  'rooms': 'rooms',
  'bookings': 'bookings',
  'laundry': 'laundry',
  'maintenance': 'maintenance',
  'hotels': 'hotels',
  'users': 'users',
  'settings': 'settings',
  'reports': 'reports',
  'categories': 'settings',
  'fixedCosts': 'settings',
}

// Map child item keywords to required actions
const getRequiredAction = (childTitleKey: string): 'view' | 'create' | null => {
  const lowerKey = childTitleKey.toLowerCase()
  if (lowerKey.includes('add') || lowerKey.includes('new')) return 'create'
  if (lowerKey.includes('list') || lowerKey.includes('overview') || lowerKey.includes('dashboard')) return 'view'
  return 'view'
}

export const Sidebar = () => {
  const { t } = useTranslation('navigation')
  const location = useLocation()
  const { user, role, isLoading: userLoading } = useUser()
  const { tenant, isLoading: tenantLoading } = useTenant()
  const { data: modulePermissions, isLoading: permissionsLoading } = useUserModulePermissions()
  const { data: pendingCounts } = usePendingCounts()
  const { hasMode } = useUsageMode()
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const expanded: string[] = []
    navigation.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(
          (child) => child.href && location.pathname.startsWith(child.href)
        )
        if (hasActiveChild) {
          expanded.push(item.titleKey)
        }
      }
    })
    return expanded
  })

  // Auto-open the group containing the active route, but DO NOT collapse
  // other user-expanded groups (less aggressive UX).
  useEffect(() => {
    const matched = navigation.find(
      (item) =>
        item.children?.some(
          (child) => child.href && location.pathname.startsWith(child.href)
        )
    )
    if (matched) {
      setExpandedItems((prev) =>
        prev.includes(matched.titleKey) ? prev : [...prev, matched.titleKey]
      )
    }
  }, [location.pathname])

  // Only block on user auth; tenant + permissions load in background to avoid full-skeleton flash.
  const isLoading = userLoading

  // Check if user has access to a module
  const hasModuleAccess = (navigationTitleKey: string): boolean => {
    if (role === 'super_admin' || role === 'owner') return true
    // While permissions are loading, optimistically show items to avoid nav flicker
    if (permissionsLoading) return true

    const moduleCode = NAVIGATION_MODULE_MAP[navigationTitleKey]
    if (!moduleCode) return true

    const modules = moduleCode.split(',')
    return modules.some(module => {
      const permission = modulePermissions?.find(p => p.module === module)
      if (!permission) return false
      return permission.can_view || permission.can_create || permission.can_update || permission.can_delete
    })
  }

  // Check if user has access to a child item
  const hasChildAccess = (parentTitleKey: string, childTitleKey: string): boolean => {
    if (role === 'super_admin' || role === 'owner') return true
    if (permissionsLoading) return true
    
    const moduleCode = NAVIGATION_MODULE_MAP[parentTitleKey]
    if (!moduleCode) return true
    
    const modules = moduleCode.split(',')
    
    return modules.some(module => {
      const permission = modulePermissions?.find(p => p.module === module)
      if (!permission) return false
      
      const requiredAction = getRequiredAction(childTitleKey)
      if (requiredAction === 'create') return permission.can_create
      if (requiredAction === 'view') return permission.can_view
      
      return permission.can_view
    })
  }

  // Select navigation based on role
  const effectiveNavigation = navigation

  // Filter navigation based on permissions and usage mode
  const filteredNavigation = effectiveNavigation.filter((item) => {
    if (item.roles && !item.roles.includes(role || 'staff')) return false
    if (item.minMode && !hasMode(item.minMode)) return false
    return hasModuleAccess(item.titleKey)
  }).map((item) => {
    if (item.children) {
      return {
        ...item,
        children: item.children.filter(child => {
          // Child entries can be narrower than their parent (for example,
          // staff management is visible to staff, but editing the staff list
          // is restricted to managers). Enforce that constraint before the
          // module/action permission check so the navigation matches the
          // route-level authorization rules.
          if (child.roles && !child.roles.includes(role || 'staff')) return false
          if ((child as NavItem).minMode && !hasMode((child as NavItem).minMode!)) return false
          return hasChildAccess(item.titleKey, child.titleKey)
        })
      }
    }
    return item
  }).filter((item) => {
    if (item.children !== undefined && item.children.length === 0 && !item.href) {
      return false
    }
    return true
  })

  const toggleExpanded = (titleKey: string) => {
    setExpandedItems((prev) =>
      prev.includes(titleKey)
        ? prev.filter((k) => k !== titleKey)
        : [...prev, titleKey]
    )
  }

  const normalizePath = (path: string) => path.replace(/\/$/, '')
  const currentPath = normalizePath(location.pathname)
  const currentQuery = new URLSearchParams(location.search)

  // Several modules keep their active view in query parameters while the
  // sidebar links use dedicated legacy paths. Resolve those views to the
  // same canonical link so the navigation never highlights the wrong item.
  const canonicalNavPath = (() => {
    if (currentPath === '/inventory' && currentQuery.get('tab') === 'operations') {
      const sub = currentQuery.get('sub')
      if (sub === 'transactions') return '/inventory/transactions'
      if (sub === 'inbound') return '/inventory/inbound'
      if (sub === 'outbound') return '/inventory/outbound'
      if (sub === 'adjustments') return '/inventory/adjustments'
      if (sub === 'distributions') return '/inventory/distributions'
      if (sub === 'reorder') return '/inventory/reorder'
    }
    if (currentPath === '/inventory' && currentQuery.get('tab') === 'analytics') {
      const sub = currentQuery.get('sub')
      if (sub === 'dead-stock') return '/inventory/dead-stock'
      if (sub === 'consumption') return '/inventory/analytics'
    }
    if (currentPath === '/inventory' && currentQuery.get('tab') === 'assets') {
      const sub = currentQuery.get('sub')
      if (sub === 'items') return '/items'
      if (sub === 'categories') return '/items/categories'
    }
    if (
      currentPath === '/inventory' &&
      currentQuery.get('tab') === 'settings' &&
      currentQuery.get('sub') === 'supplements'
    ) {
      return '/inventory?tab=settings&sub=supplements'
    }
    if (currentPath === '/laundry' && currentQuery.get('tab') === 'requests') {
      return '/laundry?tab=requests'
    }
    return `${currentPath}${location.search}`
  })()

  if (isLoading) {
    return (
      <div className="flex w-64 flex-col border-r bg-card">
        <div className="flex h-16 items-center gap-3 border-b px-6">
          <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-5 w-5 rounded bg-muted animate-pulse" />
              <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-64 flex-col border-r bg-card">
      {/* Logo & Tenant Info */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <img
          src={tenant?.logo_url || logoRoomQc}
          alt={tenant?.name || 'RoomQc'}
          className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
        />
        <div className="flex-1 overflow-hidden">
          <p className="truncate font-bold text-[15px]" title={tenant?.name || 'Hotel Management'}>
            {tenant?.name || 'Hotel Management'}
          </p>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {(() => {
                const planMap: Record<string, string> = { basic: 'Cơ bản', standard: 'Tiêu chuẩn', premium: 'Cao cấp', trial: 'Dùng thử' }
                return planMap[tenant?.subscription_plan || 'trial'] || tenant?.subscription_plan || 'Dùng thử'
              })()}
            </Badge>
            <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
              tenant?.subscription_status === 'active' ? 'bg-green-600' :
              tenant?.subscription_status === 'expired' ? 'bg-red-600' : 'bg-amber-600'
            }`} />
            {tenant?.registered_rooms != null && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">{tenant.registered_rooms} phòng</span>
            )}
          </div>
          {(() => {
            if (!tenant?.subscription_end_date) return null
            const endDate = new Date(tenant.subscription_end_date)
            const now = new Date()
            const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            if (daysLeft > 30) return null
            return (
              <p className="text-xs text-amber-600 mt-0.5">
                Hết hạn: {endDate.toLocaleDateString('vi-VN')}
              </p>
            )
          })()}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {filteredNavigation.map((item) => {
          const Icon = item.icon
          const isExpanded = expandedItems.includes(item.titleKey)
          const hasChildren = item.children && item.children.length > 0
          const title = t(item.titleKey)

          if (hasChildren) {
            const hasActiveChild = item.children!.some(
              (child) => child.href && (
                canonicalNavPath === normalizePath(child.href) ||
                canonicalNavPath === child.href ||
                (child.href.indexOf('?') === -1 && currentPath.startsWith(normalizePath(child.href)))
              )
            )

            const parentBadgeCount = item.badgeKey && pendingCounts ? pendingCounts[item.badgeKey] : 0

            // Khi hover parent → prefetch route con đầu tiên (thường là dashboard của module)
            const firstChildHref = item.children!.find((c) => c.href)?.href
            const handleParentPrefetch = firstChildHref
              ? () => prefetchRoute(firstChildHref)
              : undefined

            return (
              <div key={item.titleKey} className="space-y-1">
                <button
                  onClick={() => toggleExpanded(item.titleKey)}
                  onMouseEnter={handleParentPrefetch}
                  onPointerDown={handleParentPrefetch}
                  onFocus={handleParentPrefetch}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors',
                    isExpanded
                      ? 'bg-primary text-primary-foreground'
                      : hasActiveChild
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1 text-left">{title}</span>
                  {!isExpanded && parentBadgeCount > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                      {parentBadgeCount > 99 ? '99+' : parentBadgeCount}
                    </Badge>
                  )}
                  {item.badge && <Badge variant="secondary">{item.badge}</Badge>}
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform duration-300",
                    isExpanded ? "rotate-0" : "-rotate-90"
                  )} />
                </button>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-in-out [will-change:grid-template-rows]",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="ml-4 space-y-1 border-l border-border pl-4 py-1">
                      {(() => {
                        let lastGroup = ''
                        return item.children!.map((child) => {
                          const ChildIcon = child.icon
                              const isChildActive = child.href && (
                                canonicalNavPath === normalizePath(child.href) ||
                                canonicalNavPath === child.href
                              )
                          const childTitle = t(child.titleKey)
                          const childBadgeCount = child.badgeKey && pendingCounts ? pendingCounts[child.badgeKey] : 0
                          const showGroup = child.group && child.group !== lastGroup
                          if (child.group) lastGroup = child.group

                          return (
                            <Fragment key={child.titleKey}>
                              {showGroup && (
                                <div className="pt-4 pb-1 px-3 first:pt-1">
                                  <span className="text-xs font-bold text-foreground/60 tracking-wide">
                                    {child.group}
                                  </span>
                                </div>
                              )}
                              <Link
                                to={child.href || '#'}
                                onMouseEnter={() => child.href && prefetchRoute(child.href)}
                                onPointerDown={() => child.href && prefetchRoute(child.href)}
                                onFocus={() => child.href && prefetchRoute(child.href)}
                                className={cn(
                                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                                  isChildActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                )}
                              >
                                <ChildIcon className="h-4 w-4 flex-shrink-0" />
                                <span className="flex-1">{childTitle}</span>
                                {childBadgeCount > 0 && (
                                  <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-xs">
                                    {childBadgeCount > 99 ? '99+' : childBadgeCount}
                                  </Badge>
                                )}
                                {child.badge && (
                                  <Badge variant="secondary" className="ml-auto">
                                    {child.badge}
                                  </Badge>
                                )}
                              </Link>
                            </Fragment>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          const isActive = item.href && currentPath === normalizePath(item.href)

          return (
            <Link
              key={item.titleKey}
              to={item.href || '#'}
              onMouseEnter={() => item.href && prefetchRoute(item.href)}
              onPointerDown={() => item.href && prefetchRoute(item.href)}
              onFocus={() => item.href && prefetchRoute(item.href)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">{title}</span>
              {item.badge && <Badge variant="secondary">{item.badge}</Badge>}
            </Link>
          )
        })}
      </nav>

      {/* Help Link */}
      <div className="px-4 pb-1">
        <Link
          to="/help"
          onMouseEnter={() => prefetchRoute('/help')}
          onFocus={() => prefetchRoute('/help')}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold transition-colors',
            currentPath === '/help'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <HelpCircle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1">Hướng dẫn sử dụng</span>
        </Link>
      </div>

      {/* User Info */}
      <div className="border-t p-4">
        <Link
          to="/settings/profile"
          onMouseEnter={() => prefetchRoute('/settings/profile')}
          onFocus={() => prefetchRoute('/settings/profile')}
          className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent transition-colors"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={user?.avatar_url || ''} alt={user?.full_name || 'User'} />
            <AvatarFallback>
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-semibold text-sm">{user?.full_name || 'User'}</p>
            <p className="truncate text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        </Link>
      </div>
    </div>
  )
}
