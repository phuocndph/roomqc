import { Database } from '@/integrations/supabase/types'

// Table types
export type Permission = Database['public']['Tables']['permissions']['Row']
export type PermissionInsert = Database['public']['Tables']['permissions']['Insert']
export type PermissionUpdate = Database['public']['Tables']['permissions']['Update']

export type RolePermission = Database['public']['Tables']['role_permissions']['Row']
export type RolePermissionInsert = Database['public']['Tables']['role_permissions']['Insert']

// Permission grouped by module
export interface PermissionModule {
  module: string
  permissions: Permission[]
}

// User permission (simplified)
export interface UserPermission {
  code: string
  module: string
  action: string
  name: string
}

// Permission check result
export interface PermissionCheck {
  hasPermission: boolean
  loading: boolean
}
