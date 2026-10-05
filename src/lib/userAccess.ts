import { UserWithRelations, AppRole } from '@/types/database.types'

/**
 * Unified user access utility for consistent role and permission checks
 * This centralizes all role/level checking logic to avoid inconsistencies
 */

// Admin-level user level codes
const ADMIN_LEVELS = ['super_admin', 'tenant_owner'] as const

// Admin-level legacy roles
const ADMIN_ROLES: AppRole[] = ['super_admin', 'owner']

/**
 * Check if user is an admin (super_admin or tenant_owner)
 * Supports both legacy role system and new user_level_code
 */
export function isAdminUser(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  
  // Check user_level_code first (preferred)
  if (user.user_level_code && ADMIN_LEVELS.includes(user.user_level_code as typeof ADMIN_LEVELS[number])) {
    return true
  }
  
  // Fallback to legacy role check
  if (user.roles?.some(r => ADMIN_ROLES.includes(r.role as AppRole))) {
    return true
  }
  
  return false
}

/**
 * Check if user is super admin specifically
 */
export function isSuperAdmin(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  
  return (
    user.user_level_code === 'super_admin' ||
    user.roles?.some(r => r.role === 'super_admin')
  ) || false
}

/**
 * Check if user is tenant owner (hotel owner)
 */
export function isTenantOwner(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  
  return (
    user.user_level_code === 'tenant_owner' ||
    user.roles?.some(r => r.role === 'owner')
  ) || false
}

/**
 * Check if user is a manager (hotel_manager or department_manager)
 */
export function isManager(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  
  const managerLevels = ['manager']
  const managerRoles: AppRole[] = ['hotel_manager', 'department_manager']
  
  return (
    (user.user_level_code && managerLevels.includes(user.user_level_code)) ||
    user.roles?.some(r => managerRoles.includes(r.role as AppRole))
  ) || false
}

/**
 * Check if user is staff (lowest level)
 */
export function isStaff(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  
  return (
    user.user_level_code === 'staff' ||
    user.roles?.some(r => r.role === 'staff')
  ) || false
}

/**
 * Check if user has a specific role (supports both systems)
 */
export function hasRole(user: UserWithRelations | null | undefined, role: AppRole): boolean {
  if (!user) return false
  
  // Map user_level_code to legacy roles
  const levelToRoleMap: Record<string, AppRole[]> = {
    super_admin: ['super_admin'],
    tenant_owner: ['owner'],
    manager: ['hotel_manager', 'department_manager'],
    staff: ['staff'],
  }
  
  // Check if user_level_code maps to the requested role
  if (user.user_level_code && levelToRoleMap[user.user_level_code]?.includes(role)) {
    return true
  }
  
  // Check legacy roles
  return user.roles?.some(r => r.role === role) || false
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(user: UserWithRelations | null | undefined, roles: AppRole[]): boolean {
  return roles.some(role => hasRole(user, role))
}

/**
 * Get display-friendly role name
 */
export function getUserRoleDisplay(user: UserWithRelations | null | undefined): string {
  if (!user) return 'Unknown'
  
  // Use user_level_code display names
  const levelLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    tenant_owner: 'Chủ khách sạn',
    manager: 'Quản lý',
    staff: 'Nhân viên',
  }
  
  if (user.user_level_code && levelLabels[user.user_level_code]) {
    return levelLabels[user.user_level_code]
  }
  
  // Fallback to legacy role
  const roleLabels: Record<AppRole, string> = {
    super_admin: 'Super Admin',
    owner: 'Chủ khách sạn',
    hotel_manager: 'Quản lý khách sạn',
    department_manager: 'Quản lý bộ phận',
    staff: 'Nhân viên',
  }
  
  const primaryRole = user.roles?.[0]?.role as AppRole
  return primaryRole ? roleLabels[primaryRole] || primaryRole : 'Unknown'
}

/**
 * Check if user can create housekeeping tasks
 * Only Admin (super_admin, tenant_owner) and Manager can create tasks
 */
export function canCreateHousekeepingTask(user: UserWithRelations | null | undefined): boolean {
  if (!user) return false
  return isAdminUser(user) || isManager(user)
}
