import { useMemo } from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useInventoryHubBadges } from '@/hooks/useInventoryHubBadges'
import { useStockoutItems } from '@/hooks/useStockoutItems'

interface Props {
  onNavigate: (tab: string, sub?: string) => void
}

type Tone = 'danger' | 'warning' | 'info' | 'success'

interface TodoItem {
  key: string
  tone: Tone
  title: string
  hint?: string
  ctaLabel: string
  onClick: () => void
}

const dotByTone: Record<Tone, string> = {
  danger: 'bg-rose-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
}

const textByTone: Record<Tone, string> = {
  danger: 'text-rose-700 dark:text-rose-400',
  warning: 'text-amber-700 dark:text-amber-400',
  info: 'text-sky-700 dark:text-sky-400',
  success: 'text-emerald-700 dark:text-emerald-400',
}

/**
 * "Việc cần làm hôm nay" — Task-first hero for the Inventory Hub.
 * Aggregates from useInventoryHubBadges + dedup'd consumption snapshots
 * (via useStockoutItems) so counts are accurate (no per-day duplicates).
 */
export function InventoryTodoCard({ onNavigate }: Props) {
  const { data: badges, isLoading: badgesLoading } = useInventoryHubBadges()
  const { soonOutCount: forecastSoonOut, isLoading: snapLoading } = useStockoutItems()

  const allItems: TodoItem[] = useMemo(() => {
    const out: TodoItem[] = []
    const dist = badges?.distributionsPending ?? 0
    const distStale = badges?.distributionsStale ?? 0
    const reorder = badges?.reorderPending ?? 0
    const adj = badges?.adjustmentsPending ?? 0

    if (dist > 0) {
      const isStale = distStale > 0
      out.push({
        key: 'dist',
        tone: isStale ? 'danger' : 'warning',
        title: `${dist} phiếu xuất kho cần xử lý`,
        hint: isStale
          ? `${distStale} phiếu đã chờ quá 24h`
          : 'Đang chờ duyệt hoặc giao cho phòng',
        ctaLabel: 'Mở',
        onClick: () => onNavigate('operations', 'outbound'),
      })
    }
    if (forecastSoonOut > 0) {
      out.push({
        key: 'soonout',
        tone: 'danger',
        title: `${forecastSoonOut} món sắp hết trong 7 ngày`,
        hint: 'Dự báo theo tiêu thụ 30 ngày qua',
        ctaLabel: 'Đặt thêm',
        onClick: () => onNavigate('operations', 'reorder'),
      })
    }
    if (reorder > 0) {
      out.push({
        key: 'reorder',
        tone: 'warning',
        title: `${reorder} đề xuất đặt hàng chờ duyệt`,
        hint: 'Hệ thống gợi ý dựa trên điểm đặt hàng',
        ctaLabel: 'Duyệt',
        onClick: () => onNavigate('operations', 'reorder'),
      })
    }
    if (adj > 0) {
      out.push({
        key: 'adj',
        tone: 'info',
        title: `${adj} phiếu kiểm kê đang xử lý`,
        hint: 'Tiếp tục hoặc duyệt phiếu kiểm kê',
        ctaLabel: 'Mở',
        onClick: () => onNavigate('operations', 'adjustments'),
      })
    }

    // Sort theo severity: danger > warning > info > success
    const toneRank: Record<Tone, number> = { danger: 0, warning: 1, info: 2, success: 3 }
    out.sort((a, b) => toneRank[a.tone] - toneRank[b.tone])
    return out
  }, [badges, forecastSoonOut, onNavigate])

  const CAP = 5
  const items = allItems.slice(0, CAP)
  const overflow = allItems.length - items.length

  const isLoading = badgesLoading || snapLoading

  return (
    <section
      aria-labelledby="inv-todo-heading"
      className="rounded-xl border border-border/70 bg-card shadow-tile overflow-hidden"
    >
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2
          id="inv-todo-heading"
          className="font-display text-base font-semibold tracking-tight text-foreground"
        >
          Việc cần làm hôm nay
        </h2>
        {!isLoading && (
          <span className="font-body text-[11px] text-muted-foreground tabular-nums">
            {allItems.length > 0 ? `${allItems.length} mục` : 'Tất cả đã ổn'}
          </span>
        )}
      </header>

      <div className="divide-y divide-border/60">
        {isLoading ? (
          <div className="px-4 py-3 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-body text-sm font-medium">Mọi thứ đang ổn</div>
              <div className="font-body text-xs text-muted-foreground">
                Không có việc kho nào cần xử lý ngay.
              </div>
            </div>
          </div>
        ) : (
          items.map((it) => (
            <button
              key={it.key}
              type="button"
              onClick={it.onClick}
              className={cn(
                'group w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                'min-h-[56px]',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  aria-hidden
                  className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotByTone[it.tone])}
                />
                <div className="min-w-0">
                  <div className={cn('font-body text-sm font-medium truncate', textByTone[it.tone])}>
                    {it.title}
                  </div>
                  {it.hint && (
                    <div className="font-body text-[11px] text-muted-foreground truncate">
                      {it.hint}
                    </div>
                  )}
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 font-body text-xs font-medium text-foreground group-hover:text-primary">
                {it.ctaLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))
        )}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('operations', 'outbound')}
            className="w-full px-4 py-2.5 text-left font-body text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
          >
            Còn {overflow} mục khác — xem tất cả →
          </button>
        )}
      </div>
    </section>
  )
}
