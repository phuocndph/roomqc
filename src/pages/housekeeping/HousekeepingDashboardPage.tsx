import { Link } from 'react-router-dom'
import { Building2, ChevronDown, ClipboardCheck, ClipboardList, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRoomsNeedingActionToday } from '@/hooks/useRoomsNeedingActionToday'
import { useCheckoutToday, useCleaningProgressToday, useStaffPerformanceToday } from '@/hooks/useHousekeepingDashboardPanels'
import { useHotelContext } from '@/contexts/HotelContext'
import { RoomActionListPanel } from '@/components/housekeeping/dashboard/RoomActionListPanel'
import { CheckoutTodayPanel } from '@/components/housekeeping/dashboard/CheckoutTodayPanel'
import { CleaningProgressPanel } from '@/components/housekeeping/dashboard/CleaningProgressPanel'
import { StaffPerformancePanel } from '@/components/housekeeping/dashboard/StaffPerformancePanel'
import { FloorMapLarge } from '@/components/housekeeping/dashboard/FloorMapLarge'
import { OpsSummaryStrip } from '@/components/housekeeping/dashboard/OpsSummaryStrip'
import { useHousekeepingOpsSummary } from '@/hooks/useHousekeepingOpsSummary'

export default function HousekeepingDashboardPage() {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const hotelId = isAllHotelsMode ? null : selectedHotel?.id

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-0">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Buồng phòng</h1><p className="mt-1 text-sm text-muted-foreground">Theo dõi phòng, giao việc và kiểm tra kết quả.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><Link to="/my-tasks"><ClipboardList className="h-4 w-4" />Việc của tôi</Link></Button>
        <Button asChild size="sm"><Link to="/housekeeping/review"><ClipboardCheck className="h-4 w-4" />Việc chờ duyệt</Link></Button>
      </div>
    </header>
    {hotelId ? <HotelHousekeepingDashboard key={hotelId} hotelId={hotelId} /> : (
      <div className="space-y-2 border p-6 text-center"><Building2 className="mx-auto h-8 w-8 text-primary" /><h2 className="font-semibold">Chọn khách sạn để xem buồng phòng</h2><p className="text-sm text-muted-foreground">Dùng bộ chọn khách sạn ở đầu màn hình.</p></div>
    )}
  </div>
}

function HotelHousekeepingDashboard({ hotelId }: { hotelId: string }) {
  const buckets = useRoomsNeedingActionToday(hotelId)
  const checkout = useCheckoutToday(hotelId)
  const progress = useCleaningProgressToday(hotelId)
  const staff = useStaffPerformanceToday(hotelId)
  const ops = useHousekeepingOpsSummary(hotelId)

  return <>
    <FloorMapLarge work={progress.data} workLoading={progress.isLoading} workError={progress.isError} onRetryWork={() => void progress.refetch()} />
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <RoomActionListPanel data={buckets.data} loading={buckets.isLoading} isError={buckets.isError} onRetry={() => void buckets.refetch()} />
      <CheckoutTodayPanel data={checkout.data} loading={checkout.isLoading} isError={checkout.isError} onRetry={() => void checkout.refetch()} />
    </div>
    <OpsSummaryStrip data={ops.data} loading={ops.isLoading} isError={ops.isError} onRetry={() => void ops.refetch()} />
    <details className="group border bg-background">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>Tiến độ & nhân sự</span><span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">Xem chi tiết<ChevronDown className="h-4 w-4 group-open:rotate-180" /></span>
      </summary>
      <div className="grid gap-4 border-t p-4 xl:grid-cols-2">
        <CleaningProgressPanel data={progress.data} loading={progress.isLoading} isError={progress.isError} onRetry={() => void progress.refetch()} />
        <StaffPerformancePanel data={staff.data} loading={staff.isLoading} isError={staff.isError} onRetry={() => void staff.refetch()} />
      </div>
    </details>
    <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
      <Link to="/reports/housekeeping" className="inline-flex items-center gap-2 text-primary hover:underline"><FileText className="h-4 w-4" />Báo cáo buồng phòng</Link>
      <Link to="/housekeeping/qc" className="text-primary hover:underline">Chất lượng kiểm tra phòng</Link>
    </div>
  </>
}
