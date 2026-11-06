import { useHasPermission } from './usePermission'
import { useReportExport, type ReportExportSource } from './useReportExport'
import { useReportScope } from './useReportScope'
import { fetchFinancialReport, financialExportData, financialReportPeriod } from '@/lib/financial-report'
import type { DateRange } from '@/types/reports.types'

export function useFinancialReportExport(range: DateRange) {
  const period = financialReportPeriod(range)
  const scope = useReportScope(JSON.stringify(period))
  const { hasPermission } = useHasPermission('reports', 'export')
  const exporter = useReportExport()
  const canExport = scope.enabled && hasPermission
  const source = (): ReportExportSource => {
    // Capture at the click, not after an asynchronous data request.
    const assertCurrent = scope.capture()
    const request = { ...period, hotelId: scope.hotelId }
    const load = async () => {
      if (!canExport) throw new Error('Bạn chưa có quyền xuất báo cáo.')
      assertCurrent()
      const report = await fetchFinancialReport(request, true)
      assertCurrent()
      return financialExportData(report)
    }
    return { load, beforeSave: async () => { await load(); assertCurrent() } }
  }
  // Build the source inside the exporter's try/catch so stale sessions fail visibly.
  const input = (): ReportExportSource => {
    let prepared: ReportExportSource | undefined
    return { load: () => { prepared = source(); return prepared.load() },
      beforeSave: async () => { if (!prepared) throw new Error('Chưa tải báo cáo.'); await prepared.beforeSave() } }
  }
  return { canExport, isExporting: exporter.isExporting,
    exportExcel: () => exporter.exportToExcel(input(), 'financial'),
    exportPDF: () => exporter.exportToPDF(input(), 'financial') }
}
