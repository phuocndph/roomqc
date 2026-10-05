import { useMemo } from 'react'
import { useUserModulePermissions } from './useUserModulePermissions'
import { useUser } from './useUser'

// Thứ tự ưu tiên các route
const ROUTE_PRIORITY: { module: string; path: string; label: string }[] = [
  { module: 'dashboard', path: '/', label: 'Dashboard' },
  { module: 'items', path: '/items', label: 'Vật tư' },
  { module: 'rooms', path: '/rooms', label: 'Phòng' },
  { module: 'inventory', path: '/inventory', label: 'Kho' },
  { module: 'laundry', path: '/laundry', label: 'Giặt là' },
  { module: 'maintenance', path: '/maintenance', label: 'Bảo trì' },
  { module: 'reports', path: '/reports', label: 'Báo cáo' },
  { module: 'hotels', path: '/hotels', label: 'Khách sạn' },
  { module: 'users', path: '/settings/users', label: 'Nhân viên' },
  { module: 'vendors', path: '/vendors', label: 'Nhà cung cấp' },
]

export function useFirstAccessibleRoute() {
  const { user, hasAnyRole, isLoading: isUserLoading } = useUser()
  const { data: permissions, isLoading: isPermissionsLoading } = useUserModulePermissions()

  // Đợi cả user VÀ permissions load xong
  const isLoading = isUserLoading || isPermissionsLoading

  const firstAccessibleRoute = useMemo(() => {
    // Nếu đang loading, return null (chờ tiếp)
    if (isUserLoading || isPermissionsLoading) {
      return null
    }

    // Super admin và owner có quyền truy cập tất cả
    if (hasAnyRole(['super_admin', 'owner'])) {
      return '/'
    }

    // Đã hết loading mà không có permissions → coi như không có quyền,
    // tránh kẹt vô hạn ở /auth/callback. RoleGuard sẽ xử lý tiếp.


    const list = permissions ?? []

    // Tìm route đầu tiên user có quyền view hoặc có quyền khác (update/create)
    for (const route of ROUTE_PRIORITY) {
      const permission = list.find(p => p.module === route.module)
      // Cho phép truy cập nếu có bất kỳ quyền nào trong module
      if (permission && (permission.can_view || permission.can_update || permission.can_create)) {
        return route.path
      }
    }

    // Không có quyền gì → unauthorized
    return '/unauthorized'
  }, [permissions, hasAnyRole, isUserLoading, isPermissionsLoading])

  const hasAnyPermission = useMemo(() => {
    if (hasAnyRole(['super_admin', 'owner'])) return true
    if (!permissions || permissions.length === 0) return false
    // Có quyền nếu có bất kỳ quyền nào (view, update, create)
    return permissions.some(p => p.can_view || p.can_update || p.can_create)
  }, [permissions, hasAnyRole])

  return {
    firstAccessibleRoute,
    hasAnyPermission,
    isLoading,
    permissions,
  }
}
