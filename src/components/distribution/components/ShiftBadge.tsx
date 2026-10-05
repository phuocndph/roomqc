import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ShiftCode } from '@/types/route-batch.types'
import { SHIFT_LABELS } from '@/types/route-batch.types'
import { Sun, Sunset, Moon } from 'lucide-react'

interface ShiftBadgeProps {
  shift: ShiftCode
  className?: string
  showIcon?: boolean
}

const shiftConfig: Record<ShiftCode, { 
  className: string
  icon: React.ElementType
}> = {
  morning: {
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Sun,
  },
  afternoon: {
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
    icon: Sunset,
  },
  night: {
    className: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400',
    icon: Moon,
  },
}

export function ShiftBadge({ shift, className, showIcon = true }: ShiftBadgeProps) {
  const config = shiftConfig[shift] || shiftConfig.morning
  const Icon = config.icon

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 font-medium', config.className, className)}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {SHIFT_LABELS[shift]}
    </Badge>
  )
}
