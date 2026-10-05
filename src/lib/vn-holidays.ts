/**
 * Lịch nghỉ lễ Việt Nam — dùng cho Tape Chart (Phase 2c).
 * Bao gồm các ngày nghỉ chính thức (Dương + Âm đã quy đổi sẵn cho 2025–2027).
 * Map theo "yyyy-MM-dd". Có thể mở rộng khi sang năm mới.
 */

export interface VnHoliday {
  name: string
  short: string
  type: 'national' | 'tet' | 'observed'
}

export const VN_HOLIDAYS: Record<string, VnHoliday> = {
  // 2025
  '2025-01-01': { name: 'Tết Dương lịch', short: 'Tết DL', type: 'national' },
  '2025-01-28': { name: '29 Tết Âm lịch', short: '29 Tết', type: 'tet' },
  '2025-01-29': { name: 'Mùng 1 Tết Ất Tỵ', short: 'Mùng 1', type: 'tet' },
  '2025-01-30': { name: 'Mùng 2 Tết', short: 'Mùng 2', type: 'tet' },
  '2025-01-31': { name: 'Mùng 3 Tết', short: 'Mùng 3', type: 'tet' },
  '2025-02-01': { name: 'Mùng 4 Tết', short: 'Mùng 4', type: 'tet' },
  '2025-02-02': { name: 'Mùng 5 Tết', short: 'Mùng 5', type: 'tet' },
  '2025-04-07': { name: 'Giỗ Tổ Hùng Vương', short: 'Giỗ Tổ', type: 'national' },
  '2025-04-30': { name: 'Giải phóng miền Nam', short: '30/4', type: 'national' },
  '2025-05-01': { name: 'Quốc tế Lao động', short: '1/5', type: 'national' },
  '2025-09-02': { name: 'Quốc khánh', short: '2/9', type: 'national' },

  // 2026
  '2026-01-01': { name: 'Tết Dương lịch', short: 'Tết DL', type: 'national' },
  '2026-02-16': { name: '29 Tết Âm lịch', short: '29 Tết', type: 'tet' },
  '2026-02-17': { name: 'Mùng 1 Tết Bính Ngọ', short: 'Mùng 1', type: 'tet' },
  '2026-02-18': { name: 'Mùng 2 Tết', short: 'Mùng 2', type: 'tet' },
  '2026-02-19': { name: 'Mùng 3 Tết', short: 'Mùng 3', type: 'tet' },
  '2026-02-20': { name: 'Mùng 4 Tết', short: 'Mùng 4', type: 'tet' },
  '2026-04-26': { name: 'Giỗ Tổ Hùng Vương', short: 'Giỗ Tổ', type: 'national' },
  '2026-04-30': { name: 'Giải phóng miền Nam', short: '30/4', type: 'national' },
  '2026-05-01': { name: 'Quốc tế Lao động', short: '1/5', type: 'national' },
  '2026-09-02': { name: 'Quốc khánh', short: '2/9', type: 'national' },

  // 2027
  '2027-01-01': { name: 'Tết Dương lịch', short: 'Tết DL', type: 'national' },
  '2027-02-05': { name: '29 Tết Âm lịch', short: '29 Tết', type: 'tet' },
  '2027-02-06': { name: 'Mùng 1 Tết Đinh Mùi', short: 'Mùng 1', type: 'tet' },
  '2027-02-07': { name: 'Mùng 2 Tết', short: 'Mùng 2', type: 'tet' },
  '2027-02-08': { name: 'Mùng 3 Tết', short: 'Mùng 3', type: 'tet' },
  '2027-02-09': { name: 'Mùng 4 Tết', short: 'Mùng 4', type: 'tet' },
  '2027-04-16': { name: 'Giỗ Tổ Hùng Vương', short: 'Giỗ Tổ', type: 'national' },
  '2027-04-30': { name: 'Giải phóng miền Nam', short: '30/4', type: 'national' },
  '2027-05-01': { name: 'Quốc tế Lao động', short: '1/5', type: 'national' },
  '2027-09-02': { name: 'Quốc khánh', short: '2/9', type: 'national' },
}

export function getHoliday(dateStr: string): VnHoliday | null {
  return VN_HOLIDAYS[dateStr] || null
}
