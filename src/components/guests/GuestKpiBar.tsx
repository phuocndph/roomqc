import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import type { GuestStats } from '@/hooks/useGuestsV2'
import type { GuestSegment } from '@/hooks/useGuestsV2'
import { Cake, Crown, Repeat2, UserPlus, Users, WalletCards } from 'lucide-react'

interface Props {
  stats?: GuestStats
  isLoading?: boolean
  active: GuestSegment
  onSelect: (s: GuestSegment) => void
}

interface Tile {
  key: GuestSegment
  label: string
  value: number
  segment: GuestSegment
  icon: typeof Users
  tone?: 'default' | 'amber' | 'red' | 'green'
}

export function GuestKpiBar({ stats, isLoading, active, onSelect }: Props) {
  const tiles: Tile[] = [
    { key: 'all', label: 'Tổng khách', value: stats?.total ?? 0, segment: 'all', icon: Users },
    { key: 'vip', label: 'VIP / hạng cao', value: stats?.vip ?? 0, segment: 'vip', icon: Crown, tone: 'amber' },
    { key: 'new', label: 'Mới trong 30 ngày', value: stats?.newCount ?? 0, segment: 'new', icon: UserPlus, tone: 'green' },
    { key: 'returning', label: 'Khách quay lại', value: stats?.returning ?? 0, segment: 'returning', icon: Repeat2 },
  ]

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((t) => {
        const isActive = t.segment === active
        const Icon = t.icon
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(t.segment)}
            className={cn(
              'group flex min-h-[68px] items-center gap-2.5 rounded-lg border border-l-4 border-l-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40',
              t.tone === 'amber' && 'border-l-amber-600',
              t.tone === 'green' && 'border-l-green-600',
              isActive && 'border-foreground ring-1 ring-foreground/20',
            )}
          >
            <span className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground',
              t.tone === 'amber' && 'border-amber-600 text-amber-700',
              t.tone === 'green' && 'border-green-600 text-green-700',
            )}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs text-muted-foreground">{t.label}</span>
              <span className={cn(
                'mt-0.5 block text-lg font-semibold tabular-nums',
                t.tone === 'amber' && 'text-amber-600',
                t.tone === 'red' && 'text-red-600',
                t.tone === 'green' && 'text-green-600',
              )}>
                {isLoading ? <span className="inline-block h-5 w-12 animate-pulse rounded bg-muted" /> : t.value}
              </span>
            </span>
          </button>
        )
      })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Cake className="h-3.5 w-3.5" aria-hidden="true" />
          {isLoading ? 'Đang tải...' : `${stats?.birthday ?? 0} sinh nhật trong tháng`}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
          {isLoading ? 'Đang tải...' : `Tổng chi tiêu ${formatCurrency(stats?.totalRevenue ?? 0)}`}
        </span>
        {!isLoading && (stats?.blacklist ?? 0) > 0 && (
          <span className="text-red-600">{stats?.blacklist} khách trong blacklist</span>
        )}
      </div>
    </div>
  )
}
