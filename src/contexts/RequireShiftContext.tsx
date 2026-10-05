import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useUser } from '@/hooks/useUser'
import { useMyStaffStatus, isCurrentlyOnShift } from '@/hooks/useShiftManagement'
import { RequireShiftDialog } from '@/components/staff/RequireShiftDialog'
import type { AppRole } from '@/types/database.types'

/**
 * Gate "phải vào ca mới thao tác".
 *
 * - `requiresShift`: true cho role staff / department_manager.
 * - `isOnShift`: dùng staffPresence (đã loại ca treo >16h).
 * - `guard(fn)`: nếu không cần gác hoặc đã on-shift → chạy fn ngay.
 *   Ngược lại → mở dialog "Bạn cần vào ca để tiếp tục", và sau khi user
 *   vào ca thành công thì chạy lại fn.
 */
export interface RequireShiftContextValue {
  isOnShift: boolean
  requiresShift: boolean
  guard: (action: () => void) => void
  /** Mở dialog mà không có action cụ thể (ví dụ block route mount). */
  openDialog: () => void
}

const RequireShiftCtx = createContext<RequireShiftContextValue | null>(null)

const GATED_ROLES: AppRole[] = ['staff', 'department_manager']

export function RequireShiftProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const { data: myStatus } = useMyStaffStatus()
  const [pendingAction, setPendingAction] = useState<null | (() => void)>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const requiresShift = useMemo(() => {
    if (!user) return false
    const role = user.primaryRole
    return !!role && GATED_ROLES.includes(role)
  }, [user])

  const isOnShift = isCurrentlyOnShift(myStatus ?? null)

  const guard = useCallback(
    (action: () => void) => {
      if (!requiresShift || isOnShift) {
        action()
        return
      }
      setPendingAction(() => action)
      setDialogOpen(true)
    },
    [requiresShift, isOnShift]
  )

  const openDialog = useCallback(() => {
    if (!requiresShift || isOnShift) return
    setPendingAction(null)
    setDialogOpen(true)
  }, [requiresShift, isOnShift])

  const handleCheckedIn = useCallback(() => {
    setDialogOpen(false)
    const fn = pendingAction
    setPendingAction(null)
    // Cho RQ kịp invalidate myStatus trước khi re-run
    if (fn) setTimeout(fn, 0)
  }, [pendingAction])

  const handleCancel = useCallback(() => {
    setDialogOpen(false)
    setPendingAction(null)
  }, [])

  const value = useMemo<RequireShiftContextValue>(
    () => ({ isOnShift, requiresShift, guard, openDialog }),
    [isOnShift, requiresShift, guard, openDialog]
  )

  return (
    <RequireShiftCtx.Provider value={value}>
      {children}
      <RequireShiftDialog
        open={dialogOpen}
        onCancel={handleCancel}
        onCheckedIn={handleCheckedIn}
      />
    </RequireShiftCtx.Provider>
  )
}

export function useRequireShift(): RequireShiftContextValue {
  const ctx = useContext(RequireShiftCtx)
  if (!ctx) {
    // Fallback an toàn nếu component bị mount ngoài provider (ví dụ trong test
    // hoặc legacy route): coi như không cần gác để không gãy UX.
    return {
      isOnShift: true,
      requiresShift: false,
      guard: (fn) => fn(),
      openDialog: () => {},
    }
  }
  return ctx
}
