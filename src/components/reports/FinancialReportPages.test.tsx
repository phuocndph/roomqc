import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ data: undefined as any, error: false, pending: false, mobile: false,
  refetch: vi.fn(), exportExcel: vi.fn(), exportPDF: vi.fn(), success: vi.fn(), failure: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('@/hooks/useReports', () => ({ useFinancialReport: () => ({ data: state.data, isPending: state.pending,
  isError: state.error, refetch: state.refetch }) }))
vi.mock('@/hooks/useFinancialReportExport', () => ({ useFinancialReportExport: () => ({ canExport: true,
  isExporting: false, exportExcel: state.exportExcel, exportPDF: state.exportPDF }) }))
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: state.mobile }) }))
vi.mock('@/components/reports/HotelFilterCard', () => ({ HotelFilterCard: () => null }))
vi.mock('@/components/shared/DateRangePicker', () => ({ DateRangePicker: () => null }))
vi.mock('@/components/layout/MobileDetailHeader', () => ({ MobileDetailHeader: ({ title, action }: any) => <header>
  <h1>{title}</h1>{action && <button onClick={action.onClick}>{action.label}</button>}
</header> }))
vi.mock('@/pages/reports/components/OperationsInsightsTab', () => ({ OperationsInsightsTab: () => null }))
vi.mock('recharts', () => ({ ResponsiveContainer: () => null, LineChart: () => null, Line: () => null,
  AreaChart: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
  Tooltip: () => null, Legend: () => null }))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.failure } }))
import { FinancialReportPage } from '@/pages/reports/FinancialReportPage'
import { MobileFinancialReportPage } from './MobileFinancialReportPage'
import { financialFixture } from '@/hooks/financial-report.test-fixture'

beforeEach(() => {
  Object.assign(state, { data: financialFixture(), error: false, pending: false, mobile: false })
  for (const mock of [state.refetch, state.exportExcel, state.exportPDF, state.success, state.failure]) mock.mockReset()
})
describe('financial desktop and mobile consumers', () => {
  it('uses server recognition/profit/allocation on desktop and keeps export actions reachable in the hub', async () => {
    render(<MemoryRouter><FinancialReportPage embedded /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Xuất PDF' })); expect(state.exportPDF).toHaveBeenCalledOnce()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cơ cấu chi phí' }), { button: 0, ctrlKey: false })
    expect(await screen.findByText('Doanh thu ghi nhận')).toBeTruthy()
    expect(screen.getByText(/780[.]000/)).toBeTruthy()
    expect(screen.getByText(/700[.]000/)).toBeTruthy()
    expect(screen.getByText(/Chi phí cố định ước tính theo số ngày/)).toBeTruthy()
  })
  it('shows the same recognized revenue and profit on mobile', () => {
    render(<MemoryRouter><MobileFinancialReportPage /></MemoryRouter>)
    expect(screen.getByText('Doanh thu ghi nhận')).toBeTruthy()
    expect(screen.getByText(/900[.]000/)).toBeTruthy()
    expect(screen.getByText(/780[.]000/)).toBeTruthy()
    expect(screen.getByText(/700[.]000/)).toBeTruthy()
    expect(screen.getByText('10/2026')).toBeTruthy()
  })
  it.each(['desktop', 'mobile'])('shows a read error on %s instead of zero amounts or an endless loading state', mode => {
    state.error = true; state.data = undefined
    render(<MemoryRouter>{mode === 'desktop' ? <FinancialReportPage /> : <MobileFinancialReportPage />}</MemoryRouter>)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được báo cáo tài chính')
    expect(screen.queryByText('Tổng chi phí')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy()
  })
  it('does not announce successful refresh when the request failed', async () => {
    state.refetch.mockResolvedValue({ isError: true, data: undefined })
    render(<MemoryRouter><MobileFinancialReportPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }))
    await waitFor(() => expect(state.failure).toHaveBeenCalledOnce())
    expect(state.success).not.toHaveBeenCalled()
  })
  it('leaves export completion feedback to the awaited exporter rather than announcing success immediately', async () => {
    state.exportExcel.mockResolvedValue(false)
    render(<MemoryRouter><MobileFinancialReportPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Xuất báo cáo Excel' }))
    await waitFor(() => expect(state.exportExcel).toHaveBeenCalledOnce())
    expect(state.success).not.toHaveBeenCalled()
  })
})
