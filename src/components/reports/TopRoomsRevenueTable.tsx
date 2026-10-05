import { RoomRevenue } from '@/hooks/useRevenueReport'
import { formatCurrency } from '@/lib/utils'

interface Props {
  data: RoomRevenue[]
}

export function TopRoomsRevenueTable({ data }: Props) {
  if (!data.length) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu phòng
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-3 font-medium text-xs text-muted-foreground">#</th>
            <th className="text-left p-3 font-medium text-xs text-muted-foreground">Phòng</th>
            <th className="text-left p-3 font-medium text-xs text-muted-foreground">Loại</th>
            <th className="text-right p-3 font-medium text-xs text-muted-foreground">Bookings</th>
            <th className="text-right p-3 font-medium text-xs text-muted-foreground">Doanh thu</th>
            <th className="text-right p-3 font-medium text-xs text-muted-foreground">Phụ thu</th>
            <th className="text-right p-3 font-medium text-xs text-muted-foreground">Tổng</th>
          </tr>
        </thead>
        <tbody>
          {data.map((room, idx) => (
            <tr key={room.roomId} className="border-b last:border-0">
              <td className="p-3 text-muted-foreground">{idx + 1}</td>
              <td className="p-3 font-medium">{room.roomNumber}</td>
              <td className="p-3 text-muted-foreground text-xs">{room.roomType}</td>
              <td className="p-3 text-right">{room.bookings}</td>
              <td className="p-3 text-right font-mono text-xs">{formatCurrency(room.revenue)}</td>
              <td className="p-3 text-right font-mono text-xs text-amber-600">
                {room.surcharges > 0 ? formatCurrency(room.surcharges) : '-'}
              </td>
              <td className="p-3 text-right font-mono text-xs font-semibold">{formatCurrency(room.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
