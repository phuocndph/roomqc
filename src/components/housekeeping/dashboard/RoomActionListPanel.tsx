import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { ActionBuckets } from '@/hooks/useRoomsNeedingActionToday'

interface Props {
  data?: ActionBuckets
  missingHidden?: number
  loading?: boolean
}

/**
 * Panel trái: danh sách 5 nhóm việc cần xử lý ngay (compact list).
 */
export function RoomActionListPanel({ data, loading }: Props) {
  const items = [
    { key: 'checkout',  label: 'Check-out chưa dọn',    count: data?.checkoutNotCleaned.length ?? 0, color: 'bg-red-500',    to: '/rooms?view=grid&status=vacant_dirty' },
    { key: 'arriving',  label: 'Khách sắp đến (trong 2h)', count: 0,                                  color: 'bg-amber-500',  to: '/bookings?tab=arrivals' },
    { key: 'missing',   label: 'Phòng thiếu đồ',         count: data?.missingItems.length ?? 0,      color: 'bg-orange-500', to: '/rooms?view=grid&missing=1' },
    { key: 'broken',    label: 'Phòng báo hỏng',         count: data?.urgent.length ?? 0,            color: 'bg-zinc-500',   to: '/maintenance/requests' },
    { key: 'qc',        label: 'Phòng QC không đạt',     count: data?.rejectedQc.length ?? 0,        color: 'bg-purple-500', to: '/housekeeping/review' },
  ]
  const total = items.reduce((s, i) => s + i.count, 0)
  const activeItems = items.filter((item) => item.count > 0)

  return (
    <div className="border rounded-lg flex flex-col h-full">
      <div className="flex items-baseline justify-between px-3 py-2 border-b">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-medium">Phòng cần xử lý ngay</h3>
          <span className="text-xs text-muted-foreground tabular-nums">({total})</span>
        </div>
      </div>
      <div className="p-2 flex-1">
        {loading ? (
          <div className="h-32 animate-pulse bg-muted/30 rounded" />
        ) : activeItems.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Không có việc tồn đọng
            </div>
          ) : (
          <ul className="flex flex-col">
            {activeItems.map((it) => (
              <li key={it.key}>
                <Link to={it.to} className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/40">
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${it.color}`} />
                    {it.label}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${it.count > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {it.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          )}
      </div>
      <div className="border-t px-3 py-2 text-right">
        <Link to="/rooms?view=grid" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          Xem tất cả <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
