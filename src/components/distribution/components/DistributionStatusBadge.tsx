import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DistributionOrderStatus, DistributionRoomStatus } from '@/types/distribution.types'
import type { RouteStatus } from '@/types/route-batch.types'
import { getDisplayStatus, type AnyOrderStatus } from '../utils/orderPresentation'

// Re-export for legacy callers (kept for backwards compat – do not remove without sweep)
export const ORDER_STATUS_CONFIG = undefined as never
export const ROOM_STATUS_CONFIG = undefined as never

interface OrderStatusBadgeProps {
  status: AnyOrderStatus
  showSubLabel?: boolean
  completed?: number
  total?: number
  assignedToName?: string | null
}

export function OrderStatusBadge({ status, showSubLabel, completed, total, assignedToName }: OrderStatusBadgeProps) {
  const info = getDisplayStatus(status, { completed, total, assignedToName })
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge variant="outline" className={cn('gap-1.5 font-medium', info.textClass)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', info.dotClass)} />
        {info.label}
      </Badge>
      {showSubLabel && info.subLabel && (
        <span className="text-[10px] text-muted-foreground">{info.subLabel}</span>
      )}
    </span>
  )
}

interface OrderStatusTextProps {
  status: AnyOrderStatus
  className?: string
  completed?: number
  total?: number
  assignedToName?: string | null
}

export function OrderStatusText({ status, className, completed, total, assignedToName }: OrderStatusTextProps) {
  const info = getDisplayStatus(status, { completed, total, assignedToName })
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', info.textClass, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', info.dotClass)} />
      {info.label}
    </span>
  )
}

const ROOM_STATUS_TEXT: Record<DistributionRoomStatus, { label: string; className: string }> = {
  pending: { label: 'Chờ giao', className: 'text-amber-600 dark:text-amber-400' },
  delivered: { label: 'Đang giao', className: 'text-blue-600 dark:text-blue-400' },
  confirmed: { label: 'Đã giao', className: 'text-green-600 dark:text-green-400' },
  rejected: { label: 'Không vào được', className: 'text-red-600 dark:text-red-400' },
}

interface RoomStatusBadgeProps {
  status: DistributionRoomStatus
}

export function RoomStatusBadge({ status }: RoomStatusBadgeProps) {
  const config = ROOM_STATUS_TEXT[status]
  if (!config) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', config.className)}>
      {config.label}
    </span>
  )
}

// Suppress unused-import warnings for forwarded types
export type { DistributionOrderStatus, RouteStatus }
