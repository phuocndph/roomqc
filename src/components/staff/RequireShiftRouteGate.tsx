import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequireShift } from '@/contexts/RequireShiftContext'

/**
 * Bọc các route nghiệp vụ chỉ thực hiện được khi đã vào ca.
 * - Owner / Manager / Super Admin: pass-through.
 * - Staff / Department Manager chưa vào ca: tự mở dialog "Vào ca ngay"
 *   thông qua RequireShiftContext, đồng thời điều hướng về `fallback`
 *   (mặc định "/") để tránh page bị mount nửa vời.
 *   Sau khi vào ca, user tự bấm lại vào tác vụ.
 */
export function RequireShiftRouteGate({
  children,
  fallback = '/',
}: {
  children: ReactNode
  fallback?: string
}) {
  const { requiresShift, isOnShift, isShiftStatusLoading, openDialog } = useRequireShift()
  const navigate = useNavigate()

  // Do not decide before the shift status has loaded: an on-shift staff member
  // opening a deep link or reloading a check page was bounced to the dashboard.
  const blocked = requiresShift && !isShiftStatusLoading && !isOnShift

  useEffect(() => {
    if (!blocked) return
    openDialog()
    navigate(fallback, { replace: true })
  }, [blocked, openDialog, navigate, fallback])

  if (isShiftStatusLoading || blocked) return null
  return <>{children}</>
}
