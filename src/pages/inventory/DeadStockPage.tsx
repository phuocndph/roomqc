import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useDeadStockReport } from '@/hooks/useDeadStockReport'
import { useRefreshSnapshots } from '@/hooks/useConsumptionAnalytics'
import { useHotelContext } from '@/contexts/HotelContext'
import { formatCurrency } from '@/lib/utils'
import { Link } from 'react-router-dom'
import { downloadCsv } from '@/lib/csv'

const THRESHOLDS = [
  { value: 30, label: '30 ngày' },
  { value: 60, label: '60 ngày' },
  { value: 90, label: '90 ngày' },
  { value: 180, label: '180 ngày' },
]

export default function DeadStockPage() {
  const [days, setDays] = useState<number>(90)
  const [search, setSearch] = useState('')
  const { data: rows, isLoading } = useDeadStockReport(days)
  const refresh = useRefreshSnapshots()
  const { isAllHotelsMode } = useHotelContext()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows ?? []
    return (rows ?? []).filter(
      (r) =>
        r.item_name.toLowerCase().includes(q) ||
        r.item_code.toLowerCase().includes(q),
    )
  }, [rows, search])

  const totalValue = filtered.reduce((s, r) => s + Number(r.total_value || 0), 0)

  const handleExport = () => {
    if (!filtered.length) return
    downloadCsv(
      filtered.map((r) => ({
        Mã: r.item_code,
        'Tên tài sản': r.item_name,
        'Tồn kho': r.quantity_in_stock,
        'Đơn giá': r.unit_price,
        'Giá trị tồn': r.total_value,
        'Lần xuất cuối': r.last_outbound_at ?? 'Chưa từng xuất',
        'Số ngày không xuất': r.days_since_last_out ?? '—',
      })),
      `dead-stock-${days}d-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Tồn kho ứ đọng</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Tài sản còn tồn nhưng không xuất trong khoảng thời gian được chọn
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={!filtered.length}
          >
            Xuất CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border rounded-lg p-2">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THRESHOLDS.map((t) => (
              <SelectItem key={t.value} value={String(t.value)}>
                Không xuất ≥ {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Tìm theo mã hoặc tên..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-[240px] text-xs"
        />
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">
            {filtered.length} tài sản
          </span>
          <span>
            Tổng giá trị:{' '}
            <span className="font-semibold text-amber-600">
              {formatCurrency(totalValue)}
            </span>
          </span>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Không có tài sản ứ đọng trong ngưỡng đã chọn.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Mã</th>
                  <th className="px-3 py-2 text-left">Tên tài sản</th>
                  <th className="px-3 py-2 text-right">Tồn</th>
                  <th className="px-3 py-2 text-right">Đơn giá</th>
                  <th className="px-3 py-2 text-right">Giá trị tồn</th>
                  <th className="px-3 py-2 text-left">Lần xuất cuối</th>
                  <th className="px-3 py-2 text-right">Số ngày</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.item_id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-xs">{r.item_code}</td>
                    <td className="px-3 py-2 font-medium">{r.item_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(r.quantity_in_stock)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(Number(r.unit_price))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-600">
                      {formatCurrency(Number(r.total_value))}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.last_outbound_at
                        ? new Date(r.last_outbound_at).toLocaleDateString('vi-VN')
                        : <span className="text-red-600">Chưa từng xuất</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs">
                      {r.days_since_last_out ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/items/${r.item_id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Xem
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
