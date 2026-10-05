import { cn, formatCurrency } from '@/lib/utils'
import type { AiAdvice } from '@/hooks/useOperationsInsights'
import type { Finding } from '@/lib/operationsAdvisor'

const PRIORITY_LABEL = { high: 'CAO', medium: 'VỪA', low: 'THẤP' } as const
const PRIORITY_COLOR = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-muted-foreground',
} as const

type Item =
  | ({ kind: 'ai' } & AiAdvice)
  | ({ kind: 'rule' } & Finding)

export function AdviceCard({ item }: { item: Item }) {
  const isAi = item.kind === 'ai'
  const priority = isAi ? item.priority : item.severity
  const title = isAi ? item.title : item.finding
  const body = isAi ? item.description : ''
  const action = isAi ? item.action : item.suggestion
  const impact = item.impactVnd

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-bold tracking-wide', PRIORITY_COLOR[priority])}>
          {PRIORITY_LABEL[priority]}
        </span>
        <span className="text-xs text-muted-foreground">•</span>
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      <p className="text-sm">
        <span className="text-muted-foreground">→ </span>
        {action}
      </p>
      {typeof impact === 'number' && impact > 0 && (
        <p className="text-xs text-green-600 font-medium">
          Tác động ước tính: ~{formatCurrency(impact)}/tháng
        </p>
      )}
    </div>
  )
}
