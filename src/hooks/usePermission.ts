import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from './useUser'
import { isAdminUser } from '@/lib/userAccess'

export type PermissionModule = 
  | 'dashboard'
  | 'items'
  | 'rooms'
  | 'bookings'
  | 'laundry'
  | 'inventory'
  | 'reports'
  | 'vendors'
  | 'maintenance'
  | 'settings'
  | 'users'
  | 'subscription'
  | 'hotels'
  | 'purchase_orders'

export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve' | 'assign' | 'manage'

// All available modules for permission management UI
export const ALL_MODULES: { code: PermissionModule; name: string }[] = [
  { code: 'dashboard', name: 'Dashboard' },
  { code: 'inventory', name: 'Kho hàng' },
  { code: 'items', name: 'Tài sản' },
  { code: 'rooms', name: 'Phòng' },
  { code: 'bookings', name: 'Đặt phòng' },
  { code: 'laundry', name: 'Giặt là' },
  { code: 'maintenance', name: 'Bảo trì' },
  { code: 'vendors', name: 'Nhà cung cấp' },
  { code: 'purchase_orders', name: 'Đơn mua hàng' },
  { code: 'hotels', name: 'Khách sạn' },
  { code: 'users', name: 'Người dùng' },
  { code: 'reports', name: 'Báo cáo' },
  { code: 'settings', name: 'Cài đặt' },
]

// All available actions for permission management UI
export const ALL_ACTIONS: { code: PermissionAction; name: string }[] = [
  { code: 'view', name: 'Xem' },
  { code: 'create', name: 'Tạo mới' },
  { code: 'update', name: 'Chỉnh sửa' },
  { code: 'delete', name: 'Xóa' },
  { code: 'export', name: 'Xuất dữ liệu' },
  { code: 'approve', name: 'Phê duyệt' },
  { code: 'assign', name: 'Phân công' },
  { code: 'manage', name: 'Quản lý' },
]

export function usePermissions() {
  const { user, isLoading: userLoading } = useUser()
  
  // Using unified userAccess utility for consistent admin check
  const isAdmin = isAdminUser(user)

  const can = (module: PermissionModule, action: PermissionAction): boolean => {
    if (isAdmin) return true
    return false // Will be checked via useHasPermission for individual checks
  }

  const canAny = (module: PermissionModule): boolean => {
    if (isAdmin) return true
    return false
  }

  return {
    permissions: [],
    can,
    canAny,
    isLoading: userLoading,
    isAdmin,
  }
}

export function useHasPermission(module: PermissionModule, action: PermissionAction) {
  const { user, isLoading: userLoading } = useUser()
  
  // Using unified userAccess utility for consistent admin check
  const isAdmin = isAdminUser(user)
  
  const { data: hasPermission, isLoading: permLoading } = useQuery({
    queryKey: ['has-permission', user?.id, module, action],
    queryFn: async () => {
      if (!user?.id) return false
      
      // Admin bypass - return true immediately
      if (isAdmin) return true
      
      const { data, error } = await supabase.rpc('has_user_permission', {
        p_user_id: user.id,
        p_module: module,
        p_action: action,
      })
      
      if (error) {
        console.error('Permission check error:', error)
        return false
      }
      
      return data as boolean
    },
    enabled: !!user?.id && !isAdmin, // Skip query for admins
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
  
  // While loading user, show loading state
  if (userLoading) {
    return { hasPermission: false, isLoading: true }
  }
  
  // Admin always has permission - no need to wait for query
  if (isAdmin) {
    return { hasPermission: true, isLoading: false }
  }
  
  return { 
    hasPermission: hasPermission ?? false, 
    isLoading: permLoading 
  }
}
