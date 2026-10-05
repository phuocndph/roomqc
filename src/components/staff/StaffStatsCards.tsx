import { cn } from '@/lib/utils'
import { PRESENCE_DOT_COLOR } from '@/lib/staffPresence'
import type { StaffPresenceStats } from '@/hooks/useStaffStatus'

export type PresenceFilterKey = 'available' | 'busy' | 'disconnected' | 'off_shift'

interface StaffStatsCardsProps {
  stats: StaffPresenceStats
  selectedStatus: PresenceFilterKey | null
  onStatusClick: (status: PresenceFilterKey | null) => void
}

const config: Array<{
  key: PresenceFilterKey
  label: string
  hint: string
  dot: string
  textColor: string
}> = [
  {
    key: 'available',
    label: 'Sẵn sàng',
    hint: 'Đang trong ca · sẵn sàng',
    dot: PRESENCE_DOT_COLOR.on_shift_available,
    textColor: 'text-green-600',
  },
  {
    key: 'busy',
    label: 'Đang bận',
    hint: 'Đang trong ca · busy / break',
    dot: PRESENCE_DOT_COLOR.on_shift_busy,
    textColor: 'text-amber-600',
  },
  {
    key: 'disconnected',
    label: 'Mất kết nối',
    hint: 'Đang trong ca · không heartbeat >30 phút',
    dot: PRESENCE_DOT_COLOR.on_shift_offline,
    textColor: 'text-muted-foreground',
  },
  {
    key: 'off_shift',
    label: 'Ngoài ca',
    hint: 'Chưa vào ca / đã tan ca / ca treo',
    dot: PRESENCE_DOT_COLOR.not_on_shift,
    textColor: 'text-muted-foreground',
  },
]

export function StaffStatsCards({ stats, selectedStatus, onStatusClick }: StaffStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {config.map(({ key, label, hint, dot, textColor }) => {
        const count = stats[key]
        const isSelected = selectedStatus === key

        return (
          <button
            key={key}
            type="button"
            onClick={() => onStatusClick(isSelected ? null : key)}
            title={hint}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
              isSelected ? 'bg-muted/50 border-foreground/30' : 'bg-background hover:bg-muted/30'
            )}
          >
            <span className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', dot)} />
            <div>
              <p className={cn('text-2xl font-semibold', textColor)}>{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
