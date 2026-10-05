import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { RoomRevenue } from '@/hooks/useRevenueReport'
import type { RevenueByRoom } from '@/hooks/useRoomsReportData'

interface Props {
  topRooms: RoomRevenue[]
  revenueByRoom: RevenueByRoom[]
  loading?: boolean
}

/**
 * Hiển thị 2 bảng cạnh nhau (mobile xếp dọc):
 * - Phòng bán tốt nhất: top 10 theo doanh thu
 * - Phòng bán chậm: bottom 5 theo số đêm (gợi ý kiểm tra QC)
 */
export function TopRoomsTable({ topRooms, revenueByRoom, loading }: Props) {
  if (loading) return <Skeleton className="h-64 w-full" />

  // ADR per room từ revenue_by_room (đã có occupancy_days)
  const slowRooms = [...revenueByRoom]
    .filter((r) => r.total_bookings > 0)
    .sort((a, b) => a.total_bookings - b.total_bookings)
    .slice(0, 5)

  const totalAvgBookings =
    revenueByRoom.length > 0
      ? revenueByRoom.reduce((s, r) => s + r.total_bookings, 0) / revenueByRoom.length
      : 0

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      {/* Top selling */}
      <div className="border rounded-lg">
        <div className="px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Phòng bán tốt nhất</h3>
          <p className="text-xs text-muted-foreground">Top 10 theo doanh thu kỳ này</p>
        </div>
        {topRooms.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Phòng</span>
              <span className="text-right">Lượt</span>
              <span className="text-right">Doanh thu</span>
            </div>
            {topRooms.slice(0, 10).map((r) => (
              <div key={r.roomId} className="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">Phòng {r.roomNumber}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.roomType || '—'}</div>
                </div>
                <div className="text-right tabular-nums self-center">{r.bookings}</div>
                <div className="text-right tabular-nums self-center font-medium">{formatCurrency(r.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slow rooms */}
      <div className="border rounded-lg">
        <div className="px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Phòng bán chậm</h3>
          <p className="text-xs text-muted-foreground">
            Ít booking nhất kỳ này — gợi ý kiểm tra chất lượng/QC
          </p>
        </div>
        {slowRooms.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu</div>
        ) : (
          <div className="divide-y">
            <div className="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span>Phòng</span>
              <span className="text-right">Lượt</span>
              <span className="text-right">Doanh thu</span>
            </div>
            {slowRooms.map((r) => {
              const isLow = totalAvgBookings > 0 && r.total_bookings < totalAvgBookings * 0.3
              return (
                <div key={r.room_id} className="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">Phòng {r.room_number}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.room_type || '—'}</div>
                  </div>
                  <div className={`text-right tabular-nums self-center ${isLow ? 'text-red-600 font-medium' : ''}`}>
                    {r.total_bookings}
                  </div>
                  <div className="text-right tabular-nums self-center">{formatCurrency(r.total_revenue)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
