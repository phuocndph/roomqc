/**
 * Operations Advisor — Rule engine sinh lời khuyên vận hành.
 * Output đi vào edge function `operations-advisor` để AI viết lại tự nhiên.
 *
 * Mỗi rule pure function: nhận snapshot → trả Finding hoặc null.
 */

import { classifyBenchmark, INDUSTRY_BENCHMARKS } from './industryBenchmarks'

export interface LaborBreakdown {
  total: number
  byDepartment: Record<string, number>
}

export interface KpiSnapshot {
  /** Số ngày trong kỳ */
  periodDays: number
  /** Tổng phòng (capacity) */
  totalRooms: number
  /** Doanh thu thuần (đã trừ commission) */
  netRevenue: number
  /** Tổng doanh thu gộp */
  grossRevenue: number
  /** Doanh thu dịch vụ thêm (service + extra) */
  extraRevenue: number
  /** Tổng chi phí (purchase + laundry + maintenance + labor) */
  totalCost: number
  costBreakdown: {
    purchase: number
    laundry: number
    maintenance: number
    /** Chi phí nhân sự (tổng) — có thể = 0 nếu chưa cấu hình lương */
    labor: number
  }
  /** Số đêm phòng đã bán */
  roomNightsSold: number
  /** Số booking trong kỳ (non-refunded) */
  bookingsCount: number
  /** Doanh thu kỳ trước (để so sánh delta %) */
  prevNetRevenue: number
  prevBookingsCount: number
  prevRoomNightsSold: number
  /** YoY: cùng kỳ năm trước (optional, undefined nếu chưa đủ data) */
  yoyNetRevenue?: number
  yoyRoomNightsSold?: number
  /** Labor cost chi tiết theo bộ phận */
  laborByDepartment?: Record<string, number>
  /** Targets/budget tháng (optional) */
  targets?: Partial<{
    occupancy: number
    revpar: number
    adr: number
    gop_margin: number
    goppar: number
    labor_ratio: number
    net_revenue: number
    gop: number
  }>
}

export interface DerivedKpis {
  /** Lợi nhuận thuần (net revenue − total cost) */
  profit: number
  profitMargin: number
  /** GOP = net revenue − departmental costs − labor; ở đây dùng total cost trừ undistributed (maintenance) */
  gop: number
  gopMargin: number
  goppar: number
  occupancy: number
  revpar: number
  trevpar: number
  adr: number
  extraRevenueShare: number
  costPerRoomDay: number
  costPor: number
  laundryCostPerRoom: number
  laborRatio: number
  /** % delta so kỳ trước liền kề */
  revenueGrowth: number
  occupancyGrowth: number
  /** % delta so cùng kỳ năm trước */
  yoyRevenueGrowth?: number
  yoyOccupancyGrowth?: number
}

export type Severity = 'high' | 'medium' | 'low'
export type Category = 'revenue' | 'cost' | 'occupancy' | 'service' | 'efficiency' | 'labor' | 'target'

export interface Finding {
  id: string
  severity: Severity
  category: Category
  finding: string
  suggestion: string
  /** Tác động VNĐ ước tính / tháng nếu thực hiện gợi ý (positive = thu thêm hoặc tiết kiệm) */
  impactVnd?: number
}

/** Pure: tính các KPI dẫn xuất từ snapshot. */
export function computeDerivedKpis(s: KpiSnapshot): DerivedKpis {
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0)
  const totalRoomDays = s.totalRooms * s.periodDays
  const profit = s.netRevenue - s.totalCost
  const profitMargin = safe(profit, s.netRevenue) * 100
  // GOP = doanh thu − (departmental costs + labor); maintenance & admin là undistributed → KHÔNG trừ vào GOP
  const departmentalCost = s.costBreakdown.purchase + s.costBreakdown.laundry + s.costBreakdown.labor
  const gop = s.netRevenue - departmentalCost
  const gopMargin = safe(gop, s.netRevenue) * 100
  const goppar = safe(gop, totalRoomDays)
  const occupancy = safe(s.roomNightsSold, totalRoomDays) * 100
  const revpar = safe(s.netRevenue, totalRoomDays)
  const trevpar = safe(s.grossRevenue, totalRoomDays)
  const adr = safe(s.netRevenue, s.roomNightsSold)
  const extraRevenueShare = safe(s.extraRevenue, s.grossRevenue) * 100
  const costPerRoomDay = safe(s.totalCost, totalRoomDays)
  const costPor = safe(s.totalCost, s.roomNightsSold)
  const laundryCostPerRoom = safe(s.costBreakdown.laundry, s.totalRooms) * (30 / Math.max(1, s.periodDays))
  const laborRatio = safe(s.costBreakdown.labor, s.netRevenue) * 100
  const revenueGrowth = safe(s.netRevenue - s.prevNetRevenue, s.prevNetRevenue) * 100
  const prevOcc = safe(s.prevRoomNightsSold, s.totalRooms * s.periodDays) * 100
  const occupancyGrowth = prevOcc > 0 ? occupancy - prevOcc : 0
  const yoyRevenueGrowth =
    s.yoyNetRevenue !== undefined && s.yoyNetRevenue > 0
      ? ((s.netRevenue - s.yoyNetRevenue) / s.yoyNetRevenue) * 100
      : undefined
  const yoyOccupancy =
    s.yoyRoomNightsSold !== undefined ? safe(s.yoyRoomNightsSold, totalRoomDays) * 100 : undefined
  const yoyOccupancyGrowth = yoyOccupancy !== undefined ? occupancy - yoyOccupancy : undefined

  return {
    profit,
    profitMargin,
    gop,
    gopMargin,
    goppar,
    occupancy,
    revpar,
    trevpar,
    adr,
    extraRevenueShare,
    costPerRoomDay,
    costPor,
    laundryCostPerRoom,
    laborRatio,
    revenueGrowth,
    occupancyGrowth,
    yoyRevenueGrowth,
    yoyOccupancyGrowth,
  }
}

/** Chạy toàn bộ rule, trả danh sách Finding sắp theo severity + impact desc. */
export function runOperationsAdvisor(snapshot: KpiSnapshot): Finding[] {
  if (snapshot.totalRooms <= 0 || snapshot.periodDays <= 0) return []
  const k = computeDerivedKpis(snapshot)
  const findings: Finding[] = []

  // R1 — Lấp đầy thấp
  if (k.occupancy > 0 && k.occupancy < INDUSTRY_BENCHMARKS.occupancy.fair) {
    const targetOcc = INDUSTRY_BENCHMARKS.occupancy.fair
    const extraNights = ((targetOcc - k.occupancy) / 100) * snapshot.totalRooms * snapshot.periodDays
    const impact = extraNights * (k.adr || 500_000) * (30 / Math.max(1, snapshot.periodDays))
    findings.push({
      id: 'low-occupancy',
      severity: 'high',
      category: 'occupancy',
      finding: `Tỷ lệ lấp đầy chỉ ${k.occupancy.toFixed(0)}%, thấp hơn trung bình ngành (${targetOcc}%).`,
      suggestion:
        'Tạo gói khuyến mãi đêm giữa tuần, mở thêm kênh OTA (Booking.com, Agoda), hoặc giảm giá cho khách lưu trú dài ngày.',
      impactVnd: Math.round(impact),
    })
  }

  // R2 — Biên lợi nhuận thấp
  if (k.profitMargin < INDUSTRY_BENCHMARKS.profitMargin.fair && snapshot.netRevenue > 0) {
    findings.push({
      id: 'low-profit-margin',
      severity: 'high',
      category: 'cost',
      finding: `Biên lợi nhuận chỉ ${k.profitMargin.toFixed(1)}%, dưới mức an toàn 20%.`,
      suggestion:
        'Rà soát chi phí cố định, đặc biệt giặt là, nhân sự và mua sắm. Cân nhắc đàm phán lại hợp đồng vendor.',
      impactVnd: Math.round(snapshot.totalCost * 0.1),
    })
  }

  // R3 — RevPAR thấp
  if (classifyBenchmark('revpar', k.revpar) === 'poor' && k.revpar > 0) {
    findings.push({
      id: 'low-revpar',
      severity: 'medium',
      category: 'revenue',
      finding: `RevPAR đạt ${(k.revpar / 1000).toFixed(0)}k/phòng/ngày, dưới mức trung bình ngành.`,
      suggestion: 'Tăng giá phòng vào cuối tuần, áp dụng dynamic pricing, hoặc nâng cấp dịch vụ để tăng ADR.',
    })
  }

  // R4 — Doanh thu dịch vụ thêm thấp
  if (k.extraRevenueShare < INDUSTRY_BENCHMARKS.extraRevenueShare.fair && snapshot.grossRevenue > 0) {
    const target = INDUSTRY_BENCHMARKS.extraRevenueShare.good
    const impact =
      ((target - k.extraRevenueShare) / 100) * snapshot.grossRevenue * (30 / Math.max(1, snapshot.periodDays))
    findings.push({
      id: 'low-extra-revenue',
      severity: 'medium',
      category: 'service',
      finding: `Doanh thu dịch vụ thêm chỉ ${k.extraRevenueShare.toFixed(1)}% tổng doanh thu, ngành trung bình 10-15%.`,
      suggestion:
        'Đẩy mạnh bán minibar, dịch vụ giặt ủi cho khách, đưa đón sân bay, ăn sáng. Đào tạo lễ tân upsell.',
      impactVnd: Math.round(impact),
    })
  }

  // R5 — Chi phí giặt cao
  if (classifyBenchmark('laundryCostPerRoom', k.laundryCostPerRoom) === 'poor' && k.laundryCostPerRoom > 0) {
    const target = INDUSTRY_BENCHMARKS.laundryCostPerRoom.good
    const saving = (k.laundryCostPerRoom - target) * snapshot.totalRooms
    findings.push({
      id: 'high-laundry-cost',
      severity: 'medium',
      category: 'cost',
      finding: `Chi phí giặt là ${Math.round(k.laundryCostPerRoom / 1000)}k/phòng/tháng, cao hơn mức tốt (${target / 1000}k).`,
      suggestion:
        'So sánh báo giá 2-3 vendor giặt là, hoặc cân nhắc đầu tư máy giặt công nghiệp nội bộ nếu công suất đủ lớn.',
      impactVnd: Math.round(saving),
    })
  }

  // R6 — Chi phí bảo trì tăng đột biến
  if (snapshot.netRevenue > 0 && snapshot.costBreakdown.maintenance / snapshot.netRevenue > 0.08) {
    findings.push({
      id: 'high-maintenance-cost',
      severity: 'medium',
      category: 'cost',
      finding: `Chi phí bảo trì chiếm ${((snapshot.costBreakdown.maintenance / snapshot.netRevenue) * 100).toFixed(1)}% doanh thu, vượt ngưỡng 8%.`,
      suggestion:
        'Lên lịch bảo trì định kỳ thay vì sửa chữa khi hỏng. Đầu tư PM (preventive maintenance) để giảm chi phí dài hạn.',
    })
  }

  // R7 — Doanh thu giảm so kỳ trước
  if (k.revenueGrowth < -10 && snapshot.prevNetRevenue > 0) {
    findings.push({
      id: 'revenue-declining',
      severity: 'high',
      category: 'revenue',
      finding: `Doanh thu giảm ${Math.abs(k.revenueGrowth).toFixed(0)}% so kỳ trước.`,
      suggestion:
        'Rà soát khách hàng cũ chưa quay lại, kích hoạt chương trình loyalty, kiểm tra review online và phản hồi tiêu cực.',
    })
  }

  // R8 — Số booking ít bất thường
  if (snapshot.bookingsCount < snapshot.totalRooms * 0.5 && snapshot.periodDays >= 28) {
    findings.push({
      id: 'few-bookings',
      severity: 'low',
      category: 'occupancy',
      finding: `Chỉ có ${snapshot.bookingsCount} booking trong ${snapshot.periodDays} ngày — thấp với ${snapshot.totalRooms} phòng.`,
      suggestion: 'Marketing thêm trên mạng xã hội địa phương, cộng tác với công ty du lịch khu vực.',
    })
  }

  // R9 — Lãi tốt → giữ vững
  if (k.profitMargin >= INDUSTRY_BENCHMARKS.profitMargin.good && snapshot.netRevenue > 0) {
    findings.push({
      id: 'healthy-margin',
      severity: 'low',
      category: 'efficiency',
      finding: `Biên lợi nhuận ${k.profitMargin.toFixed(1)}% — vận hành rất hiệu quả.`,
      suggestion:
        'Cân nhắc tái đầu tư: nâng cấp phòng, mở rộng dịch vụ, hoặc tích lũy dự phòng cho mùa thấp điểm.',
    })
  }

  // R10 — ADR thấp
  if (classifyBenchmark('adr', k.adr) === 'poor' && k.adr > 0) {
    findings.push({
      id: 'low-adr',
      severity: 'medium',
      category: 'revenue',
      finding: `Giá phòng trung bình ${Math.round(k.adr / 1000)}k/đêm, thấp so phân khúc.`,
      suggestion:
        'Phân khúc lại sản phẩm: tạo gói cao cấp (view đẹp, tầng cao), nâng cấp ảnh OTA, dùng dynamic pricing.',
    })
  }

  // R11 — Labor ratio quá cao
  if (snapshot.costBreakdown.labor > 0 && k.laborRatio > INDUSTRY_BENCHMARKS.laborRatio.fair) {
    const target = INDUSTRY_BENCHMARKS.laborRatio.good
    const saving = ((k.laborRatio - target) / 100) * snapshot.netRevenue
    findings.push({
      id: 'high-labor-ratio',
      severity: 'high',
      category: 'labor',
      finding: `Chi phí nhân sự chiếm ${k.laborRatio.toFixed(1)}% doanh thu, cao hơn chuẩn ngành (${target}%).`,
      suggestion:
        'Tối ưu lịch ca theo công suất phòng, cắt giảm ca dư thừa ngày thấp điểm, cross-training nhân viên đa nhiệm.',
      impactVnd: Math.round(saving * (30 / Math.max(1, snapshot.periodDays))),
    })
  }

  // R12 — GOPPAR thấp hơn target > 20%
  if (snapshot.targets?.goppar && snapshot.targets.goppar > 0 && k.goppar > 0) {
    const gap = ((snapshot.targets.goppar - k.goppar) / snapshot.targets.goppar) * 100
    if (gap > 20) {
      findings.push({
        id: 'goppar-below-target',
        severity: 'high',
        category: 'target',
        finding: `GOPPAR thực tế ${Math.round(k.goppar / 1000)}k thấp hơn mục tiêu ${Math.round(snapshot.targets.goppar / 1000)}k (${gap.toFixed(0)}%).`,
        suggestion:
          'Đánh giá lại 2 nhánh: tăng GOP (cắt chi phí departmental) hoặc tăng RevPAR (giá phòng + lấp đầy).',
        impactVnd: Math.round((snapshot.targets.goppar - k.goppar) * snapshot.totalRooms * 30),
      })
    }
  }

  // R13 — YoY revenue giảm > 15%
  if (k.yoyRevenueGrowth !== undefined && k.yoyRevenueGrowth < -15) {
    findings.push({
      id: 'yoy-revenue-decline',
      severity: 'high',
      category: 'revenue',
      finding: `Doanh thu giảm ${Math.abs(k.yoyRevenueGrowth).toFixed(0)}% so cùng kỳ năm trước.`,
      suggestion:
        'Phân tích nguyên nhân: thị trường, cạnh tranh, chất lượng dịch vụ, hay vấn đề kênh phân phối? Đặt mục tiêu phục hồi 90 ngày.',
    })
  }

  // R14 — Occupancy đạt target nhưng RevPAR không → ADR thấp
  if (
    snapshot.targets?.occupancy &&
    snapshot.targets?.revpar &&
    k.occupancy >= snapshot.targets.occupancy * 0.95 &&
    k.revpar < snapshot.targets.revpar * 0.85
  ) {
    findings.push({
      id: 'occ-ok-revpar-low',
      severity: 'medium',
      category: 'revenue',
      finding: 'Lấp đầy đạt mục tiêu nhưng RevPAR thiếu hụt — giá phòng đang bán quá thấp.',
      suggestion:
        'Tăng giá phòng 5-10% ở các phân khúc bán chạy, giảm chiết khấu OTA, ưu tiên direct booking để giữ margin.',
    })
  }

  // R15 — Lương phụ thuộc 1 bộ phận quá lớn
  if (snapshot.laborByDepartment && snapshot.costBreakdown.labor > 0) {
    const entries = Object.entries(snapshot.laborByDepartment)
    const totalLabor = snapshot.costBreakdown.labor
    const top = entries.reduce((m, [d, v]) => (v > m.v ? { d, v } : m), { d: '', v: 0 })
    if (top.v / totalLabor > 0.6 && entries.length > 1) {
      findings.push({
        id: 'labor-concentration',
        severity: 'low',
        category: 'labor',
        finding: `Bộ phận "${top.d}" chiếm ${((top.v / totalLabor) * 100).toFixed(0)}% chi phí nhân sự.`,
        suggestion: 'Rà soát ca làm bộ phận này, đảm bảo không thừa giờ. Cân nhắc cross-training để chia tải.',
      })
    }
  }

  // R16 — CostPOR cao bất thường
  if (classifyBenchmark('costPor', k.costPor) === 'poor' && k.costPor > 0) {
    findings.push({
      id: 'high-cost-por',
      severity: 'medium',
      category: 'cost',
      finding: `Chi phí trên mỗi đêm phòng bán ra ${Math.round(k.costPor / 1000)}k — cao hơn chuẩn ngành.`,
      suggestion:
        'Giảm tiêu hao amenities (xà phòng, dầu gội đóng chai → bình lớn), tối ưu hóa tần suất giặt khăn theo lựa chọn khách.',
    })
  }

  return sortFindings(findings)
}

function severityRank(s: Severity): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : 1
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sd = severityRank(b.severity) - severityRank(a.severity)
    if (sd !== 0) return sd
    return (b.impactVnd || 0) - (a.impactVnd || 0)
  })
}
