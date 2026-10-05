import { formatCurrency } from '@/lib/utils'
import { classifyBenchmark } from '@/lib/industryBenchmarks'
import type { RoomRevenueMetrics } from '@/hooks/useRoomRevenueMetrics'

interface Props {
  m: RoomRevenueMetrics
}

interface Insight {
  level: 'warn' | 'good' | 'info'
  title: string
  detail: string
}

/**
 * Rule-based insight cards cho chủ KS.
 * Không dùng AI/ML — chỉ so sánh với benchmark + trong nội bộ kỳ.
 */
export function RoomRevenueInsights({ m }: Props) {
  if (m.loading) return null

  const insights: Insight[] = []

  // 1) Occupancy benchmark
  if (m.occupancy.value > 0) {
    const lv = classifyBenchmark('occupancy', m.occupancy.value)
    if (lv === 'poor') {
      insights.push({
        level: 'warn',
        title: 'Công suất phòng thấp dưới chuẩn ngành',
        detail: `Đang ở ${m.occupancy.value.toFixed(1)}%, dưới ngưỡng 55%. Cân nhắc giảm giá đêm thường, đẩy quảng bá hoặc kiểm tra kênh OTA.`,
      })
    } else if (lv === 'excellent') {
      insights.push({
        level: 'good',
        title: 'Công suất phòng rất tốt',
        detail: `${m.occupancy.value.toFixed(1)}% — vượt ngưỡng xuất sắc. Cân nhắc tăng nhẹ giá để tối ưu doanh thu.`,
      })
    }
  }

  // 2) ADR benchmark
  if (m.adr.value > 0) {
    const lv = classifyBenchmark('adr', m.adr.value)
    if (lv === 'poor') {
      insights.push({
        level: 'warn',
        title: 'Giá phòng trung bình đang thấp',
        detail: `ADR ${formatCurrency(m.adr.value)}/đêm — dưới chuẩn ngành. Có thể đang bán quá rẻ; thử tăng giá cuối tuần 10–15%.`,
      })
    }
  }

  // 3) OTA share warning
  const sources = m.revenue?.bySource || []
  const totalGross = sources.reduce((s, r) => s + r.grossRevenue, 0)
  const otaGross = sources
    .filter((s) => s.source.startsWith('ota_'))
    .reduce((s, r) => s + r.grossRevenue, 0)
  const otaShare = totalGross > 0 ? (otaGross / totalGross) * 100 : 0
  if (otaShare > 60) {
    const commission = sources.reduce((s, r) => s + r.otaCommission, 0)
    insights.push({
      level: 'warn',
      title: `OTA chiếm ${otaShare.toFixed(0)}% doanh thu`,
      detail: `Phí hoa hồng kỳ này ~${formatCurrency(commission)}. Cân nhắc đẩy kênh trực tiếp/website để giảm phụ thuộc.`,
    })
  }

  // 4) Phòng bán chậm
  const byRoom = m.rooms?.revenueByRoom || []
  if (byRoom.length >= 3) {
    const avg = byRoom.reduce((s, r) => s + r.total_bookings, 0) / byRoom.length
    const lows = byRoom.filter((r) => r.total_bookings < avg * 0.3 && avg >= 2)
    if (lows.length > 0) {
      insights.push({
        level: 'warn',
        title: `${lows.length} phòng bán dưới 30% trung bình`,
        detail: `Phòng: ${lows
          .slice(0, 5)
          .map((r) => r.room_number)
          .join(', ')}. Kiểm tra QC, ảnh OTA hoặc xuống cấp tài sản.`,
      })
    }
  }

  // 5) RevPAR trend
  if (m.revpar.value > 0 && m.revpar.delta != null && m.revpar.delta < -15) {
    insights.push({
      level: 'warn',
      title: 'RevPAR giảm mạnh so kỳ trước',
      detail: `Giảm ${Math.abs(m.revpar.delta).toFixed(1)}%. Có thể do công suất giảm hoặc bán giá thấp hơn — xem chi tiết theo phòng/kênh.`,
    })
  }

  if (insights.length === 0) {
    insights.push({
      level: 'info',
      title: 'Chưa có cảnh báo đáng chú ý',
      detail: 'Các chỉ số đang ở mức ổn định. Tiếp tục theo dõi xu hướng kỳ tới.',
    })
  }

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Gợi ý hành động</h3>
        <p className="text-xs text-muted-foreground">Tự sinh từ dữ liệu kỳ này</p>
      </div>
      <div className="divide-y">
        {insights.map((ins, i) => (
          <div key={i} className="px-3 py-2.5">
            <div
              className={`text-sm font-medium ${
                ins.level === 'warn'
                  ? 'text-amber-600'
                  : ins.level === 'good'
                    ? 'text-green-600'
                    : 'text-foreground'
              }`}
            >
              {ins.title}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{ins.detail}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
