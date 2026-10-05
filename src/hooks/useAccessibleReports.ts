import { useMemo } from 'react'
import { useUser } from './useUser'
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
  const department = (user?.position?.department ?? null) as DepartmentCode | null

  const accessible = useMemo(
    () => filterReportsForUser(REPORTS_CATALOG, { role, department }),
    [role, department],
  )

  const sections = useMemo(() => groupReportsBySection(accessible), [accessible])

  const canExport = (report: ReportDefinition) => canExportReport(report, { role, department })

  return {
    role,
    department,
    reports: accessible,
    sections,
    canExport,
  }
}
