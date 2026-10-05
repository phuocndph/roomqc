import { BENCHMARK_LABELS, BENCHMARK_COLORS, classifyBenchmark, type BenchmarkKey } from '@/lib/industryBenchmarks'
import { cn } from '@/lib/utils'

interface Props {
  metric: BenchmarkKey
  value: number
  className?: string
}

export function BenchmarkBadge({ metric, value, className }: Props) {
  const level = classifyBenchmark(metric, value)
  return (
    <span className={cn('text-xs font-medium', BENCHMARK_COLORS[level], className)}>
      {BENCHMARK_LABELS[level]}
    </span>
  )
}
