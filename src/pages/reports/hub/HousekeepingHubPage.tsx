import { ReportHubShell } from './ReportHubShell'
import { LaundryReportPage } from '../LaundryReportPage'
import QcDashboardPage from '@/pages/housekeeping/QcDashboardPage'

export function HousekeepingHubPage() {
  return (
    <ReportHubShell
      title="Buồng phòng & Giặt là"
      question="Đội buồng phòng & giặt là chạy có hiệu quả không?"
      tabs={[
        { id: 'qc', label: 'Chất lượng (QC)', render: () => <QcDashboardPage embedded /> },
        { id: 'laundry', label: 'Giặt là', Component: LaundryReportPage },
      ]}
      defaultTab="qc"
    />
  )
}

export default HousekeepingHubPage
