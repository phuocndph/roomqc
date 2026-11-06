import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { CheckoutTodayItem } from '@/hooks/useHousekeepingDashboardPanels'
import { PanelError, type PanelQueryState } from './PanelError'

interface Props extends PanelQueryState {
  data?: CheckoutTodayItem[]
}

const STATUS_LABEL: Record<CheckoutTodayItem['status'], { text: string; cls: string }> = {
  cleaned: { text: 'Đã dọn', cls: 'bg-green-700 text-white' },
  cleaning: { text: 'Đang dọn', cls: 'bg-blue-700 text-white' },
  dirty: { text: 'Chưa dọn', cls: 'bg-orange-700 text-white' },
  occupied: { text: 'Còn khách', cls: 'bg-blue-700 text-white' },
  blocked: { text: 'Tạm ngừng / Khác', cls: 'bg-slate-700 text-white' },
}

export function CheckoutTodayPanel({ data, loading, isError, onRetry }: Props) {
  const list = data || []
  return <section className="min-w-0 border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
      <h2 className="font-semibold">Trả phòng hôm nay</h2>
      <Link to="/bookings" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Quản lý đặt phòng<ChevronRight className="h-4 w-4" /></Link>
    </div>
    {isError ? <PanelError onRetry={onRetry} /> : loading ? <div className="m-4 h-20 animate-pulse bg-muted" /> : !list.length ? (
      <p className="p-4 text-sm text-muted-foreground">Không có khách trả phòng hôm nay.</p>
    ) : <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-muted-foreground"><tr className="border-b"><th scope="col" className="px-4 py-2 text-left font-medium">Phòng</th><th scope="col" className="px-2 py-2 text-left font-medium">Giờ trả</th><th scope="col" className="px-4 py-2 text-right font-medium">Tình trạng</th></tr></thead>
        <tbody>{list.map(room => {
          const state = STATUS_LABEL[room.status]
          return <tr key={room.bookingId} className="border-b last:border-0 hover:bg-muted">
            <td className="px-4 py-3 font-semibold"><Link to={`/rooms/${room.roomId}`} className="text-primary hover:underline">{room.roomNumber}</Link></td>
            <td className="px-2 py-3 tabular-nums">{room.expectedTime || 'Chưa đặt'}</td>
            <td className="px-4 py-3 text-right"><span className={`inline-block px-2 py-1 text-xs font-medium ${state.cls}`}>{state.text}</span></td>
          </tr>
        })}</tbody>
      </table>
    </div>}
  </section>
}
