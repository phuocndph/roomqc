import { Skeleton } from '@/components/ui/skeleton'
import { useRoomPerformance } from '@/hooks/useRoomPerformance'
import { formatCurrency } from '@/lib/utils'

export function PanelPerformance({ roomId }: { roomId: string }) {
  const { data, isLoading, isError } = useRoomPerformance(roomId, 30)

  if (isLoading) return <Skeleton className="h-20 w-full" />
  if (isError) return <p className="text-sm text-muted-foreground">Chưa tải được thống kê phòng.</p>

  const metrics = [
    ['Doanh thu', formatCurrency(data?.totalRevenue || 0)],
    ['Tỷ lệ lấp đầy', `${Math.round((data?.occupancyRate || 0) * 100)}%`],
    ['Giá phòng trung bình / đêm', formatCurrency(data?.adr || 0)],
    ['Số đặt phòng', String(data?.bookingCount || 0)],
    ['Lượt khách', String(data?.guestCount || 0)],
    ['Thời gian ở trung bình', `${(data?.avgStayNights || 0).toFixed(1)} đêm`],
  ]

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
      {metrics.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
