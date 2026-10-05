import { Navigate } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'

/**
 * Redirect /settings → trang đầu tiên trong Settings theo role.
 * Tránh tình huống staff click "Cài đặt" rồi bị PermissionRoute chặn ở General.
 */
export default function SettingsRedirect() {
  const { role, isLoading } = useUser()

  if (isLoading) return null

  // Staff chỉ thấy profile và đổi mật khẩu
  if (role === 'staff') {
    return <Navigate to="/settings/change-password" replace />
  }

  // Department manager thấy thêm room-check settings
  if (role === 'department_manager') {
    return <Navigate to="/settings/room-check" replace />
  }

  // Manager, owner, super_admin vào general settings
  return <Navigate to="/settings/general" replace />
}
