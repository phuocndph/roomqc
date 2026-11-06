import { RevenueReport, ReportPeriod } from '@/hooks/useRevenueReport'
import { toast } from 'sonner'
import { downloadWorkbook } from '@/lib/excelUtils'
import { useHasPermission } from '@/hooks/usePermission'
import { recognizedRevenue, recognizedRevenueGrowth } from '@/hooks/useRevenueReport'
import { useReportScope } from '@/hooks/useReportScope'
import { supabase } from '@/integrations/supabase/client'
import { useRef, useState } from 'react'

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)

export function useRevenueExport(selection = '') {
  const { hasPermission } = useHasPermission('reports', 'export')
  const scope = useReportScope(selection)
  const canExport = hasPermission && scope.enabled
  const busy = useRef(false)
  const [isExporting, setIsExporting] = useState(false)
  const prepare = (loaded: RevenueReport) => {
    const assertCurrent = scope.capture()
    const request = { p_start_date: loaded.periodStart, p_end_date: loaded.periodEnd,
      p_timezone: loaded.recognitionTimezone, p_hotel_id: scope.hotelId }
    return async () => {
      assertCurrent()
      const { data, error } = await supabase.rpc('export_revenue_report', request)
      if (error) throw error
      assertCurrent()
      const report = data as unknown as RevenueReport | null
      if (!report?.noShow || !report.currentPeriod || !report.previousPeriod
        || report.periodStart !== request.p_start_date || report.periodEnd !== request.p_end_date
        || report.recognitionTimezone !== request.p_timezone) throw new Error('Báo cáo chưa sẵn sàng.')
      return report
    }
  }
  const exportExcel = async (loaded: RevenueReport, period: ReportPeriod) => {
    if (!canExport) { toast.error('Bạn chưa có quyền xuất báo cáo.'); return false }
    if (busy.current) return false
    busy.current = true; setIsExporting(true)
    try {
      const read = prepare(loaded)
      const report = await read()
      const sheets: { name: string; rows: (string | number)[][] }[] = []

      // Overview sheet
      const overviewData = [
        ['Báo cáo Doanh thu'],
        ['Kỳ báo cáo', period === 'week' ? 'Tuần' : period === 'month' ? 'Tháng' : period === 'quarter' ? 'Quý' : period === 'custom' ? 'Tùy chọn' : 'Năm'],
        [],
        ['Chỉ số', 'Giá trị'],
        ['Từ ngày', report.periodStart], ['Đến ngày', report.periodEnd], ['Múi giờ ghi nhận', report.recognitionTimezone],
        ['Đã thanh toán của lượt trả phòng (không phải dòng tiền trong kỳ)', formatVND(report.currentPeriod.paidRevenue)],
        ['Chờ thanh toán', formatVND(report.currentPeriod.pendingRevenue)],
        ['Doanh thu phòng sau hoa hồng', formatVND(report.currentPeriod.netRevenue)],
        ['Phí giữ cọc no-show ghi nhận trong kỳ', formatVND(report.noShow.currentPeriod.retainedAmount)],
        ['Doanh thu ghi nhận gồm phí no-show', formatVND(recognizedRevenue(report, 'currentPeriod'))],
        ['Cọc cần hoàn ghi nhận trong kỳ (chưa phải đã hoàn)', formatVND(report.noShow.currentPeriod.refundDueAmount)],
        ['Booking no-show cần đối soát (mọi kỳ)', report.noShow.review.unclassifiedBookings],
        ['Tiền trả trước ngoài cọc chưa phân loại (mọi kỳ)', formatVND(report.noShow.review.unallocatedPrepaymentAmount)],
        ['HH OTA', formatVND(report.currentPeriod.otaCommission)],
        ['Phụ thu', formatVND(report.currentPeriod.surcharges.total)],
        ['Số booking', report.currentPeriod.bookingsCount],
        ['Tăng trưởng doanh thu ghi nhận', `${recognizedRevenueGrowth(report).toFixed(1)}%`],
      ]
      sheets.push({ name: 'Tổng quan', rows: overviewData })
      sheets.push({ name: 'No-show theo tháng', rows: [
        ['Tháng', 'Phí giữ cọc', 'Cọc cần hoàn ghi nhận (chưa phải đã hoàn)'],
        ...report.noShow.monthlyTrends.map(m => [m.month, m.retainedAmount, m.refundDueAmount]),
      ] })

      // By Type
      if (report.byType.length) {
        const typeData = [
          ['Loại hình', 'Bookings', 'Doanh thu', '%'],
          ...report.byType.map(t => [t.label, t.bookings, formatVND(t.revenue), `${t.percentage.toFixed(1)}%`]),
        ]
        sheets.push({ name: 'Theo loại', rows: typeData })
      }

      // By Source
      if (report.bySource.length) {
        const sourceData = [
          ['Nguồn', 'Bookings', 'Gross', 'HH OTA', 'Net'],
          ...report.bySource.map(s => [s.source, s.bookings, formatVND(s.grossRevenue), formatVND(s.otaCommission), formatVND(s.netRevenue)]),
        ]
        sheets.push({ name: 'Theo nguồn', rows: sourceData })
      }

      // Top Rooms
      if (report.topRooms.length) {
        const roomData = [
          ['Phòng', 'Loại', 'Bookings', 'Doanh thu', 'Phụ thu', 'Tổng'],
          ...report.topRooms.map(r => [r.roomNumber, r.roomType, r.bookings, formatVND(r.revenue), formatVND(r.surcharges), formatVND(r.total)]),
        ]
        sheets.push({ name: 'Top phòng', rows: roomData })
      }

      await downloadWorkbook(sheets, `bao-cao-doanh-thu-${period}.xlsx`, async () => { await read() })
      toast.success('Đã xuất file Excel')
      return true
    } catch {
      toast.error('Lỗi khi xuất Excel')
      return false
    } finally {
      busy.current = false; setIsExporting(false)
    }
  }

  const exportPDF = async (loaded: RevenueReport, period: ReportPeriod) => {
    if (!canExport) { toast.error('Bạn chưa có quyền xuất báo cáo.'); return false }
    if (busy.current) return false
    busy.current = true; setIsExporting(true)
    try {
      const read = prepare(loaded)
      const report = await read()
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Bao cao Doanh thu', 14, 20)
      doc.setFontSize(10)
      doc.text(`Ky bao cao: ${period === 'week' ? 'Tuan' : period === 'month' ? 'Thang' : period === 'quarter' ? 'Quy' : period === 'custom' ? 'Tuy chon' : 'Nam'}`, 14, 28)

      // Overview table
      autoTable(doc, {
        startY: 35,
        head: [['Chi so', 'Gia tri']],
        body: [
          ['Ky / mui gio', `${report.periodStart} - ${report.periodEnd} / ${report.recognitionTimezone}`],
          ['Da thanh toan cua luot tra phong (khong phai dong tien trong ky)', formatVND(report.currentPeriod.paidRevenue)],
          ['Cho thanh toan', formatVND(report.currentPeriod.pendingRevenue)],
          ['Doanh thu phong sau hoa hong', formatVND(report.currentPeriod.netRevenue)],
          ['Phi giu coc no-show trong ky', formatVND(report.noShow.currentPeriod.retainedAmount)],
          ['Doanh thu ghi nhan gom no-show', formatVND(recognizedRevenue(report, 'currentPeriod'))],
          ['Coc can hoan trong ky (chua phai da hoan)', formatVND(report.noShow.currentPeriod.refundDueAmount)],
          ['Booking can doi soat (moi ky)', String(report.noShow.review.unclassifiedBookings)],
          ['Tra truoc ngoai coc chua phan loai (moi ky)', formatVND(report.noShow.review.unallocatedPrepaymentAmount)],
          ['HH OTA', formatVND(report.currentPeriod.otaCommission)],
          ['Phu thu', formatVND(report.currentPeriod.surcharges.total)],
          ['So booking', String(report.currentPeriod.bookingsCount)],
          ['Tang truong doanh thu ghi nhan', `${recognizedRevenueGrowth(report).toFixed(1)}%`],
        ],
      })

      // By Type
      if (report.byType.length) {
        const finalY = (doc as any).lastAutoTable?.finalY || 100
        autoTable(doc, {
          startY: finalY + 10,
          head: [['Loai hinh', 'Bookings', 'Doanh thu', '%']],
          body: report.byType.map(t => [t.label, String(t.bookings), formatVND(t.revenue), `${t.percentage.toFixed(1)}%`]),
        })
      }

      // Top Rooms
      if (report.topRooms.length) {
        const finalY = (doc as any).lastAutoTable?.finalY || 150
        autoTable(doc, {
          startY: finalY + 10,
          head: [['Phong', 'Bookings', 'Doanh thu', 'Phu thu', 'Tong']],
          body: report.topRooms.map(r => [r.roomNumber, String(r.bookings), formatVND(r.revenue), formatVND(r.surcharges), formatVND(r.total)]),
        })
      }

      await read()
      doc.save(`bao-cao-doanh-thu-${period}.pdf`)
      toast.success('Đã xuất file PDF')
      return true
    } catch {
      toast.error('Lỗi khi xuất PDF')
      return false
    } finally {
      busy.current = false; setIsExporting(false)
    }
  }

  return { exportExcel, exportPDF, canExport, isExporting }
}
