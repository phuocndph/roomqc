import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
const state = vi.hoisted(() => ({ current: null as any, previous: null as any, calls: vi.fn(), legacy: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('@/hooks/useReports', () => ({ useFinancialReport: (range: { start: Date }) => { state.calls(range)
  return range.start.getMonth() === 9 ? state.current : state.previous } }))
vi.mock('@/hooks/useRevenueReport', async original => ({ ...await original<typeof import('@/hooks/useRevenueReport')>(), useRevenueReport: state.legacy }))
vi.mock('./KpiScorecard', () => ({
  KpiScorecardStrip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KpiScorecard: ({ label, value, deltaPct }: { label: string; value: string; deltaPct: number }) =>
    <output aria-label={label}>{value}|{deltaPct}</output>,
}))
import { FinanceKpiStrip } from './FinanceKpiStrip'
import { financialFixture } from '@/hooks/financial-report.test-fixture'
import { resolvePeriod } from '@/lib/reportPeriods'
beforeEach(() => {
  state.calls.mockReset(); state.legacy.mockReset()
  state.current = { data: financialFixture(), isPending: false, isError: false }
  const previous = financialFixture(); previous.revenue_summary.recognized_revenue = 300000
  previous.revenue_summary.paid_revenue = 200000; previous.revenue_summary.pending_revenue = 100000
  previous.cost_summary = { ...previous.cost_summary, total_cost: 100000 }
  previous.profit_summary = { net_profit: 200000, after_allocated_fixed_cost: 120000, profit_margin: 66.7 }
  state.previous = { data: previous, isPending: false, isError: false }
})
describe('finance KPI period consistency', () => {
  it('uses the actual selected previous calendar period for every metric', () => {
    const period = resolvePeriod('this_month', new Date(2026, 9, 26))
    render(<FinanceKpiStrip period={period} />)
    expect(state.calls.mock.calls.map(c => c[0])).toEqual([period.current, period.previous])
    expect(period.previous.start.getDate()).toBe(1); expect(period.previous.end.getDate()).toBe(30)
    expect(state.legacy).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Doanh thu ghi nhận').textContent).toContain('900.000')
    expect(screen.getByLabelText('Doanh thu ghi nhận').textContent).toContain('|200')
    expect(screen.getByLabelText('Đã thanh toán · lượt trả phòng').textContent).toContain('|100')
    expect(screen.getByLabelText('Còn nợ').textContent).toContain('|400')
    expect(screen.getByLabelText('Tổng chi phí').textContent).toContain('|20')
    expect(screen.getByLabelText('Lợi nhuận vận hành').textContent).toContain('780.000')
    expect(screen.getByLabelText('Lợi nhuận vận hành').textContent).toContain('|290')
    expect(screen.getByLabelText('Biên LN').textContent).toBe('86.7%|20')
    expect(screen.getByText(/Ghi nhận theo ngày xử lý cọc/)).toBeTruthy()
  })
  it.each(['current', 'previous'] as const)('shows an error for failed %s instead of calculating against zero', field => {
    state[field] = { data: undefined, isPending: false, isError: true }
    render(<FinanceKpiStrip period={resolvePeriod('this_month', new Date(2026, 9, 26))} />)
    expect(screen.getByRole('alert').textContent).toContain('Không tải được báo cáo tài chính')
    expect(screen.queryByLabelText('Lợi nhuận vận hành')).toBeNull()
  })
})
