import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLowStockItems } from '@/hooks/useInventoryDashboard'
import { useDeadStockReport } from '@/hooks/useDeadStockReport'
import { useStockoutItems } from '@/hooks/useStockoutItems'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function formatCompact(amount: number) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(0)}M`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`
  return amount.toString()
}

/**
 * Card cảnh báo tồn kho — 3 chỉ số tổng + danh sách item dưới định mức.
 * "Sắp hết <7d" dùng helper useStockoutItems đã dedup latest-per-item.
 */
export function CombinedStockAlerts() {
  const navigate = useNavigate()
  const { data: lowItems, isLoading: loadingLow } = useLowStockItems(50)
  const { data: deadRows, isLoading: loadingDead } = useDeadStockReport(90)
  const { soonOutCount, isLoading: loadingSnap } = useStockoutItems()

  const summary = useMemo(() => {
    const dead_count = deadRows?.length ?? 0
    const dead_value = (deadRows ?? []).reduce(
      (s, r) => s + Number(r.total_value || 0),
      0,
    )
    return { dead_count, dead_value, critical: soonOutCount }
  }, [deadRows, soonOutCount])

  const isLoading = loadingLow || loadingDead || loadingSnap
  const items = lowItems ?? []

  return (
    <div className="border rounded-lg bg-card flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="text-sm font-semibold">Cảnh báo tồn kho</div>
        <div className="text-[11px] text-muted-foreground">{items.length} item thấp</div>
      </div>

      {/* 3 metric tiles */}
      <div className="grid grid-cols-3 divide-x border-b">
        <button
          type="button"
          onClick={() => navigate('/inventory?tab=operations&sub=reorder')}
          className="px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sắp hết &lt;7d</div>
          <div className={cn('text-lg font-semibold tabular-nums', summary.critical > 0 ? 'text-red-600' : 'text-muted-foreground')}>
            {summary.critical}
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/items?stockStatus=low_stock')}
          className="px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Dưới định mức</div>
          <div className={cn('text-lg font-semibold tabular-nums', items.length > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
            {items.length}
          </div>
        </button>
        <button
          type="button"
          onClick={() => navigate('/inventory?tab=analytics&sub=dead-stock')}
          className="px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ứ đọng ≥90d</div>
          <div className={cn('text-lg font-semibold tabular-nums', summary.dead_count > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
            {summary.dead_count}
          </div>
          <div className="text-[10px] text-muted-foreground">{formatCompact(summary.dead_value)} ₫</div>
        </button>
      </div>

      {/* List of low-stock items */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">
            Không có item nào dưới định mức.
          </div>
        ) : (
          <ul className="divide-y">
            {items.slice(0, 8).map((it) => {
              const critical = it.shortage_percent >= 50
              return (
                <li
                  key={it.id}
                  onClick={() => navigate(`/items/${it.id}`)}
                  className="flex items-center justify-between px-3 py-2 hover:bg-muted/40 cursor-pointer text-sm"
                >
                  <span className="truncate pr-2">{it.name}</span>
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums shrink-0',
                      critical ? 'text-red-600' : 'text-amber-600',
                    )}
                  >
                    {it.quantity_in_stock}/{it.minimum_stock}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
