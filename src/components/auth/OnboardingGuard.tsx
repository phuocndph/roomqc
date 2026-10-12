import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUser } from '@/hooks/useUser'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { AccountSetupNotice } from './AccountSetupNotice'
import { getAccountSetupState } from '@/lib/account-setup'

interface OnboardingGuardProps {
  children: React.ReactNode
}

export const OnboardingGuard = ({ children }: OnboardingGuardProps) => {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const { user, isLoading: userLoading, error, refetch } = useUser()
  const location = useLocation()

  // Still loading - show spinner
  if (authLoading || userLoading) {
    return <LoadingSpinner fullScreen />
  }

  // Not authenticated - should be handled by AuthGuard, but just in case
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  if (error) {
    return <AccountSetupNotice onRetry={() => { void refetch() }} />
  }

  const setupState = getAccountSetupState(user)
  if (setupState === 'assignment-required') {
    return <AccountSetupNotice assignmentRequired onRetry={() => { void refetch() }} />
  }

  // Skip onboarding check if already on onboarding page
  if (location.pathname === '/onboarding') {
    return <>{children}</>
  }

  if (setupState === 'register') {
    return <Navigate to="/onboarding" replace />
  }

  // User is fully set up - allow access
  return <>{children}</>
}
