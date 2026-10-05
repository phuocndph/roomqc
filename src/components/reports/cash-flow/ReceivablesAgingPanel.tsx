import { formatCurrency } from '@/lib/utils'
import type { AgingBucket, ReceivableBooking } from '@/hooks/useCashFlowReport'

interface Props {
  aging: AgingBucket[]
  top: ReceivableBooking[]
  loading?: boolean
}

const BUCKET_TONE: Record<AgingBucket['key'], string> = {
  '0_7': 'text-foreground',
  '8_30': 'text-amber-600',
  '31_60': 'text-amber-700',
  '60_plus': 'text-red-600',
}

export function ReceivablesAgingPanel({ aging, top, loading }: Props) {
  if (loading) {
    return <div className="rounded-lg border border-border h-44 animate-pulse bg-muted/30" />
  }
  const total = aging.reduce((s, b) => s + b.amount, 0)
  if (total === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
        Không có công nợ phải thu — tốt!
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Công nợ phải thu (Aging)</h3>
        <span className="text-xs font-mono">{formatCurrency(total)}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-b border-border">
        {aging.map((b) => (
          <div key={b.key} className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {b.label}
            </div>
            <div className={`text-sm font-mono mt-1 ${BUCKET_TONE[b.key]}`}>
              {formatCurrency(b.amount)}
            </div>
            <div className="text-[11px] text-muted-foreground">{b.count} booking</div>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="p-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Top nợ
          </div>
          <ul className="divide-y divide-border">
            {top.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {r.guest_name || 'Khách'}{' '}
                    {r.room_number && (
                      <span className="text-muted-foreground">· P.{r.room_number}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Checkout {r.check_out_date?.slice(0, 10) || '—'} · {r.age_days} ngày
                  </div>
                </div>
                <div className="font-mono tabular-nums text-red-600 ml-2">
                  {formatCurrency(r.debt)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
