import { useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StaffTasksTab } from '@/components/housekeeping/StaffTasksTab'
import { useUser } from '@/hooks/useUser'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { navigateBack } from '@/lib/navigation'

/**
 * Page xem công việc cá nhân của staff/manager.
 *
 * Permission gate (Phase 1 — Lượt 2):
 *  - Bắt buộc đăng nhập (đã có AuthGuard ở App.tsx).
 *  - Bắt buộc có tenant (chặn super_admin chưa chọn tenant cụ thể).
 *  - Cho phép các role có khả năng nhận việc:
 *      owner | hotel_manager | department_manager | staff
 *  - User ngoài role → redirect về Dashboard.
 *
 * Lưu ý: dữ liệu task đã được RLS lọc theo tenant_id + assigned_to,
 *       gate này chỉ tránh hiển thị UI rỗng cho user không thuộc tenant.
 */
export function MyTasksPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const taskId = searchParams.get('task')
  const { user, tenantId, hasAnyRole, isLoading } = useUser()

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) return <Navigate to="/auth/login" replace />

  // Chặn user không thuộc tenant (vd super_admin global view)
  if (!tenantId) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Bạn chưa được gán vào khách sạn nào nên không có công việc cá nhân.
      </div>
    )
  }

  const canSeeMyTasks = hasAnyRole([
    'super_admin',
    'owner',
    'hotel_manager',
    'department_manager',
    'staff',
  ])

  if (!canSeeMyTasks) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateBack(navigate, '/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Công việc của tôi</h1>
            <p className="text-sm text-muted-foreground">
              Danh sách công việc được giao
            </p>
          </div>
        </div>
      </div>

      <StaffTasksTab initialTaskId={taskId} />
    </div>
  )
}

export default MyTasksPage
