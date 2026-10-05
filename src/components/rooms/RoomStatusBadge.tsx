import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getRoomStatusMeta } from '@/lib/roomStatus'
import type { RoomStatus } from '@/types/rooms.types'

interface RoomStatusBadgeProps {
  status: RoomStatus | string | null | undefined
  className?: string
  /** Hiển thị nhãn ngắn (cho mobile/badge nhỏ). Mặc định false. */
  short?: boolean
}

/**
 * Badge trạng thái phòng — minimalist, dùng semantic text color theo design system.
 * Tự nhận cả status legacy và v2 thông qua `getRoomStatusMeta`.
 */
export function RoomStatusBadge({ status, className, short = false }: RoomStatusBadgeProps) {
  const meta = getRoomStatusMeta(status)

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium border',
        meta.text,
        meta.bg,
        meta.border,
        className,
      )}
      title={meta.description}
    >
      {short ? meta.short : meta.label}
    </Badge>
  )
}
