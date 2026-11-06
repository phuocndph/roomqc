import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { computeDelta, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'
import { NoShowFinanceSummary } from './NoShowFinanceSummary'
import { useFinancialReport } from '@/hooks/useReports'
import { KpiScorecard, KpiScorecardStrip } from './KpiScorecard'

interface Props {
  period: PeriodRangeWithPrevious
}

/**
 * Strip 6 KPI cho Finance Hub.
 * - Doanh thu thuần • Đã thu • Còn nợ • Tổng chi phí • Lợi nhuận • Biên LN
 * - Mọi tile dùng đúng hai khoảng ngày current/previous do người dùng chọn.
 */
export function FinanceKpiStrip({ period }: Props) {
  const { current, previous } = period

  // Financial cần fetch riêng 2 lần (current + previous) để có delta
  const finCurQ = useFinancialReport({ start: current.start, end: current.end })
  const finPrevQ = useFinancialReport({ start: previous.start, end: previous.end })

  const loading = finCurQ.isPending || finPrevQ.isPending

  const kpis = useMemo(() => {
    const cur = finCurQ.data?.revenue_summary
    const prev = finPrevQ.data?.revenue_summary
    const finCur = finCurQ.data?.cost_summary
    const finPrev = finPrevQ.data?.cost_summary

    const netRevenue = cur?.recognized_revenue ?? 0
    const netRevenuePrev = prev?.recognized_revenue ?? 0
    const paid = cur?.paid_revenue ?? 0
    const paidPrev = prev?.paid_revenue ?? 0
    const pending = cur?.pending_revenue ?? 0
    const pendingPrev = prev?.pending_revenue ?? 0

    const cost = finCur?.total_cost ?? 0
    const costPrev = finPrev?.total_cost ?? 0
    const profit = finCurQ.data?.profit_summary.net_profit ?? 0
    const profitPrev = finPrevQ.data?.profit_summary.net_profit ?? 0
    const margin = finCurQ.data?.profit_summary.profit_margin ?? 0
    const marginPrev = finPrevQ.data?.profit_summary.profit_margin ?? 0

    return {
      netRevenue: { value: netRevenue, delta: computeDelta(netRevenue, netRevenuePrev) },
      paid: { value: paid, delta: computeDelta(paid, paidPrev) },
      pending: { value: pending, delta: computeDelta(pending, pendingPrev) },
      cost: { value: cost, delta: computeDelta(cost, costPrev) },
      profit: { value: profit, delta: computeDelta(profit, profitPrev) },
      margin: { value: margin, delta: margin - marginPrev },
    }
  }, [finCurQ.data, finPrevQ.data])

  if (finCurQ.isError || finPrevQ.isError) return <p role="alert">Không tải được báo cáo tài chính. Vui lòng tải lại hoặc kiểm tra quyền xem.</p>
  return (<div className="space-y-3">
    <KpiScorecardStrip>
      <KpiScorecard
        label="Doanh thu ghi nhận"
        hint="Phòng sau hoa hồng + phí khách không đến"
        value={formatCurrency(kpis.netRevenue.value)}
        deltaPct={loading ? null : kpis.netRevenue.delta}
        goodDirection="up"
        loading={loading}
      />
      <KpiScorecard
        label="Đã thanh toán · lượt trả phòng"
        hint="Theo kỳ trả phòng; tiền thực thu xem tại Dòng tiền"
        value={formatCurrency(kpis.paid.value)}
        deltaPct={loading ? null : kpis.paid.delta}
        goodDirection="up"
        loading={loading}
      />
      <KpiScorecard
        label="Còn nợ"
        value={formatCurrency(kpis.pending.value)}
        deltaPct={loading ? null : kpis.pending.delta}
        goodDirection="down"
        loading={loading}
      />
      <KpiScorecard
        label="Tổng chi phí"
        value={formatCurrency(kpis.cost.value)}
        deltaPct={loading ? null : kpis.cost.delta}
        goodDirection="down"
        loading={loading}
      />
      <KpiScorecard
        label="Lợi nhuận vận hành"
        value={formatCurrency(kpis.profit.value)}
        deltaPct={loading ? null : kpis.profit.delta}
        goodDirection="up"
        loading={loading}
      />
      <KpiScorecard
        label="Biên LN"
        value={`${kpis.margin.value.toFixed(1)}%`}
        deltaPct={loading ? null : kpis.margin.delta}
        goodDirection="up"
        loading={loading}
        hint={
          kpis.margin.value >= 20
            ? 'Tốt'
            : kpis.margin.value >= 10
              ? 'Trung bình'
              : 'Dưới ngưỡng'
        }
      />
    </KpiScorecardStrip>
    {finCurQ.data && <NoShowFinanceSummary report={{ noShow: finCurQ.data.no_show, recognitionTimezone: finCurQ.data.recognition_timezone }} />}
  </div>)
}
