import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RoomStatusBadge } from './RoomStatusBadge'
import { RoomTransitionDialog } from './RoomTransitionDialog'
import { useRoomTransition } from '@/hooks/useRoomTransition'
import {
  ROOM_STATUS_META_V2,
  ROOM_STATUS_V2_LIST,
  normalizeRoomStatus,
} from '@/lib/roomStatus'
import type { RoomStatus, RoomStatusV2 } from '@/types/rooms.types'

interface RoomStatusSelectorProps {
  roomId: string
  currentStatus: RoomStatus | string | null | undefined
  className?: string
}

/** Trạng thái cần dialog nhập lý do/thời hạn */
const REQUIRES_DIALOG: RoomStatusV2[] = ['dnd', 'out_of_service', 'out_of_order', 'skipper', 'sleep_out']

/** Nhóm hiển thị trong dropdown để dễ scan */
const GROUPS: { label: string; statuses: RoomStatusV2[] }[] = [
  {
    label: 'Sẵn sàng',
    statuses: ['vacant_clean', 'vacant_inspected', 'vacant_dirty'],
  },
  {
    label: 'Đang lưu trú',
    statuses: ['occupied_clean', 'occupied_dirty', 'dnd', 'service_refused', 'sleep_out'],
  },
  {
    label: 'Đặc biệt',
    statuses: ['skipper', 'out_of_order', 'out_of_service'],
  },
]

export function RoomStatusSelector({ roomId, currentStatus, className }: RoomStatusSelectorProps) {
  const transition = useRoomTransition()
  const [pendingTarget, setPendingTarget] = useState<RoomStatusV2 | null>(null)

  const normalized = normalizeRoomStatus(currentStatus)

  const handleSelect = (target: RoomStatusV2) => {
    if (target === normalized) return
    if (REQUIRES_DIALOG.includes(target)) {
      setPendingTarget(target)
      return
    }
    transition.mutate({ roomId, toStatus: target })
  }

  return (
    <>
      <div onClick={(e) => { e.stopPropagation(); e.preventDefault() }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={className}
              size="sm"
              disabled={transition.isPending}
              onClick={(e) => { e.stopPropagation(); e.preventDefault() }}
            >
              {transition.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RoomStatusBadge status={normalized} />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background w-56 max-h-[60vh] overflow-y-auto">
            {GROUPS.map((group, i) => (
              <div key={group.label}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </DropdownMenuLabel>
                {group.statuses.map((status) => {
                  const meta = ROOM_STATUS_META_V2[status]
                  const isCurrent = normalized === status
                  return (
                    <DropdownMenuItem
                      key={status}
                      onClick={() => handleSelect(status)}
                      className="cursor-pointer flex items-start gap-2 py-2"
                    >
                      <div className={`mt-0.5 h-2 w-2 rounded-full ${meta.bg} border ${meta.border}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${meta.text}`}>{meta.label}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{meta.description}</div>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 mt-0.5" />}
                    </DropdownMenuItem>
                  )
                })}
              </div>
            ))}
            {/* Fallback: hiển thị các trạng thái còn lại nếu không nằm trong group */}
            {ROOM_STATUS_V2_LIST.filter(s => !GROUPS.some(g => g.statuses.includes(s))).length > 0 && (
              <>
                <DropdownMenuSeparator />
                {ROOM_STATUS_V2_LIST.filter(s => !GROUPS.some(g => g.statuses.includes(s))).map((status) => (
                  <DropdownMenuItem key={status} onClick={() => handleSelect(status)}>
                    {ROOM_STATUS_META_V2[status].label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pendingTarget && (
        <RoomTransitionDialog
          open={!!pendingTarget}
          onOpenChange={(open) => !open && setPendingTarget(null)}
          roomId={roomId}
          targetStatus={pendingTarget}
          onDone={() => setPendingTarget(null)}
        />
      )}
    </>
  )
}
