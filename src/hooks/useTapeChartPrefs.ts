/**
 * Lưu preference Tape Chart per user/per browser (Phase 2c).
 * - days: số ngày hiển thị (3/7/14/30)
 * - statusFilter: bộ lọc trạng thái cuối cùng
 * - floorFilter: tầng cuối cùng
 * - colorBlind: bật pattern thay cho phụ thuộc màu
 *
 * Lưu vào localStorage với key cố định. Có thể nâng cấp thành per-user-id sau.
 */
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tape-chart:prefs:v1'

export interface TapeChartPrefs {
  days: number
  statusFilter: string
  floorFilter: string
  colorBlind: boolean
  selectedDate?: string
}

const DEFAULTS: TapeChartPrefs = {
  days: 14,
  statusFilter: 'all',
  floorFilter: 'all',
  colorBlind: false,
}

function read(): TapeChartPrefs {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

export function useTapeChartPrefs(initialDays?: number) {
  const [prefs, setPrefs] = useState<TapeChartPrefs>(() => {
    const stored = read()
    if (initialDays && !localStorage.getItem(STORAGE_KEY)) {
      return { ...stored, days: initialDays }
    }
    return stored
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // ignore quota errors
    }
  }, [prefs])

  const update = (patch: Partial<TapeChartPrefs>) => setPrefs((p) => ({ ...p, ...patch }))

  return { prefs, update }
}
