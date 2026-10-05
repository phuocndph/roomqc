import { cn } from '@/lib/utils'
import type { GuestSegment } from '@/hooks/useGuestsV2'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SEGMENTS: { value: GuestSegment; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'vip', label: 'VIP' },
  { value: 'new', label: 'Mới' },
  { value: 'returning', label: 'Khách quay lại' },
  { value: 'birthday', label: 'Sinh nhật' },
  { value: 'blacklist', label: 'Blacklist' },
]

interface Props {
  value: GuestSegment
  onChange: (v: GuestSegment) => void
  counts?: Partial<Record<GuestSegment, number>>
  compact?: boolean
}

export function GuestSegmentTabs({ value, onChange, counts, compact }: Props) {
  if (compact) {
    return (
      <Select value={value} onValueChange={(v) => onChange(v as GuestSegment)}>
        <SelectTrigger aria-label="Nhóm khách hàng" className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SEGMENTS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}{typeof counts?.[s.value] === 'number' ? ` (${counts[s.value]})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <div role="group" aria-label="Nhóm khách hàng" className="flex flex-wrap items-center gap-1 border-b">
      {SEGMENTS.map((s) => {
        const active = s.value === value
        const count = counts?.[s.value]
        return (
          <button
            key={s.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.value)}
            className={cn(
              'h-10 shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'border-foreground bg-muted/60 font-medium text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            )}
          >
            {s.label}
            {typeof count === 'number' && (
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">({count})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
