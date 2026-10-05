import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { useUser } from './useUser'
import { getFriendlyError } from '@/lib/errorMessage'

export interface UserPermission {
  id: string
  user_id: string
  tenant_id: string
  module: string
  action: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface PermissionSummary {
  module: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_export: boolean
  can_approve: boolean
  can_assign: boolean
  can_manage: boolean
}

export interface UserPermissionDetail {
  code: string
  name: string
  module: string
  action: string
  source: 'role' | 'user'
}

export const MODULES = [
  { code: 'dashboard', name: 'Trang chủ', icon: 'LayoutDashboard' },
  { code: 'items', name: 'Tài sản', icon: 'Package' },
  { code: 'rooms', name: 'Phòng', icon: 'DoorClosed' },
  { code: 'bookings', name: 'Đặt phòng', icon: 'CalendarDays' },
  { code: 'laundry', name: 'Giặt là', icon: 'Shirt' },
  { code: 'inventory', name: 'Kho', icon: 'Warehouse' },
  { code: 'maintenance', name: 'Bảo trì', icon: 'Wrench' },
  { code: 'vendors', name: 'Nhà cung cấp', icon: 'Store' },
  { code: 'purchase_orders', name: 'Đơn mua hàng', icon: 'ShoppingCart' },
  { code: 'reports', name: 'Báo cáo', icon: 'FileText' },
  { code: 'users', name: 'Người dùng', icon: 'Users' },
  { code: 'settings', name: 'Cài đặt', icon: 'Settings' },
  { code: 'hotels', name: 'Khách sạn', icon: 'Building2' },
]

export const ACTIONS = [
  { code: 'view', name: 'Xem', color: 'blue' },
  { code: 'create', name: 'Tạo mới', color: 'green' },
  { code: 'update', name: 'Chỉnh sửa', color: 'yellow' },
  { code: 'delete', name: 'Xóa', color: 'red' },
  { code: 'export', name: 'Xuất dữ liệu', color: 'purple' },
  { code: 'approve', name: 'Phê duyệt', color: 'indigo' },
  { code: 'assign', name: 'Phân công', color: 'cyan' },
  { code: 'manage', name: 'Quản lý', color: 'orange' },
]

// Define which actions are applicable for each module
export const MODULE_ACTIONS: Record<string, string[]> = {
  dashboard: ['view'],
  items: ['view', 'create', 'update', 'delete', 'export'],
  rooms: ['view', 'create', 'update', 'delete'],
  bookings: ['view', 'create', 'update', 'delete', 'export'],
  laundry: ['view', 'create', 'update', 'delete', 'export', 'approve'],
  inventory: ['view', 'create', 'update', 'delete', 'export', 'approve'],
  maintenance: ['view', 'create', 'update', 'delete', 'assign', 'approve'],
  vendors: ['view', 'create', 'update', 'delete'],
  purchase_orders: ['view', 'create', 'update', 'delete', 'approve'],
  reports: ['view', 'export'],
  users: ['view', 'create', 'update', 'delete'],
  settings: ['view', 'update', 'manage'],
  hotels: ['view', 'create', 'update', 'delete'],
}

// Get applicable actions for a module
export function getModuleActions(moduleCode: string) {
  const applicableCodes = MODULE_ACTIONS[moduleCode] || ['view', 'create', 'update', 'delete', 'export', 'approve']
  return ACTIONS.filter(a => applicableCodes.includes(a.code))
}

export function useUserPermissionsDetail(userId?: string) {
  return useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: async () => {
      if (!userId) throw new Error('No user ID')

      const { data, error } = await supabase
        .from('user_permissions' as any)
        .select('*')
        .eq('user_id', userId)
        .order('module')

      if (error) throw error
      return data as unknown as UserPermission[]
    },
    enabled: !!userId,
  })
}

export function useUserPermissionsSummary(userId?: string) {
  return useQuery({
    queryKey: ['user-permissions-summary', userId],
    queryFn: async () => {
      if (!userId) throw new Error('No user ID')

      const { data, error } = await supabase.rpc('get_user_permissions_summary' as any, {
        p_user_id: userId,
      })

      if (error) throw error
      return data as unknown as PermissionSummary[]
    },
    enabled: !!userId,
  })
}

export function useUserPermissionsWithSource(userId?: string) {
  return useQuery({
    queryKey: ['user-permissions-with-source', userId],
    queryFn: async () => {
      if (!userId) throw new Error('No user ID')

      const { data, error } = await supabase.rpc('get_user_permissions' as any, {
        _user_id: userId,
      })

      if (error) throw error
      return data as unknown as UserPermissionDetail[]
    },
    enabled: !!userId,
  })
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient()
  const { tenantId } = useUser()

  return useMutation({
    mutationFn: async ({
      userId,
      permissions,
    }: {
      userId: string
      permissions: { module: string; action: string; enabled: boolean }[]
    }) => {
      if (!tenantId) throw new Error('No tenant')

      // Delete all existing permissions for this user
      await supabase.from('user_permissions' as any).delete().eq('user_id', userId)

      // Insert new permissions
      const permissionsToInsert = permissions.map((p) => ({
        user_id: userId,
        tenant_id: tenantId,
        module: p.module,
        action: p.action,
        enabled: p.enabled,
      }))

      const { error } = await supabase.from('user_permissions' as any).insert(permissionsToInsert)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['user-permissions-summary', variables.userId] })
      
      // FIX: Invalidate user-side queries for immediate permission refresh
      queryClient.invalidateQueries({ queryKey: ['user-module-permissions', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['user-module-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['route-permission', variables.userId], exact: false })
      queryClient.invalidateQueries({ queryKey: ['check-permission', variables.userId], exact: false })
      
      toast({
        title: 'Thành công',
        description: 'Đã cập nhật phân quyền người dùng',
      })
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: getFriendlyError(error),
      })
    },
  })
}

export function useCheckUserPermission(module: string, action: string) {
  const { user } = useUser()

  return useQuery({
    queryKey: ['check-permission', user?.id, module, action],
    queryFn: async () => {
      if (!user?.id) return false

      const { data, error } = await supabase.rpc('has_user_permission' as any, {
        p_user_id: user.id,
        p_module: module,
        p_action: action,
      })

      if (error) throw error
      return data as boolean
    },
    enabled: !!user?.id,
  })
}
