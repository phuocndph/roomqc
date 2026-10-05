import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import type { SubReason } from '@/lib/issueBucketMapping'

interface Props {
  options: SubReason[]
  value: string | null
  onChange: (key: string) => void
}

export function SubReasonPicker({ options, value, onChange }: Props) {
  return (
    <div>
      <Label className="text-[14px] font-semibold">
        Lý do cụ thể <span className="text-destructive">*</span>
      </Label>
      <div className="mt-2 space-y-2">
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className={cn(
                'w-full text-left rounded-xl border-2 px-4 py-3 active:bg-muted/50 transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-background text-foreground',
              )}
              style={{ minHeight: 56 }}
            >
              <div className="text-[16px] font-semibold leading-tight">
                {opt.label}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
