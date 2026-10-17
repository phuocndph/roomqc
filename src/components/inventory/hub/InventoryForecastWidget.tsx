import { useNavigate } from 'react-router-dom'
import { useLatestConsumptionSnapshots } from '@/hooks/useConsumptionAnalytics'
import { cn } from '@/lib/utils'
import { InventoryPanelError } from './InventoryPanelError'

export function InventoryForecastWidget() {
  const navigate = useNavigate()
  const query = useLatestConsumptionSnapshots(500)
  const { isLoading } = query
  const forecastTopRows = (query.data ?? [])
    .filter(row => row.stock_days_remaining !== null && row.stock_days_remaining >= 0 && row.stock_days_remaining < 14)
    .sort((a, b) => (a.stock_days_remaining ?? 0) - (b.stock_days_remaining ?? 0))
    .slice(0, 8)

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Dự báo sắp hết hàng</h3>
        <div className="text-xs text-muted-foreground">Dưới 14 ngày</div>
      </div>
      {isLoading ? (
        <div className="p-4 text-xs text-muted-foreground">Đang tải…</div>
      ) : query.isError ? <InventoryPanelError onRetry={() => void query.refetch()} />
        : forecastTopRows.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          Chưa có dự báo sắp hết hàng. Dự báo cần dữ liệu tiêu thụ để tính toán.
        </div>
      ) : (
        <ul className="divide-y">
          {forecastTopRows.map((r) => {
            const days = r.stock_days_remaining ?? 0
            const tone =
              days < 3 ? 'text-red-600' : days < 7 ? 'text-amber-600' : 'text-foreground'
            return (
              <li key={r.item_id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => navigate(`/items/${r.item_id}`)}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.item?.name ?? r.item_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.item?.item_code} · tồn {r.stock_on_date} · TB {r.avg_daily_consumption.toFixed(1)}/ngày
                  </div>
                </div>
                <div className={cn('text-xs font-semibold tabular-nums', tone)}>
                  còn {days} ngày
                </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
