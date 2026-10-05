import { RevenueReport, ReportPeriod } from '@/hooks/useRevenueReport'
import { toast } from 'sonner'
import { downloadWorkbook } from '@/lib/excelUtils'

const formatVND = (v: number) => new Intl.NumberFormat('vi-VN').format(v)

export function useRevenueExport() {
  const exportExcel = async (report: RevenueReport, period: ReportPeriod) => {
    try {
      const sheets: { name: string; rows: (string | number)[][] }[] = []

      // Overview sheet
      const overviewData = [
        ['Báo cáo Doanh thu'],
        ['Kỳ báo cáo', period === 'week' ? 'Tuần' : period === 'month' ? 'Tháng' : period === 'quarter' ? 'Quý' : 'Năm'],
        [],
        ['Chỉ số', 'Giá trị'],
        ['Đã thu', formatVND(report.currentPeriod.paidRevenue)],
        ['Chờ thanh toán', formatVND(report.currentPeriod.pendingRevenue)],
        ['Net Revenue', formatVND(report.currentPeriod.netRevenue)],
        ['HH OTA', formatVND(report.currentPeriod.otaCommission)],
        ['Phụ thu', formatVND(report.currentPeriod.surcharges.total)],
        ['Số booking', report.currentPeriod.bookingsCount],
        ['Tăng trưởng', `${report.revenueGrowth.toFixed(1)}%`],
      ]
      sheets.push({ name: 'Tổng quan', rows: overviewData })

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

      await downloadWorkbook(sheets, `bao-cao-doanh-thu-${period}.xlsx`)
      toast.success('Đã xuất file Excel')
    } catch {
      toast.error('Lỗi khi xuất Excel')
    }
  }

  const exportPDF = async (report: RevenueReport, period: ReportPeriod) => {
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Bao cao Doanh thu', 14, 20)
      doc.setFontSize(10)
      doc.text(`Ky bao cao: ${period === 'week' ? 'Tuan' : period === 'month' ? 'Thang' : period === 'quarter' ? 'Quy' : 'Nam'}`, 14, 28)

      // Overview table
      autoTable(doc, {
        startY: 35,
        head: [['Chi so', 'Gia tri']],
        body: [
          ['Da thu', formatVND(report.currentPeriod.paidRevenue)],
          ['Cho thanh toan', formatVND(report.currentPeriod.pendingRevenue)],
          ['Net Revenue', formatVND(report.currentPeriod.netRevenue)],
          ['HH OTA', formatVND(report.currentPeriod.otaCommission)],
          ['Phu thu', formatVND(report.currentPeriod.surcharges.total)],
          ['So booking', String(report.currentPeriod.bookingsCount)],
          ['Tang truong', `${report.revenueGrowth.toFixed(1)}%`],
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

      doc.save(`bao-cao-doanh-thu-${period}.pdf`)
      toast.success('Đã xuất file PDF')
    } catch {
      toast.error('Lỗi khi xuất PDF')
    }
  }

  return { exportExcel, exportPDF }
}
