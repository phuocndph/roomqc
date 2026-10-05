import { Clock, CheckCircle, LogIn, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  useMyStaffStatus,
  useShiftCheckIn,
  useShiftCheckOut,
  isCurrentlyOnShift,
  calculateShiftDuration,
  formatShiftStartTime,
} from '@/hooks/useShiftManagement'

interface ShiftCheckInCardProps {
  className?: string
}

export function ShiftCheckInCard({ className }: ShiftCheckInCardProps) {
  const { t } = useTranslation('common')
  const { data: myStatus, isLoading: isLoadingStatus } = useMyStaffStatus()
  const { mutate: checkIn, isPending: isCheckingIn } = useShiftCheckIn()
  const { mutate: checkOut, isPending: isCheckingOut } = useShiftCheckOut()

  const isOnShift = isCurrentlyOnShift(myStatus)
  const shiftDuration = calculateShiftDuration(myStatus?.shift_start_at)
  const shiftStartTime = formatShiftStartTime(myStatus?.shift_start_at)

  if (isLoadingStatus) {
    return (
      <div className={cn('p-4 border rounded-lg bg-card', className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('p-4 border rounded-lg bg-card', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-5 w-5 text-primary" />
        <span className="font-medium">{t('shift.title', 'Ca làm việc')}</span>
      </div>

      {isOnShift ? (
        // Currently on shift
        <>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
            <CheckCircle className="h-4 w-4" />
            <span className="font-medium">{t('shift.onShift', 'Đang trong ca làm việc')}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {t('shift.startedAt', 'Bắt đầu: {{time}}', { time: shiftStartTime })}
            {shiftDuration && ` (${shiftDuration})`}
          </p>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => checkOut()}
            disabled={isCheckingOut}
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            {t('shift.checkOut', 'Kết thúc ca')}
          </Button>
        </>
      ) : (
        // Not on shift
        <>
          <p className="text-sm text-muted-foreground mb-4">
            {t('shift.notOnShift', 'Bạn chưa vào ca hôm nay')}
          </p>
          <Button
            className="w-full"
            onClick={() => checkIn()}
            disabled={isCheckingIn}
          >
            {isCheckingIn ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4 mr-2" />
            )}
            {t('shift.checkIn', 'Vào ca ngay')}
          </Button>
        </>
      )}
    </div>
  )
}
