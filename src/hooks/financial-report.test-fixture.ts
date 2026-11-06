import type { FinancialReportData } from '@/types/reports.types'
import { reportFixture } from './revenue-report.test-fixture'

export function financialFixture(): FinancialReportData {
  const cost = { total_cost: 120000, purchase_cost: 50000, laundry_cost: 30000, maintenance_cost: 40000 }
  return { version: 2, period_start: '2026-10-01', period_end: '2026-10-31', recognition_timezone: 'Asia/Ho_Chi_Minh',
    summary: cost, cost_summary: cost,
    revenue_summary: { gross_revenue: 900000, paid_revenue: 400000, pending_revenue: 500000,
      ota_commission: 100000, vat_amount: 0, net_revenue: 800000, no_show_fees: 100000, recognized_revenue: 900000 },
    no_show: reportFixture().noShow,
    fixed_cost_summary: { allocated_amount: 80000, method: 'calendar_day_proration', is_estimate: true },
    profit_summary: { net_profit: 780000, after_allocated_fixed_cost: 700000, profit_margin: 86.7 },
    monthly_trend: [{ month: '10/2026', period_start: '2026-10-01', period_end: '2026-10-31',
      purchase: 50000, laundry: 30000, maintenance: 40000, room_revenue: 800000, no_show_fees: 100000,
      revenue: 900000, refund_due: 0, fixed_cost_allocation: 80000, profit: 780000 }],
    cost_by_category: [] }
}
