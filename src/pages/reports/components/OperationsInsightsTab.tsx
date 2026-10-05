import { Skeleton } from '@/components/ui/skeleton'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRevenueReport } from '@/hooks/useRevenueReport'
import { useOperationsInsights, useOperationsAdvice } from '@/hooks/useOperationsInsights'
import { KpiHeroCardV2 } from '@/components/reports/insights/KpiHeroCardV2'
import { PnLTable, type PnLRow } from '@/components/reports/insights/PnLTable'
import { CostBreakdownChart } from '@/components/reports/insights/CostBreakdownChart'
import { SetTargetsDialog } from '@/components/reports/insights/SetTargetsDialog'
import { AdviceCard } from '@/components/reports/insights/AdviceCard'
import { InsightsTrendChart } from '@/components/reports/insights/InsightsTrendChart'
import { ExportInsightsPdfButton } from '@/components/reports/insights/ExportInsightsPdfButton'
import { formatCurrency } from '@/lib/utils'
import { departmentLabel } from '@/lib/industryBenchmarks'
import { useUser } from '@/hooks/useUser'

interface Props {
  dateRange: { start: Date; end: Date }
}

export function OperationsInsightsTab({ dateRange }: Props) {
  const { selectedHotel, isAllHotelsMode, availableHotels } = useHotelContext()
  const { role } = useUser()
  const canSetTargets = role === 'super_admin' || role === 'owner' || role === 'hotel_manager'
  const revenue = useRevenueReport('custom', dateRange)
  const insights = useOperationsInsights(dateRange)
  const advice = useOperationsAdvice(insights.data)

  const totalRooms = isAllHotelsMode
    ? availableHotels.reduce((s, h) => s + (h.total_rooms || 0), 0)
    : selectedHotel?.total_rooms || 0

  if (totalRooms === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Chưa có phòng nào được cấu hình. Vui lòng thêm phòng để xem báo cáo vận hành.
      </div>
    )
  }

  if (insights.isLoading || insights.isFetching || (!insights.data && !insights.error)) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (insights.error || !insights.data) {
    return (
      <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Chưa đủ dữ liệu để đánh giá. Cần ít nhất một số booking và chi phí trong kỳ.
      </div>
    )
  }

  const { snapshot, derived, ruleFindings } = insights.data
  const aiList = advice.data ?? []
  const targets = snapshot.targets ?? {}
  const hasLaborData = snapshot.costBreakdown.labor > 0

  // P&L USALI rút gọn
  const roomRevenue = snapshot.netRevenue - snapshot.extraRevenue
  const departmentalCost = snapshot.costBreakdown.purchase + snapshot.costBreakdown.laundry + snapshot.costBreakdown.labor
  const undistributed = snapshot.costBreakdown.maintenance
  const gop = snapshot.netRevenue - departmentalCost
  const noi = gop - undistributed

  const pnlRows: PnLRow[] = [
    { label: 'DOANH THU', current: snapshot.netRevenue, bold: true, divider: true },
    { label: 'Doanh thu phòng', current: roomRevenue, indent: true },
    { label: 'Dịch vụ & phụ thu', current: snapshot.extraRevenue, indent: true },
    { label: 'CHI PHÍ DEPARTMENTAL', current: departmentalCost, bold: true, isCost: true, divider: true },
    { label: 'Mua sắm vật tư', current: snapshot.costBreakdown.purchase, indent: true, isCost: true },
    { label: 'Giặt là', current: snapshot.costBreakdown.laundry, indent: true, isCost: true },
    { label: 'Nhân sự (lương)', current: snapshot.costBreakdown.labor, indent: true, isCost: true },
    { label: 'GOP (LỢI NHUẬN GỘP)', current: gop, bold: true, budget: targets.gop, divider: true },
    { label: 'CHI PHÍ KHÔNG PHÂN BỔ', current: undistributed, bold: true, isCost: true, divider: true },
    { label: 'Bảo trì', current: snapshot.costBreakdown.maintenance, indent: true, isCost: true },
    { label: 'NOI (LỢI NHUẬN VẬN HÀNH)', current: noi, bold: true, divider: true },
  ]

  // Cost breakdown by department: gom labor by department + non-labor categories
  const costSlices = [
    { key: 'purchase', label: 'Mua sắm', value: snapshot.costBreakdown.purchase },
    { key: 'laundry', label: 'Giặt là', value: snapshot.costBreakdown.laundry },
    { key: 'maintenance', label: 'Bảo trì', value: snapshot.costBreakdown.maintenance },
    ...Object.entries(snapshot.laborByDepartment ?? {}).map(([dept, v]) => ({
      key: `labor-${dept}`,
      label: `Lương ${departmentLabel(dept)}`,
      value: Number(v) || 0,
    })),
  ]

  // Target progress
  const occTarget = targets.occupancy
  const revparTarget = targets.revpar
  const gopparTarget = targets.goppar
  const laborRatioTarget = targets.labor_ratio

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Đánh giá vận hành</h2>
          <p className="text-sm text-muted-foreground">
            {dateRange.start.toLocaleDateString('vi-VN')} – {dateRange.end.toLocaleDateString('vi-VN')}
            {' • '}
            {snapshot.totalRooms} phòng • Chuẩn USALI rút gọn
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSetTargets && <SetTargetsDialog periodDate={dateRange.start} />}
          <ExportInsightsPdfButton
            insights={insights.data}
            advice={aiList}
            fallbackFindings={ruleFindings}
            hotelName={isAllHotelsMode ? 'Tất cả khách sạn' : selectedHotel?.name}
          />
        </div>
      </div>

      {!hasLaborData && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-100">
          Chưa cấu hình lương nhân viên — GOP và chỉ số nhân sự đang tính với chi phí lương = 0. Cập nhật lương giờ/tháng tại trang Cài đặt nhân viên để có số liệu chính xác.
        </div>
      )}

      {/* 6 KPI hero */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiHeroCardV2
          label="GOP"
          value={formatCurrency(derived.gop)}
          pop={derived.revenueGrowth}
          yoy={derived.yoyRevenueGrowth}
          targetPct={targets.gop ? (derived.gop / targets.gop) * 100 : undefined}
          targetLabel={targets.gop ? formatCurrency(targets.gop) : undefined}
          hint="Lợi nhuận gộp (USALI)"
        />
        <KpiHeroCardV2
          label="GOPPAR"
          value={formatCurrency(derived.goppar)}
          benchmark={{ metric: 'goppar', value: derived.goppar }}
          targetPct={gopparTarget ? (derived.goppar / gopparTarget) * 100 : undefined}
          targetLabel={gopparTarget ? formatCurrency(gopparTarget) : undefined}
          hint="GOP / phòng / ngày"
        />
        <KpiHeroCardV2
          label="RevPAR"
          value={formatCurrency(derived.revpar)}
          benchmark={{ metric: 'revpar', value: derived.revpar }}
          targetPct={revparTarget ? (derived.revpar / revparTarget) * 100 : undefined}
          targetLabel={revparTarget ? formatCurrency(revparTarget) : undefined}
        />
        <KpiHeroCardV2
          label="Lấp đầy"
          value={`${derived.occupancy.toFixed(1)}%`}
          pop={derived.occupancyGrowth}
          yoy={derived.yoyOccupancyGrowth}
          benchmark={{ metric: 'occupancy', value: derived.occupancy }}
          targetPct={occTarget ? (derived.occupancy / occTarget) * 100 : undefined}
          targetLabel={occTarget ? `${occTarget}%` : undefined}
        />
        <KpiHeroCardV2
          label="ADR"
          value={formatCurrency(derived.adr)}
          benchmark={{ metric: 'adr', value: derived.adr }}
          targetPct={targets.adr ? (derived.adr / targets.adr) * 100 : undefined}
          targetLabel={targets.adr ? formatCurrency(targets.adr) : undefined}
        />
        <KpiHeroCardV2
          label="Tỷ lệ lương"
          value={`${derived.laborRatio.toFixed(1)}%`}
          benchmark={{ metric: 'laborRatio', value: derived.laborRatio }}
          inverse
          targetPct={
            laborRatioTarget && derived.laborRatio > 0
              ? (laborRatioTarget / derived.laborRatio) * 100
              : undefined
          }
          targetLabel={laborRatioTarget ? `≤ ${laborRatioTarget}%` : undefined}
          hint="Lương / doanh thu"
        />
      </div>

      {/* P&L USALI */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Báo cáo lãi lỗ (USALI rút gọn)</h3>
        <PnLTable rows={pnlRows} />
      </section>

      {/* Cost breakdown by department */}
      <CostBreakdownChart slices={costSlices} />

      {/* KPI phụ */}
      <div className="border rounded-lg divide-y">
        <RowKpi label="TRevPAR (tổng DT / phòng / ngày)" value={formatCurrency(derived.trevpar)} />
        <RowKpi label="CostPOR (chi phí / đêm bán)" value={formatCurrency(derived.costPor)} />
        <RowKpi label="Biên GOP" value={`${derived.gopMargin.toFixed(1)}%`} />
        <RowKpi label="Biên lợi nhuận thuần" value={`${derived.profitMargin.toFixed(1)}%`} />
        <RowKpi label="Doanh thu dịch vụ thêm" value={`${derived.extraRevenueShare.toFixed(1)}%`} />
        <RowKpi label="Số booking kỳ này / kỳ trước" value={`${snapshot.bookingsCount} / ${snapshot.prevBookingsCount}`} />
      </div>

      {/* Xu hướng */}
      {revenue.data && <InsightsTrendChart data={revenue.data.monthlyTrends} />}

      {/* Lời khuyên */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Lời khuyên ưu tiên</h3>
          {advice.isLoading && <span className="text-xs text-muted-foreground">AI đang phân tích...</span>}
        </div>

        {advice.isLoading && aiList.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        )}

        {!advice.isLoading && aiList.length === 0 && ruleFindings.length === 0 && (
          <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
            Chưa có lời khuyên — vận hành đang ổn định.
          </div>
        )}

        {aiList.length > 0 &&
          aiList.map((a, i) => <AdviceCard key={`ai-${i}`} item={{ kind: 'ai', ...a }} />)}

        {aiList.length === 0 && !advice.isLoading && ruleFindings.length > 0 && (
          <>
            {advice.error && (
              <p className="text-xs text-amber-600">AI tạm thời không khả dụng — hiển thị gợi ý cơ bản.</p>
            )}
            {ruleFindings.slice(0, 6).map(f => (
              <AdviceCard key={f.id} item={{ kind: 'rule', ...f }} />
            ))}
          </>
        )}
      </section>
    </div>
  )
}

function RowKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
