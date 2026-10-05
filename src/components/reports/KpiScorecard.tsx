import { ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export type KpiTone = 'positive' | 'negative' | 'neutral'

export interface KpiScorecardProps {
  label: string
  value: ReactNode
  /** Δ% so kỳ trước. Bỏ qua nếu không truyền. */
  deltaPct?: number | null
  /**
   * Hướng "tốt" của KPI:
   * - 'up'   → tăng = tốt (xanh khi +Δ)
   * - 'down' → giảm = tốt (xanh khi -Δ) — dùng cho chi phí, công nợ, tổn thất
   * - 'flat' → trung tính, luôn xám
   */
  goodDirection?: 'up' | 'down' | 'flat'
  /** Diễn giải ngắn dưới delta (vd: "Vượt ngưỡng ngành"). */
  hint?: ReactNode
  /** Badge nhỏ ở góc (vd: classify benchmark). */
  badge?: ReactNode
  loading?: boolean
  onClick?: () => void
  className?: string
}

function classifyTone(delta: number | null | undefined, good: 'up' | 'down' | 'flat'): KpiTone {
  if (delta == null || good === 'flat' || delta === 0) return 'neutral'
  if (good === 'up') return delta > 0 ? 'positive' : 'negative'
  return delta < 0 ? 'positive' : 'negative'
}

const TONE_TEXT: Record<KpiTone, string> = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral: 'text-muted-foreground',
}

/**
 * Tile chuẩn dùng cho mọi Report Hub.
 * - Layout compact, semantic color theo `goodDirection`.
 * - Không dùng Card — chỉ border + rounded để bám design Enterprise Minimalist.
 */
export function KpiScorecard({
  label,
  value,
  deltaPct,
  goodDirection = 'up',
  hint,
  badge,
  loading,
  onClick,
  className,
}: KpiScorecardProps) {
  const tone = classifyTone(deltaPct, goodDirection)
  const Arrow = deltaPct == null || deltaPct === 0 ? ArrowRight : deltaPct > 0 ? ArrowUp : ArrowDown
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-background p-3 text-left transition-colors',
        onClick && 'hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground line-clamp-1">
          {label}
        </span>
        {badge}
      </div>

      {loading ? (
        <Skeleton className="h-6 w-24" />
      ) : (
        <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      )}

      {loading ? (
        <Skeleton className="h-3 w-20 mt-1" />
      ) : deltaPct != null ? (
        <div className={cn('flex items-center gap-1 text-xs', TONE_TEXT[tone])}>
          <Arrow className="h-3 w-3" />
          <span className="tabular-nums font-medium">
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
          <span className="text-muted-foreground font-normal">so kỳ trước</span>
        </div>
      ) : hint ? (
        <div className="text-xs text-muted-foreground line-clamp-1">{hint}</div>
      ) : null}

      {hint && deltaPct != null ? (
        <div className="text-[11px] text-muted-foreground line-clamp-1">{hint}</div>
      ) : null}
    </Comp>
  )
}

export function KpiScorecardStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
