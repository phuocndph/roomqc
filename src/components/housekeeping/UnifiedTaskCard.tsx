import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UnifiedTask } from '@/hooks/useUnifiedTasks'

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-muted-foreground/40',
}

const SOURCE_LABELS: Record<string, string> = {
  housekeeping: 'Buồng phòng',
  stock_adjustment: 'Kiểm kê',
}

interface UnifiedTaskCardProps {
  task: UnifiedTask
  onClick?: () => void
}

export function UnifiedTaskCard({ task, onClick }: UnifiedTaskCardProps) {
  const navigate = useNavigate()
  const isUrgent = task.priority === 'urgent' || task.priority === 'high'
  const isInProgress = task.status === 'in_progress'

  const startedAt = task.source === 'housekeeping'
    ? task.originalHousekeepingTask?.started_at
    : task.originalStockAdjustment?.started_at
  const elapsedTime = startedAt
    ? formatDistanceToNow(new Date(startedAt), { locale: vi, addSuffix: false })
    : null

  const createdAgo = formatDistanceToNow(new Date(task.createdAt), { locale: vi, addSuffix: true })

  const handleGoToTask = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(task.actionUrl)
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 transition-colors',
        onClick && 'cursor-pointer active:bg-muted/50',
        isUrgent && task.status === 'pending' && 'bg-red-50/60 dark:bg-red-950/20',
        isInProgress && 'bg-blue-50/60 dark:bg-blue-950/20'
      )}
    >
      {/* Priority dot */}
      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', PRIORITY_DOT[task.priority] || PRIORITY_DOT.low)} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {task.roomNumber && (
            <span className="text-sm font-bold tracking-tight">P.{task.roomNumber}</span>
          )}
          <span className="text-xs text-muted-foreground truncate">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
          <span className="text-muted-foreground/70">{SOURCE_LABELS[task.source] || task.source}</span>
          <span>·</span>
          {isInProgress && elapsedTime ? (
            <span className="text-blue-600">⏱ {elapsedTime}</span>
          ) : (
            <span>{createdAgo}</span>
          )}
        </div>
      </div>

      {/* Action */}
      {task.source !== 'housekeeping' && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs shrink-0"
          onClick={handleGoToTask}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Mở
        </Button>
      )}
    </div>
  )
}
