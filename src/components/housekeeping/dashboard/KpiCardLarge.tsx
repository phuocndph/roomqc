import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface KpiCardLargeProps {
  label: string
  value: number
  percent?: number | null
  icon: LucideIcon
  to?: string
  tone?: 'default' | 'success' | 'info' | 'warning' | 'danger' | 'maintenance' | 'reserved'
  loading?: boolean
}

const TONE: Record<NonNullable<KpiCardLargeProps['tone']>, { value: string; icon: string; accent: string }> = {
  default:     { value: 'text-foreground', icon: 'text-muted-foreground', accent: 'border-l-border' },
  success:     { value: 'text-green-700 dark:text-green-400', icon: 'text-green-700 dark:text-green-400', accent: 'border-l-green-600' },
  info:        { value: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-700 dark:text-blue-400', accent: 'border-l-blue-600' },
  warning:     { value: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-700 dark:text-amber-400', accent: 'border-l-amber-600' },
  danger:      { value: 'text-red-700 dark:text-red-400', icon: 'text-red-700 dark:text-red-400', accent: 'border-l-red-600' },
  maintenance: { value: 'text-zinc-700 dark:text-zinc-300', icon: 'text-zinc-700 dark:text-zinc-300', accent: 'border-l-zinc-600' },
  reserved:    { value: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-700 dark:text-purple-400', accent: 'border-l-purple-600' },
}

export function KpiCardLarge({ label, value, percent, icon: Icon, to, tone = 'default', loading }: KpiCardLargeProps) {
  const t = TONE[tone]
  const body = (
    <div className={cn('flex items-center justify-between gap-2 border border-l-4 rounded-lg p-2.5 sm:p-3 hover:bg-muted/30 transition-colors h-full', t.accent)}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className={cn('text-2xl font-semibold tabular-nums leading-tight', t.value)}>
          {loading ? '…' : value}
        </div>
        {percent != null && (
          <div className="text-[11px] text-muted-foreground tabular-nums">{percent.toFixed(1)}%</div>
        )}
      </div>
      <div className="h-9 w-9 rounded-md border border-border bg-background flex items-center justify-center shrink-0">
        <Icon className={cn('h-5 w-5', t.icon)} />
      </div>
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}
