import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BatchStatus } from '@/types/route-batch.types'
import { BATCH_STATUS_LABELS } from '@/types/route-batch.types'
import { Package, Truck, CheckCircle, Clock } from 'lucide-react'

interface BatchStatusBadgeProps {
  status: BatchStatus
  className?: string
}

const statusConfig: Record<BatchStatus, { 
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
  className: string
  icon: React.ElementType
}> = {
  open: {
    variant: 'outline',
    className: 'border-muted-foreground/30 text-muted-foreground',
    icon: Clock,
  },
  handed_over: {
    variant: 'secondary',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Truck,
  },
  received: {
    variant: 'secondary',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Package,
  },
  done: {
    variant: 'secondary',
    className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
}

export function BatchStatusBadge({ status, className }: BatchStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.open
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn('gap-1 font-medium', config.className, className)}
    >
      <Icon className="h-3 w-3" />
      {BATCH_STATUS_LABELS[status]}
    </Badge>
  )
}
