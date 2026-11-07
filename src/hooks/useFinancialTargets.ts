import { format, startOfMonth } from 'date-fns'
import { useReportTargets } from './useReportTargets'
import { TargetError, type TargetMetric } from '@/lib/report-targets'
export type { TargetMetric } from '@/lib/report-targets'

export function useFinancialTargets(periodDate: Date, enabled = true) {
  const query = useReportTargets('financial', format(startOfMonth(periodDate), 'yyyy-MM-dd'), enabled)
  const reviewError = query.data?.review_required
    ? new TargetError('review_required', 'Mục tiêu cũ cần chủ khách sạn đối soát. Mở Đặt mục tiêu để kiểm tra.') : null
  return { ...query, report: query.data, error: query.error || reviewError,
    data: query.data && !reviewError ? query.data.values as Partial<Record<TargetMetric, number>> : undefined }
}

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  occupancy: 'Lấp đầy (%)', revpar: 'RevPAR (VNĐ/phòng/ngày)', adr: 'ADR (VNĐ/đêm)',
  gop_margin: 'Biên GOP (%)', goppar: 'GOPPAR (VNĐ/phòng/ngày)', labor_ratio: 'Tỷ lệ chi phí nhân sự (%)',
  net_revenue: 'Doanh thu thuần (VNĐ/tháng)', gop: 'GOP (VNĐ/tháng)',
}
