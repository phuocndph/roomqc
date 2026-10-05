import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PeriodPresetChips } from '@/components/reports/PeriodPresetChips'
import { resolvePeriod, type PeriodPresetId, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'
import { useRoomRevenueMetrics } from '@/hooks/useRoomRevenueMetrics'
import { useReportExport } from '@/hooks/useReportExport'
import { RoomRevenueKpiHeadline } from '@/components/reports/room-revenue/RoomRevenueKpiHeadline'
import { OccupancyRevparChart } from '@/components/reports/room-revenue/OccupancyRevparChart'
import { TopRoomsTable } from '@/components/reports/room-revenue/TopRoomsTable'
import { ChannelMixPanel } from '@/components/reports/room-revenue/ChannelMixPanel'
import { RoomRevenueInsights } from '@/components/reports/room-revenue/RoomRevenueInsights'

interface Props {
  /** Khi render trong Hub: nhận period từ chip ngoài. Standalone: undefined → tự quản. */
  period?: PeriodRangeWithPrevious
  /** Ẩn header + chip nội bộ khi nhúng vào tab Hub. */
  embedded?: boolean
}

/**
 * /reports/room-revenue
 * Báo cáo doanh thu phòng — trang chính cho chủ KS xem hàng ngày.
 */
export function RoomRevenueReportPage({ period: embeddedPeriod, embedded }: Props = {}) {
  const [presetId, setPresetId] = useState<PeriodPresetId>('this_month')
  const period = embeddedPeriod ?? resolvePeriod(presetId)
  const m = useRoomRevenueMetrics(period)
  const { exportToExcel, isExporting } = useReportExport()

  const handleExport = () => {
    if (!m.revenue) return
    const dateRange = `${period.current.start.toLocaleDateString('vi-VN')} – ${period.current.end.toLocaleDateString('vi-VN')}`
    exportToExcel(
      {
        title: 'Báo cáo Doanh thu phòng',
        dateRange,
        tables: [
          {
            title: 'Doanh thu phòng',
            headers: ['Chỉ số', 'Kỳ này', 'Kỳ trước', 'Thay đổi'],
            rows: [
              ['Doanh thu phòng', m.roomRevenue.value, '', `${m.roomRevenue.delta?.toFixed(1) ?? '-'}%`],
              ['Công suất (%)', m.occupancy.value, '', `${m.occupancy.delta?.toFixed(1) ?? '-'}%`],
              ['ADR', m.adr.value, '', `${m.adr.delta?.toFixed(1) ?? '-'}%`],
              ['RevPAR', m.revpar.value, '', `${m.revpar.delta?.toFixed(1) ?? '-'}%`],
              ['ALOS (đêm)', m.alos.toFixed(1), '', ''],
            ],
          },
          {
            title: 'Top phòng',
            headers: ['Phòng', 'Doanh thu', 'Số đêm'],
            rows: (m.revenue?.topRooms || []).map(r => [r.roomNumber, r.total, r.bookings]),
          },
        ],
      },
      'room-revenue'
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 p-3 sm:p-4 max-w-7xl mx-auto'}>
      {!embedded && (
        <>
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Doanh thu phòng</h1>
            <p className="text-sm text-muted-foreground">
              Hôm nay thu bao nhiêu? Lấp đầy bao nhiêu %? Giá trung bình mỗi đêm?
            </p>
          </header>
          <PeriodPresetChips value={presetId} onChange={setPresetId} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || m.loading}>
              <Download className="w-4 h-4 mr-1" />
              {isExporting ? 'Đang xuất…' : 'Xuất Excel'}
            </Button>
          </div>
        </>
      )}

      <RoomRevenueKpiHeadline m={m} />

      <OccupancyRevparChart data={m.rooms?.occupancyTrend || []} loading={m.loading} />

      <TopRoomsTable
        topRooms={m.revenue?.topRooms || []}
        revenueByRoom={m.rooms?.revenueByRoom || []}
        loading={m.loading}
      />

      <ChannelMixPanel bySource={m.revenue?.bySource || []} loading={m.loading} />

      <RoomRevenueInsights m={m} />
    </div>
  )
}

export default RoomRevenueReportPage
