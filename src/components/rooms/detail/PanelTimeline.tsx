import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRoomDistributionHistory } from '@/hooks/useRoomDistributionHistory'
import type { RoomCheckWithUser, CheckType } from '@/types/rooms.types'

type EventKind = 'check' | 'delivery'

interface TimelineEvent {
  id: string
  kind: EventKind
  at: Date
  title: string
  subtitle: string
  detail?: string
  badgeColor: string // tailwind text color class
  dotColor: string   // hsl raw for dot bg
}

interface Props {
  roomId: string
  checks: RoomCheckWithUser[]
}

const kindLabel: Record<EventKind, string> = {
  check: 'Kiểm tra',
  delivery: 'Giao đồ',
}

const checkTypeLabel: Record<CheckType, string> = {
  daily: 'Kiểm tra hằng ngày',
  periodic: 'Kiểm tra định kỳ',
  checkin: 'Kiểm tra nhận phòng',
  checkout: 'Kiểm tra trả phòng',
  maintenance: 'Kiểm tra bảo trì',
  delivery: 'Giao đồ',
  replenish: 'Bổ sung đồ',
}

export function PanelTimeline({ roomId, checks }: Props) {
  const { data: deliveries } = useRoomDistributionHistory(roomId)
  const [filter, setFilter] = useState<'all' | EventKind>('all')

  const events: TimelineEvent[] = useMemo(() => {
    const out: TimelineEvent[] = []

    checks?.forEach((c) => {
      const issues =
        (Array.isArray(c.items_missing) ? c.items_missing.length : 0) +
        (Array.isArray(c.items_damaged) ? c.items_damaged.length : 0)
      out.push({
        id: `chk-${c.id}`,
        kind: 'check',
        at: new Date(c.checked_at),
        title: checkTypeLabel[c.check_type] || 'Kiểm tra',
        subtitle: `${c.checked_by_name}${c.cleanliness_score != null ? ` • ${c.cleanliness_score}/5 ★` : ''}`,
        detail: issues > 0
          ? `${issues} sự cố${Array.isArray(c.photos) && c.photos.length > 0 ? ` • ${(c.photos as string[]).length} ảnh` : ''}`
          : Array.isArray(c.photos) && c.photos.length > 0
            ? `${(c.photos as string[]).length} ảnh`
            : undefined,
        badgeColor: 'text-blue-600',
        dotColor: 'hsl(217 91% 60%)',
      })
    })

    deliveries?.forEach((d) => {
      const ts = d.confirmed_at || d.delivered_at || d.created_at
      const statusLabel =
        d.room_status === 'confirmed' ? 'đã xác nhận' :
        d.room_status === 'delivered' ? 'đã giao, chờ xác nhận' :
        d.room_status === 'rejected' ? 'từ chối' :
        d.room_status === 'pending' ? 'chờ giao' : d.room_status
      const color =
        d.room_status === 'confirmed' ? 'hsl(142 76% 36%)' :
        d.room_status === 'rejected' ? 'hsl(0 84% 60%)' :
        'hsl(38 92% 50%)'
      out.push({
        id: `dlv-${d.room_order_id}`,
        kind: 'delivery',
        at: new Date(ts),
        title: `${d.order_code}`,
        subtitle: `${d.total_items} loại • ${d.total_quantity} món • ${statusLabel}`,
        detail: d.assigned_to_name ? `Nhân viên: ${d.assigned_to_name}` : undefined,
        badgeColor: 'text-amber-600',
        dotColor: color,
      })
    })

    return out
      .filter((e) => filter === 'all' || e.kind === filter)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
  }, [checks, deliveries, filter])

  return (
    <div className="border rounded-lg p-4 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Dòng thời gian</p>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả ({events.length})</SelectItem>
            <SelectItem value="check">Kiểm tra</SelectItem>
            <SelectItem value="delivery">Giao đồ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Chưa có hoạt động nào</p>
          </div>
        ) : (
          <ol className="relative border-l-2 border-muted ml-2 space-y-3">
            {events.map((e) => (
              <li key={e.id} className="pl-4 relative">
                <span
                  className="absolute -left-[7px] top-1 h-3 w-3 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: e.dotColor }}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium truncate">{e.title}</p>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">
                    {format(e.at, 'dd/MM HH:mm', { locale: vi })}
                  </span>
                </div>
                <p className={`text-[11px] ${e.badgeColor} mt-0.5`}>
                  {kindLabel[e.kind]} · <span className="text-muted-foreground">{e.subtitle}</span>
                </p>
                {e.detail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{e.detail}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
