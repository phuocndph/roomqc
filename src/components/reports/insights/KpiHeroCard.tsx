import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BenchmarkBadge } from './BenchmarkBadge'
import type { BenchmarkKey } from '@/lib/industryBenchmarks'

interface Props {
  label: string
  value: string
  delta?: number
  benchmark?: { metric: BenchmarkKey; value: number }
  hint?: string
  /** Khi true: delta âm là tốt (vd: chi phí) */
  inverse?: boolean
}

export function KpiHeroCard({ label, value, delta, benchmark, hint, inverse }: Props) {
  const showDelta = typeof delta === 'number' && isFinite(delta) && Math.abs(delta) > 0.5
  const isPositiveTrend = inverse ? (delta ?? 0) < 0 : (delta ?? 0) > 0
  const trendColor = !showDelta
    ? 'text-muted-foreground'
    : isPositiveTrend
      ? 'text-green-600'
      : 'text-red-600'
  const Arrow = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <div className="flex items-center justify-between gap-2">
        {showDelta && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <Arrow className="h-3 w-3" />
            <span>
              {delta! > 0 ? '+' : ''}
              {delta!.toFixed(1)}% kỳ trước
            </span>
          </div>
        )}
        {benchmark && <BenchmarkBadge metric={benchmark.metric} value={benchmark.value} />}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
