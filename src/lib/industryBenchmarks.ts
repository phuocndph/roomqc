/**
 * Benchmark ngành khách sạn Việt Nam 2–4 sao.
 * Nguồn tham khảo: STR, Statista 2024, USALI rút gọn, khảo sát nội bộ.
 * Đơn vị: % hoặc VND.
 */

export type BenchmarkLevel = 'poor' | 'fair' | 'good' | 'excellent'

export interface BenchmarkThresholds {
  poor: number
  fair: number
  good: number
  excellent: number
}

export const INDUSTRY_BENCHMARKS = {
  /** Tỷ lệ lấp đầy phòng (%) */
  occupancy: { poor: 40, fair: 55, good: 70, excellent: 80 },
  /** Biên lợi nhuận thuần (%) — net margin */
  profitMargin: { poor: 10, fair: 20, good: 30, excellent: 40 },
  /** Biên GOP (%) — chuẩn USALI, thường cao hơn net margin */
  gopMargin: { poor: 15, fair: 25, good: 35, excellent: 45 },
  /** GOPPAR (VND) — GOP / phòng có sẵn / ngày */
  goppar: { poor: 200_000, fair: 400_000, good: 700_000, excellent: 1_000_000 },
  /** Doanh thu / phòng có sẵn / ngày (VND) — RevPAR */
  revpar: { poor: 300_000, fair: 500_000, good: 800_000, excellent: 1_200_000 },
  /** Tổng doanh thu / phòng có sẵn / ngày (VND) — TRevPAR */
  trevpar: { poor: 350_000, fair: 600_000, good: 950_000, excellent: 1_400_000 },
  /** Giá phòng trung bình / đêm (VND) — ADR */
  adr: { poor: 400_000, fair: 700_000, good: 1_000_000, excellent: 1_500_000 },
  /** % doanh thu dịch vụ thêm / tổng doanh thu */
  extraRevenueShare: { poor: 5, fair: 10, good: 15, excellent: 25 },
  /** Chi phí giặt / phòng / tháng (VND) — thấp hơn = tốt hơn (ngược) */
  laundryCostPerRoom: { poor: 500_000, fair: 350_000, good: 200_000, excellent: 120_000 },
  /** Tỷ lệ chi phí nhân sự / doanh thu (%) — thấp hơn = tốt hơn (ngược) */
  laborRatio: { poor: 45, fair: 35, good: 30, excellent: 25 },
  /** CostPOR — chi phí / đêm phòng bán (VND) — thấp hơn = tốt hơn (ngược) */
  costPor: { poor: 600_000, fair: 450_000, good: 320_000, excellent: 220_000 },
} as const satisfies Record<string, BenchmarkThresholds>

export type BenchmarkKey = keyof typeof INDUSTRY_BENCHMARKS

const LOWER_IS_BETTER: BenchmarkKey[] = ['laundryCostPerRoom', 'laborRatio', 'costPor']

/** Classify giá trị vào 1 trong 4 mức. */
export function classifyBenchmark(
  key: BenchmarkKey,
  value: number,
): BenchmarkLevel {
  const t = INDUSTRY_BENCHMARKS[key]
  const isInverse = LOWER_IS_BETTER.includes(key)

  if (isInverse) {
    if (value <= t.excellent) return 'excellent'
    if (value <= t.good) return 'good'
    if (value <= t.fair) return 'fair'
    return 'poor'
  }

  if (value >= t.excellent) return 'excellent'
  if (value >= t.good) return 'good'
  if (value >= t.fair) return 'fair'
  return 'poor'
}

export const BENCHMARK_LABELS: Record<BenchmarkLevel, string> = {
  poor: 'Yếu',
  fair: 'Trung bình',
  good: 'Tốt',
  excellent: 'Xuất sắc',
}

/** Tailwind text color class theo mức. */
export const BENCHMARK_COLORS: Record<BenchmarkLevel, string> = {
  poor: 'text-red-600',
  fair: 'text-amber-600',
  good: 'text-green-600',
  excellent: 'text-emerald-600',
}

/** Map bộ phận → nhãn tiếng Việt. */
export const DEPARTMENT_LABELS: Record<string, string> = {
  housekeeping: 'Buồng phòng',
  front_office: 'Lễ tân',
  reception: 'Lễ tân',
  fnb: 'F&B',
  food_beverage: 'F&B',
  maintenance: 'Bảo trì',
  laundry: 'Giặt là',
  admin: 'Quản lý',
  management: 'Quản lý',
  security: 'An ninh',
  other: 'Khác',
}

export function departmentLabel(code: string | null | undefined): string {
  if (!code) return 'Khác'
  return DEPARTMENT_LABELS[code.toLowerCase()] ?? code
}
