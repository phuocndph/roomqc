import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow, format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  ClipboardCheck, 
  Sparkles, 
  DoorOpen, 
  Package, 
  PackageCheck,
  MoreHorizontal,
  Clock,
  User,
  Play,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Calendar
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useTaskById, useUpdateTaskStatus } from '@/hooks/useHousekeepingTasks'
import { useDeliveryTaskItems } from '@/hooks/useDeliveryTaskItems'

import { CleaningCompleteDialog } from '@/components/rooms/CleaningCompleteDialog'
import { TaskQcReviewDialog } from './TaskQcReviewDialog'
import { useState } from 'react'
import type { TaskType, TaskPriority } from '@/types/housekeeping.types'
import { TASK_TYPE_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '@/types/housekeeping.types'

const TASK_ICONS: Record<TaskType, typeof ClipboardCheck> = {
  checkout_inspection: ClipboardCheck,
  cleaning: Sparkles,
  checkin_prep: DoorOpen,
  amenity_request: Package,
  delivery_confirmation: PackageCheck,
  other: MoreHorizontal
}

const PRIORITY_BADGE_STYLES: Record<TaskPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  completed_pending_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected_rework: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
}

interface TaskDetailDialogProps {
  taskId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TaskDetailDialog({ taskId, open, onOpenChange }: TaskDetailDialogProps) {
  const navigate = useNavigate()
  const { data: task, isLoading } = useTaskById(taskId)
  const { mutateAsync: updateStatus, isPending: isUpdating } = useUpdateTaskStatus()
  
  const [showCleaningComplete, setShowCleaningComplete] = useState(false)
  const [showQcReview, setShowQcReview] = useState<false | 'approve' | 'reject'>(false)

  // Fetch delivery items if this is a delivery confirmation task
  const isDeliveryTask = task?.task_type === 'delivery_confirmation'
  const isCleaningTask = task?.task_type === 'cleaning'
  const { data: deliveryData } = useDeliveryTaskItems(
    isDeliveryTask ? task?.distribution_order_room_id : null
  )

  if (!open) return null

  const handleStart = async () => {
    if (!task) return
    await updateStatus({ taskId: task.id, status: 'in_progress' })
    
    // Navigate based on task type — pre-assigned type, no intermediate steps
    if (task.task_type === 'checkout_inspection') {
      onOpenChange(false)
      const inspectionParam = task.checkout_inspection_id 
        ? `&inspection=${task.checkout_inspection_id}` 
        : ''
      navigate(`/rooms/${task.room_id}/check?type=checkout&resume=true${inspectionParam}`)
    } else if (task.task_type === 'delivery_confirmation') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=delivery&room_order_id=${task.distribution_order_room_id}&task_id=${task.id}&returnTo=/my-tasks`)
    } else if (task.task_type === 'checkin_prep') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=checkin&resume=true`)
    } else if (task.task_type === 'amenity_request') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=replenish&resume=true&task_id=${task.id}`)
    } else if (task.task_type === 'cleaning') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=daily&resume=true`)
    }
  }

  const handleComplete = async () => {
    if (!task) return
    
    // For cleaning tasks, show dialog to choose: mark ready or check first
    if (isCleaningTask) {
      setShowCleaningComplete(true)
      return
    }
    
    await updateStatus({ taskId: task.id, status: 'completed' })
    onOpenChange(false)
  }

  const handleCleaningCompleted = async () => {
    if (!task) return
    await updateStatus({ taskId: task.id, status: 'completed' })
    setShowCleaningComplete(false)
    onOpenChange(false)
  }

  const handleContinue = () => {
    if (!task) return
    if (task.task_type === 'checkout_inspection') {
      onOpenChange(false)
      const inspectionParam = task.checkout_inspection_id 
        ? `&inspection=${task.checkout_inspection_id}` 
        : ''
      navigate(`/rooms/${task.room_id}/check?type=checkout&resume=true${inspectionParam}`)
    } else if (task.task_type === 'checkin_prep') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=checkin&resume=true`)
    } else if (task.task_type === 'amenity_request') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=replenish&resume=true&task_id=${task.id}`)
    } else if (task.task_type === 'cleaning') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=daily&resume=true`)
    } else if (task.task_type === 'delivery_confirmation') {
      onOpenChange(false)
      navigate(`/rooms/${task.room_id}/check?type=delivery&room_order_id=${task.distribution_order_room_id}&task_id=${task.id}&returnTo=/my-tasks`)
    }
  }

  const handleDeliveryConfirm = () => {
    if (!task) return
    onOpenChange(false)
    navigate(`/rooms/${task.room_id}/check?type=delivery&room_order_id=${task.distribution_order_room_id}&task_id=${task.id}&returnTo=/my-tasks`)
  }

  const Icon = task ? TASK_ICONS[task.task_type] : MoreHorizontal
  const isInProgress = task?.status === 'in_progress'
  const isUrgent = task?.priority === 'urgent' || task?.priority === 'high'

  // Calculate elapsed time for in_progress tasks
  const elapsedTime = task?.started_at 
    ? formatDistanceToNow(new Date(task.started_at), { locale: vi, addSuffix: false })
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chi tiết công việc</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : task ? (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Room Info */}
              <div className={cn(
                'p-3 rounded-lg border',
                isUrgent && 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10',
                isInProgress && !isUrgent && 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    isUrgent ? 'bg-red-100 dark:bg-red-900/30' : 'bg-muted'
                  )}>
                    <MapPin className={cn(
                      'h-5 w-5',
                      isUrgent ? 'text-red-600' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Phòng {task.room?.room_number}</h3>
                    <p className="text-sm text-muted-foreground">
                      Tầng {task.room?.floor}{task.room?.room_type ? ` · ${task.room.room_type}` : ''}
                    </p>
                  </div>
                </div>
              </div>

              {/* Task Details */}
              <div className="space-y-3">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trạng thái</p>
                    <Badge className={cn('mt-0.5', STATUS_BADGE_STYLES[task.status] || 'bg-muted')}>
                      {STATUS_LABELS[task.status] || task.status}
                    </Badge>
                  </div>
                </div>

                {/* Task Type */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Loại công việc</p>
                    <p className="font-medium">{task.title || TASK_TYPE_LABELS[task.task_type]}</p>
                  </div>
                </div>

                {/* Priority */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    {isUrgent ? (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Mức độ ưu tiên</p>
                    <Badge className={cn('mt-0.5', PRIORITY_BADGE_STYLES[task.priority])}>
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                  </div>
                </div>

                {/* Requested By */}
                {task.requested_user && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Người giao việc</p>
                      <p className="font-medium">{task.requested_user.full_name}</p>
                    </div>
                  </div>
                )}

                {/* Time */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Giao lúc</p>
                    <p className="font-medium">
                      {format(new Date(task.created_at), 'HH:mm', { locale: vi })}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({formatDistanceToNow(new Date(task.created_at), { locale: vi, addSuffix: true })})
                      </span>
                    </p>
                    {task.due_at && (
                      <p className={cn(
                        'text-xs',
                        new Date(task.due_at) < new Date() && 'text-red-600 font-medium'
                      )}>
                        Deadline: {format(new Date(task.due_at), 'HH:mm', { locale: vi })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Elapsed time if in progress */}
                {isInProgress && elapsedTime && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Đang thực hiện</p>
                      <p className="font-medium text-blue-600">{elapsedTime}</p>
                    </div>
                  </div>
                )}

                {/* Guest info */}
                {task.booking?.guest_name && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Khách hàng</p>
                      <p className="font-medium">{task.booking.guest_name}</p>
                      {task.booking.check_out_date && (
                        <p className="text-xs text-muted-foreground">
                          Checkout: {format(new Date(task.booking.check_out_date), 'dd/MM/yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Delivery items preview */}
                {isDeliveryTask && deliveryData && deliveryData.items.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Đồ dùng cần xác nhận</p>
                      <p className="font-medium">
                        {deliveryData.items.length} loại ({deliveryData.orderCode})
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {task.description && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Mô tả</p>
                  <p className="text-sm">{task.description}</p>
                </div>
              )}

              {/* Notes */}
              {task.notes && task.notes !== task.description && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Ghi chú</p>
                  <p className="text-sm">{task.notes}</p>
                </div>
              )}

              {/* Actions - sticky footer */}
              <div className="sticky bottom-0 bg-background pt-2 border-t mt-auto flex gap-2">
                {task.status === 'pending' && (
                  <Button 
                    className="flex-1"
                    onClick={handleStart}
                    disabled={isUpdating}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Bắt đầu thực hiện
                  </Button>
                )}
                
                {isInProgress && (
                  <>
                    {task.task_type === 'checkout_inspection' || task.task_type === 'checkin_prep' || task.task_type === 'amenity_request' ? (
                      <Button 
                        className="flex-1"
                        onClick={handleContinue}
                        disabled={isUpdating}
                      >
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        Kiểm tra phòng
                      </Button>
                    ) : task.task_type === 'delivery_confirmation' ? (
                      <Button 
                        className="flex-1"
                        onClick={handleDeliveryConfirm}
                        disabled={isUpdating || !deliveryData}
                      >
                        <PackageCheck className="h-4 w-4 mr-2" />
                        Xác nhận nhận hàng
                      </Button>
                    ) : task.task_type === 'cleaning' ? (
                      <>
                        <Button 
                          variant="outline"
                          onClick={() => { onOpenChange(false); navigate(`/rooms/${task.room_id}`) }}
                        >
                          <DoorOpen className="h-4 w-4 mr-2" />
                          P.{task.room?.room_number}
                        </Button>
                        <Button 
                          className="flex-1"
                          onClick={handleComplete}
                          disabled={isUpdating}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Hoàn thành
                        </Button>
                      </>
                    ) : (
                      <Button 
                        className="flex-1"
                        onClick={handleComplete}
                        disabled={isUpdating}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Hoàn thành
                      </Button>
                    )}
                  </>
                )}

                {/* QC review actions — Phase 2 state machine */}
                {(task.status === 'completed_pending_review' || task.status === 'rejected_rework') && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setShowQcReview('reject')}
                    >
                      Trả lại làm lại
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => setShowQcReview('approve')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Duyệt
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Không tìm thấy công việc</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery Confirmation Modal đã chuyển sang trang Lean /check-delivery */}


      {/* Cleaning Complete Dialog */}
      {isCleaningTask && task && task.room && (
        <CleaningCompleteDialog
          open={showCleaningComplete}
          onOpenChange={setShowCleaningComplete}
          roomId={task.room_id}
          roomNumber={task.room.room_number}
          onComplete={handleCleaningCompleted}
        />
      )}

      {/* QC Review Dialog — Phase 2 */}
      <TaskQcReviewDialog
        task={task ?? null}
        open={showQcReview !== false}
        onOpenChange={(v) => !v && setShowQcReview(false)}
        defaultMode={showQcReview === 'reject' ? 'reject' : 'approve'}
      />
    </>
  )
}
