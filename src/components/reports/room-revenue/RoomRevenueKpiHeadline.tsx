import { formatCurrency } from '@/lib/utils'
import { KpiScorecard } from '../KpiScorecard'
import { BenchmarkBadge } from '../insights/BenchmarkBadge'
import type { RoomRevenueMetrics } from '@/hooks/useRoomRevenueMetrics'

interface Props {
  m: RoomRevenueMetrics
}

/** 4 ô KPI lớn: Doanh thu phòng • Occupancy • ADR • RevPAR. */
export function RoomRevenueKpiHeadline({ m }: Props) {
  const { loading } = m
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <KpiScorecard
        label="Doanh thu phòng"
        value={formatCurrency(m.roomRevenue.value)}
        deltaPct={loading ? null : m.roomRevenue.delta}
        goodDirection="up"
        loading={loading}
        hint={`${m.roomNightsSold} đêm đã bán`}
      />
      <KpiScorecard
        label="Công suất"
        value={`${m.occupancy.value.toFixed(1)}%`}
        deltaPct={loading ? null : m.occupancy.delta}
        goodDirection="up"
        loading={loading}
        badge={!loading && m.occupancy.value > 0 ? <BenchmarkBadge metric="occupancy" value={m.occupancy.value} /> : null}
        hint={`${m.roomNightsSold}/${m.availableRoomNights} đêm`}
      />
      <KpiScorecard
        label="ADR (giá TB/đêm)"
        value={formatCurrency(m.adr.value)}
        deltaPct={loading ? null : m.adr.delta}
        goodDirection="up"
        loading={loading}
        badge={!loading && m.adr.value > 0 ? <BenchmarkBadge metric="adr" value={m.adr.value} /> : null}
      />
      <KpiScorecard
        label="RevPAR"
        value={formatCurrency(m.revpar.value)}
        deltaPct={loading ? null : m.revpar.delta}
        goodDirection="up"
        loading={loading}
        badge={!loading && m.revpar.value > 0 ? <BenchmarkBadge metric="revpar" value={m.revpar.value} /> : null}
        hint={m.alos > 0 ? `ALOS ${m.alos.toFixed(1)} đêm` : undefined}
      />
    </div>
  )
}
