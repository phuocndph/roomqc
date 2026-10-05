/**
 * Route prefetch — kích hoạt khi user hover/focus/pointerdown link trong sidebar,
 * hoặc chủ động sau khi app idle.
 *
 * Mỗi route chỉ prefetch 1 lần, browser tự dedupe network nếu trùng chunk.
 *
 * Cách dùng:
 *   <Link onPointerDown={() => prefetchRoute('/inventory')} ... />
 *
 * Lợi ích: Khi user click, chunk thường đã ở cache → chuyển trang gần như tức thì.
 */

import { prefetchRouteData } from './route-data-prefetch'

// Map từ pathname prefix → loader (giống lazy() trong App.tsx).
// Dùng prefix match: '/rooms/123' khớp '/rooms'.
const loaders: Record<string, () => Promise<unknown>> = {
  // Dashboard
  '/': () => import('@/pages/Dashboard'),

  // Inventory
  '/inventory/transactions': () => import('@/pages/inventory/TransactionListPage'),
  '/inventory/inbound': () => import('@/pages/inventory/InboundPage'),
  '/inventory/outbound': () => import('@/pages/inventory/OutboundPage'),
  '/inventory/transfer': () => import('@/pages/inventory/TransferPage'),
  '/inventory/adjustments': () => import('@/pages/inventory/AdjustmentListPage'),
  '/inventory/distributions': () => import('@/pages/inventory/DistributionOrdersPage'),
  '/inventory/reorder': () => import('@/pages/inventory/ReorderSuggestionsPage'),
  '/inventory/dead-stock': () => import('@/pages/inventory/DeadStockPage'),
  '/inventory/analytics': () => import('@/pages/inventory/InventoryAnalyticsPage'),
  '/inventory': () => import('@/pages/inventory/InventoryDashboardPage'),

  // Items
  '/items/categories': () => import('@/pages/items/CategoriesPage'),
  '/items/new': () => import('@/pages/items/ItemFormPage'),
  '/items': () => import('@/pages/items/ItemsPage'),

  // Supplements
  '/supplements': () => import('@/pages/supplements/SupplementsPage'),

  // Rooms
  '/rooms/standards': () => import('@/pages/rooms/RoomStandardsPage'),
  '/rooms/new': () => import('@/pages/rooms/RoomFormPage'),
  '/rooms': () => import('@/pages/rooms/RoomsPage'),

  // Bookings & Guests
  '/bookings': () => import('@/pages/bookings/BookingsPage'),
  '/guests': () => import('@/pages/guests/GuestsPage'),
  '/guest-invoices': () => import('@/pages/invoices/GuestInvoicesPage'),
  '/lost-found': () => import('@/pages/lost-found/LostFoundPage'),

  // My tasks (mobile bottom nav)
  '/my-tasks': () => import('@/pages/MyTasksPage'),

  // Laundry
  '/laundry/batches/new': () => import('@/pages/laundry/CreateBatchPage'),
  '/laundry/batches': () => import('@/pages/laundry/LaundryBatchesPage'),
  '/laundry/compensation': () => import('@/pages/laundry/LaundryCompensationPage'),
  '/laundry/linen-batches/new': () => import('@/pages/laundry/NewLinenBatchPage'),
  '/laundry/vendors/new': () => import('@/pages/laundry/VendorFormPage'),
  '/laundry/vendors': () => import('@/pages/laundry/VendorListPage'),
  '/laundry': () => import('@/pages/laundry/LaundryDashboardPage'),

  // Vendors
  '/vendors/compare': () => import('@/pages/vendors/VendorComparisonPage'),
  '/vendors/new': () => import('@/pages/vendors/VendorFormPage'),
  '/vendors': () => import('@/pages/vendors/VendorListPage'),
  '/purchase-orders/new': () => import('@/pages/purchase-orders/POFormPage'),
  '/purchase-orders': () => import('@/pages/purchase-orders/POListPage'),

  // Maintenance
  '/maintenance/requests': () => import('@/pages/maintenance/MaintenanceRequestList'),
  '/maintenance/recurring-issues': () => import('@/pages/maintenance/RecurringIssuesPage'),
  '/maintenance': () => import('@/pages/maintenance/MaintenanceDashboard'),

  // Staff
  '/staff/shift-handover': () => import('@/pages/staff/ShiftHandoverPage'),
  '/staff': () => import('@/pages/staff/StaffManagementPage'),

  // Reports (consolidated hubs)
  '/reports/finance': () => import('@/pages/reports/hub/FinanceHubPage'),
  '/reports/operations': () => import('@/pages/reports/hub/OperationsHubPage'),
  '/reports/housekeeping': () => import('@/pages/reports/hub/HousekeepingHubPage'),
  '/reports/inventory': () => import('@/pages/reports/hub/InventoryHubPage'),
  '/reports': () => import('@/pages/reports/hub/OverviewHubPage'),

  // Settings
  '/settings/general': () => import('@/pages/settings/GeneralSettingsPage'),
  '/settings/hotels': () => import('@/pages/settings/HotelsManagementPage'),
  '/settings/users': () => import('@/pages/users/UsersPage'),
  '/settings/change-password': () => import('@/pages/settings/ChangePasswordPage'),
  '/settings/subscription': () => import('@/pages/settings/SubscriptionPage'),
  '/settings/usage': () => import('@/pages/settings/UsageDashboardPage'),
  '/settings/notifications': () => import('@/pages/settings/NotificationSettingsPage'),
  '/settings/telegram': () => import('@/pages/settings/TelegramSettingsPage'),
  '/settings/business': () => import('@/pages/settings/BusinessConfigurationPage'),
  '/settings/room-check': () => import('@/pages/settings/RoomCheckSettingsPage'),
  '/settings/pricing-rules': () => import('@/pages/settings/PricingRulesPage'),
  '/settings/workflows': () => import('@/pages/settings/WorkflowsPage'),
  '/settings/ai': () => import('@/pages/settings/AISettingsPage'),
  '/settings/audit-log': () => import('@/pages/settings/AuditLogPage'),
  
  '/settings/hotel-policy': () => import('@/pages/settings/HotelPolicyPage'),
  '/settings/warehouses': () => import('@/pages/settings/WarehouseListPage'),
  '/settings/profile': () => import('@/pages/profile/ProfilePage'),

  // Help
  '/help': () => import('@/pages/HelpPage'),

  // Super Admin (canonical: /super-admin/*)
  '/super-admin': () => import('@/pages/admin/SuperAdminDashboard'),
  '/super-admin/tenants': () => import('@/pages/admin/TenantsPage'),
  '/super-admin/approval': () => import('@/pages/admin/TenantApprovalPage'),
  '/super-admin/promo-codes': () => import('@/pages/admin/PromoCodesPage'),
  '/super-admin/campaigns': () => import('@/pages/admin/MarketingCampaignsPage'),
  '/super-admin/reminders': () => import('@/pages/admin/RenewalRemindersPage'),
  '/super-admin/pricing': () => import('@/pages/admin/PricingPlansPage'),
  '/super-admin/payments': () => import('@/pages/admin/PaymentSettingsPage'),
  '/super-admin/analytics': () => import('@/pages/admin/AnalyticsPage'),
  '/super-admin/settings': () => import('@/pages/admin/SuperAdminSettingsPage'),
  '/super-admin/announcements': () => import('@/pages/admin/AnnouncementsPage'),
}

const prefetched = new Set<string>()

const findLoader = (path: string): (() => Promise<unknown>) | null => {
  const clean = path.split('?')[0].split('#')[0]
  if (loaders[clean]) return loaders[clean]
  const sorted = Object.keys(loaders).sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    if (key === '/') continue
    if (clean === key || clean.startsWith(key + '/')) return loaders[key]
  }
  return null
}

const isSlowConnection = () => {
  if (typeof navigator === 'undefined') return false
  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string }
  }).connection
  if (!conn) return false
  if (conn.saveData) return true
  if (conn.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true
  return false
}

/**
 * Prefetch chunk cho một route. An toàn để gọi nhiều lần.
 * Bỏ qua trên kết nối chậm (save-data hoặc 2g/slow-2g).
 */
export const prefetchRoute = (path: string) => {
  if (typeof window === 'undefined') return

  // Data prefetch (React Query) — chạy độc lập với chunk prefetch, tự throttle.
  // Module này đã được dùng bởi MainLayout nên import tĩnh tránh chunk warning.
  void prefetchRouteData(path)

  if (prefetched.has(path)) return
  if (isSlowConnection()) return

  const loader = findLoader(path)
  if (!loader) return

  prefetched.add(path)
  loader().catch(() => prefetched.delete(path))
}

/**
 * Prefetch danh sách route khi browser idle. Dùng sau khi app mount để
 * "âm thầm" kéo các chunk người dùng nhiều khả năng sẽ click tới.
 */
export const prefetchRoutesIdle = (paths: string[]) => {
  if (typeof window === 'undefined') return
  if (isSlowConnection()) return

  type IdleCallback = (cb: () => void, opts?: { timeout: number }) => number
  const ric: IdleCallback =
    (window as Window & { requestIdleCallback?: IdleCallback }).requestIdleCallback ??
    ((cb: () => void) => window.setTimeout(cb, 200))

  // Stagger để không nghẽn main thread / network đồng thời.
  paths.forEach((path, i) => {
    ric(() => {
      window.setTimeout(() => prefetchRoute(path), i * 80)
    }, { timeout: 2000 })
  })
}
