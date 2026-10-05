import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Target } from 'lucide-react'
import {
  TARGET_METRIC_LABELS,
  useFinancialTargets,
  useUpsertFinancialTarget,
  useDeleteFinancialTarget,
  type TargetMetric,
} from '@/hooks/useFinancialTargets'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface Props {
  periodDate: Date
}

const METRIC_ORDER: TargetMetric[] = [
  'occupancy',
  'revpar',
  'adr',
  'goppar',
  'gop_margin',
  'labor_ratio',
  'net_revenue',
  'gop',
]

export function SetTargetsDialog({ periodDate }: Props) {
  const [open, setOpen] = useState(false)
  const targets = useFinancialTargets(periodDate)
  const upsert = useUpsertFinancialTarget(periodDate)
  const del = useDeleteFinancialTarget(periodDate)
  const [draft, setDraft] = useState<Partial<Record<TargetMetric, string>>>({})

  const handleSave = async () => {
    const entries = Object.entries(draft) as [TargetMetric, string][]
    for (const [metric, val] of entries) {
      const n = Number(val.replace(/[.,\s]/g, ''))
      if (!isFinite(n) || n <= 0) {
        // Empty → delete
        if (val === '' && targets.data?.[metric] !== undefined) {
          await del.mutateAsync(metric)
        }
        continue
      }
      await upsert.mutateAsync({ metric, target_value: n })
    }
    setDraft({})
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <Target className="h-3.5 w-3.5" />
          Đặt mục tiêu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Mục tiêu tháng {format(periodDate, 'MM/yyyy', { locale: vi })}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Để trống để bỏ mục tiêu. Tiền nhập theo VND, ví dụ 5000000.
          </p>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {METRIC_ORDER.map(metric => {
            const current = targets.data?.[metric]
            return (
              <div key={metric} className="space-y-1">
                <Label className="text-xs">{TARGET_METRIC_LABELS[metric]}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder={current ? String(current) : '—'}
                  defaultValue={current ?? ''}
                  className="h-8 text-sm"
                  onChange={e => setDraft(d => ({ ...d, [metric]: e.target.value }))}
                />
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
            Lưu mục tiêu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
