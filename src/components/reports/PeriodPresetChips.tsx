import { cn } from '@/lib/utils'
import { PERIOD_PRESETS, type PeriodPresetId } from '@/lib/reportPeriods'

interface Props {
  value: PeriodPresetId
  onChange: (id: PeriodPresetId) => void
  className?: string
}

/**
 * Strip chip nhỏ gọn để chọn nhanh kỳ báo cáo.
 * Mobile: scroll ngang + snap.
 */
export function PeriodPresetChips({ value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        'flex gap-1 overflow-x-auto snap-x snap-mandatory -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]',
        className,
      )}
      role="tablist"
      aria-label="Chọn kỳ báo cáo"
    >
      {PERIOD_PRESETS.map((p) => {
        const active = p.id === value
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p.id)}
            className={cn(
              'snap-start shrink-0 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted',
            )}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
