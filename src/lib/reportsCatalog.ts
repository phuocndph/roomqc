/**
 * Reports Catalog — Single source of truth cho toàn bộ báo cáo
 * Sau hợp nhất: chỉ còn 4 Hub (finance / operations / housekeeping / inventory).
 *
 * Quy tắc lọc:
 * - super_admin / owner / hotel_manager: thấy mọi section.
 * - department_manager: chỉ thấy section trùng `departments` của họ.
 * - staff: không vào /reports.
 */

import type { AppRole } from '@/types/database.types'

export type ReportSectionId =
  | 'finance'
  | 'operations'
  | 'housekeeping'
  | 'inventory'

export type DepartmentCode =
  | 'housekeeping'
  | 'laundry'
  | 'inventory'
  | 'maintenance'

export interface ReportDefinition {
  id: string
  title: string
  description: string
  path: string
  section: ReportSectionId
  roles: AppRole[]
  departments?: DepartmentCode[]
  isNew?: boolean
}

export interface ReportSection {
  id: ReportSectionId
  title: string
  description: string
}

export const REPORT_SECTIONS: ReportSection[] = [
  { id: 'finance', title: 'Tài chính', description: 'Doanh thu phòng, dòng tiền, lời/lỗ' },
  { id: 'operations', title: 'Vận hành phòng', description: 'KPI vận hành, hiệu năng phòng' },
  { id: 'housekeeping', title: 'Buồng phòng & Giặt là', description: 'QC, giặt là' },
  { id: 'inventory', title: 'Kho & Bảo trì', description: 'Tồn kho, xuất kho, kiểm kê, hỏng/mất, bảo trì' },
]

const ALL_PRIVILEGED: AppRole[] = ['super_admin', 'owner', 'hotel_manager']

export const REPORTS_CATALOG: ReportDefinition[] = [
  {
    id: 'finance',
    title: 'Tài chính',
    description: 'Doanh thu phòng, dòng tiền, chi phí & lợi nhuận.',
    path: '/reports/finance',
    section: 'finance',
    roles: ALL_PRIVILEGED,
  },
  {
    id: 'operations',
    title: 'Vận hành phòng',
    description: 'KPI vận hành và hiệu năng từng phòng.',
    path: '/reports/operations',
    section: 'operations',
    roles: ALL_PRIVILEGED,
  },
  {
    id: 'housekeeping',
    title: 'Buồng phòng & Giặt là',
    description: 'Chất lượng dọn phòng (QC) & giặt là.',
    path: '/reports/housekeeping',
    section: 'housekeeping',
    roles: [...ALL_PRIVILEGED, 'department_manager'],
    departments: ['housekeeping', 'laundry'],
  },
  {
    id: 'inventory',
    title: 'Kho & Bảo trì',
    description: 'Tồn kho, xuất kho, kiểm kê, hỏng/mất, bảo trì.',
    path: '/reports/inventory',
    section: 'inventory',
    roles: [...ALL_PRIVILEGED, 'department_manager'],
    departments: ['inventory', 'maintenance'],
  },
]

export interface ReportAccessContext {
  role?: AppRole | null
  department?: DepartmentCode | string | null
}

export function filterReportsForUser(
  catalog: ReportDefinition[],
  ctx: ReportAccessContext,
): ReportDefinition[] {
  const { role, department } = ctx
  if (!role) return []

  return catalog.filter((r) => {
    if (!r.roles.includes(role)) return false

    if (role === 'department_manager') {
      if (!r.departments || r.departments.length === 0) return false
      if (!department) return false
      return r.departments.includes(department as DepartmentCode)
    }

    return true
  })
}

export function groupReportsBySection(reports: ReportDefinition[]): Array<{
  section: ReportSection
  reports: ReportDefinition[]
}> {
  return REPORT_SECTIONS
    .map((section) => ({
      section,
      reports: reports.filter((r) => r.section === section.id),
    }))
    .filter((g) => g.reports.length > 0)
}

export function canExportReport(
  report: ReportDefinition,
  ctx: ReportAccessContext,
): boolean {
  const { role, department } = ctx
  if (!role) return false
  if (role === 'super_admin' || role === 'owner' || role === 'hotel_manager') return true
  if (role === 'department_manager') {
    if (!report.departments || !department) return false
    return report.departments.includes(department as DepartmentCode)
  }
  return false
}
