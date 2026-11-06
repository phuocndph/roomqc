import type { UserWithRelations } from '@/types/database.types'

type EditActor = Pick<UserWithRelations, 'id' | 'tenant_id'>
type EditTarget = Pick<UserWithRelations, 'id' | 'tenant_id' | 'user_level_code' | 'is_primary_owner' | 'is_super_admin'>

export type EmployeeEditEntry =
  | { kind: 'profile' }
  | { kind: 'employee' }
  | { kind: 'blocked'; message: string }

// Navigation disposition only. The server still authorizes capability,
// hierarchy, live session, scope and every allowed column on each mutation.
export function getEmployeeEditEntry(target: EditTarget, actor: EditActor | null | undefined): EmployeeEditEntry {
  if (!actor?.id) return { kind: 'blocked', message: 'Chưa tải được tài khoản hiện tại. Vui lòng thử lại.' }
  if (target.id === actor.id) return { kind: 'profile' }
  if (!actor.tenant_id || target.tenant_id !== actor.tenant_id) {
    return { kind: 'blocked', message: 'Không thể mở hồ sơ nhân viên ngoài doanh nghiệp hiện tại.' }
  }
  if (target.is_primary_owner || target.is_super_admin ||
      !['manager', 'department_manager', 'staff'].includes(target.user_level_code || '')) {
    return { kind: 'blocked', message: 'Chủ sở hữu và quản trị hệ thống tự cập nhật tại Hồ sơ cá nhân; không sửa bằng biểu mẫu nhân viên.' }
  }
  return { kind: 'employee' }
}
