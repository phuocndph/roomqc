import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { navigateBack } from '@/lib/navigation'

interface PermissionToastProps {
  module?: string
  action?: string
}

/**
 * Hiển thị toast lỗi ngắn gọn khi user không có quyền truy cập,
 * sau đó tự động điều hướng quay lại trang trước (hoặc trang chủ).
 * Tránh hiển thị trang AccessDenied to choán toàn màn hình.
 */
export function PermissionToast({ module, action }: PermissionToastProps) {
  const navigate = useNavigate()
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    toast.error('Bạn không có quyền với chức năng này', {
      description: 'Liên hệ quản lý để được cấp quyền.',
      duration: 2500,
    })

    // Quay lại trang trước, nếu không có history thì về trang chủ
    const timer = setTimeout(() => {
      navigateBack(navigate, '/')
    }, 50)

    return () => clearTimeout(timer)
  }, [navigate, module, action])

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}
