/**
 * Tape Chart utilities — Phase 2a
 *
 * Cung cấp:
 * - Tính toán vị trí bar theo GIỜ THỰC (half-day rendering)
 * - Phân làn (lane) khi có booking trùng giờ trong cùng phòng (overbooking)
 * - Tính trạng thái thanh toán 5-state cho màu sắc bar
 */
import { addDays, differenceInMinutes, parseISO } from 'date-fns'
import type { TapeChartBooking } from '@/hooks/useTapeChart'

export const DEFAULT_CHECK_IN_HOUR = 14 // 14:00
export const DEFAULT_CHECK_OUT_HOUR = 12 // 12:00
export const MINUTES_PER_DAY = 24 * 60

/** Parse "HH:MM" or "HH:MM:SS" → minutes from midnight, fallback default */
export function parseTimeToMinutes(t: string | null | undefined, fallbackHour: number): number {
  if (!t) return fallbackHour * 60
  const [hh, mm] = t.split(':')
  const h = Number(hh) || fallbackHour
  const m = Number(mm) || 0
  return h * 60 + m
}

/** Lấy mốc datetime check-in/out thực tế của booking dưới dạng Date */
export function getBookingInterval(b: TapeChartBooking): { start: Date; end: Date } {
  const ci = parseISO(b.check_in_date)
  const co = parseISO(b.check_out_date)
  const ciMin = parseTimeToMinutes(b.expected_check_in_time, DEFAULT_CHECK_IN_HOUR)
  const coMin = parseTimeToMinutes(b.expected_check_out_time, DEFAULT_CHECK_OUT_HOUR)
  const start = new Date(ci)
  start.setMinutes(ciMin)
  const end = new Date(co)
  end.setMinutes(coMin)
  return { start, end }
}

export interface BookingLayout {
  booking: TapeChartBooking
  offsetMin: number // phút từ startDate
  durationMin: number // độ dài bar tính bằng phút
  lane: number // 0,1,2... khi có conflict
  conflict: boolean // có đè lên booking khác cùng phòng
}

/**
 * Sweep-line phân làn cho danh sách booking của 1 phòng.
 * Trả về layout đã được clamp về window [start, end).
 */
export function buildRoomLane(
  bookings: TapeChartBooking[],
  windowStart: Date,
  days: number,
): { layouts: BookingLayout[]; laneCount: number } {
  const windowEnd = addDays(windowStart, days)
  const windowEndMin = days * MINUTES_PER_DAY

  // Sort theo start time thực
  const enriched = bookings
    .map((b) => {
      const { start, end } = getBookingInterval(b)
      return { b, start, end }
    })
    .filter(({ start, end }) => end > windowStart && start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // Lane allocation: greedy — tìm lane đầu tiên còn trống
  const laneEnds: Date[] = []
  const layouts: BookingLayout[] = []
  // Đánh dấu conflict: cặp nào overlap thực sự
  const conflicts = new Set<string>()
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      if (enriched[j].start < enriched[i].end) {
        conflicts.add(enriched[i].b.id)
        conflicts.add(enriched[j].b.id)
      } else break
    }
  }

  for (const { b, start, end } of enriched) {
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    const offsetMin = Math.max(0, differenceInMinutes(start, windowStart))
    const rawEnd = Math.min(windowEndMin, differenceInMinutes(end, windowStart))
    const durationMin = Math.max(60, rawEnd - offsetMin) // tối thiểu 1h cho dễ nhìn
    layouts.push({
      booking: b,
      offsetMin,
      durationMin,
      lane,
      conflict: conflicts.has(b.id),
    })
  }

  return { layouts, laneCount: Math.max(1, laneEnds.length) }
}

/** 5 trạng thái thanh toán → màu */
export type PaymentState =
  | 'unpaid'
  | 'partial_deposit'
  | 'deposit_full'
  | 'paid_full'
  | 'debt_after_checkout'

export function getPaymentState(b: TapeChartBooking): PaymentState {
  const total = Number(b.total_amount) || 0
  const paid = Number(b.amount_paid) || 0
  const deposit = Number(b.deposit_amount) || 0
  const settled = paid + deposit
  const remaining = total - settled

  if (b.status === 'checked_out') {
    return remaining > 1000 ? 'debt_after_checkout' : 'paid_full'
  }
  if (total <= 0) return 'unpaid'
  if (settled >= total - 1000) return b.status === 'checked_in' ? 'paid_full' : 'deposit_full'
  if (settled > 0) return 'partial_deposit'
  return 'unpaid'
}

export interface BarColor {
  bg: string
  border: string
  text: string
  hover: string
  ring: string
}

/**
 * Navy Trust palette cho tape chart bars.
 *
 * Visual hierarchy (từ nổi → mờ):
 *  - Đang ở (checked_in)    : navy đậm, chữ trắng  → cần chú ý nhất
 *  - Còn nợ                 : đỏ đậm, chữ trắng    → cảnh báo
 *  - Sắp tới (confirmed)    : tint nhạt + left border màu semantic
 *  - Đã trả phòng           : slate xám rất mờ      → ngữ cảnh quá khứ
 */
export function getBarColor(b: TapeChartBooking): BarColor {
  const ps = getPaymentState(b)

  // 1. Đang lưu trú — solid navy (primary), nổi bật nhất
  if (b.status === 'checked_in') {
    return {
      bg: 'bg-slate-900',
      border: 'border-l-[3px] border-l-[hsl(var(--primary))]',
      text: 'text-white',
      hover: 'hover:bg-slate-800',
      ring: 'ring-slate-400',
    }
  }

  // 2. Đã trả phòng
  if (b.status === 'checked_out') {
    if (ps === 'debt_after_checkout') {
      return {
        bg: 'bg-red-600',
        border: 'border-l-[3px] border-l-red-900',
        text: 'text-white',
        hover: 'hover:bg-red-700',
        ring: 'ring-red-300',
      }
    }
    return {
      bg: 'bg-slate-100',
      border: 'border-l-[3px] border-l-slate-400',
      text: 'text-slate-600',
      hover: 'hover:bg-slate-200',
      ring: 'ring-slate-300',
    }
  }

  // 3. Confirmed — tint nhạt theo trạng thái thanh toán
  switch (ps) {
    case 'deposit_full':
    case 'paid_full':
      return {
        bg: 'bg-emerald-50',
        border: 'border-l-[3px] border-l-emerald-600',
        text: 'text-emerald-900',
        hover: 'hover:bg-emerald-100',
        ring: 'ring-emerald-400',
      }
    case 'partial_deposit':
      return {
        bg: 'bg-amber-50',
        border: 'border-l-[3px] border-l-amber-600',
        text: 'text-amber-900',
        hover: 'hover:bg-amber-100',
        ring: 'ring-amber-400',
      }
    default:
      return {
        bg: 'bg-orange-50',
        border: 'border-l-[3px] border-l-orange-500',
        text: 'text-orange-900',
        hover: 'hover:bg-orange-100',
        ring: 'ring-orange-400',
      }
  }
}


/** Khoá ngắn để CSS color-blind áp pattern overlay đúng nhóm trạng thái */
export function getBarKey(b: TapeChartBooking): string {
  if (b.status === 'checked_in') return 'checked_in'
  if (b.status === 'checked_out') {
    return getPaymentState(b) === 'debt_after_checkout' ? 'debt' : 'checked_out'
  }
  const ps = getPaymentState(b)
  if (ps === 'deposit_full' || ps === 'paid_full') return 'paid'
  if (ps === 'partial_deposit') return 'partial'
  return 'unpaid'
}

export const PAYMENT_LABEL: Record<PaymentState, string> = {
  unpaid: 'Chưa cọc',
  partial_deposit: 'Cọc một phần',
  deposit_full: 'Đã cọc đủ',
  paid_full: 'Đã thanh toán',
  debt_after_checkout: 'Còn nợ sau trả',
}

/** Nguồn booking → mã ngắn 2 ký tự */
export function getSourceBadge(src: string | null | undefined): string | null {
  if (!src) return null
  const s = src.toLowerCase()
  if (s.includes('walk')) return 'WI'
  if (s.includes('booking')) return 'BK'
  if (s.includes('agoda')) return 'AG'
  if (s.includes('airbnb')) return 'AB'
  if (s.includes('expedia')) return 'EX'
  if (s.includes('traveloka')) return 'TR'
  if (s.includes('direct') || s.includes('trực')) return 'DR'
  if (s.includes('phone') || s.includes('điện')) return 'PH'
  return s.slice(0, 2).toUpperCase()
}

/** Filter booking theo từ khóa */
export function bookingMatchesQuery(b: TapeChartBooking, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase().trim()
  return (
    b.guest_name?.toLowerCase().includes(needle) ||
    (b.guest_phone?.toLowerCase().includes(needle) ?? false) ||
    b.id.toLowerCase().includes(needle)
  )
}
