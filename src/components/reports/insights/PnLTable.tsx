import { formatCurrency, cn } from '@/lib/utils'

export interface PnLRow {
  label: string
  current: number
  previous?: number
  yoy?: number
  budget?: number
  bold?: boolean
  indent?: boolean
  /** Tô đậm divider phía dưới */
  divider?: boolean
  /** Hiển thị âm = chi phí */
  isCost?: boolean
}

interface Props {
  rows: PnLRow[]
}

function formatVnd(v: number, isCost?: boolean) {
  if (!isFinite(v)) return '—'
  const sign = isCost && v > 0 ? '−' : ''
  return sign + formatCurrency(Math.abs(v))
}

function deltaCell(current: number, compare?: number, isCost?: boolean) {
  if (compare === undefined || compare === 0) return <span className="text-muted-foreground">—</span>
  const delta = ((current - compare) / Math.abs(compare)) * 100
  if (!isFinite(delta)) return <span className="text-muted-foreground">—</span>
  const positive = isCost ? delta < 0 : delta > 0
  const color = Math.abs(delta) < 0.5 ? 'text-muted-foreground' : positive ? 'text-green-600' : 'text-red-600'
  return (
    <span className={cn('text-xs tabular-nums', color)}>
      {delta > 0 ? '+' : ''}
      {delta.toFixed(1)}%
    </span>
  )
}

export function PnLTable({ rows }: Props) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-xs">
          <tr>
            <th className="text-left p-2 font-medium">Khoản mục</th>
            <th className="text-right p-2 font-medium">Kỳ này</th>
            <th className="text-right p-2 font-medium">Kỳ trước</th>
            <th className="text-right p-2 font-medium">Δ PoP</th>
            <th className="text-right p-2 font-medium">Δ YoY</th>
            <th className="text-right p-2 font-medium">Mục tiêu</th>
            <th className="text-right p-2 font-medium">Đạt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const targetPct =
              r.budget && r.budget !== 0 ? (r.isCost ? (r.budget / Math.max(1, r.current)) * 100 : (r.current / r.budget) * 100) : null
            const targetColor =
              targetPct === null
                ? 'text-muted-foreground'
                : targetPct >= 95
                  ? 'text-green-600'
                  : targetPct >= 75
                    ? 'text-amber-600'
                    : 'text-red-600'
            return (
              <tr
                key={i}
                className={cn(
                  'border-t',
                  r.divider && 'border-t-2 bg-muted/20',
                  r.bold && 'font-semibold',
                )}
              >
                <td className={cn('p-2', r.indent && 'pl-6 text-muted-foreground')}>{r.label}</td>
                <td className="p-2 text-right font-mono tabular-nums">{formatVnd(r.current, r.isCost)}</td>
                <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">
                  {r.previous !== undefined ? formatVnd(r.previous, r.isCost) : '—'}
                </td>
                <td className="p-2 text-right">{deltaCell(r.current, r.previous, r.isCost)}</td>
                <td className="p-2 text-right">{deltaCell(r.current, r.yoy, r.isCost)}</td>
                <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">
                  {r.budget !== undefined ? formatVnd(r.budget, r.isCost) : '—'}
                </td>
                <td className={cn('p-2 text-right text-xs tabular-nums font-semibold', targetColor)}>
                  {targetPct !== null ? `${targetPct.toFixed(0)}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
