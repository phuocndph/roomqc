import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { RoomStatus } from '@/types/rooms.types'

type FilterStatus = 'all' | RoomStatus
const ALL_STATUSES: RoomStatus[] = ['vacant', 'occupied', 'check_in', 'check_out', 'cleaning', 'maintenance', 'out_of_order']

interface Props {
  value: FilterStatus
  onChange: (v: FilterStatus) => void
}

export function MobileRoomStatusFilterBar({ value, onChange }: Props) {
  const { t } = useTranslation(['rooms'])
  return (
    <div className="sticky top-14 bg-background border-b z-10 px-4 py-3 overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        <button
          onClick={() => onChange('all')}
          className={cn(
            'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
            value === 'all' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
          )}
        >
          {t('filters.all')}
        </button>
        {ALL_STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => onChange(status)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              value === status ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            )}
          >
            {t(`status.${status}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

export type { FilterStatus }
