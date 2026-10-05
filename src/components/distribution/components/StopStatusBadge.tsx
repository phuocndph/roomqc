import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { StopStatus } from '@/types/route-batch.types'
import { STOP_STATUS_LABELS } from '@/types/route-batch.types'
import { Clock, CheckCircle, XCircle, ArrowRightLeft } from 'lucide-react'

interface StopStatusBadgeProps {
  status: StopStatus
  className?: string
}

const statusConfig: Record<StopStatus, { 
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  className: string
  icon: React.ElementType
}> = {
  pending: {
    variant: 'outline',
    className: 'border-muted-foreground/30 text-muted-foreground',
    icon: Clock,
  },
  delivered: {
    variant: 'secondary',
    className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
  cannot_access: {
    variant: 'destructive',
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    icon: XCircle,
  },
  resolved: {
    variant: 'secondary',
    className: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400',
    icon: ArrowRightLeft,
  },
}

export function StopStatusBadge({ status, className }: StopStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn('gap-1 font-medium', config.className, className)}
    >
      <Icon className="h-3 w-3" />
      {STOP_STATUS_LABELS[status]}
    </Badge>
  )
}
