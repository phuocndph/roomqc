import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { OrderStatusText } from './DistributionStatusBadge'
import { getPendingTask } from '../utils/orderPresentation'
import type { DistributionOrder } from '@/types/distribution.types'
import { cn } from '@/lib/utils'

interface DistributionOrderTableProps {
  orders: DistributionOrder[]
  onRowClick?: (order: DistributionOrder) => void
  isLoading?: boolean
  emptyMessage?: React.ReactNode
  currentUserId?: string | null
  isCurrentUserStorekeeper?: boolean
}

const TABLE_HEADERS = (
  <TableRow>
    <TableHead className="text-xs">Mã phiếu</TableHead>
    <TableHead className="text-xs">Trạng thái</TableHead>
    <TableHead className="text-xs">Việc cần làm</TableHead>
    <TableHead className="text-xs text-center">Tiến độ</TableHead>
    <TableHead className="text-xs">Người giao</TableHead>
    <TableHead className="text-xs">Ngày tạo</TableHead>
  </TableRow>
)

export function DistributionOrderTable({
  orders,
  onRowClick,
  isLoading,
  emptyMessage,
  currentUserId,
  isCurrentUserStorekeeper,
}: DistributionOrderTableProps) {
  if (isLoading) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>{TABLE_HEADERS}</TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>{TABLE_HEADERS}</TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12">
                {emptyMessage}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>{TABLE_HEADERS}</TableHeader>
        <TableBody>
          {orders.map(order => {
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
              <TableRow
                key={order.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onRowClick?.(order)}
              >
                <TableCell className="font-mono font-medium text-sm py-2">
                  {order.order_code}
                </TableCell>
                <TableCell className="py-2">
                  <OrderStatusText
                    status={order.status}
                    total={order.total_rooms}
                    completed={order.rooms_completed}
                  />
                </TableCell>
                <TableCell className="py-2">
                  <span className={cn('text-xs font-medium', task.textClass)}>{task.text}</span>
                </TableCell>
                <TableCell className="text-center text-sm py-2">
                  <span className="text-muted-foreground">
                    {order.rooms_completed}/{order.total_rooms}
                  </span>
                </TableCell>
                <TableCell className="text-sm py-2">{order.assigned_to_name || '—'}</TableCell>
                <TableCell className="text-sm py-2">
                  {format(new Date(order.created_at), 'dd/MM HH:mm', { locale: vi })}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
