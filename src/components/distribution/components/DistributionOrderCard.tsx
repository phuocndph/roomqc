import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { OrderStatusText } from './DistributionStatusBadge'
import { getPendingTask } from '../utils/orderPresentation'
import type { DistributionOrder } from '@/types/distribution.types'
import { cn } from '@/lib/utils'

interface DistributionOrderCardProps {
  order: DistributionOrder
  onClick?: () => void
  currentUserId?: string | null
  isCurrentUserStorekeeper?: boolean
}

export function DistributionOrderCard({
  order,
  onClick,
  currentUserId,
  isCurrentUserStorekeeper,
}: DistributionOrderCardProps) {
  const task = getPendingTask({
    status: order.status,
    hasAssignee: !!order.assigned_to,
    assignedToName: order.assigned_to_name,
    isCurrentUserAssignee: !!currentUserId && order.assigned_to === currentUserId,
    isCurrentUserStorekeeper,
    isCurrentUserCreator: !!currentUserId && order.created_by === currentUserId,
    totalRooms: order.total_rooms,
    completedRooms: order.rooms_completed,
  })

  return (
    <div
      className="border rounded-lg p-3 cursor-pointer hover:bg-muted/30 transition-colors space-y-1.5"
      onClick={onClick}
    >
      {/* Row 1: code + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold text-sm">{order.order_code}</span>
        <OrderStatusText status={order.status} total={order.total_rooms} completed={order.rooms_completed} />
      </div>

      {/* Row 2: việc cần làm */}
      <div className={cn('text-sm font-medium leading-snug', task.textClass)}>{task.text}</div>

      {/* Row 3: meta */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">
          {order.assigned_to_name || 'Chưa phân công'} • {order.rooms_completed}/{order.total_rooms} phòng
        </span>
        <span>{format(new Date(order.created_at), 'dd/MM HH:mm', { locale: vi })}</span>
      </div>
    </div>
  )
}
