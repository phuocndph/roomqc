import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { useFirstAccessibleRoute } from '@/hooks/useFirstAccessibleRoute'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Đường dẫn nội bộ cần quay lại sau khi đăng nhập (vd: màn hình đồng ý OAuth)
  const rawNext = searchParams.get('next')
  const nextPath = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null
  const { user: authUser, loading: authLoading, signOut } = useAuth()
  const { user, isLoading: isUserLoading } = useUser()
  const { firstAccessibleRoute, isLoading: isPermissionsLoading } = useFirstAccessibleRoute()
  const { toast } = useToast()

  const [showEscape, setShowEscape] = useState(false)
  const [forceFallback, setForceFallback] = useState(false)

  const isLoading = authLoading || isUserLoading || isPermissionsLoading

  // Hiển thị nút "Đăng nhập lại" sau 5s để user không bị kẹt
  useEffect(() => {
    const t = setTimeout(() => setShowEscape(true), 5000)
    return () => clearTimeout(t)
  }, [])

  // Safety timeout 8s: nếu chưa redirect được thì fallback
  useEffect(() => {
    const t = setTimeout(() => setForceFallback(true), 8000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (isLoading && !forceFallback) return

    if (!authUser) {
      navigate('/auth/login', { replace: true })
      return
    }

    if (nextPath) {
      navigate(nextPath, { replace: true })
      return
    }

    if (!user?.tenant_id || !user?.hotel_id) {
      navigate('/onboarding', { replace: true })
      return
    }

    if (user?.must_change_password === true) {
      navigate('/auth/change-password', { replace: true })
      return
    }

    if (firstAccessibleRoute === null) {
      if (forceFallback) {
        console.warn('[AuthCallback] permissions stuck, fallback to /', {
          hasUser: !!user,
          tenantId: user?.tenant_id,
        })
        navigate('/', { replace: true })
      }
      return
    }

    navigate(firstAccessibleRoute, { replace: true })
  }, [authUser, user, isLoading, firstAccessibleRoute, forceFallback, navigate, toast, nextPath])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center space-y-4 max-w-xs px-6">
        <LoadingSpinner size="lg" />
        <div className="space-y-1">
          <p className="text-muted-foreground">Đang xác thực...</p>
          <p className="text-xs text-muted-foreground/70">
            {isPermissionsLoading ? 'Đang tải quyền truy cập' : 'Đang chuẩn bị giao diện'}
          </p>
        </div>
        {showEscape && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut()
              navigate('/auth/login', { replace: true })
            }}
          >
            Đăng nhập lại
          </Button>
        )}
      </div>
    </div>
  )
}
