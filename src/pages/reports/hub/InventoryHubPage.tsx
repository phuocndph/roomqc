import { ReportHubShell } from './ReportHubShell'
import { InventoryReportPage } from '../InventoryReportPage'
import { OutboundReportPage } from '../OutboundReportPage'
import { StockAuditReportPage } from '../StockAuditReportPage'
import { MaintenanceReportPage } from '../MaintenanceReportPage'
import { DamagesReportPage } from '../DamagesReportPage'
import { OperationsReportPage } from '../OperationsReportPage'

export function InventoryHubPage() {
  return (
    <ReportHubShell
      title="Kho & Bảo trì"
      question="Kho có đủ không? Tài sản có được bảo trì không? Hỏng/mất gì không?"
      tabs={[
        { id: 'operations', label: 'Vận hành kho', Component: OperationsReportPage },
        { id: 'stock', label: 'Tồn kho', Component: InventoryReportPage },
        { id: 'outbound', label: 'Xuất kho', Component: OutboundReportPage },
        { id: 'audit', label: 'Kiểm kê', Component: StockAuditReportPage },
        { id: 'damages', label: 'Hỏng / Mất', Component: DamagesReportPage },
        { id: 'maintenance', label: 'Bảo trì', Component: MaintenanceReportPage },
      ]}
      defaultTab="operations"
    />
  )
}

export default InventoryHubPage
