import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import type { BatchStatus } from '@/types/laundry.types'

interface BatchStatusBadgeProps {
  status: BatchStatus
  className?: string
}

const statusStyles: Record<BatchStatus, string> = {
  draft: 'bg-slate-600 text-white hover:bg-slate-600',
  delivered: 'bg-blue-700 text-white hover:bg-blue-700',
  washing: 'bg-amber-700 text-white hover:bg-amber-700',
  ready: 'bg-green-700 text-white hover:bg-green-700',
  received: 'bg-blue-700 text-white hover:bg-blue-700',
  stocked: 'bg-green-700 text-white hover:bg-green-700',
  cancelled: 'bg-slate-600 text-white hover:bg-slate-600',
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
    <Badge
      className={cn(
        'whitespace-nowrap border-transparent',
        statusStyles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </Badge>
  )
}
