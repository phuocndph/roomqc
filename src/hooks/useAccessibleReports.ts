import { useMemo } from 'react'
import { useUser } from './useUser'
import { useHasPermission } from './usePermission'
import {
  REPORTS_CATALOG,
  filterReportsForUser,
  groupReportsBySection,
  canExportReport,
  type ReportDefinition,
  type DepartmentCode,
} from '@/lib/reportsCatalog'

/**
 * Trả về danh sách báo cáo + sections người dùng hiện tại được phép xem.
 * + hàm canExport(reportId) tiện dụng.
 */
export function useAccessibleReports() {
  const { user, role } = useUser()
  const view = useHasPermission('reports', 'view')
  const exportPermission = useHasPermission('reports', 'export')
  const department = (user?.position?.department ?? null) as DepartmentCode | null

  const accessible = useMemo(
    () => filterReportsForUser(REPORTS_CATALOG, { role, department, canViewReports: view.hasPermission === true }),
    [role, department, view.hasPermission],
  )

  const sections = useMemo(() => groupReportsBySection(accessible), [accessible])

  const canExport = (report: ReportDefinition) => canExportReport(report, { role, department,
    canViewReports: view.hasPermission === true, canExportReports: exportPermission.hasPermission === true })

  return {
    role,
    department,
    reports: accessible,
    sections,
    canExport,
  }
}
