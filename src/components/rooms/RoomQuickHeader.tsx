import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  getRoomStatusDotClass,
  getRoomStatusTextClass,
  getRoomStatusLabel,
} from '@/lib/roomStatus'

/**
 * Header dùng chung cho Quick View dialog (cả RoomQuickViewDialog & ReceptionQuickDialog).
 * Pattern: [chấm semantic] · "Phòng <số>" · [nhãn trạng thái màu] · [slot phụ — VIP, badge…]
 *
 * Right slot dùng cho dropdown menu (⋯) hoặc CTA phụ ở góc phải.
 * Sub line dùng cho meta info (loại phòng · giường · tầng · m² · view).
 */
interface Props {
  roomNumber: string
  status: string
  /** Có thêm chữ "Phòng " trước số phòng (default: true). RoomQuickViewDialog ngắn gọn có thể bỏ. */
  withPrefix?: boolean
  /** Slot bên phải cho dropdown menu ⋯ hoặc nút phụ. */
  rightSlot?: ReactNode
  /** Slot phụ sát nhãn trạng thái (VIP badge, group badge…). */
  trailingBadge?: ReactNode
  /** Hàng meta dưới (loại phòng, tầng, view…). */
  subline?: ReactNode
  className?: string
}

export function RoomQuickHeader({
  roomNumber,
  status,
  withPrefix = true,
  rightSlot,
  trailingBadge,
  subline,
  className,
}: Props) {
  const dot = getRoomStatusDotClass(status)
  const textCls = getRoomStatusTextClass(status)
  const label = getRoomStatusLabel(status)

  return (
    <div className={cn('px-4 sm:px-5 py-3.5 border-b space-y-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', dot)}
            aria-hidden
          />
          <span className="text-xl font-bold leading-none">
            {withPrefix ? `Phòng ${roomNumber}` : roomNumber}
          </span>
          <span className={cn('text-sm font-medium ml-1', textCls)}>{label}</span>
          {trailingBadge}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      {subline && (
        <div className="text-xs text-muted-foreground capitalize flex items-center gap-2 flex-wrap pl-5">
          {subline}
        </div>
      )}
    </div>
  )
}
