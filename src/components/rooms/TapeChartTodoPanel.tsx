import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn, formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { TapeChartBooking, TapeChartRoom } from '@/hooks/useTapeChart'
import { getPaymentState } from '@/lib/tape-chart'
import { isRoomDirty } from '@/lib/roomStatus'

interface Props {
  rooms: TapeChartRoom[]
  bookings: TapeChartBooking[]
  onBookingClick: (b: TapeChartBooking) => void
  className?: string
}

/**
 * Sidebar "Cần làm hôm nay" — nhóm việc cho lễ tân.
 * 4 nhóm: Đến hôm nay (chưa check-in) / Đi hôm nay (chưa check-out) /
 * Phòng dơ cần dọn / Booking còn nợ.
 */
export function TapeChartTodoPanel({ rooms, bookings, onBookingClick, className }: Props) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const data = useMemo(() => {
    const arrivals = bookings.filter(
      (b) => b.check_in_date === todayStr && b.status === 'confirmed',
    )
    const departures = bookings.filter(
      (b) => b.check_out_date === todayStr && b.status === 'checked_in',
    )
    const dirty = rooms.filter((r) => isRoomDirty(r.status))
    const debts = bookings.filter((b) => {
      const r = (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0) - (Number(b.deposit_amount) || 0)
      return r > 1000 && (b.status === 'checked_in' || b.status === 'checked_out')
    })
    return { arrivals, departures, dirty, debts }
  }, [rooms, bookings, todayStr])

  const Section = ({
    title,
    count,
    accent,
    children,
  }: {
    title: string
    count: number
    accent: string
    children: React.ReactNode
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        <span className={cn('text-xs font-semibold tabular-nums', accent)}>{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-1 text-[11px] text-muted-foreground/70">Không có</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </div>
  )

  const roomMap = useMemo(() => {
    const m = new Map<string, TapeChartRoom>()
    rooms.forEach((r) => m.set(r.id, r))
    return m
  }, [rooms])

  return (
    <aside
      className={cn(
        'flex w-full flex-col gap-3 rounded-lg border bg-card p-3 text-sm',
        className,
      )}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Cần làm hôm nay</h3>
        <span className="text-[11px] text-muted-foreground">
          {format(new Date(), 'EEE dd/MM', { locale: vi })}
        </span>
      </div>

      <Section title="Khách đến" count={data.arrivals.length} accent="text-emerald-600">
        {data.arrivals.map((b) => {
          const r = roomMap.get(b.room_id)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBookingClick(b)}
              className="flex w-full items-center gap-2 rounded border bg-background px-2 py-1.5 text-left hover:bg-accent/40"
            >
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">
                {r?.room_number || '?'}
              </span>
              <span className="flex-1 truncate text-xs">{b.guest_name}</span>
              <span className="text-[10px] text-muted-foreground">
                {b.expected_check_in_time?.slice(0, 5) || '14:00'}
              </span>
            </button>
          )
        })}
      </Section>

      <Section title="Khách đi" count={data.departures.length} accent="text-blue-600">
        {data.departures.map((b) => {
          const r = roomMap.get(b.room_id)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBookingClick(b)}
              className="flex w-full items-center gap-2 rounded border bg-background px-2 py-1.5 text-left hover:bg-accent/40"
            >
              <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] text-blue-700">
                {r?.room_number || '?'}
              </span>
              <span className="flex-1 truncate text-xs">{b.guest_name}</span>
              <span className="text-[10px] text-muted-foreground">
                {b.expected_check_out_time?.slice(0, 5) || '12:00'}
              </span>
            </button>
          )
        })}
      </Section>

      <Section title="Phòng dơ" count={data.dirty.length} accent="text-amber-600">
        <div className="flex flex-wrap gap-1">
          {data.dirty.slice(0, 30).map((r) => (
            <Badge
              key={r.id}
              variant="outline"
              className="rounded font-mono text-[10px] text-amber-700"
            >
              {r.room_number}
            </Badge>
          ))}
          {data.dirty.length > 30 && (
            <span className="text-[10px] text-muted-foreground">+{data.dirty.length - 30}</span>
          )}
        </div>
      </Section>

      <Section title="Booking còn nợ" count={data.debts.length} accent="text-red-600">
        {data.debts.slice(0, 10).map((b) => {
          const r = roomMap.get(b.room_id)
          const remaining =
            (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0) - (Number(b.deposit_amount) || 0)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBookingClick(b)}
              className="flex w-full items-center gap-2 rounded border bg-background px-2 py-1.5 text-left hover:bg-accent/40"
            >
              <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] text-red-700">
                {r?.room_number || '?'}
              </span>
              <span className="flex-1 truncate text-xs">{b.guest_name}</span>
              <span className="text-[10px] font-semibold text-red-600">
                {formatCurrency(remaining)}
              </span>
            </button>
          )
        })}
      </Section>
    </aside>
  )
}
