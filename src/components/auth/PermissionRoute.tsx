import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'
import { useQuery, useQueries } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { Loader2 } from 'lucide-react'
import { isAdminUser } from '@/lib/userAccess'
import { AccessDenied } from './AccessDenied'

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

interface PermissionRouteProps {
  children: ReactNode
  module: PermissionModule
  action?: PermissionAction
  fallback?: ReactNode
}

/**
 * PermissionRoute - Route protection component based on user permissions
 * Admin users (super_admin, tenant_owner) bypass all permission checks
 */
export function PermissionRoute({ 
  children, 
  module, 
  action = 'view',
  fallback 
}: PermissionRouteProps) {
  const { user, isLoading: userLoading } = useUser()
  
  // IMPORTANT: Wait for user data to load first before any checks
  if (userLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  
  // If no user after loading complete, redirect to login
  if (!user) {
    return <Navigate to="/auth/login" replace />
  }
  
  // Check if user is admin - using unified userAccess utility
  const isAdmin = isAdminUser(user)
  
  // Admin users ALWAYS have access - bypass all permission checks
  if (isAdmin) {
    return <>{children}</>
  }
  
  // For non-admin users, check permissions via RPC
  return (
    <NonAdminPermissionCheck 
      userId={user.id} 
      module={module} 
      action={action}
      fallback={fallback}
    >
      {children}
    </NonAdminPermissionCheck>
  )
}

/**
 * Separate component for non-admin permission checking
 * This ensures hooks are called consistently
 */
function NonAdminPermissionCheck({ 
  userId, 
  module, 
  action, 
  fallback, 
  children 
}: { 
  userId: string
  module: PermissionModule
  action: PermissionAction
  fallback?: ReactNode
  children: ReactNode 
}) {
  const { data: hasPermission, isLoading } = useQuery({
    queryKey: ['route-permission', userId, module, action],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_user_permission', {
        p_user_id: userId,
        p_module: module,
        p_action: action,
      })
      
      if (error) {
        console.error('Permission check error:', error)
        return false
      }
      
      return data as boolean
    },
    staleTime: 30 * 1000, // Reduced from 5 min to 30 sec for faster permission updates
  })
  
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  
  if (!hasPermission) {
    return fallback ? <>{fallback}</> : <AccessDenied module={module} action={action} />
  }
  
  return <>{children}</>
}

/**
 * Hook to check multiple permissions at once
 * Optimized for performance: fetches all permissions in one query for non-admin users
 */
export function useCanAccess(module: PermissionModule, actions: PermissionAction[]) {
  const { user, isLoading: userLoading } = useUser()
  const isAdmin = isAdminUser(user)

  // Always create the query list. React requires hook order to remain stable
  // when a user changes from a normal account to an admin account.
  const permissionQueries = useQueries({
    queries: actions.map(action => ({
      queryKey: ['route-permission', user?.id, module, action],
      queryFn: async () => {
        if (!user?.id) return false
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
      enabled: !!user?.id && !isAdmin,
      staleTime: 5 * 60 * 1000, // 5 minutes for better caching
    })),
  })

  // For admin, return all true immediately without using query results.
  if (isAdmin && !userLoading && user) {
    return {
      permissions: actions.reduce((acc, action) => {
        acc[action] = true
        return acc
      }, {} as Record<PermissionAction, boolean>),
      isLoading: false,
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    }
  }
  
  const isLoading = userLoading || permissionQueries.some(q => q.isLoading)
  
  // Build permissions object from query results
  const permissions = actions.reduce((acc, action, index) => {
    acc[action] = permissionQueries[index]?.data ?? false
    return acc
  }, {} as Record<PermissionAction, boolean>)
  
  return {
    permissions,
    isLoading,
    canView: permissions['view'] ?? false,
    canCreate: permissions['create'] ?? false,
    canUpdate: permissions['update'] ?? false,
    canDelete: permissions['delete'] ?? false,
  }
}
