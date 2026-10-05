import { lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { OnboardingGuard } from '@/components/auth/OnboardingGuard'
import { MainLayout } from '@/components/layout/MainLayout'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'

const LandingPage = lazy(() => import('@/pages/LandingPage'))

const LandingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
    <div className="max-w-sm space-y-3">
      <h1 className="text-base font-semibold">RoomQc</h1>
      <p className="text-sm text-muted-foreground">
        Trang giới thiệu đang tải lại. Vui lòng đăng nhập để tiếp tục.
      </p>
      <a
        href="/auth/login"
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Đăng nhập
      </a>
    </div>
  </div>
)

/**
 * Root route gate:
 * - Anonymous user truy cập đúng "/" → render LandingPage (không bọc MainLayout).
 * - Mọi trường hợp khác → giữ nguyên hành vi cũ: AuthGuard → OnboardingGuard → MainLayout.
 */
export const RootRoute = () => {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingSpinner fullScreen />
  }

  const isRoot = location.pathname === '/'
  if (!isAuthenticated && isRoot) {
    return (
      <SectionErrorBoundary name="landing-root" fallback={<LandingFallback />}>
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <LandingPage />
        </Suspense>
      </SectionErrorBoundary>
    )
  }

  return (
    <AuthGuard>
      <OnboardingGuard>
        <MainLayout />
      </OnboardingGuard>
    </AuthGuard>
  )
}

export default RootRoute
