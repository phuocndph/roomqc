import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BenchmarkBadge } from './BenchmarkBadge'
import type { BenchmarkKey } from '@/lib/industryBenchmarks'

interface Props {
  label: string
  value: string
  /** % delta so kỳ trước liền kề */
  pop?: number
  /** % delta so cùng kỳ năm trước */
  yoy?: number
  /** % hoàn thành mục tiêu (100 = đạt) */
  targetPct?: number
  /** Hiển thị tooltip mục tiêu raw */
  targetLabel?: string
  benchmark?: { metric: BenchmarkKey; value: number }
  hint?: string
  /** Khi true: delta âm là tốt (vd: chi phí, labor ratio) */
  inverse?: boolean
}

function DeltaPill({ value, inverse, label }: { value: number; inverse?: boolean; label: string }) {
  const show = isFinite(value) && Math.abs(value) > 0.5
  if (!show) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-2.5 w-2.5" />
        {label} —
      </span>
    )
  }
  const positive = inverse ? value < 0 : value > 0
  const color = positive ? 'text-green-600' : 'text-red-600'
  const Arrow = value >= 0 ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium', color)}>
      <Arrow className="h-2.5 w-2.5" />
      {label} {value > 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

export function KpiHeroCardV2({
  label,
  value,
  pop,
  yoy,
  targetPct,
  targetLabel,
  benchmark,
  hint,
  inverse,
}: Props) {
  const targetColor =
    typeof targetPct === 'number'
      ? targetPct >= 95
        ? 'text-green-600'
        : targetPct >= 75
          ? 'text-amber-600'
          : 'text-red-600'
      : 'text-muted-foreground'

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        {benchmark && <BenchmarkBadge metric={benchmark.metric} value={benchmark.value} />}
      </div>
      <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {typeof pop === 'number' && <DeltaPill value={pop} inverse={inverse} label="Kỳ trước" />}
        {typeof yoy === 'number' && <DeltaPill value={yoy} inverse={inverse} label="YoY" />}
      </div>
      {typeof targetPct === 'number' && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground" title={targetLabel}>
            Mục tiêu
          </span>
          <span className={cn('font-semibold tabular-nums', targetColor)}>{targetPct.toFixed(0)}%</span>
        </div>
      )}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
