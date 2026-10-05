import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useHousekeepingKpi } from '@/hooks/useHousekeepingKpi'
import { useRoomsNeedingActionToday } from '@/hooks/useRoomsNeedingActionToday'
import {
  useCheckoutToday,
  useCleaningProgressToday,
  useStaffPerformanceToday,
} from '@/hooks/useHousekeepingDashboardPanels'
import { useHotelContext } from '@/contexts/HotelContext'
import { KpiTopRow } from '@/components/housekeeping/dashboard/KpiTopRow'
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

  const kpi = useHousekeepingKpi(hotelId)
  const buckets = useRoomsNeedingActionToday(hotelId)
  const checkout = useCheckoutToday(hotelId)
  const progress = useCleaningProgressToday(hotelId)
  const staff = useStaffPerformanceToday(hotelId)
  const ops = useHousekeepingOpsSummary(hotelId)

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 max-w-[1600px] mx-auto w-full">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Buồng phòng</h1>
          <p className="text-xs text-muted-foreground">Việc cần xử lý và tình trạng phòng hôm nay</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/reports/housekeeping"><FileText className="h-4 w-4 mr-1.5" /> Báo cáo buồng</Link>
          </Button>
        </div>
      </header>

      {isAllHotelsMode && (
        <div className="border rounded-lg p-3 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400">
          Chọn một khách sạn cụ thể để xem cockpit Trưởng buồng phòng.
        </div>
      )}

      {!isAllHotelsMode && (
        <>
          {/* Hàng 1 — KPI 7 ô */}
          <KpiTopRow data={kpi.data} loading={kpi.isLoading} />

          {/* Hàng 2 — 4 panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <RoomActionListPanel data={buckets.data} loading={buckets.isLoading} />
            <CheckoutTodayPanel data={checkout.data} loading={checkout.isLoading} />
            <CleaningProgressPanel data={progress.data} loading={progress.isLoading} />
            <StaffPerformancePanel data={staff.data} loading={staff.isLoading} />
          </div>

          {/* Hàng 3 — Vận hành liên quan (Bảo trì / Thất lạc / Giặt ủi / Giao đồ) */}
          <OpsSummaryStrip data={ops.data} loading={ops.isLoading} />

          {/* Hàng 4 — Sơ đồ phòng lớn */}
          <FloorMapLarge />

        </>
      )}
    </div>
  )
}
