import { useMemo } from 'react'
import { useLatestConsumptionSnapshots } from '@/hooks/useConsumptionAnalytics'
import { InventoryPanelError } from './InventoryPanelError'

export function InventoryTopConsumedWidget() {
  const { data: snapshots, isLoading, isError, refetch } = useLatestConsumptionSnapshots(500)

  const top = useMemo(() => {
    if (!snapshots) return []
    return [...snapshots]
      .filter((s) => s.qty_consumed_30d > 0)
      .sort((a, b) => b.qty_consumed_30d - a.qty_consumed_30d)
      .slice(0, 6)
  }, [snapshots])

  const max = top[0]?.qty_consumed_30d ?? 1

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Dùng nhiều nhất</h3>
        <div className="text-[11px] text-muted-foreground">30 ngày</div>
      </div>
      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Đang tải…</div>
      ) : isError ? <InventoryPanelError onRetry={() => void refetch()} />
        : top.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">Chưa có dữ liệu tiêu thụ.</div>
      ) : (
        <ul className="p-3 space-y-2">
          {top.map((s) => {
            const pct = Math.max(4, Math.round((s.qty_consumed_30d / max) * 100))
            return (
              <li key={s.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate pr-2">
                    {s.item?.name ?? s.item_id}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {s.qty_consumed_30d}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
