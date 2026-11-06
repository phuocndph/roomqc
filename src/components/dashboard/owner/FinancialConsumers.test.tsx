import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ financial: null as any, revenue: null as any, inventory: null as any,
  financeHook: vi.fn(), oldMonthly: vi.fn(), oldBooking: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('@/hooks/useReports', () => ({ useFinancialReport: (range: unknown) => { state.financeHook(range); return state.financial } }))
vi.mock('@/hooks/useMonthlyExpenses', () => ({ useMonthlyExpenses: state.oldMonthly }))
vi.mock('@/hooks/useDashboardStats', () => ({ useDashboardStats: () => state.inventory }))
vi.mock('@/hooks/useRevenueReport', async original => ({ ...await original<typeof import('@/hooks/useRevenueReport')>(), useRevenueReport: () => state.revenue }))
vi.mock('@/hooks/useBookingStats', () => ({ useBookingStats: () => { state.oldBooking(); return { data: { todayRevenue: 999999, projectedRevenue: 111 }, isLoading: false } } }))
vi.mock('@/hooks/useInventoryDashboard', () => ({ useLowStockItems: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { full_name: 'Demo Owner' }, tenantId: 'tenant-a' }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel-a', name: 'Hotel A' }, isAllHotelsMode: false }) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isLoading: false }) }))
vi.mock('./SetupChecklist', () => ({ SetupChecklist: () => null }))
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  AreaChart: ({ data }: { data: unknown }) => <output aria-label="Dữ liệu biểu đồ">{JSON.stringify(data)}</output>,
  Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null }))
import { FinancialOverview } from './FinancialOverview'
import { MobileOwnerDashboard } from './MobileOwnerDashboard'
import { OwnerProfitOverview } from './OwnerProfitOverview'
import { financialFixture } from '@/hooks/financial-report.test-fixture'
import { reportFixture } from '@/hooks/revenue-report.test-fixture'
import { formatCurrency } from '@/lib/utils'

const range = { start: new Date(2026, 4, 8), end: new Date(2026, 4, 12, 23, 59) }
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>
beforeEach(() => {
  state.financeHook.mockReset(); state.oldMonthly.mockReset(); state.oldBooking.mockReset()
  state.financial = { data: financialFixture(), isPending: false, isError: false }
  state.inventory = { data: { total_value: 650000, low_stock_count: 0 }, isLoading: false, error: null }
  const report = reportFixture()
  Object.assign(report.currentPeriod, { netRevenue: 800000, paidRevenue: 400000, bookingsCount: 2 })
  report.noShow.currentPeriod.retainedAmount = 100000
  report.previousPeriod.netRevenue = 200000; report.noShow.previousPeriod.retainedAmount = 100000
  report.today.netRevenue = 500; report.noShow.today.retainedAmount = 50
  report.monthlyTrends = [{ month: '10/2026', revenue: 800000, bookings: 2 }]
  report.recognizedMonthlyTrends = [{ month: '10/2026', revenue: 900000, bookings: 2 }]
  report.revenueGrowth = 12.3
  state.revenue = { data: report, isLoading: false, error: null }
})

describe('owner financial consumers', () => {
  it.each(['desktop', 'mobile'])('%s uses the exact selected days and direct cost DTO', view => {
    const element = view === 'desktop' ? <FinancialOverview dateRange={range} />
      : <MobileOwnerDashboard dateRange={range} datePreset="1m" onDatePresetChange={() => {}} />
    const { rerender } = render(element, { wrapper })
    expect(state.financeHook).toHaveBeenLastCalledWith(range); expect(state.oldMonthly).not.toHaveBeenCalled()
    expect(screen.getByText('Chi phí trực tiếp trong kỳ').parentElement?.parentElement?.textContent).toContain('120.000')
    expect(screen.getByText('Tồn kho hiện tại')).toBeTruthy()
    const nextRange = { start: new Date(2025, 1, 2), end: new Date(2025, 1, 3) }
    rerender(view === 'desktop' ? <FinancialOverview dateRange={nextRange} />
      : <MobileOwnerDashboard dateRange={nextRange} datePreset="1m" onDatePresetChange={() => {}} />)
    expect(state.financeHook).toHaveBeenLastCalledWith(nextRange)
  })
  it.each(['desktop', 'mobile'])('%s shows a denied report instead of invented zero cost', view => {
    state.financial = { data: undefined, isPending: false, isError: true }
    render(view === 'desktop' ? <FinancialOverview dateRange={range} />
      : <MobileOwnerDashboard dateRange={range} datePreset="1m" onDatePresetChange={() => {}} />, { wrapper })
    expect(screen.getByRole('alert').textContent).toContain('Không tải được tổng quan tài chính')
    expect(screen.queryByText('Chi phí trực tiếp trong kỳ')).toBeNull()
  })
  it('uses recognized revenue for headline, growth, comparison, today and chart', () => {
    render(<OwnerProfitOverview />, { wrapper })
    expect(screen.getByText('Doanh thu ghi nhận tháng này').parentElement?.parentElement?.textContent).toContain('900.000')
    expect(screen.getByText('200.0%')).toBeTruthy()
    expect(screen.getByLabelText('Dữ liệu biểu đồ').textContent).toContain('900000')
    expect(screen.getByText(/Tháng trước:/).textContent).toContain('300.000')
    expect(screen.getByText(/Ghi nhận hôm nay:/).textContent).toContain('550')
    expect(screen.getByText(/không phải dòng tiền thực thu/)).toBeTruthy()
    expect(state.oldBooking).not.toHaveBeenCalled()
  })
  it('does not disguise a revenue request failure as an empty chart', () => {
    state.revenue = { data: undefined, isLoading: false, error: new Error('REPORT_DENIED') }
    render(<OwnerProfitOverview />, { wrapper }); expect(screen.getByRole('alert').textContent).toContain('Không tải được doanh thu')
    expect(screen.queryByText('Chưa có doanh thu để hiển thị biểu đồ.')).toBeNull()
  })
  it('uses the server total without re-summing rounded monthly buckets', () => {
    state.financial.data.monthly_trend = []
    render(<FinancialOverview dateRange={range} />)
    const costCard = screen.getByText('Chi phí trực tiếp trong kỳ').parentElement!
    expect(within(costCard).getByText(formatCurrency(120000), { normalizer: text => text })).toBeTruthy()
  })
})
