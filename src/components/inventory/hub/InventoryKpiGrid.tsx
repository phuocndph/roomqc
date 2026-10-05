import { useMemo } from 'react'
import { ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useInventoryDashboard } from '@/hooks/useInventoryDashboard'
import { useStockoutItems } from '@/hooks/useStockoutItems'
import { useDeadStockReport } from '@/hooks/useDeadStockReport'
import { Skeleton } from '@/components/ui/skeleton'

function formatVnd(value: number) {
  if (!value) return '0 ₫'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} tỷ ₫`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr ₫`
  return new Intl.NumberFormat('vi-VN').format(value) + ' ₫'
}

type Tone = 'default' | 'warning' | 'danger' | 'success'

interface Props {
  onNavigate: (tab: string, sub?: string) => void
}

/**
 * Compact 4-tile "Tình hình kho" — supporting stats only.
 * Action-oriented "sắp hết 7d" đã chuyển lên TodoCard; tile thứ 3 ở đây
 * đổi sang "Đã hết hàng" (stock=0 thực tế) để không trùng TodoCard.
 */
export function InventoryKpiGrid({ onNavigate }: Props) {
  const { data: stats, isLoading } = useInventoryDashboard()
  const { outOfStockCount } = useStockoutItems()
  const { data: deadStock } = useDeadStockReport(90)

  const deadStockValue = useMemo(
    () => (deadStock ?? []).reduce((acc, r) => acc + (r.total_value || 0), 0),
    [deadStock],
  )
  const deadStockCount = (deadStock ?? []).length

  if (isLoading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    )
  }

  const deltaPct = stats?.stock_value_change_percent ?? 0
  const deltaPositive = deltaPct >= 0

  const tiles: Array<{
    label: string
    value: string
    hint?: string
    tone?: Tone
    trailing?: React.ReactNode
    onClick: () => void
  }> = [
    {
      label: 'Giá trị tồn kho',
      value: stats ? formatVnd(stats.total_stock_value) : '—',
      hint: stats
        ? `${deltaPositive ? '+' : ''}${deltaPct.toFixed(1)}% so tháng trước`
        : undefined,
      trailing: stats ? (
        deltaPositive ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
        )
      ) : null,
      onClick: () => onNavigate('analytics', 'consumption'),
    },
    {
      label: 'Loại hàng',
      value: stats ? new Intl.NumberFormat('vi-VN').format(stats.total_product_types) : '—',
      hint: stats
        ? `${new Intl.NumberFormat('vi-VN').format(stats.total_items_count)} món tồn`
        : undefined,
      onClick: () => onNavigate('assets', 'items'),
    },
    {
      label: 'Đã hết hàng',
      value: String(outOfStockCount),
      hint: outOfStockCount > 0 ? 'Tồn thực tế bằng 0' : 'Không có món nào hết',
      tone: outOfStockCount > 0 ? 'danger' : 'success',
      onClick: () => onNavigate('analytics', 'consumption'),
    },
    {
      label: 'Tồn lâu (>3 tháng)',
      value: deadStockCount ? String(deadStockCount) : '0',
      hint: deadStockCount ? formatVnd(deadStockValue) : 'Không có',
      tone: deadStockCount > 0 ? 'warning' : 'default',
      onClick: () => onNavigate('analytics', 'dead-stock'),
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {tiles.map((k) => (
        <button
          key={k.label}
          type="button"
          onClick={k.onClick}
          className={cn(
            'group relative text-left rounded-xl border border-border/70 bg-card p-4 transition-all',
            'hover:border-steel/50 hover:shadow-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'min-h-[104px]',
          )}
        >
          <div className="font-body text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {k.label}
          </div>
          <div
            className={cn(
              'mt-1.5 font-display text-2xl lg:text-[26px] font-semibold tabular-nums leading-none tracking-tight',
              k.tone === 'danger' && 'text-rose-600',
              k.tone === 'warning' && 'text-amber-600',
              k.tone === 'success' && 'text-emerald-600',
            )}
          >
            {k.value}
          </div>
          {k.hint && (
            <div className="mt-2 flex items-center gap-1 font-body text-[11px] text-muted-foreground line-clamp-1">
              {k.trailing}
              <span className="truncate">{k.hint}</span>
            </div>
          )}
          <ArrowUpRight className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-steel transition-colors" />
        </button>
      ))}
    </div>
  )
}
