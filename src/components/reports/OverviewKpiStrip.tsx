import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { KpiScorecard, KpiScorecardStrip } from './KpiScorecard'
import { useOverviewKpiStrip } from '@/hooks/useOverviewKpiStrip'
import type { PeriodRangeWithPrevious } from '@/lib/reportPeriods'

interface Props {
  period: PeriodRangeWithPrevious
}

/**
 * Dải 6 KPI tổng cho trang `/reports`.
 * Click tile → drilldown sang hub liên quan.
 */
export function OverviewKpiStrip({ period }: Props) {
  const nav = useNavigate()
  const k = useOverviewKpiStrip(period)
  const { loading } = k

  const goFinance = (tab: string) => nav(`/reports/finance?tab=${tab}`)
  const goOperations = (tab: string) => nav(`/reports/operations?tab=${tab}`)

  return (
    <KpiScorecardStrip>
      <KpiScorecard
        label="Doanh thu thuần"
        value={formatCurrency(k.netRevenue.value)}
        deltaPct={loading ? null : k.netRevenue.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goFinance('revenue')}
      />
      <KpiScorecard
        label="Lợi nhuận"
        value={formatCurrency(k.profit.value)}
        deltaPct={loading ? null : k.profit.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goFinance('costs')}
      />
      <KpiScorecard
        label="Công suất phòng"
        value={`${k.occupancy.value.toFixed(1)}%`}
        deltaPct={loading ? null : k.occupancy.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goOperations('rooms')}
      />
      <KpiScorecard
        label="RevPAR"
        value={formatCurrency(k.revpar.value)}
        deltaPct={loading ? null : k.revpar.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goOperations('kpi')}
      />
      <KpiScorecard
        label="Chi phí vận hành"
        value={formatCurrency(k.cost.value)}
        deltaPct={loading ? null : k.cost.delta}
        goodDirection="down"
        loading={loading}
        onClick={() => goFinance('costs')}
      />
      <KpiScorecard
        label="Còn nợ"
        value={formatCurrency(k.debt.value)}
        deltaPct={loading ? null : k.debt.delta}
        goodDirection="down"
        loading={loading}
        onClick={() => goFinance('revenue')}
      />
    </KpiScorecardStrip>
  )
}
