import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { OverviewAlert } from '@/hooks/useOverviewAlerts'

const TONE_DOT: Record<OverviewAlert['tone'], string> = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
}

interface Props {
  alerts: OverviewAlert[] | undefined
  loading?: boolean
}

export function AlertList({ alerts, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    )
  }

  if (!alerts || alerts.length === 0) {
    return (
      <div className="rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Mọi thứ ổn ✓</p>
        <p className="text-xs text-muted-foreground mt-1">Không có cảnh báo nào lúc này.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border divide-y divide-border">
      {alerts.map((a) => (
        <Link
          key={a.id}
          to={a.href}
          className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors group"
        >
          <span
            aria-hidden
            className={cn('h-2 w-2 rounded-full shrink-0', TONE_DOT[a.tone])}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground line-clamp-1">{a.title}</div>
            <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
        </Link>
      ))}
    </div>
  )
}
