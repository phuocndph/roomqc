import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  CheckCircle, AlertTriangle, Wind, Truck, PackageOpen, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMissingDisplay, type PriorityTier } from '@/lib/roomPriority'
import { getRoomStatusDotClass, getRoomStatusTextClass } from '@/lib/roomStatus'
import type { RoomWithStats } from '@/types/rooms.types'

interface Props {
  room: RoomWithStats
  isSelected: boolean
  selectionMode: boolean
  session: { user_id: string; user_name: string; check_type: string } | null | undefined
  pendingCount: number
  priorityTier: PriorityTier
  priorityReason: string | null | undefined
  currentUserId?: string
  onToggleSelect: (id: string) => void
  onEnterSelection: (id: string) => void
  onOpenQuickView: () => void
}

export function MobileRoomCard({
  room, isSelected, selectionMode, session, pendingCount,
  priorityTier, priorityReason, currentUserId,
  onToggleSelect, onEnterSelection, onOpenQuickView,
}: Props) {
  const { t } = useTranslation(['rooms', 'common', 'distribution'])
  const navigate = useNavigate()
  const longPressTimer = useRef<number | null>(null)
  const longPressTriggered = useRef(false)

  const missing = getMissingDisplay(room)
  const statusLabel = t(`status.${room.status}`, { defaultValue: room.status })
  const checkDisabled = !!session && session.user_id !== currentUserId
  const checkLabel = session
    ? session.user_id === currentUserId
      ? t('checkSession.continueCheck')
      : t('checkSession.inProgress')
    : t('checkSession.check')

  const startLongPress = () => {
    longPressTriggered.current = false
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true
      if (!selectionMode) {
        onEnterSelection(room.id)
        if ('vibrate' in navigator) navigator.vibrate?.(30)
      }
    }, 500)
  }
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleCardClick = () => {
    if (longPressTriggered.current) { longPressTriggered.current = false; return }
    if (selectionMode) { onToggleSelect(room.id); return }
    onOpenQuickView()
  }

  return (
    <Card
      className={cn(
        'transition-all active:scale-[0.99] cursor-pointer select-none',
        priorityTier === 'urgent' && 'border-l-[3px] border-l-red-500',
        priorityTier === 'warning' && 'border-l-[3px] border-l-amber-500',
        isSelected && 'ring-2 ring-primary bg-primary/5',
      )}
      onClick={handleCardClick}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectionMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(room.id)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', getRoomStatusDotClass(room.status))} aria-hidden />
            <span className="font-bold text-lg leading-none shrink-0">{room.room_number}</span>
            <span className={cn('text-xs font-medium truncate', getRoomStatusTextClass(room.status))}>
              {statusLabel}
            </span>
          </div>
        </div>

        {priorityReason && priorityTier !== 'normal' && (
          <p className={cn(
            'text-sm font-medium',
            priorityTier === 'urgent' ? 'text-red-600' : 'text-amber-600',
          )}>
            {priorityReason}
          </p>
        )}

        <div className="space-y-1 text-sm">
          {session ? (
            <div className="flex items-center gap-1.5 text-orange-600">
              <Clock className="h-3.5 w-3.5 animate-pulse shrink-0" />
              <span className="font-medium truncate">
                {t('checkSession.checking', {
                  name: session.user_name,
                  type: t(`checkTypes.${session.check_type}`, { defaultValue: session.check_type }),
                })}
              </span>
            </div>
          ) : missing.kind === 'complete' ? (
            <div className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{t('grid.itemsComplete')}</span>
            </div>
          ) : missing.kind === 'after_clean' ? (
            <div className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{t('grid.missingAfterClean', { count: missing.count })}</span>
            </div>
          ) : missing.kind === 'restock' ? (
            <div className="flex items-center gap-1.5 text-amber-600">
              <PackageOpen className="h-3.5 w-3.5 shrink-0" />
              <span>{t('grid.needRestock', { count: missing.count })}</span>
            </div>
          ) : null}

          {room.items_in_laundry > 0 && (
            <div className="flex items-center gap-1.5 text-cyan-600">
              <Wind className="h-3.5 w-3.5 shrink-0" />
              <span>{t('grid.itemsInLaundry', { count: room.items_in_laundry })}</span>
            </div>
          )}

          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <Truck className="h-3.5 w-3.5 shrink-0" />
              <span>{t('distribution:roomHistory.pendingDeliveries', { count: pendingCount })}</span>
            </div>
          )}
        </div>

        <div className="pt-1.5 border-t text-xs text-muted-foreground truncate">
          {[
            t(`roomTypes.${room.room_type}`, { defaultValue: room.room_type }),
            `${room.max_guests} khách`,
            room.bed_type || null,
            room.area_sqm ? `${room.area_sqm}m²` : null,
          ].filter(Boolean).join(' • ')}
        </div>

        {!selectionMode && (
          <div className="pt-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="w-full h-9"
              disabled={checkDisabled}
              onClick={() => {
                const hasSession = !!session && session.user_id === currentUserId
                navigate(`/rooms/${room.id}/check${hasSession ? '?resume=true' : ''}`)
              }}
            >
              {checkLabel}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
