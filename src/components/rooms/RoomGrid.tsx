import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Bed,
  CheckCircle,
  AlertTriangle,
  Wind,
  Clock,
  Truck,
  PackageOpen,
  ChevronDown,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RoomQuickViewDialog, type QuickViewEntry } from './RoomQuickViewDialog'
import { CreateTaskDialog } from '@/components/housekeeping/CreateTaskDialog'
import { useAllRoomCheckSessions } from '@/hooks/useRoomCheckSession'
import { usePendingRoomDistributions } from '@/hooks/usePendingRoomDistributions'
import { useActiveRoomBookings, minutesUntilCheckout, formatCheckoutTime, type ActiveBooking } from '@/hooks/useActiveRoomBookings'
import { useUser } from '@/hooks/useUser'
import { hasPermission } from '@/lib/permissions'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import { cn } from '@/lib/utils'
import { calcRoomPriority, getMissingDisplay, isOccupiedStatus, type PriorityTier } from '@/lib/roomPriority'
import { getRoomStatusDotClass, getRoomStatusTextClass } from '@/lib/roomStatus'
import { useRoomViewDensity } from '@/hooks/useRoomViewDensity'
import { useHotelContext } from '@/contexts/HotelContext'
import { useRequireShift } from '@/contexts/RequireShiftContext'
import type { RoomWithStats } from '@/types/rooms.types'

type ManualTaskType = 'checkout_inspection' | 'cleaning' | 'checkin_prep' | 'amenity_request' | 'other'

interface RoomGridProps {
  rooms: RoomWithStats[]
  isLoading: boolean
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

function lastCheckClass(days: number | null): string {
  if (days === null) return 'text-amber-600'
  if (days > 30) return 'text-red-600 font-medium'
  if (days > 7) return 'text-amber-600'
  return 'text-muted-foreground'
}

function priorityRingClass(tier: PriorityTier): string {
  switch (tier) {
    case 'urgent':
      return 'border-l-[3px] border-l-red-500'
    case 'warning':
      return 'border-l-[3px] border-l-amber-500'
    default:
      return 'border-l-[3px] border-l-transparent'
  }
}

export function RoomGrid({ rooms, isLoading, selectedIds, onSelectionChange }: RoomGridProps) {
  const { t } = useTranslation(['rooms', 'distribution'])
  const navigate = useNavigate()
  const { user, role } = useUser()
  const checkSessions = useAllRoomCheckSessions(user?.tenant_id)
  const { data: pendingDistributions } = usePendingRoomDistributions()
  const { selectedHotel } = useHotelContext()
  const { data: activeBookings } = useActiveRoomBookings(selectedHotel?.id)

  const [taskRoom, setTaskRoom] = useState<{ id: string; number: string; hotelId: string } | null>(null)
  const [taskType, setTaskType] = useState<ManualTaskType>('cleaning')
  const [quickViewEntry, setQuickViewEntry] = useState<QuickViewEntry | null>(null)
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)


  const canViewRoomDetail = hasPermission(role, 'manage_rooms') || role !== 'staff'
  const canCreateTask = canCreateHousekeepingTask(user)
  const { styles } = useRoomViewDensity(selectedHotel?.id)
  const { guard: guardShift, isOnShift, requiresShift } = useRequireShift()

  // Tick mỗi 60s để recompute countdown trả phòng
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Collapse "Bình thường" mặc định + persist theo hotel
  const collapseKey = `rooms.grid.normalCollapsed:${selectedHotel?.id || 'default'}`
  const [normalCollapsed, setNormalCollapsed] = useState<boolean>(true)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey)
      setNormalCollapsed(raw === null ? true : raw === '1')
    } catch {
      setNormalCollapsed(true)
    }
  }, [collapseKey])
  const toggleNormal = () => {
    setNormalCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(collapseKey, next ? '1' : '0') } catch { /* persistence is best effort */ }
      return next
    })
  }

  const grouped = useMemo(() => {
    const now = new Date(nowTick)
    const items = rooms.map((room) => {
      const pendingCount = pendingDistributions?.get(room.id) || 0
      const booking = activeBookings?.get(room.id) || null
      const mins = booking && isOccupiedStatus(room.status)
        ? minutesUntilCheckout(booking, now)
        : null
      const priority = calcRoomPriority(room, { pendingDistributions: pendingCount, minutesToCheckout: mins })
      return { room, pendingCount, priority, booking, minutesToCheckout: mins }
    })
    items.sort((a, b) => b.priority.score - a.priority.score)
    return {
      urgent: items.filter((i) => i.priority.tier === 'urgent'),
      warning: items.filter((i) => i.priority.tier === 'warning'),
      normal: items.filter((i) => i.priority.tier === 'normal'),
    }
  }, [rooms, pendingDistributions, activeBookings, nowTick])

  // Split "Normal" into 3 subgroups: Sẵn sàng / Đang ở / Khác.
  // Keep this memo before loading/empty returns so hook order is stable.
  const normalSubgroups = useMemo(() => {
    const ready: typeof grouped.normal = []
    const occupied: typeof grouped.normal = []
    const other: typeof grouped.normal = []
    for (const it of grouped.normal) {
      const s = it.room.status
      if (s === 'clean' || s === 'available') ready.push(it)
      else if (isOccupiedStatus(s)) occupied.push(it)
      else other.push(it)
    }
    return { ready, occupied, other }
  }, [grouped])

  // Flat sorted list for shift-click range select
  const flatItems = useMemo(
    () => [...grouped.urgent, ...grouped.warning, ...grouped.normal],
    [grouped.urgent, grouped.warning, grouped.normal],
  )

  // Map room_id → list of sibling room ids cùng booking_group_id
  const groupSiblingsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!activeBookings) return map
    const byGroup = new Map<string, string[]>()
    for (const [roomId, b] of activeBookings.entries()) {
      if (!b.booking_group_id) continue
      const arr = byGroup.get(b.booking_group_id) ?? []
      arr.push(roomId)
      byGroup.set(b.booking_group_id, arr)
    }
    for (const ids of byGroup.values()) {
      if (ids.length < 2) continue
      for (const id of ids) map.set(id, ids.filter((x) => x !== id))
    }
    return map
  }, [activeBookings])

  const buildGroupSiblings = (roomId: string) => {
    const ids = groupSiblingsMap.get(roomId)
    if (!ids || ids.length === 0) return undefined
    return ids
      .map((sid) => {
        const r = rooms.find((rr) => rr.id === sid)
        const b = activeBookings?.get(sid) || null
        if (!r) return null
        return {
          roomId: sid,
          roomNumber: r.room_number,
          status: r.status,
          guestName: b?.guest_name ?? null,
        }
      })
      .filter(Boolean) as Array<{ roomId: string; roomNumber: string; status: string; guestName: string | null }>
  }

  const handleSelectRoom = (roomId: string, checked: boolean) => {
    if (checked) onSelectionChange([...selectedIds, roomId])
    else onSelectionChange(selectedIds.filter((id) => id !== roomId))
    setLastSelectedId(roomId)
  }

  /**
   * Click on card:
   * - Shift+Click → range select từ lastSelected đến current trong danh sách flat
   * - Cmd/Ctrl+Click → toggle select 1 phòng
   * - Click thường → mở Quick View
   */
  const handleCardClick = (entry: (typeof grouped.urgent)[number], e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedId) {
      const ids = flatItems.map((i) => i.room.id)
      const startIdx = ids.indexOf(lastSelectedId)
      const endIdx = ids.indexOf(entry.room.id)
      if (startIdx >= 0 && endIdx >= 0) {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        const range = ids.slice(lo, hi + 1)
        const next = Array.from(new Set([...selectedIds, ...range]))
        onSelectionChange(next)
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      handleSelectRoom(entry.room.id, !selectedIds.includes(entry.room.id))
      return
    }
    const session = checkSessions[entry.room.id]
    setQuickViewEntry({
      ...entry,
      session: session ?? null,
      groupSiblings: buildGroupSiblings(entry.room.id),
    })
  }



  const openTaskDialog = (room: RoomWithStats, type: ManualTaskType) => {
    setTaskType(type)
    setTaskRoom({ id: room.id, number: room.room_number, hotelId: room.hotel_id })
  }

  const getCheckTypeLabel = (type: string) => t(`checkTypes.${type}`, { defaultValue: type })

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bed className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">{t('grid.noRooms')}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t('grid.tryChangeFilter')}</p>
      </div>
    )
  }

  const renderCard = (entry: (typeof grouped.urgent)[number]) => {
    const { room, pendingCount, priority, booking, minutesToCheckout } = entry
    const isSelected = selectedIds.includes(room.id)
    const session = checkSessions[room.id]
    const missing = getMissingDisplay(room)
    const roomTypeLabel = t(`roomTypes.${room.room_type}`, { defaultValue: room.room_type })
    const statusLabel = t(`status.${room.status}`, { defaultValue: room.status })

    const isOccupied = isOccupiedStatus(room.status)
    const showBookingLine = isOccupied && !!booking
    const hasPriorityReason = !!priority.reason && priority.tier !== 'normal'
    // Khi đã có booking line → không cần lặp lại last-check
    const showLastCheck = !showBookingLine && !hasPriorityReason && (priority.daysSinceCheck === null || priority.daysSinceCheck > 7)

    const lastCheckText = room.last_check_at
      ? t('grid.lastCheckedRelative', {
          time: formatDistanceToNow(new Date(room.last_check_at), { locale: vi, addSuffix: false }),
        })
      : t('grid.neverChecked')


    // Meta row: type • guests • bed • area
    const metaParts = [
      roomTypeLabel,
      `${room.max_guests} khách`,
      room.bed_type || null,
      room.area_sqm ? `${room.area_sqm}m²` : null,
    ].filter(Boolean)

    return (
      <div
        key={room.id}
        className={cn(
          'group rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md hover:border-foreground/20 cursor-pointer',
          priorityRingClass(priority.tier),
          isSelected && 'ring-2 ring-primary bg-primary/5',
        )}
        onClick={(e) => handleCardClick(entry, e)}
      >
        <div className={cn('space-y-2', styles.cellPadding)}>
          {/* Line 1: dot + số phòng + tên trạng thái (text semantic) + checkbox */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', getRoomStatusDotClass(room.status))} aria-hidden />
              <h3 className="font-bold leading-none tracking-tight shrink-0" style={styles.numberStyle}>
                {room.room_number}
              </h3>
              <span className={cn('text-xs font-medium truncate', getRoomStatusTextClass(room.status))}>
                {statusLabel}
              </span>
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => handleSelectRoom(room.id, !!checked)}
              />
            </div>
          </div>


          {/* Line 2: priority reason */}
          {hasPriorityReason && (
            <p
              className={cn(
                'font-medium',
                priority.tier === 'urgent' ? 'text-red-600' : 'text-amber-600',
              )}
              style={styles.bodyStyle}
            >
              {priority.reason}
            </p>
          )}

          {/* Line 3: actionable info */}
          <div className="space-y-1" style={styles.bodyStyle}>
            {session ? (
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <Clock className="h-3 w-3 animate-pulse shrink-0" />
                <span className="font-medium truncate">
                  {t('checkSession.checking', {
                    name: session.user_name,
                    type: getCheckTypeLabel(session.check_type),
                  })}
                </span>
              </div>
            ) : showBookingLine ? (
              <BookingLine booking={booking!} minutesToCheckout={minutesToCheckout} t={t} />
            ) : missing.kind === 'complete' ? (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-3 w-3 shrink-0" />
                <span>{t('grid.itemsComplete')}</span>
              </div>
            ) : missing.kind === 'after_clean' ? (
              <div className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>{t('grid.missingAfterClean', { count: missing.count })}</span>
              </div>
            ) : missing.kind === 'restock' ? (
              <div className="flex items-center gap-1 text-amber-600">
                <PackageOpen className="h-3 w-3 shrink-0" />
                <span>{t('grid.needRestock', { count: missing.count })}</span>
              </div>
            ) : null}

            {room.items_in_laundry > 0 && (
              <div className="flex items-center gap-1 text-cyan-600">
                <Wind className="h-3 w-3 shrink-0" />
                <span>{t('grid.itemsInLaundry', { count: room.items_in_laundry })}</span>
              </div>
            )}

            {pendingCount > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <Truck className="h-3 w-3 shrink-0" />
                <span>{t('distribution:roomHistory.pendingDeliveries', { count: pendingCount })}</span>
              </div>
            )}

            {showLastCheck && (
              <div className={cn('flex items-center gap-1', lastCheckClass(priority.daysSinceCheck))}>
                <Clock className="h-3 w-3 shrink-0" />
                <span>{lastCheckText}</span>
              </div>
            )}
          </div>


          {/* Line 4: meta row (loại • khách • giường • m²) — không còn giá phòng */}
          <div className="pt-1 border-t text-muted-foreground" style={styles.captionStyle}>
            <span className="truncate block" title={metaParts.join(' • ')}>
              {metaParts.join(' • ')}
            </span>
          </div>
        </div>

        {/* Footer action — chỉ còn 1 nút Kiểm tra. Giao việc / Xem chi tiết đã gom vào Quick View. */}
        <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          {(() => {
            const isLocked = !!session && session.user_id !== user?.id
            const needShift = requiresShift && !isOnShift
            const hasSession = !!session && session.user_id === user?.id
            const label = session
              ? session.user_id === user?.id
                ? t('checkSession.continueCheck')
                : t('checkSession.inProgress')
              : t('checkSession.check')
            const onClick = () => {
              const go = () => navigate(`/rooms/${room.id}/check${hasSession ? '?resume=true' : ''}`)
              guardShift(go)
            }
            const btn = (
              <Button
                size="sm"
                className="w-full h-8"
                disabled={isLocked}
                onClick={onClick}
              >
                {label}
              </Button>
            )
            if (needShift && !isLocked) {
              return (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent>Bạn cần vào ca trước khi kiểm tra</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            }
            return btn
          })()}
        </div>
      </div>
    )
  }

  const renderSection = (
    title: string,
    items: typeof grouped.urgent,
    headerClass: string,
    options?: { collapsible?: boolean; collapsed?: boolean; onToggle?: () => void },
  ) => {
    if (items.length === 0) return null
    const collapsible = options?.collapsible
    const collapsed = options?.collapsed
    return (
      <section className="space-y-3">
        {collapsible ? (
          <button
            type="button"
            onClick={options?.onToggle}
            className={cn(
              'flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:opacity-70',
              headerClass,
            )}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{title}</span>
            <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
              · {collapsed ? t('grid.expandSection') : t('grid.collapseSection')}
            </span>
          </button>
        ) : (
          <h2 className={cn('text-xs font-semibold uppercase tracking-wider', headerClass)}>{title}</h2>
        )}
        {(!collapsible || !collapsed) && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map(renderCard)}
          </div>
        )}
      </section>
    )
  }

  const renderNormalContent = () => (
    <div className="space-y-4">
      {normalSubgroups.ready.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            Sẵn sàng · {normalSubgroups.ready.length}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {normalSubgroups.ready.map(renderCard)}
          </div>
        </div>
      )}
      {normalSubgroups.occupied.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
            Đang có khách · {normalSubgroups.occupied.length}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {normalSubgroups.occupied.map(renderCard)}
          </div>
        </div>
      )}
      {normalSubgroups.other.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            Khác · {normalSubgroups.other.length}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {normalSubgroups.other.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {renderSection(t('grid.sectionUrgent', { count: grouped.urgent.length }), grouped.urgent, 'text-red-600')}
      {renderSection(t('grid.sectionWarning', { count: grouped.warning.length }), grouped.warning, 'text-amber-600')}
      {grouped.normal.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={toggleNormal}
            className={cn(
              'flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-colors hover:opacity-70 text-muted-foreground',
            )}
          >
            {normalCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{t('grid.sectionNormal', { count: grouped.normal.length })}</span>
            <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
              · {normalCollapsed ? t('grid.expandSection') : t('grid.collapseSection')}
            </span>
          </button>
          {!normalCollapsed && renderNormalContent()}
        </section>
      )}

      {taskRoom && (
        <CreateTaskDialog
          open={!!taskRoom}
          onOpenChange={(open) => !open && setTaskRoom(null)}
          roomId={taskRoom.id}
          roomNumber={taskRoom.number}
          hotelId={taskRoom.hotelId}
          defaultTaskType={taskType}
        />
      )}

      <RoomQuickViewDialog
        open={!!quickViewEntry}
        onOpenChange={(open) => !open && setQuickViewEntry(null)}
        entry={quickViewEntry}
        canViewRoomDetail={canViewRoomDetail}
        canCreateTask={canCreateTask}
        currentUserId={user?.id}
        onOpenCreateTask={(room) => openTaskDialog(room, 'cleaning')}
      />
    </div>
  )
}

/**
 * Dòng booking cho phòng đang có khách: "Trả 12:00 · Nguyễn Văn A" + trạng thái countdown.
 */
function BookingLine({
  booking,
  minutesToCheckout,
  t,
}: {
  booking: ActiveBooking
  minutesToCheckout: number | null
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const time = formatCheckoutTime(booking.expected_check_out_time)
  const overdue = minutesToCheckout !== null && minutesToCheckout < 0
  const soon = minutesToCheckout !== null && minutesToCheckout >= 0 && minutesToCheckout <= 120

  const colorClass = overdue
    ? 'text-red-600'
    : soon
      ? 'text-orange-600'
      : 'text-foreground'

  return (
    <div className={cn('flex flex-col gap-0.5 font-medium', colorClass)}>
      <div className="flex items-center gap-1">
        <LogOut className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {t('grid.checkoutAt', { time })} · {booking.guest_name}
        </span>
      </div>
      {overdue && (
        <span className="text-[0.95em] font-normal pl-4">
          {t('grid.checkoutOverdue', { minutes: Math.abs(minutesToCheckout!) })}
        </span>
      )}
      {!overdue && soon && (
        <span className="text-[0.95em] font-normal pl-4">
          {t('grid.checkoutSoon')}
        </span>
      )}
    </div>
  )
}
