import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Clock } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { RoomStatusSelector } from './RoomStatusSelector'
import { RoomQuickHeader } from './RoomQuickHeader'
import { QuickViewBookingCard } from './quickview/QuickViewBookingCard'
import { QuickViewGroupSiblings } from './quickview/QuickViewGroupSiblings'
import { QuickViewItemsStatus } from './quickview/QuickViewItemsStatus'
import { QuickViewFooter } from './quickview/QuickViewFooter'
import { cn } from '@/lib/utils'
import { type PriorityTier } from '@/lib/roomPriority'
import { type ActiveBooking } from '@/hooks/useActiveRoomBookings'
import type { RoomWithStats, RoomStatus } from '@/types/rooms.types'

export interface GroupSibling {
  roomId: string
  roomNumber: string
  status: string
  guestName: string | null
}

export interface QuickViewEntry {
  room: RoomWithStats
  pendingCount: number
  priority: {
    tier: PriorityTier
    reason?: string | null
    daysSinceCheck: number | null
  }
  booking: ActiveBooking | null
  minutesToCheckout: number | null
  session?: { user_id: string; user_name: string; check_type: string } | null
  /** Các phòng cùng group booking (không bao gồm phòng hiện tại) */
  groupSiblings?: GroupSibling[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: QuickViewEntry | null
  canViewRoomDetail: boolean
  canCreateTask: boolean
  currentUserId?: string
  onOpenCreateTask?: (room: RoomWithStats) => void
}

export function RoomQuickViewDialog({
  open, onOpenChange, entry, canViewRoomDetail, canCreateTask, currentUserId, onOpenCreateTask,
}: Props) {
  const { t } = useTranslation(['rooms'])
  const navigate = useNavigate()

  if (!entry) return null
  const { room, pendingCount, priority, booking, minutesToCheckout, session, groupSiblings } = entry
  const roomTypeLabel = t(`roomTypes.${room.room_type}`, { defaultValue: room.room_type })

  const metaParts = [
    roomTypeLabel,
    `${room.max_guests} khách`,
    room.bed_type || null,
    room.area_sqm ? `${room.area_sqm}m²` : null,
  ].filter(Boolean)

  const lastCheckText = room.last_check_at
    ? t('grid.lastCheckedRelative', {
        time: formatDistanceToNow(new Date(room.last_check_at), { locale: vi, addSuffix: false }),
      })
    : t('grid.neverChecked')

  const close = () => onOpenChange(false)
  const goCheck = () => {
    const mine = !!session && session.user_id === currentUserId
    navigate(`/rooms/${room.id}/check${mine ? '?resume=true' : ''}`)
    close()
  }
  const goDetail = () => { navigate(`/rooms/${room.id}`); close() }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0">
        <RoomQuickHeader roomNumber={room.room_number} status={room.status} withPrefix={false} />

        <div className="px-4 py-3 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Đổi trạng thái</span>
            <RoomStatusSelector roomId={room.id} currentStatus={room.status as RoomStatus} />
          </div>

          {priority.reason && priority.tier !== 'normal' && (
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium',
                priority.tier === 'urgent'
                  ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900',
              )}
            >
              {priority.reason}
            </div>
          )}

          {session && (
            <div className="flex items-center gap-2 text-orange-600">
              <Clock className="h-4 w-4 animate-pulse shrink-0" />
              <span className="font-medium">
                {t('checkSession.checking', {
                  name: session.user_name,
                  type: t(`checkTypes.${session.check_type}`, { defaultValue: session.check_type }),
                })}
              </span>
            </div>
          )}

          {booking && <QuickViewBookingCard booking={booking} minutesToCheckout={minutesToCheckout} />}

          {groupSiblings && groupSiblings.length > 0 && (
            <QuickViewGroupSiblings siblings={groupSiblings} onNavigate={close} />
          )}

          <QuickViewItemsStatus
            room={room}
            pendingCount={pendingCount}
            daysSinceCheck={priority.daysSinceCheck}
            lastCheckText={lastCheckText}
          />

          <div className="pt-2 border-t text-xs text-muted-foreground">
            {metaParts.join(' • ')}
          </div>
        </div>

        <QuickViewFooter
          room={room}
          session={session}
          currentUserId={currentUserId}
          canViewRoomDetail={canViewRoomDetail}
          canCreateTask={canCreateTask}
          onCheck={goCheck}
          onDetail={goDetail}
          onCreateTask={onOpenCreateTask}
          onClose={close}
        />
      </DialogContent>
    </Dialog>
  )
}
