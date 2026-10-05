/**
 * Period presets dùng chung cho mọi Report Hub.
 * Mục tiêu: 1 vocab thống nhất + tính sẵn kỳ trước (previous) cùng độ dài.
 */
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  subYears,
  differenceInCalendarDays,
} from 'date-fns'

export type PeriodPresetId =
  | 'today'
  | 'last_7'
  | 'this_month'
  | 'last_month'
  | 'last_90'
  | 'this_year'

export interface PeriodPreset {
  id: PeriodPresetId
  label: string
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'last_7', label: '7 ngày' },
  { id: 'this_month', label: 'Tháng này' },
  { id: 'last_month', label: 'Tháng trước' },
  { id: 'last_90', label: '90 ngày' },
  { id: 'this_year', label: 'Năm nay' },
]

export interface PeriodRange {
  start: Date
  end: Date
}

export interface PeriodRangeWithPrevious {
  current: PeriodRange
  previous: PeriodRange
  /** Số ngày đã chọn (để dán nhãn so sánh "so 7 ngày trước"). */
  days: number
  label: string
}

export function resolvePeriod(id: PeriodPresetId, now: Date = new Date()): PeriodRangeWithPrevious {
  const preset = PERIOD_PRESETS.find((p) => p.id === id) ?? PERIOD_PRESETS[2]
  switch (id) {
    case 'today': {
      const s = startOfDay(now)
      const e = endOfDay(now)
      const prevS = startOfDay(subDays(now, 1))
      const prevE = endOfDay(subDays(now, 1))
      return { current: { start: s, end: e }, previous: { start: prevS, end: prevE }, days: 1, label: preset.label }
    }
    case 'last_7': {
      const s = startOfDay(subDays(now, 6))
      const e = endOfDay(now)
      const prevS = startOfDay(subDays(now, 13))
      const prevE = endOfDay(subDays(now, 7))
      return { current: { start: s, end: e }, previous: { start: prevS, end: prevE }, days: 7, label: preset.label }
    }
    case 'last_90': {
      const s = startOfDay(subDays(now, 89))
      const e = endOfDay(now)
      const prevS = startOfDay(subDays(now, 179))
      const prevE = endOfDay(subDays(now, 90))
      return { current: { start: s, end: e }, previous: { start: prevS, end: prevE }, days: 90, label: preset.label }
    }
    case 'last_month': {
      const lastMonth = subMonths(now, 1)
      const s = startOfMonth(lastMonth)
      const e = endOfMonth(lastMonth)
      const prevMonth = subMonths(now, 2)
      return {
        current: { start: s, end: e },
        previous: { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) },
        days: differenceInCalendarDays(e, s) + 1,
        label: preset.label,
      }
    }
    case 'this_year': {
      const s = startOfYear(now)
      const e = endOfDay(now)
      const lastYear = subYears(now, 1)
      const prevS = startOfYear(lastYear)
      const prevE = endOfDay(subYears(now, 1))
      return {
        current: { start: s, end: e },
        previous: { start: prevS, end: prevE },
        days: differenceInCalendarDays(e, s) + 1,
        label: preset.label,
      }
    }
    case 'this_month':
    default: {
      const s = startOfMonth(now)
      const e = endOfDay(now)
      const lastMonth = subMonths(now, 1)
      const prevS = startOfMonth(lastMonth)
      const prevE = endOfMonth(lastMonth)
      return {
        current: { start: s, end: e },
        previous: { start: prevS, end: prevE },
        days: differenceInCalendarDays(e, s) + 1,
        label: preset.label,
      }
    }
  }
}

/**
 * Tính delta % an toàn (tránh chia 0 / Infinity).
 * - previous 0, current > 0 → +100% (mới phát sinh)
 * - previous 0, current 0   → 0%
 */
export function computeDelta(current: number, previous: number): number {
  if (!isFinite(current) || !isFinite(previous)) return 0
  if (previous === 0) {
    if (current === 0) return 0
    return current > 0 ? 100 : -100
  }
  return ((current - previous) / Math.abs(previous)) * 100
}
