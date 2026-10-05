import { addDays, format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface Props {
  fromDate: string // yyyy-MM-dd
  days: number
  selectedIn?: string
  selectedOut?: string // exclusive (ngày khách trả phòng)
  isDateBooked: (d: string) => boolean
  onPickDate?: (d: string) => void
  isLoading?: boolean
  /** Khi user đang chọn check-out (bước 2 của range mode) → highlight gợi ý */
  pickingStep?: 'in' | 'out'
}

/**
 * Mini-calendar grid 7 cột.
 * Vai trò ô:
 *  - Nhận (check-in): primary đậm
 *  - Trả (check-out, ngày khách rời = selectedOut - 1 hiển thị label "Trả")
 *  - Ở giữa: primary nhạt
 *  - Bận: đỏ; Trống: muted
 */
export function RoomAvailabilityStrip({
  fromDate,
  days,
  selectedIn,
  selectedOut,
  isDateBooked,
  onPickDate,
  isLoading,
  pickingStep,
}: Props) {
  const start = parseISO(fromDate)
  const cells = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i)
    return {
      iso: format(d, 'yyyy-MM-dd'),
      dayNum: format(d, 'd'),
      dow: format(d, 'EEEEEE', { locale: vi }),
    }
  })

  // Ngày trả thực tế = selectedOut - 1 (vì selectedOut là exclusive)
  const checkoutDay = selectedOut
    ? format(addDays(parseISO(selectedOut), -1), 'yyyy-MM-dd')
    : undefined

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Lịch {days} ngày tới</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-muted border" /> Trống
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> Đã đặt
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-primary" /> Nhận
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-primary/70" /> Trả
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-primary/20" /> Trong khoảng
        </span>
      </div>

      {isLoading ? (
        <div className="h-24 rounded border bg-muted/30 animate-pulse" />
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => {
            const booked = isDateBooked(c.iso)
            const isIn = selectedIn === c.iso
            const isOut = checkoutDay === c.iso
            const inRange =
              !isIn &&
              !isOut &&
              selectedIn &&
              selectedOut &&
              c.iso > selectedIn &&
              c.iso < selectedOut

            let stateClass =
              'bg-muted hover:bg-accent border-transparent text-foreground cursor-pointer'
            if (booked) {
              stateClass = 'bg-red-50 border-red-200 text-red-600 cursor-not-allowed'
            } else if (isIn) {
              stateClass =
                'bg-primary border-primary text-primary-foreground font-semibold cursor-pointer'
            } else if (isOut) {
              stateClass =
                'bg-primary/70 border-primary text-primary-foreground font-semibold cursor-pointer'
            } else if (inRange) {
              stateClass =
                'bg-primary/20 border-primary/30 text-primary hover:bg-primary/30 cursor-pointer'
            }

            const label = isIn ? 'Nhận' : isOut ? 'Trả' : c.dow

            return (
              <button
                key={c.iso}
                type="button"
                disabled={booked}
                onClick={() => !booked && onPickDate?.(c.iso)}
                title={
                  booked
                    ? `${format(parseISO(c.iso), 'dd/MM/yyyy')} — Đã đặt`
                    : `${format(parseISO(c.iso), 'dd/MM/yyyy')}${isIn ? ' — Nhận phòng' : isOut ? ' — Trả phòng' : ''}`
                }
                className={cn(
                  'h-12 rounded text-[11px] leading-tight flex flex-col items-center justify-center border transition-colors',
                  stateClass,
                  pickingStep === 'out' && !booked && !isIn && 'ring-1 ring-primary/30',
                )}
              >
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-tight',
                    isIn || isOut ? 'opacity-90' : 'opacity-60',
                  )}
                >
                  {label}
                </span>
                <span className="font-medium text-sm">{c.dayNum}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
