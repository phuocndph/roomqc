import { cn } from '@/lib/utils'
import type { StaffStatusType } from '@/hooks/useStaffStatus'

interface StaffStatusBadgeProps {
  status: StaffStatusType
  showLabel?: boolean
  size?: 'sm' | 'md'
}

const statusConfig: Record<StaffStatusType, { label: string; color: string; dotColor: string }> = {
  available: {
    label: 'Rảnh',
    color: 'text-green-600',
    dotColor: 'bg-green-500',
  },
  busy: {
    label: 'Đang bận',
    color: 'text-red-600',
    dotColor: 'bg-red-500',
  },
  break: {
    label: 'Nghỉ',
    color: 'text-amber-600',
    dotColor: 'bg-amber-500',
  },
  offline: {
    label: 'Offline',
    color: 'text-muted-foreground',
    dotColor: 'bg-muted-foreground',
  },
}

export function StaffStatusBadge({ status, showLabel = true, size = 'md' }: StaffStatusBadgeProps) {
  const config = statusConfig[status]
  
  return (
    <div className={cn('flex items-center gap-1.5', config.color)}>
      <span 
        className={cn(
          'rounded-full animate-pulse',
          config.dotColor,
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'
        )} 
      />
      {showLabel && (
        <span className={cn('font-medium', size === 'sm' ? 'text-xs' : 'text-sm')}>
          {config.label}
        </span>
      )}
    </div>
  )
}
