import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  XCircle,
  MapPin,
  UserPlus,
  Repeat,
  MoreVertical,
  Ban
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCancelTask } from '@/hooks/useHousekeepingTasks'
import { 
  TASK_TYPE_LABELS, 
  PRIORITY_COLORS,
  type TaskPriority,
  type TaskType,
  type HousekeepingTaskWithDetails
} from '@/types/housekeeping.types'
import { cn } from '@/lib/utils'

interface ManagerTaskCardProps {
  task: HousekeepingTaskWithDetails
  onAssign: () => void
}

export function ManagerTaskCard({ task, onAssign }: ManagerTaskCardProps) {
  const cancelTask = useCancelTask()

  const getStatusIcon = () => {
    switch (task.status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-600" />
      case 'in_progress':
        return <PlayCircle className="h-4 w-4 text-blue-600" />
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-muted-foreground" />
      default:
        return null
    }
  }

  const getDuration = () => {
    if (task.status === 'in_progress' && task.started_at) {
      return formatDistanceToNow(new Date(task.started_at), { 
        locale: vi,
        addSuffix: false 
      })
    }
    if (task.status === 'pending') {
      return formatDistanceToNow(new Date(task.created_at), { 
        locale: vi,
        addSuffix: true 
      })
    }
    return null
  }

  const handleCancel = () => {
    if (confirm('Bạn có chắc muốn hủy công việc này?')) {
      cancelTask.mutate(task.id)
    }
  }

  const isActive = task.status === 'pending' || task.status === 'in_progress'

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border transition-colors',
        task.status === 'in_progress' && 'bg-blue-50/50 border-blue-200',
        task.priority === 'urgent' && task.status === 'pending' && 'bg-red-50/50 border-red-200'
      )}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0">
        {getStatusIcon()}
      </div>

      {/* Room & Task Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-bold">
            {task.room?.room_number || 'N/A'}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
            {TASK_TYPE_LABELS[task.task_type as TaskType] || task.task_type}
          </span>
          {task.title && (
            <span className="text-sm text-muted-foreground truncate">
              {task.title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className={cn('font-medium', PRIORITY_COLORS[task.priority as TaskPriority])}>
            {task.priority === 'urgent' && 'Khẩn cấp'}
            {task.priority === 'high' && 'Ưu tiên cao'}
            {task.priority === 'medium' && 'Trung bình'}
            {task.priority === 'low' && 'Thấp'}
          </span>
          {getDuration() && (
            <>
              <span>•</span>
              <span>
                {task.status === 'in_progress' ? `⏱ ${getDuration()}` : getDuration()}
              </span>
            </>
          )}
          {task.room?.floor && (
            <>
              <span>•</span>
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                Tầng {task.room.floor}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="flex items-center gap-1">
          {!task.assigned_to ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onAssign}
              className="h-7 text-xs gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Giao việc
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Thêm tùy chọn">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                <DropdownMenuItem onClick={onAssign}>
                  <Repeat className="h-4 w-4 mr-2" />
                  Chuyển việc
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleCancel}
                  className="text-red-600 focus:text-red-600"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Hủy công việc
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  )
}
