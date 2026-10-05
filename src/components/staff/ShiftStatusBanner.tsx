import { useState } from 'react'
import { Clock, CheckCircle, ChevronRight, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useMyStaffStatus,
  useShiftCheckIn,
  useShiftCheckOut,
  isCurrentlyOnShift,
  formatShiftStartTime,
  calculateShiftDuration,
} from '@/hooks/useShiftManagement'

/**
 * Compact banner that shows shift status on all mobile pages.
 * - Yellow banner when not on shift (with check-in button)
 * - Green banner when on shift (with check-out button)
 */
export function ShiftStatusBanner() {
  const { t } = useTranslation('common')
  const { data: myStatus, isLoading } = useMyStaffStatus()
  const { mutate: checkIn, isPending: isCheckingIn } = useShiftCheckIn()
  const { mutate: checkOut, isPending: isCheckingOut } = useShiftCheckOut()

  const [showCheckInConfirm, setShowCheckInConfirm] = useState(false)
  const [showCheckOutConfirm, setShowCheckOutConfirm] = useState(false)

  const isOnShift = isCurrentlyOnShift(myStatus)

  const handleCheckIn = () => {
    checkIn()
    setShowCheckInConfirm(false)
  }

  const handleCheckOut = () => {
    checkOut()
    setShowCheckOutConfirm(false)
  }

  // Only hide while loading
  if (isLoading) return null

  // On shift - Green banner with check-out button
  if (isOnShift) {
    const startTime = formatShiftStartTime(myStatus?.shift_start_at)
    const duration = calculateShiftDuration(myStatus?.shift_start_at)

    return (
      <>
        <div className="bg-green-50 dark:bg-green-950 border-b border-green-200 dark:border-green-800 px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {t('shift.onShift', 'Đang trong ca')} • {startTime}
                {duration && ` (${duration})`}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900"
              onClick={() => setShowCheckOutConfirm(true)}
              disabled={isCheckingOut}
            >
              {isCheckingOut ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <LogOut className="h-3 w-3 mr-1" />
                  {t('shift.checkOut', 'Kết thúc ca')}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Check-out confirmation dialog */}
        <AlertDialog open={showCheckOutConfirm} onOpenChange={setShowCheckOutConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('shift.confirmCheckOutTitle', 'Xác nhận kết thúc ca')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t('shift.confirmCheckOutDescription', {
                  duration: duration || '0 phút',
                  defaultValue: `Bạn đã làm việc được ${duration || '0 phút'}. Bạn có chắc muốn kết thúc ca làm việc?`,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('buttons.cancel', 'Hủy')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleCheckOut} disabled={isCheckingOut}>
                {isCheckingOut
                  ? t('shift.processing', 'Đang xử lý...')
                  : t('shift.checkOut', 'Kết thúc ca')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // Not on shift - Yellow banner with check-in button
  return (
    <>
      <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t('shift.notOnShift', 'Bạn chưa vào ca hôm nay')}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
            onClick={() => setShowCheckInConfirm(true)}
            disabled={isCheckingIn}
          >
            {isCheckingIn ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                {t('shift.checkIn', 'Vào ca ngay')}
                <ChevronRight className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Check-in confirmation dialog */}
      <AlertDialog open={showCheckInConfirm} onOpenChange={setShowCheckInConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shift.confirmCheckInTitle', 'Xác nhận vào ca')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('shift.confirmCheckInDescription', 'Bạn có chắc muốn bắt đầu ca làm việc ngay bây giờ?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('buttons.cancel', 'Hủy')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCheckIn} disabled={isCheckingIn}>
              {isCheckingIn
                ? t('shift.processing', 'Đang xử lý...')
                : t('shift.checkIn', 'Vào ca')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
