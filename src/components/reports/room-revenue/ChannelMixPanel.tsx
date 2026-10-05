import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { RevenueBySource } from '@/hooks/useRevenueReport'

interface Props {
  bySource: RevenueBySource[]
  loading?: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  walk_in: 'Khách vãng lai',
  direct: 'Trực tiếp',
  phone: 'Điện thoại',
  website: 'Website',
  booking_com: 'Booking.com',
  agoda: 'Agoda',
  traveloka: 'Traveloka',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  corporate: 'Doanh nghiệp',
  agent: 'Đại lý du lịch',
  other: 'Khác',
}

function labelOf(source: string) {
  return SOURCE_LABELS[source] || source
}

/** Doanh thu theo kênh: bảng + bar visual đơn giản. */
export function ChannelMixPanel({ bySource, loading }: Props) {
  if (loading) return <Skeleton className="h-48 w-full" />

  const sorted = [...bySource].sort((a, b) => b.grossRevenue - a.grossRevenue)
  const totalGross = sorted.reduce((s, r) => s + r.grossRevenue, 0)

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Doanh thu theo kênh</h3>
        <p className="text-xs text-muted-foreground">Kênh nào đang mang khách về</p>
      </div>
      {sorted.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</div>
      ) : (
        <div className="divide-y">
          <div className="grid grid-cols-[1fr_60px_110px_110px_110px_55px] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span>Kênh</span>
            <span className="text-right">Lượt</span>
            <span className="text-right">Doanh thu</span>
            <span className="text-right">Hoa hồng</span>
            <span className="text-right">Ròng</span>
            <span className="text-right">%</span>
          </div>
          {sorted.map((s) => (
            <div key={s.source} className="px-3 py-2">
              <div className="grid grid-cols-[1fr_60px_110px_110px_110px_55px] gap-2 text-sm items-center">
                <div className="font-medium truncate">{labelOf(s.source)}</div>
                <div className="text-right tabular-nums">{s.bookings}</div>
                <div className="text-right tabular-nums font-medium">{formatCurrency(s.grossRevenue)}</div>
                <div className="text-right tabular-nums text-red-600">
                  {s.otaCommission > 0 ? `-${formatCurrency(s.otaCommission)}` : '—'}
                </div>
                <div className="text-right tabular-nums font-medium text-green-700">
                  {formatCurrency(s.netRevenue)}
                </div>
                <div className="text-right tabular-nums text-muted-foreground">{s.percentage.toFixed(0)}%</div>
              </div>
              {totalGross > 0 && (
                <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(s.grossRevenue / totalGross) * 100}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
