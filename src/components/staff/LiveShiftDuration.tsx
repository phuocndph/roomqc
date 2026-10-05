import { useShiftTimer, getShiftStatus, getShiftStatusColor, type ShiftStatus } from '@/hooks/useShiftTimer'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LiveShiftDurationProps {
  shiftStartAt: string | null | undefined
  warningHours?: number
  maxHours?: number
  showIcon?: boolean
  className?: string
}

export function LiveShiftDuration({
  shiftStartAt,
  warningHours = 8,
  maxHours = 10,
  showIcon = true,
  className,
}: LiveShiftDurationProps) {
  const duration = useShiftTimer(shiftStartAt)
  const status = getShiftStatus(duration.totalMinutes, warningHours, maxHours)
  const colorClass = getShiftStatusColor(status)

  if (!shiftStartAt) return null

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {showIcon && (
        status === 'overtime' ? (
          <AlertTriangle className={cn('h-3.5 w-3.5', colorClass)} />
        ) : (
          <Clock className={cn('h-3.5 w-3.5', colorClass)} />
        )
      )}
      <span className={cn('text-sm font-medium tabular-nums', colorClass)}>
        {duration.formatted}
      </span>
      {status === 'overtime' && (
        <span className="text-xs text-red-600 ml-1">Quá giờ!</span>
      )}
      {status === 'warning' && (
        <span className="text-xs text-amber-600 ml-1">Sắp hết giờ</span>
      )}
    </div>
  )
}

interface ShiftStatusIndicatorProps {
  status: ShiftStatus
  className?: string
}

export function ShiftStatusIndicator({ status, className }: ShiftStatusIndicatorProps) {
  const bgColor = {
    normal: 'bg-green-500',
    warning: 'bg-amber-500',
    overtime: 'bg-red-500',
  }[status]

  return (
    <span className={cn('inline-block h-2 w-2 rounded-full', bgColor, className)} />
  )
}
