import type { CashFlowReport } from '@/hooks/useCashFlowReport'
import { formatCurrency } from '@/lib/utils'

interface Props {
  m: CashFlowReport
}

interface Insight {
  id: string
  tone: 'danger' | 'warning' | 'info'
  title: string
  description: string
}

const TONE: Record<Insight['tone'], string> = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
}

export function CashFlowInsights({ m }: Props) {
  if (m.loading) return null
  const insights: Insight[] = []

  if (m.netCash.value < 0) {
    insights.push({
      id: 'net-negative',
      tone: 'danger',
      title: 'Âm dòng tiền kỳ này',
      description: `Tiền ra ${formatCurrency(m.cashOut.value)} vượt tiền vào ${formatCurrency(m.cashIn.value)} — chênh ${formatCurrency(Math.abs(m.netCash.value))}.`,
    })
  }

  const over30 = m.aging.filter((b) => b.key === '31_60' || b.key === '60_plus')
  const over30Amt = over30.reduce((s, b) => s + b.amount, 0)
  const allDebt = m.receivablesTotal.value
  if (allDebt > 0 && over30Amt / allDebt > 0.3) {
    insights.push({
      id: 'aging-stale',
      tone: 'warning',
      title: 'Công nợ cũ tích tụ',
      description: `${formatCurrency(over30Amt)} công nợ trên 30 ngày (${((over30Amt / allDebt) * 100).toFixed(0)}% tổng nợ). Cần đôn đốc thu hồi.`,
    })
  }

  const otaPendingTotal = m.otaPending.reduce((s, o) => s + o.pending, 0)
  if (otaPendingTotal > 0 && otaPendingTotal > m.cashIn.value * 0.2) {
    insights.push({
      id: 'ota-pending-high',
      tone: 'warning',
      title: 'OTA giữ tiền nhiều',
      description: `${formatCurrency(otaPendingTotal)} đang chờ OTA chuyển — chiếm hơn 20% tiền vào kỳ này.`,
    })
  }

  const next7 = m.upcomingPayables.filter((p) => (p.days_to_due ?? 999) <= 7)
  const next7Total = next7.reduce((s, p) => s + p.amount, 0)
  if (next7Total > 0 && next7Total > m.cashIn.value && m.cashIn.value > 0) {
    insights.push({
      id: 'payables-spike',
      tone: 'danger',
      title: 'Khoản phải trả tuần tới lớn hơn tiền vào kỳ',
      description: `Sắp phải trả ${formatCurrency(next7Total)} trong 7 ngày — chuẩn bị dòng tiền trước.`,
    })
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Dòng tiền ổn định ✓</p>
        <p className="text-xs text-muted-foreground mt-1">
          Không có cảnh báo nào về dòng tiền lúc này.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {insights.map((a) => (
        <div key={a.id} className="flex items-start gap-3 p-3">
          <span aria-hidden className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${TONE[a.tone]}`} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{a.title}</div>
            <div className="text-xs text-muted-foreground">{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
