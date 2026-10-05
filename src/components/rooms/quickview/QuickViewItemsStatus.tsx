import { useTranslation } from 'react-i18next'
import { CheckCircle, AlertTriangle, Wind, Truck, PackageOpen, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMissingDisplay } from '@/lib/roomPriority'
import type { RoomWithStats } from '@/types/rooms.types'

interface Props {
  room: RoomWithStats
  pendingCount: number
  daysSinceCheck: number | null
  lastCheckText: string
}

export function QuickViewItemsStatus({ room, pendingCount, daysSinceCheck, lastCheckText }: Props) {
  const { t } = useTranslation(['rooms', 'distribution'])
  const missing = getMissingDisplay(room)

  const lastCheckColor =
    daysSinceCheck === null
      ? 'text-amber-600'
      : daysSinceCheck > 30
        ? 'text-red-600'
        : daysSinceCheck > 7
          ? 'text-amber-600'
          : 'text-muted-foreground'

  return (
    <div className="space-y-1.5">
      {missing.kind === 'complete' && (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{t('grid.itemsComplete')}</span>
        </div>
      )}
      {missing.kind === 'after_clean' && (
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('grid.missingAfterClean', { count: missing.count })}</span>
        </div>
      )}
      {missing.kind === 'restock' && (
        <div className="flex items-center gap-2 text-amber-600">
          <PackageOpen className="h-4 w-4 shrink-0" />
          <span>{t('grid.needRestock', { count: missing.count })}</span>
        </div>
      )}
      {room.items_in_laundry > 0 && (
        <div className="flex items-center gap-2 text-cyan-600">
          <Wind className="h-4 w-4 shrink-0" />
          <span>{t('grid.itemsInLaundry', { count: room.items_in_laundry })}</span>
        </div>
      )}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-amber-600">
          <Truck className="h-4 w-4 shrink-0" />
          <span>{t('distribution:roomHistory.pendingDeliveries', { count: pendingCount })}</span>
        </div>
      )}
      <div className={cn('flex items-center gap-2', lastCheckColor)}>
        <Clock className="h-4 w-4 shrink-0" />
        <span>{lastCheckText}</span>
      </div>
    </div>
  )
}
