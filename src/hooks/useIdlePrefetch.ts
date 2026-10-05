import { useEffect } from 'react'
import { prefetchRoutesIdle } from '@/lib/route-prefetch'
import { useUserModulePermissions } from '@/hooks/useUserModulePermissions'

/**
 * Sau khi app mount, idle-prefetch các route phổ biến mà user CÓ quyền truy cập.
 * Giúp chuyển trang gần như tức thì cho các tab thường dùng.
 */
const ROUTE_BY_MODULE: Record<string, string[]> = {
  rooms: ['/rooms'],
  bookings: ['/bookings', '/guests'],
  inventory: ['/inventory', '/inventory/transactions'],
  items: ['/items'],
  laundry: ['/laundry'],
  maintenance_requests: ['/maintenance'],
  housekeeping_tasks: ['/my-tasks'],
  reports: ['/reports'],
}

// Route luôn prefetch (dùng cho mọi user)
const ALWAYS_PREFETCH = ['/', '/settings/profile']

export const useIdlePrefetch = () => {
  const { data: modulePermissions } = useUserModulePermissions()

  useEffect(() => {
    const paths = new Set<string>(ALWAYS_PREFETCH)

    if (Array.isArray(modulePermissions)) {
      const allowed = new Set(
        modulePermissions.filter((p) => p?.can_view).map((p) => p.module)
      )
      for (const [moduleId, routes] of Object.entries(ROUTE_BY_MODULE)) {
        if (allowed.has(moduleId)) {
          routes.forEach((r) => paths.add(r))
        }
      }
    }

    prefetchRoutesIdle(Array.from(paths))
  }, [modulePermissions])
}
