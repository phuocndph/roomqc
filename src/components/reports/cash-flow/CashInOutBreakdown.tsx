import { formatCurrency } from '@/lib/utils'
import type {
  CashInBreakdownItem,
  CashOutBreakdownItem,
} from '@/hooks/useCashFlowReport'

interface Props {
  cashIn: CashInBreakdownItem[]
  cashOut: CashOutBreakdownItem[]
  loading?: boolean
}

function BreakdownTable({
  title,
  rows,
  emptyText,
  tone,
}: {
  title: string
  rows: { key: string; label: string; amount: number; count: number }[]
  emptyText: string
  tone: 'in' | 'out'
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const accent = tone === 'in' ? 'bg-green-500/80' : 'bg-red-500/70'
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs font-mono">{formatCurrency(total)}</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const pct = total > 0 ? (r.amount / total) * 100 : 0
            return (
              <li key={r.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">
                    {r.label}{' '}
                    <span className="text-muted-foreground">· {r.count}</span>
                  </span>
                  <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${accent}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function CashInOutBreakdown({ cashIn, cashOut, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border h-44 animate-pulse bg-muted/30" />
        <div className="rounded-lg border border-border h-44 animate-pulse bg-muted/30" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <BreakdownTable
        title="Tiền vào theo kênh"
        rows={cashIn}
        emptyText="Chưa có khoản thu trong kỳ."
        tone="in"
      />
      <BreakdownTable
        title="Tiền ra theo nhóm"
        rows={cashOut}
        emptyText="Chưa có khoản chi trong kỳ."
        tone="out"
      />
    </div>
  )
}
