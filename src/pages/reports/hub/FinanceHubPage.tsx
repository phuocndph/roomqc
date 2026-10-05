import { useState } from 'react'
import { ReportHubShell } from './ReportHubShell'
import { RoomRevenueReportPage } from '../RoomRevenueReportPage'
import { CashFlowReportPage } from '../CashFlowReportPage'
import { FinancialReportPage } from '../FinancialReportPage'
import { RevenueReportPage } from '../RevenueReportPage'
import { FinanceKpiStrip } from '@/components/reports/FinanceKpiStrip'
import { PeriodPresetChips } from '@/components/reports/PeriodPresetChips'
import { resolvePeriod, type PeriodPresetId } from '@/lib/reportPeriods'

export function FinanceHubPage() {
  const [periodId, setPeriodId] = useState<PeriodPresetId>('this_month')
  const period = resolvePeriod(periodId)

  return (
    <ReportHubShell
      title="Báo cáo Tài chính"
      question="Hôm nay thu bao nhiêu? Kênh nào mang khách về nhiều nhất? Tháng này lời hay lỗ?"
      tabs={[
        {
          id: 'room-revenue',
          label: 'Doanh thu phòng',
          render: () => <RoomRevenueReportPage period={period} embedded />,
        },
        {
          id: 'cash-flow',
          label: 'Dòng tiền',
          render: () => <CashFlowReportPage period={period} embedded />,
        },
        {
          id: 'costs',
          label: 'Chi phí & Lợi nhuận',
          render: () => <FinancialReportPage period={period} embedded />,
        },
        {
          id: 'channels',
          label: 'Kênh bán',
          render: () => <RevenueReportPage period={period} embedded />,
        },
      ]}
      defaultTab="room-revenue"
      scorecard={
        <div className="space-y-3">
          <PeriodPresetChips value={periodId} onChange={setPeriodId} />
          <FinanceKpiStrip period={period} />
        </div>
      }
    />
  )
}

export default FinanceHubPage
