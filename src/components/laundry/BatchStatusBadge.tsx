import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { BatchStatus } from '@/types/laundry.types'

interface BatchStatusBadgeProps {
  status: BatchStatus
  className?: string
}

const statusStyles: Record<BatchStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  delivered: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  washing: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  ready: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  received: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
  stocked: 'bg-green-100 text-green-800 hover:bg-green-200',
  cancelled: 'bg-red-100 text-red-800 hover:bg-red-200',
}

export function BatchStatusBadge({ status, className }: BatchStatusBadgeProps) {
  const { t } = useTranslation('laundry')
  
  const statusLabels: Record<BatchStatus, string> = {
    draft: t('statusBadge.draft', 'Nháp'),
    delivered: t('statusBadge.delivered'),
    washing: t('statusBadge.washing'),
    ready: t('statusBadge.ready'),
    received: t('statusBadge.received'),
    stocked: t('statusBadge.stocked'),
    cancelled: t('statusBadge.cancelled'),
  }
  
  return (
    <Badge className={cn(statusStyles[status], className)}>
      {statusLabels[status]}
    </Badge>
  )
}
