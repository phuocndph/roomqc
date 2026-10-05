import { formatCurrency } from '@/lib/utils'
import { KpiScorecard } from '../KpiScorecard'
import type { CashFlowReport } from '@/hooks/useCashFlowReport'

interface Props {
  m: CashFlowReport
}

/** 4 KPI lớn: Tiền vào • Tiền ra • Net cash • Số dư công nợ. */
export function CashFlowKpiHeadline({ m }: Props) {
  const { loading } = m
  const receivablesCount = m.topReceivables.length
  const otaCount = m.otaPending.reduce((s, o) => s + o.bookings, 0)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <KpiScorecard
        label="Tiền vào kỳ"
        value={formatCurrency(m.cashIn.value)}
        deltaPct={loading ? null : m.cashIn.delta}
        goodDirection="up"
        loading={loading}
        hint={m.cashInByChannel.length > 0 ? `${m.cashInByChannel.length} kênh` : undefined}
      />
      <KpiScorecard
        label="Tiền ra kỳ"
        value={formatCurrency(m.cashOut.value)}
        deltaPct={loading ? null : m.cashOut.delta}
        goodDirection="down"
        loading={loading}
        hint={m.cashOutByGroup.length > 0 ? `${m.cashOutByGroup.length} nhóm chi` : undefined}
      />
      <KpiScorecard
        label="Net cash"
        value={formatCurrency(m.netCash.value)}
        deltaPct={loading ? null : m.netCash.delta}
        goodDirection="up"
        loading={loading}
        hint={m.netCash.value < 0 ? 'Âm dòng tiền' : 'Dương dòng tiền'}
      />
      <KpiScorecard
        label="Công nợ phải thu"
        value={formatCurrency(m.receivablesTotal.value)}
        goodDirection="down"
        loading={loading}
        hint={`${receivablesCount} booking · ${otaCount} qua OTA`}
      />
    </div>
  )
}
