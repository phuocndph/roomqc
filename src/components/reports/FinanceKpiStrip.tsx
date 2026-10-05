import { useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { computeDelta, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'
import { useRevenueReport } from '@/hooks/useRevenueReport'
import { useFinancialReport } from '@/hooks/useReports'
import { KpiScorecard, KpiScorecardStrip } from './KpiScorecard'

interface Props {
  period: PeriodRangeWithPrevious
}

/**
 * Strip 6 KPI cho Finance Hub.
 * - Doanh thu thuần • Đã thu • Còn nợ • Tổng chi phí • Lợi nhuận • Biên LN
 * - Mỗi tile so kỳ trước cùng độ dài.
 */
export function FinanceKpiStrip({ period }: Props) {
  const { current, previous } = period

  // Revenue hook tự tính current + previous nếu period='custom'
  const revQ = useRevenueReport('custom', { start: current.start, end: current.end })

  // Financial cần fetch riêng 2 lần (current + previous) để có delta
  const finCurQ = useFinancialReport({ start: current.start, end: current.end })
  const finPrevQ = useFinancialReport({ start: previous.start, end: previous.end })

  const loading = revQ.isLoading || finCurQ.isLoading || finPrevQ.isLoading

  const kpis = useMemo(() => {
    const cur = revQ.data?.currentPeriod
    const prev = revQ.data?.previousPeriod
    const finCur = finCurQ.data?.summary
    const finPrev = finPrevQ.data?.summary

    const netRevenue = cur?.netRevenue ?? 0
    const netRevenuePrev = prev?.netRevenue ?? 0
    const paid = cur?.paidRevenue ?? 0
    const paidPrev = prev?.paidRevenue ?? 0
    const pending = cur?.pendingRevenue ?? 0
    const pendingPrev = prev?.pendingRevenue ?? 0

    const cost = finCur?.total_cost ?? 0
    const costPrev = finPrev?.total_cost ?? 0
    const profit = netRevenue - cost
    const profitPrev = netRevenuePrev - costPrev
    const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0
    const marginPrev = netRevenuePrev > 0 ? (profitPrev / netRevenuePrev) * 100 : 0

    return {
      netRevenue: { value: netRevenue, delta: computeDelta(netRevenue, netRevenuePrev) },
      paid: { value: paid, delta: computeDelta(paid, paidPrev) },
      pending: { value: pending, delta: computeDelta(pending, pendingPrev) },
      cost: { value: cost, delta: computeDelta(cost, costPrev) },
      profit: { value: profit, delta: computeDelta(profit, profitPrev) },
      margin: { value: margin, delta: margin - marginPrev },
    }
  }, [revQ.data, finCurQ.data, finPrevQ.data])

  return (
    <KpiScorecardStrip>
      <KpiScorecard
        label="Doanh thu thuần"
        value={formatCurrency(kpis.netRevenue.value)}
        deltaPct={loading ? null : kpis.netRevenue.delta}
        goodDirection="up"
        loading={loading}
      />
      <KpiScorecard
        label="Đã thu"
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
  )
}
