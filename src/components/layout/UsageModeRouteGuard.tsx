import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useTenant } from '@/hooks/useTenant'
import { useUsageMode } from '@/hooks/useUsageMode'
import { isPathAllowedInMode, OUTSIDE_MODE_MESSAGE } from '@/lib/usageModeRoutes'

/** W1-D3: typing the URL of a module hidden by usage_mode returns to the
 * dashboard with a short notice instead of opening the module. */
export function UsageModeRouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { tenant, isLoading } = useTenant()
  const { usageMode } = useUsageMode()
  const blocked = !isLoading && !!tenant && !isPathAllowedInMode(pathname, usageMode)

  useEffect(() => {
    if (blocked) toast.info(OUTSIDE_MODE_MESSAGE, { id: 'usage-mode-route-guard' })
  }, [blocked, pathname])

  if (blocked) return <Navigate to="/" replace />
  return <>{children}</>
}
