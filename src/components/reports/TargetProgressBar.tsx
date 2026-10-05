import { cn, formatCurrency } from '@/lib/utils'

interface Props {
  label: string
  current: number
  target: number
  format: 'currency' | 'percent'
}

export function TargetProgressBar({ label, current, target, format }: Props) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const fmt = format === 'currency' ? formatCurrency : (v: number) => `${v.toFixed(1)}%`
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {fmt(current)} <span className="text-muted-foreground">/ {fmt(target)}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full transition-all',
            pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{pct.toFixed(0)}% mục tiêu</p>
    </div>
  )
}

export default TargetProgressBar
