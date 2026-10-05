import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  useLatestConsumptionSnapshots,
  useConsumptionTrend,
  useRefreshSnapshots,
} from '@/hooks/useConsumptionAnalytics'
import { useHotelContext } from '@/contexts/HotelContext'
import { format } from 'date-fns'

export default function InventoryAnalyticsPage() {
  const { data: snapshots, isLoading } = useLatestConsumptionSnapshots(500)
  const refresh = useRefreshSnapshots()
  const { isAllHotelsMode } = useHotelContext()
  const [search, setSearch] = useState('')
  const [trendItem, setTrendItem] = useState<{ id: string; name: string } | null>(null)

  // Group: latest snapshot per item_id
  const latestByItem = useMemo(() => {
    const m = new Map<string, typeof snapshots[number]>()
    ;(snapshots ?? []).forEach((s) => {
      const cur = m.get(s.item_id)
      if (!cur || cur.snapshot_date < s.snapshot_date) m.set(s.item_id, s)
    })
    return Array.from(m.values())
  }, [snapshots])

  // Need item names — fetch via separate query? For now display item_id last 6 chars; extend later.
  // Filter / sort
  const sorted = useMemo(() => {
    const list = [...latestByItem].sort((a, b) => {
      const ad = a.stock_days_remaining ?? Infinity
      const bd = b.stock_days_remaining ?? Infinity
      return ad - bd
    })
    if (!search.trim()) return list
    const q = search.trim().toLowerCase()
    return list.filter(
      (s) =>
        s.item?.name?.toLowerCase().includes(q) ||
        s.item?.item_code?.toLowerCase().includes(q) ||
        s.item_id.toLowerCase().includes(q),
    )
  }, [latestByItem, search])

  const stats = useMemo(() => {
    const critical = latestByItem.filter(
      (s) => s.stock_days_remaining != null && s.stock_days_remaining < 7,
    ).length
    const stale = latestByItem.filter(
      (s) => Number(s.qty_consumed_30d) === 0 && Number(s.stock_on_date) > 0,
    ).length
    return {
      total: latestByItem.length,
      critical,
      stale,
    }
  }, [latestByItem])

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Phân tích tiêu thụ</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Snapshot tiêu thụ 7/30/90 ngày — cập nhật tự động mỗi giờ
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending || isAllHotelsMode}
          title={isAllHotelsMode ? 'Chuyển sang một hotel để cập nhật' : undefined}
        >
          {refresh.isPending ? 'Đang tính...' : 'Tính lại snapshot'}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatBox label="Tổng item theo dõi" value={stats.total} />
        <StatBox
          label="Sắp hết (< 7 ngày)"
          value={stats.critical}
          tone={stats.critical > 0 ? 'danger' : undefined}
        />
        <StatBox
          label="Không tiêu thụ 30 ngày"
          value={stats.stale}
          tone={stats.stale > 0 ? 'warning' : undefined}
        />
      </div>

      <div className="flex items-center gap-2 border rounded-lg p-2">
        <Input
          placeholder="Tìm theo mã hoặc tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[280px] text-xs"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {sorted.length} item
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Chưa có snapshot — bấm "Tính lại snapshot" để tạo dữ liệu hôm nay.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Tồn</th>
                  <th className="px-3 py-2 text-right">7 ngày</th>
                  <th className="px-3 py-2 text-right">30 ngày</th>
                  <th className="px-3 py-2 text-right">90 ngày</th>
                  <th className="px-3 py-2 text-right">TB/ngày</th>
                  <th className="px-3 py-2 text-right">Ngày còn lại</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((s) => {
                  const days = s.stock_days_remaining
                  const tone =
                    days == null
                      ? 'text-muted-foreground'
                      : days < 7
                        ? 'text-red-600 font-semibold'
                        : days < 14
                          ? 'text-amber-600 font-medium'
                          : 'text-green-600'
                  return (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.item?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground font-mono">{s.item?.item_code ?? s.item_id.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(s.stock_on_date)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(s.qty_consumed_7d)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(s.qty_consumed_30d)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {Number(s.qty_consumed_90d)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(s.avg_daily_consumption).toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tone}`}>
                        {days == null ? '—' : `${Math.floor(days)}d`}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setTrendItem({ id: s.item_id, name: s.item?.name ?? s.item_id.slice(0, 8) })
                          }
                        >
                          Xem trend
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TrendDialog
        item={trendItem}
        onClose={() => setTrendItem(null)}
      />
    </div>
  )
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'danger' | 'warning'
}) {
  const color =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-foreground'
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  )
}

function TrendDialog({
  item,
  onClose,
}: {
  item: { id: string; name: string } | null
  onClose: () => void
}) {
  const { data, isLoading } = useConsumptionTrend(item?.id, 90)
  const chartData = (data ?? []).map((p) => ({
    day: format(new Date(p.day), 'dd/MM'),
    qty: Number(p.qty_out),
  }))
  const total = chartData.reduce((s, p) => s + p.qty, 0)

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Xu hướng tiêu thụ 90 ngày — {item?.name}
          </DialogTitle>
        </DialogHeader>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">
              Tổng xuất 90 ngày: <span className="font-semibold text-foreground">{total}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="qty"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#trendGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
