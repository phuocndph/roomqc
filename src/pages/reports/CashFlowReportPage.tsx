import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PeriodPresetChips } from '@/components/reports/PeriodPresetChips'
import { resolvePeriod, type PeriodPresetId, type PeriodRangeWithPrevious } from '@/lib/reportPeriods'
import { useCashFlowReport } from '@/hooks/useCashFlowReport'
import { useReportExport } from '@/hooks/useReportExport'
import { CashFlowKpiHeadline } from '@/components/reports/cash-flow/CashFlowKpiHeadline'
import { CashInOutChart } from '@/components/reports/cash-flow/CashInOutChart'
import { CashInOutBreakdown } from '@/components/reports/cash-flow/CashInOutBreakdown'
import { ReceivablesAgingPanel } from '@/components/reports/cash-flow/ReceivablesAgingPanel'
import { OtaPendingPanel } from '@/components/reports/cash-flow/OtaPendingPanel'
import { UpcomingPayablesPanel } from '@/components/reports/cash-flow/UpcomingPayablesPanel'
import { CashFlowInsights } from '@/components/reports/cash-flow/CashFlowInsights'

interface Props {
  period?: PeriodRangeWithPrevious
  embedded?: boolean
}

/**
 * /reports/cash-flow — Báo cáo Dòng tiền cho chủ KS.
 */
export function CashFlowReportPage({ period: embeddedPeriod, embedded }: Props = {}) {
  const [presetId, setPresetId] = useState<PeriodPresetId>('this_month')
  const period = embeddedPeriod ?? resolvePeriod(presetId)
  const m = useCashFlowReport(period)
  const { exportToExcel, isExporting } = useReportExport()

  const handleExport = () => {
    const dateRange = `${period.current.start.toLocaleDateString('vi-VN')} – ${period.current.end.toLocaleDateString('vi-VN')}`
    exportToExcel(
      {
        title: 'Báo cáo Dòng tiền',
        dateRange,
        tables: [
          {
            title: 'Dòng tiền',
            headers: ['Ngày', 'Tiền vào', 'Tiền ra', 'Ròng'],
            rows: (m.daily || []).map(d => [d.date, d.inflow, d.outflow, d.net]),
          },
          {
            title: 'Công nợ',
            headers: ['Khách', 'Số tiền', 'Số ngày quá hạn'],
            rows: (m.topReceivables || []).map(r => [r.guest_name, r.debt, r.age_days]),
          },
        ],
      },
      'cash-flow'
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 p-3 sm:p-4 max-w-7xl mx-auto'}>
      {!embedded && (
        <>
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Dòng tiền</h1>
            <p className="text-sm text-muted-foreground">
              Tiền vào, tiền ra, công nợ, OTA chưa thanh toán và khoản sắp phải trả.
            </p>
          </header>
          <PeriodPresetChips value={presetId} onChange={setPresetId} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting || m.loading}>
              <Download className="w-4 h-4 mr-1" />
              {isExporting ? 'Đang xuất…' : 'Xuất Excel'}
            </Button>
          </div>
        </>
      )}

      <CashFlowKpiHeadline m={m} />

      <CashInOutChart data={m.daily} loading={m.loading} />

      <CashInOutBreakdown
        cashIn={m.cashInByChannel}
        cashOut={m.cashOutByGroup}
        loading={m.loading}
      />

      <ReceivablesAgingPanel aging={m.aging} top={m.topReceivables} loading={m.loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OtaPendingPanel rows={m.otaPending} loading={m.loading} />
        <UpcomingPayablesPanel rows={m.upcomingPayables} loading={m.loading} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Cảnh báo dòng tiền</h2>
        <CashFlowInsights m={m} />
      </section>
    </div>
  )
}

export default CashFlowReportPage
