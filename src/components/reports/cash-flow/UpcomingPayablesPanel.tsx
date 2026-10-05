import { formatCurrency } from '@/lib/utils'
import type { UpcomingPayableItem } from '@/hooks/useCashFlowReport'

interface Props {
  rows: UpcomingPayableItem[]
  loading?: boolean
}

function dueTone(days: number | null) {
  if (days == null) return 'text-muted-foreground'
  if (days < 0) return 'text-red-600'
  if (days <= 7) return 'text-amber-600'
  return 'text-foreground'
}

function dueLabel(days: number | null, due: string | null) {
  if (days == null) return '—'
  if (days < 0) return `Trễ ${Math.abs(days)} ngày`
  if (days === 0) return 'Hôm nay'
  if (days === 1) return 'Ngày mai'
  if (due) return `Còn ${days} ngày`
  return `Còn ${days} ngày`
}

export function UpcomingPayablesPanel({ rows, loading }: Props) {
  if (loading) {
    return <div className="rounded-lg border border-border h-40 animate-pulse bg-muted/30" />
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        Không có khoản phải trả trong 30 ngày tới.
      </div>
    )
  }
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="rounded-lg border border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Sắp phải trả (30 ngày tới)</h3>
        <span className="text-xs font-mono">{formatCurrency(total)}</span>
      </div>
      <ul className="divide-y divide-border max-h-[400px] overflow-y-auto">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between p-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{r.label}</div>
              <div className="text-[11px] text-muted-foreground">
                <span className="font-mono">{r.code}</span>
                {r.due_date && (
                  <>
                    {' · '}
                    <span className={dueTone(r.days_to_due)}>
                      {dueLabel(r.days_to_due, r.due_date)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="font-mono tabular-nums text-sm">
              {formatCurrency(r.amount)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
