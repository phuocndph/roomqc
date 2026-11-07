import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useHotelContext } from '@/contexts/HotelContext'
import { useOperationsInsights, useOperationsAdvice } from '@/hooks/useOperationsInsights'
import { KpiHeroCardV2 } from '@/components/reports/insights/KpiHeroCardV2'
import { PnLTable, type PnLRow } from '@/components/reports/insights/PnLTable'
import { CostBreakdownChart } from '@/components/reports/insights/CostBreakdownChart'
import { SetTargetsDialog } from '@/components/reports/insights/SetTargetsDialog'
import { AdviceCard } from '@/components/reports/insights/AdviceCard'
import { RevenueVsCostChart } from '@/components/reports/RevenueVsCostChart'
import { ExportInsightsPdfButton } from '@/components/reports/insights/ExportInsightsPdfButton'
import { formatCurrency } from '@/lib/utils'
import { departmentLabel } from '@/lib/industryBenchmarks'
import { useUser } from '@/hooks/useUser'

interface Props {
  dateRange: { start: Date; end: Date }
}

export function OperationsInsightsTab({ dateRange }: Props) {
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const { role } = useUser()
  const canSetTargets = role === 'super_admin' || role === 'owner' || role === 'hotel_manager'
  const insights = useOperationsInsights(dateRange)
  const advice = useOperationsAdvice(insights.isFetching || insights.error ? undefined : insights.data)

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
      <div role="alert" className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
        Không tải được dữ liệu đánh giá. Vui lòng tải lại hoặc kiểm tra quyền xem báo cáo.
      </div>
    )
  }

  const { snapshot, derived, ruleFindings } = insights.data
  const aiList = advice.scopeEnabled && !advice.isBusy ? advice.data ?? [] : []
  const targets = snapshot.targets ?? {}
  const hasLaborData = snapshot.costBreakdown.labor > 0

  // P&L USALI rút gọn
  const departmentalCost = snapshot.costBreakdown.purchase + snapshot.costBreakdown.laundry + snapshot.costBreakdown.labor
  const undistributed = snapshot.costBreakdown.maintenance
  const gop = snapshot.netRevenue - departmentalCost
  const noi = gop - undistributed

  const pnlRows: PnLRow[] = [
    { label: 'DOANH THU GHI NHẬN', current: snapshot.netRevenue, bold: true, divider: true },
    { label: 'Lượt trả phòng sau hoa hồng (gồm phụ thu)', current: snapshot.roomNetRevenue, indent: true },
    { label: 'Phí giữ cọc no-show', current: snapshot.noShowFees, indent: true },
    { label: 'CHI PHÍ DEPARTMENTAL', current: departmentalCost, bold: true, isCost: true, divider: true },
    { label: 'Mua sắm vật tư', current: snapshot.costBreakdown.purchase, indent: true, isCost: true },
    { label: 'Giặt là', current: snapshot.costBreakdown.laundry, indent: true, isCost: true },
    { label: 'Nhân sự (ước tính từ ca)', current: snapshot.costBreakdown.labor, indent: true, isCost: true },
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
      label: `Nhân sự ước tính · ${departmentLabel(dept)}`,
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

      <p className="text-xs text-muted-foreground">Chi phí nhân sự là ước tính từ thời lượng ca đã ghi nhận và mức lương cấu hình, theo ngày bắt đầu ca; chưa phải bảng lương chốt hoặc tiền đã trả.</p>
      <p className="text-xs text-muted-foreground">Công suất ước tính từ ngày lưu trú đã ghi và số phòng hiện có, chưa tái dựng lịch sử chuyển phòng hoặc phòng ngừng bán. ADR dùng đêm của lượt đã trả phòng; RevPAR chỉ dùng doanh thu của lượt trả phòng. Lợi nhuận có chi phí nhân sự ước tính, chưa trừ ngân sách cố định. Múi giờ: {insights.data.recognitionTimezone}.</p>
      {insights.data.invalidCheckoutDates > 0 && <p role="alert" className="text-sm text-amber-800">Có {insights.data.invalidCheckoutDates} lượt trả phòng sai ngày lưu trú cần đối soát; không tính đêm phòng cho các lượt này.</p>}
      {snapshot.totalRooms === 0 && <p className="text-sm text-muted-foreground">Chưa có phòng nào trong phạm vi được phép. Công suất, ADR và RevPAR chưa thể dùng để đánh giá.</p>}
      {!insights.data.monthlyTargetsApplicable && <p className="text-xs text-muted-foreground">Mục tiêu tháng chỉ áp dụng khi kỳ bắt đầu từ đầu tháng và nằm trong cùng tháng.</p>}
      {!hasLaborData && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 text-xs text-amber-900 dark:text-amber-100">
          Chưa ghi nhận chi phí nhân sự trong kỳ. Hãy kiểm tra ca làm việc và mức lương cấu hình; giá trị 0 không xác nhận chưa phát sinh lương thực tế.
        </div>
      )}

      {/* 6 KPI hero */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiHeroCardV2
          label="GOP"
          value={formatCurrency(derived.gop)}
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
          deltaUnit="percentage-points"
          benchmark={{ metric: 'occupancy', value: derived.occupancy }}
          targetPct={occTarget ? (derived.occupancy / occTarget) * 100 : undefined}
          targetLabel={occTarget ? `${occTarget}%` : undefined}
        />
        <KpiHeroCardV2
          label="ADR"
          value={derived.adrAvailable ? formatCurrency(derived.adr) : 'Chưa đủ dữ liệu hợp lệ'}
          benchmark={derived.adrAvailable ? { metric: 'adr', value: derived.adr } : undefined}
          targetPct={derived.adrAvailable && targets.adr ? (derived.adr / targets.adr) * 100 : undefined}
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
        <RowKpi label="TRevPAR (doanh thu ghi nhận / phòng / ngày)" value={formatCurrency(derived.trevpar)} />
        <RowKpi label="CostPOR (chi phí / đêm bán)" value={derived.adrAvailable ? formatCurrency(derived.costPor) : 'Chưa đủ dữ liệu hợp lệ'} />
        <RowKpi label="Biên GOP" value={`${derived.gopMargin.toFixed(1)}%`} />
        <RowKpi label="Biên lợi nhuận thuần" value={`${derived.profitMargin.toFixed(1)}%`} />
        <RowKpi label="Dịch vụ thêm / tổng tiền lượt trả phòng" value={`${derived.extraRevenueShare.toFixed(1)}%`} />
        <RowKpi label="Doanh thu ghi nhận so kỳ trước" value={`${derived.revenueGrowth.toFixed(1)}%`} />
        <RowKpi label="Doanh thu ghi nhận so cùng kỳ năm trước" value={derived.yoyRevenueGrowth === undefined ? 'Chưa có doanh thu kỳ gốc để so sánh' : `${derived.yoyRevenueGrowth.toFixed(1)}%`} />
        <RowKpi label="Lượt trả phòng không hoàn tiền kỳ này / kỳ trước" value={`${snapshot.bookingsCount} / ${snapshot.prevBookingsCount}`} />
      </div>

      {/* Xu hướng */}
      <RevenueVsCostChart data={insights.data.daily} period={dateRange} />

      {/* Lời khuyên */}
      <section className="space-y-3" aria-label="Tư vấn vận hành">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold">Tư vấn AI</h3>
          <Button size="sm" disabled={!advice.scopeEnabled || !advice.pendingReady || advice.isBusy || !!advice.pending}
            onClick={() => { void advice.generate().catch(() => {}) }}>Tạo phân tích AI</Button>
        </div>
        <p className="text-xs text-muted-foreground">Chỉ tạo phân tích khi bạn bấm nút. Mỗi yêu cầu sử dụng hạn mức của gói; AI dựa trên dữ liệu tổng hợp tại thời điểm tạo và cần được đối chiếu.</p>
        {!advice.scopeEnabled && <p className="text-sm text-muted-foreground">Cần phiên, phạm vi báo cáo và quyền xem hợp lệ để dùng tư vấn AI.</p>}
        {advice.notice && <p role="alert" className="text-sm text-amber-800">{advice.notice}</p>}
        {advice.pending && <div className="space-y-2 rounded-lg border p-3">
          <p role="status" className="text-sm">{advice.receipt?.state === 'unknown'
            ? 'Chưa xác nhận được kết quả của yêu cầu đã gửi. Hạn mức vẫn được giữ; hệ thống không tự gửi lại.'
            : advice.receipt?.state === 'not_found' || advice.receipt?.state === 'reserved'
              ? 'Yêu cầu chưa xác nhận đã gửi tới AI. Bạn có thể tiếp tục cùng mã hoặc hủy yêu cầu chưa gửi.'
              : 'Có yêu cầu cần kiểm tra trong kỳ này. Kiểm tra kết quả trước khi tạo lần mới.'}</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" disabled={advice.isBusy} onClick={() => { void advice.lookup().catch(() => {}) }}>Kiểm tra kết quả</Button>
            {['not_found', 'reserved'].includes(advice.receipt?.state ?? '') && <Button size="sm" variant="outline" disabled={advice.isBusy}
              onClick={() => { void advice.resume().catch(() => {}) }}>Tiếp tục yêu cầu cũ</Button>}
            {advice.receipt?.state !== 'unknown' && <Button size="sm" variant="outline" disabled={advice.isBusy}
              onClick={() => { void advice.cancel().catch(() => {}) }}>Hủy yêu cầu chưa gửi</Button>}
            {advice.receipt?.state === 'unknown' && advice.receipt.can_close === true && <AlertDialog key={advice.scope}>
              <AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={advice.isBusy}>Đóng yêu cầu cũ</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Đóng yêu cầu chưa rõ kết quả?</AlertDialogTitle>
                  <AlertDialogDescription>Kết quả cũ chưa được xác nhận. Hạn mức đã dùng vẫn giữ. Đóng yêu cầu để có thể tạo yêu cầu mới; hệ thống không tự tạo hoặc gửi lại.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Giữ yêu cầu</AlertDialogCancel>
                  <AlertDialogAction disabled={advice.isBusy} onClick={() => { void advice.close().catch(() => {}) }}>Đóng yêu cầu</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>}
          </div>
          {advice.receipt?.state === 'unknown' && advice.receipt.can_close !== true &&
            <p className="text-xs text-muted-foreground">Sau thời hạn xử lý, bấm “Kiểm tra kết quả” để xem kết quả hoặc đóng yêu cầu cũ.</p>}
        </div>}
        {advice.receipt?.state === 'cancelled' && <p role="status" className="text-sm">Đã hủy yêu cầu chưa gửi tới AI.</p>}
        {advice.receipt?.state === 'closed_unknown' && <p role="status" className="text-sm">Đã đóng yêu cầu cũ. Hạn mức đã dùng vẫn giữ; bạn có thể chủ động tạo phân tích mới.</p>}

        {advice.isBusy && aiList.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        )}

        {!advice.isBusy && aiList.length === 0 && !advice.pending && !advice.notice && ruleFindings.length === 0 && (
          <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
            Chưa có phân tích AI. Chưa đủ cơ sở để kết luận vận hành ổn định.
          </div>
        )}

        {aiList.length > 0 &&
          aiList.map((a, i) => <AdviceCard key={`ai-${i}`} item={{ kind: 'ai', ...a }} />)}

        {aiList.length === 0 && !advice.isBusy && ruleFindings.length > 0 && (
          <>
            <h4 className="text-sm font-medium">Gợi ý cơ bản từ chỉ số</h4>
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
