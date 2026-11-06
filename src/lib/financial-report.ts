import { format } from 'date-fns'
import { supabase } from '@/integrations/supabase/client'
import type { DateRange, FinancialReportData } from '@/types/reports.types'

export function financialReportPeriod(range: DateRange) {
  return { start: format(range.start, 'yyyy-MM-dd'), end: format(range.end, 'yyyy-MM-dd'),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh' }
}

export type FinancialReportRequest = ReturnType<typeof financialReportPeriod> & { hotelId?: string }

export async function fetchFinancialReport(request: FinancialReportRequest, forExport = false, signal?: AbortSignal) {
  const query = supabase.rpc('get_financial_report_scoped', {
    p_start_date: request.start, p_end_date: request.end, p_timezone: request.timezone,
    p_hotel_id: request.hotelId, p_for_export: forExport,
  })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) throw error
  const report = data as unknown as FinancialReportData | null
  if (!report || report.version !== 2 || report.period_start !== request.start
    || report.period_end !== request.end || report.recognition_timezone !== request.timezone
    || !report.cost_summary || !report.revenue_summary || !report.profit_summary
    || !report.fixed_cost_summary || !report.no_show || !Array.isArray(report.monthly_trend)
    || !Number.isFinite(report.cost_summary.total_cost)
    || !Number.isFinite(report.revenue_summary.recognized_revenue)
    || !Number.isFinite(report.profit_summary.net_profit)
    || !Number.isFinite(report.profit_summary.after_allocated_fixed_cost)
    || report.fixed_cost_summary.method !== 'calendar_day_proration'
    || report.fixed_cost_summary.is_estimate !== true) {
    throw new Error('Báo cáo chưa sẵn sàng. Vui lòng kiểm tra phiên bản máy chủ.')
  }
  return report
}

/** Use the same server DTO for desktop, mobile and both download formats. */
export function financialExportData(report: FinancialReportData) {
  return {
    title: 'Báo cáo Tài chính',
    dateRange: `${report.period_start} - ${report.period_end} (${report.recognition_timezone})`,
    summary: {
      'Doanh thu phòng sau hoa hồng': report.revenue_summary.net_revenue,
      'Phí giữ cọc no-show': report.revenue_summary.no_show_fees,
      'Doanh thu ghi nhận': report.revenue_summary.recognized_revenue,
      'Chi phí mua sắm': report.cost_summary.purchase_cost,
      'Chi phí giặt là': report.cost_summary.laundry_cost,
      'Chi phí bảo trì': report.cost_summary.maintenance_cost,
      'Tổng chi phí trực tiếp': report.cost_summary.total_cost,
      'Lợi nhuận vận hành': report.profit_summary.net_profit,
      'Chi phí cố định phân bổ ước tính': report.fixed_cost_summary.allocated_amount,
      'Lợi nhuận sau phân bổ ước tính': report.profit_summary.after_allocated_fixed_cost,
      'Cọc cần hoàn ghi nhận (chưa phải đã hoàn)': report.no_show.currentPeriod.refundDueAmount,
    },
    tables: [{ title: 'Theo tháng trong kỳ',
      headers: ['Tháng', 'Từ ngày', 'Đến ngày', 'Doanh thu ghi nhận', 'Mua sắm', 'Giặt là', 'Bảo trì', 'Lợi nhuận vận hành', 'Chi phí cố định phân bổ ước tính'],
      rows: report.monthly_trend.map(m => [m.month, m.period_start, m.period_end, m.revenue,
        m.purchase, m.laundry, m.maintenance, m.profit, m.fixed_cost_allocation]),
    }],
    notes: ['Chi phí cố định được ước tính theo số ngày lịch của kỳ trong từng tháng.',
      'Doanh thu ghi nhận và khoản đã thanh toán của lượt trả phòng không phải dòng tiền trong kỳ.',
      'Cọc cần hoàn là nghĩa vụ hoàn trả, chưa xác nhận đã hoàn tiền.'],
  }
}
