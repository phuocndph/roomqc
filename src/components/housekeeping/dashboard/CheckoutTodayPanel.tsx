import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { CheckoutTodayItem } from '@/hooks/useHousekeepingDashboardPanels'

interface Props {
  data?: CheckoutTodayItem[]
  loading?: boolean
}

const STATUS_LABEL: Record<CheckoutTodayItem['status'], { text: string; cls: string }> = {
  cleaned:  { text: 'Đã dọn',   cls: 'text-green-600' },
  cleaning: { text: 'Đang dọn', cls: 'text-amber-600' },
  dirty:    { text: 'Chưa dọn', cls: 'text-red-600' },
  occupied: { text: 'Còn khách', cls: 'text-blue-600' },
}

export function CheckoutTodayPanel({ data, loading }: Props) {
  const list = data || []
  return (
    <div className="border rounded-lg flex flex-col h-full">
      <div className="flex items-baseline justify-between px-3 py-2 border-b">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium">Check-out hôm nay</h3>
          <span className="text-xs text-muted-foreground tabular-nums">({list.length} phòng)</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="m-2 h-32 animate-pulse bg-muted/30 rounded" />
        ) : list.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-6">
            Không có khách trả phòng hôm nay
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[220px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left font-normal px-3 py-1.5">Phòng</th>
                  <th className="text-left font-normal px-2 py-1.5">Khách trả</th>
                  <th className="text-left font-normal px-2 py-1.5">Loại phòng</th>
                  <th className="text-right font-normal px-3 py-1.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 8).map((r) => {
                  const s = STATUS_LABEL[r.status]
                  return (
                    <tr key={r.bookingId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium tabular-nums">
                        <Link to={`/rooms/${r.roomId}`} className="hover:underline">P{r.roomNumber}</Link>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{r.expectedTime || '—'}</td>
                      <td className="px-2 py-1.5 truncate max-w-[140px]">{r.roomType || '—'}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${s.cls}`}>{s.text}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="border-t px-3 py-2 text-right">
        <Link to="/bookings?tab=checkout-today" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Xem tất cả <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
