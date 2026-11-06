import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '@/lib/utils'
import { KpiScorecard, KpiScorecardStrip } from './KpiScorecard'
import type { useOverviewKpiStrip } from '@/hooks/useOverviewKpiStrip'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  kpis: ReturnType<typeof useOverviewKpiStrip>
}

/**
 * Dải 6 KPI tổng cho trang `/reports`.
 * Click tile → drilldown sang hub liên quan.
 */
export function OverviewKpiStrip({ kpis }: Props) {
  const nav = useNavigate()
  const { data: k, loading, error } = kpis

  const goFinance = (tab: string) => nav(`/reports/finance?tab=${tab}`)
  const goOperations = (tab: string) => nav(`/reports/operations?tab=${tab}`)

  if (error) return <div role="alert" className="rounded-lg border p-4 text-sm">Không tải được tổng quan. Vui lòng tải lại hoặc kiểm tra quyền xem báo cáo.</div>
  if (loading) return <Skeleton className="h-28 w-full" />
  if (!k) return <p className="text-sm text-muted-foreground">Đăng nhập và chọn khách sạn để xem tổng quan.</p>

  return (
    <KpiScorecardStrip>
      <KpiScorecard
        label="Doanh thu ghi nhận"
        value={formatCurrency(k.netRevenue.value)}
        deltaPct={loading ? null : k.netRevenue.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goFinance('revenue')}
      />
      <KpiScorecard
        label="Lợi nhuận trước lương và chi phí cố định"
        value={formatCurrency(k.profit.value)}
        deltaPct={loading ? null : k.profit.delta}
        goodDirection="up"
        loading={loading}
        onClick={() => goFinance('costs')}
      />
      <KpiScorecard
        label="Công suất phòng (ước tính)"
        value={`${k.occupancy.value.toFixed(1)}%`}
        deltaPct={loading ? null : k.occupancy.delta}
        deltaUnit="percentage-points"
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
        label="Chi phí trực tiếp"
        value={formatCurrency(k.cost.value)}
        deltaPct={loading ? null : k.cost.delta}
        goodDirection="down"
        loading={loading}
        onClick={() => goFinance('costs')}
      />
      <KpiScorecard
        label="Còn nợ của lượt trả phòng"
        value={formatCurrency(k.debt.value)}
        deltaPct={loading ? null : k.debt.delta}
        goodDirection="down"
        loading={loading}
        onClick={() => goFinance('revenue')}
      />
    </KpiScorecardStrip>
  )
}
