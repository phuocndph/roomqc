import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

interface OnboardingGuardProps {
  children: React.ReactNode
}

export const OnboardingGuard = ({ children }: OnboardingGuardProps) => {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { user, isLoading: userLoading } = useUser()
  const location = useLocation()

  // Still loading - show spinner
  if (authLoading || userLoading) {
    return <LoadingSpinner fullScreen />
  }

  // Not authenticated - should be handled by AuthGuard, but just in case
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  // Skip onboarding check if already on onboarding page
  if (location.pathname === '/onboarding') {
    return <>{children}</>
  }

  // Check if user needs onboarding:
  // - user is null = not in users table yet
  // - pending_setup = auth user exists but has not completed registration
  // - missing tenant_id
  // - manager/staff missing hotel_id
  const needsOnboarding = user === null ||
    (user && user.status === 'pending_setup') ||
    (user && !user.tenant_id) ||
    (user && (user.user_level_code === 'manager' || user.user_level_code === 'staff') && !user.hotel_id)
  
  // Redirect to onboarding if needed
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  // User is fully set up - allow access
  return <>{children}</>
}
