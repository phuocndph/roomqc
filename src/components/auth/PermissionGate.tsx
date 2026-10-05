import { ReactNode } from 'react'
import { useHasPermission, PermissionModule, PermissionAction } from '@/hooks/usePermission'
import { useUser } from '@/hooks/useUser'
import { isAdminUser } from '@/lib/userAccess'

interface PermissionGateProps {
  children: ReactNode
  module: PermissionModule
  action: PermissionAction
  fallback?: ReactNode
}

/**
 * PermissionGate - Component to conditionally render UI based on user permissions
 * Uses module + action pattern for consistency with the permission system
 * Admin users (super_admin, tenant_owner) bypass all checks
 * 
 * @example
 * <PermissionGate module="items" action="create">
 *   <Button>Thêm tài sản</Button>
 * </PermissionGate>
 * 
 * @example with fallback
 * <PermissionGate module="users" action="delete" fallback={<span>Không có quyền</span>}>
 *   <DeleteButton />
 * </PermissionGate>
 */
export function PermissionGate({ children, module, action, fallback = null }: PermissionGateProps) {
  const { user, isLoading: userLoading } = useUser()
  const isAdmin = isAdminUser(user)
  const { hasPermission, isLoading } = useHasPermission(module, action)

  // Keep the permission hook unconditional; user/admin state can change after
  // the first render without violating React's hook ordering rules.
  if (isAdmin && !userLoading) return <>{children}</>

  if (isLoading || userLoading) {
    return null
  }

  return hasPermission ? <>{children}</> : <>{fallback}</>
}

// Re-export types for convenience
export type { PermissionModule, PermissionAction } from '@/hooks/usePermission'
