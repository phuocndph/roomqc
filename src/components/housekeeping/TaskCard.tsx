import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Play,
  CheckCircle2,
  CornerDownRight,
  Hand,
  PackageCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useUpdateTaskStatus, useClaimTask } from '@/hooks/useHousekeepingTasks'
import { useDeliveryTaskItems } from '@/hooks/useDeliveryTaskItems'

import { CleaningCompleteDialog } from '@/components/rooms/CleaningCompleteDialog'
import type { HousekeepingTaskWithDetails, TaskType, TaskPriority } from '@/types/housekeeping.types'
import { TASK_TYPE_LABELS } from '@/types/housekeeping.types'

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-muted-foreground/40',
}

const SHORT_LABELS: Record<TaskType, string> = {
  checkout_inspection: 'KT checkout',
  cleaning: 'Dọn phòng',
  checkin_prep: 'Check-in',
  amenity_request: 'Bổ sung',
  delivery_confirmation: 'Nhận hàng',
  other: 'Khác',
}

interface TaskCardProps {
  task: HousekeepingTaskWithDetails
  showActions?: boolean
  showClaimButton?: boolean
  onClick?: () => void
}

export function TaskCard({ task, showActions = true, showClaimButton = false, onClick }: TaskCardProps) {
  const navigate = useNavigate()
  const [isUpdating, setIsUpdating] = useState(false)
  
  const [showCleaningComplete, setShowCleaningComplete] = useState(false)
  const { mutateAsync: updateStatus } = useUpdateTaskStatus()
  const { mutateAsync: claimTask, isPending: isClaiming } = useClaimTask()

  const isDeliveryTask = task.task_type === 'delivery_confirmation'
  const isCleaningTask = task.task_type === 'cleaning'
  const { data: deliveryData } = useDeliveryTaskItems(
    isDeliveryTask ? task.distribution_order_room_id : null
  )

  const isPending = task.status === 'pending'
  const isInProgress = task.status === 'in_progress'
  const isUrgent = task.priority === 'urgent' || task.priority === 'high'
  const roomNumber = task.room?.room_number

  const elapsedTime = task.started_at
    ? formatDistanceToNow(new Date(task.started_at), { locale: vi, addSuffix: false })
    : null

  const createdAgo = formatDistanceToNow(new Date(task.created_at), { locale: vi, addSuffix: true })

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsUpdating(true)
    try {
      await updateStatus({ taskId: task.id, status: 'in_progress' })
      if (task.task_type === 'checkout_inspection') {
        const ip = task.checkout_inspection_id ? `&inspection=${task.checkout_inspection_id}` : ''
        navigate(`/rooms/${task.room_id}/check?type=checkout&resume=true${ip}`)
      } else if (task.task_type === 'delivery_confirmation') {
        navigate(`/rooms/${task.room_id}/check?type=delivery&room_order_id=${task.distribution_order_room_id}&task_id=${task.id}&returnTo=/my-tasks`)
      } else if (task.task_type === 'checkin_prep') {
        navigate(`/rooms/${task.room_id}/check?type=checkin&resume=true`)
      } else if (task.task_type === 'amenity_request') {
        navigate(`/rooms/${task.room_id}/check?type=replenish&resume=true&task_id=${task.id}`)
      } else if (task.task_type === 'cleaning') {
        navigate(`/rooms/${task.room_id}/check?type=daily&resume=true`)
      }
    } finally {
      setIsUpdating(false)
    }
  }

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isCleaningTask) {
      setShowCleaningComplete(true)
      return
    }
    setIsUpdating(true)
    try {
      await updateStatus({ taskId: task.id, status: 'completed' })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleContinue = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (task.task_type === 'checkout_inspection') {
      const ip = task.checkout_inspection_id ? `&inspection=${task.checkout_inspection_id}` : ''
      navigate(`/rooms/${task.room_id}/check?type=checkout&resume=true${ip}`)
    } else if (task.task_type === 'checkin_prep') {
      navigate(`/rooms/${task.room_id}/check?type=checkin&resume=true`)
    } else if (task.task_type === 'amenity_request') {
      navigate(`/rooms/${task.room_id}/check?type=replenish&resume=true&task_id=${task.id}`)
    } else if (task.task_type === 'cleaning') {
      navigate(`/rooms/${task.room_id}/check?type=daily&resume=true`)
    } else if (task.task_type === 'delivery_confirmation') {
      navigate(`/rooms/${task.room_id}/check?type=delivery&room_order_id=${task.distribution_order_room_id}&task_id=${task.id}&returnTo=/my-tasks`)
    }
  }

  const handleCleaningCompleted = async () => {
    setIsUpdating(true)
    try {
      await updateStatus({ taskId: task.id, status: 'completed' })
      setShowCleaningComplete(false)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <>
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 transition-colors',
          onClick && 'cursor-pointer active:bg-muted/50',
          isUrgent && isPending && 'bg-red-50/60 dark:bg-red-950/20',
          isInProgress && 'bg-blue-50/60 dark:bg-blue-950/20'
        )}
      >
        {/* Priority dot */}
        <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', PRIORITY_DOT[task.priority])} />

        {/* Room + task info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-tight">
              P.{roomNumber || 'N/A'}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {SHORT_LABELS[task.task_type] || TASK_TYPE_LABELS[task.task_type]}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
            {isUrgent && (
              <span className="text-red-600 font-medium">Gấp</span>
            )}
            {(task.status === 'rejected_rework' || (task.rework_count ?? 0) > 0) && (
              <span className="text-red-600 font-medium">
                Cần làm lại{(task.rework_count ?? 0) > 1 ? ` ×${task.rework_count}` : ''}
              </span>
            )}
            {isInProgress && elapsedTime ? (
              <span className="text-blue-600">⏱ {elapsedTime}</span>
            ) : (
              <span>{createdAgo}</span>
            )}
          </div>
          {task.status === 'rejected_rework' && task.rejection_reason && (
            <div className="mt-0.5 text-[11px] text-red-600 line-clamp-2">
              Lý do: {task.rejection_reason}
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="shrink-0">
          {showClaimButton ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs"
              onClick={(e) => { e.stopPropagation(); claimTask(task.id).catch(() => {}) }}
              disabled={isClaiming}
            >
              <Hand className="h-3.5 w-3.5 mr-1" />
              Nhận
            </Button>
          ) : showActions && (
            <>
              {isPending && (
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={handleStart}
                  disabled={isUpdating}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Bắt đầu
                </Button>
              )}
              {isInProgress && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 px-2.5 text-xs"
                  onClick={handleContinue}
                >
                  <CornerDownRight className="h-3.5 w-3.5 mr-1" />
                  Tiếp tục kiểm tra
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}


      {isCleaningTask && task.room && (
        <CleaningCompleteDialog
          open={showCleaningComplete}
          onOpenChange={setShowCleaningComplete}
          roomId={task.room_id}
          roomNumber={task.room.room_number}
          onComplete={handleCleaningCompleted}
        />
      )}
    </>
  )
}
