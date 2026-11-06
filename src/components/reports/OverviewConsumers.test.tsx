import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const state = vi.hoisted(() => ({ nav: vi.fn(), kpiHook: vi.fn(), insights: null as any, advice: null as any }))
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => state.nav }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('@/hooks/useOverviewKpiStrip', async original => ({ ...await original<typeof import('@/hooks/useOverviewKpiStrip')>(), useOverviewKpiStrip: state.kpiHook }))
vi.mock('@/hooks/useOperationsInsights', async original => ({ ...await original<typeof import('@/hooks/useOperationsInsights')>(),
  useOperationsInsights: () => state.insights, useOperationsAdvice: () => state.advice }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ role: 'staff' }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'h', name: 'Hotel', total_rooms: 0 }, isAllHotelsMode: false }) }))
vi.mock('@/hooks/useOverviewAlerts', () => ({ useOverviewAlerts: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useAccessibleReports', () => ({ useAccessibleReports: () => ({ reports: [] }) }))
vi.mock('@/hooks/useFixedExpenses', () => ({ useMonthlyTarget: () => ({ data: { revenue_target: 1000 }, error: null, isPending: false }) }))
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: false }) }))
vi.mock('@/components/reports/insights/KpiHeroCardV2', () => ({ KpiHeroCardV2: (p: any) => <div data-testid={'hero-' + p.label}>{p.label}:{p.value}{p.pop !== undefined ? ':pop=' + p.pop : ''}</div> }))
vi.mock('@/components/reports/insights/PnLTable', () => ({ PnLTable: ({ rows }: any) => <div>{rows.map((r: any) => <p key={r.label}>{r.label}:{r.current}</p>)}</div> }))
vi.mock('@/components/reports/insights/CostBreakdownChart', () => ({ CostBreakdownChart: () => null }))
vi.mock('@/components/reports/insights/SetTargetsDialog', () => ({ SetTargetsDialog: () => null }))
vi.mock('@/components/reports/insights/AdviceCard', () => ({ AdviceCard: ({ item }: any) => <p data-testid={'advice-' + item.kind}>{item.title ?? item.finding}</p> }))
vi.mock('@/components/reports/insights/ExportInsightsPdfButton', () => ({ ExportInsightsPdfButton: () => null }))
vi.mock('recharts', () => {
  const box = ({ children }: any) => <div>{children}</div>, blank = () => null
  return { ResponsiveContainer: box, ComposedChart: ({ data, children }: any) => <div><pre data-testid="chart-data">{JSON.stringify(data)}</pre>{children}</div>,
    Bar: blank, Line: blank, Tooltip: blank, XAxis: blank, YAxis: blank, Legend: blank, CartesianGrid: blank }
})
import { OverviewKpiStrip } from './OverviewKpiStrip'
import { RevenueVsCostChart } from './RevenueVsCostChart'
import { OverviewHubPage } from '@/pages/reports/hub/OverviewHubPage'
import { OperationsInsightsTab } from '@/pages/reports/components/OperationsInsightsTab'
import { overviewMetrics } from '@/hooks/useOverviewKpiStrip'
import { buildOperationsInsights } from '@/hooks/useOperationsInsights'
import { operationsFixture, operationsRange } from '@/hooks/operations-report.test-fixture'
const ready = () => ({ data: overviewMetrics(operationsFixture()), chart: operationsFixture().daily.map(d => ({ date: d.date, revenue: d.recognized_revenue, cost: d.total_cost })), loading: false, error: null, scopeEnabled: true })
beforeEach(() => {
  state.nav.mockReset(); state.kpiHook.mockReset().mockReturnValue(ready())
  state.insights = { data: buildOperationsInsights(operationsFixture(), { total_labor_cost: 20, by_department: {} } as any, {}, operationsRange), error: null, isLoading: false, isFetching: false }
  state.advice = { data: [], scopeEnabled: true, pendingReady: true, isBusy: false, pending: null, receipt: null, notice: null,
    generate: vi.fn().mockResolvedValue({}), lookup: vi.fn().mockResolvedValue({}), resume: vi.fn().mockResolvedValue({}), cancel: vi.fn().mockResolvedValue({}) }
})
describe('overview and insights presentation', () => {
  it('labels recognized revenue, estimated occupancy and direct costs with drilldowns', () => {
    render(<OverviewKpiStrip kpis={ready()} />)
    expect(screen.getByText('Doanh thu ghi nhận')).toBeTruthy(); expect(screen.getByText('Công suất phòng (ước tính)')).toBeTruthy()
    fireEvent.click(screen.getByText('Doanh thu ghi nhận')); expect(state.nav).toHaveBeenCalledWith('/reports/finance?tab=revenue')
  })
  it('shows source denial instead of cached KPI cards', () => {
    render(<OverviewKpiStrip kpis={{ ...ready(), error: new Error('DENIED') }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được tổng quan'); expect(screen.queryByText('Doanh thu ghi nhận')).toBeNull()
  })
  it('renders server calendar days rather than filling around today', () => {
    render(<RevenueVsCostChart period={operationsRange} data={ready().chart} />)
    const data = JSON.parse(screen.getByTestId('chart-data').textContent!)
    expect(data).toHaveLength(2); expect(data.map((d: any) => d.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(screen.getByText('01/10/2026 – 02/10/2026')).toBeTruthy()
  })
  it('does not render an old chart on source failure or fabricate an unloaded chart', () => {
    const { rerender } = render(<RevenueVsCostChart period={operationsRange} data={ready().chart} error={new Error('DENIED')} />)
    expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.queryByTestId('chart-data')).toBeNull()
    rerender(<RevenueVsCostChart period={operationsRange} data={undefined} />); expect(screen.queryByTestId('chart-data')).toBeNull()
  })
  it('loads the overview once and hides monthly targets when switching to a different period', () => {
    render(<MemoryRouter><OverviewHubPage /></MemoryRouter>); expect(state.kpiHook).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Tiến độ mục tiêu tháng')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tháng trước' }))
    expect(state.kpiHook).toHaveBeenCalledTimes(2); expect(screen.queryByText('Tiến độ mục tiêu tháng')).toBeNull()
    expect(state.kpiHook.mock.calls.at(-1)![0].label).toBe('Tháng trước')
  })
  it('uses server room inventory and separates no-show in P&L without mislabeling revenue growth as GOP growth', () => {
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByText('Lượt trả phòng sau hoa hồng (gồm phụ thu):120')).toBeTruthy()
    expect(screen.getByText('Phí giữ cọc no-show:30')).toBeTruthy(); expect(screen.getByText('DOANH THU GHI NHẬN:150')).toBeTruthy()
    expect(screen.getByTestId('hero-GOP').textContent).not.toContain(':pop=')
    expect(screen.getByText(/10 phòng/)).toBeTruthy()
  })
  it('explains reconciliation and suppresses an unreliable ADR', () => {
    state.insights.data.invalidCheckoutDates = 1; state.insights.data.derived.adrAvailable = false
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByRole('alert')).toHaveTextContent('sai ngày lưu trú')
    expect(screen.getByTestId('hero-ADR')).toHaveTextContent('Chưa đủ dữ liệu hợp lệ')
  })
  it('requires a deliberate AI click and labels rules as basic suggestions', () => {
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(state.advice.generate).not.toHaveBeenCalled(); expect(state.advice.lookup).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phân tích AI' })); expect(state.advice.generate).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Mỗi yêu cầu sử dụng hạn mức/)).toBeTruthy()
  })
  it.each(['unknown', 'not_found', 'reserved'])('offers recovery appropriate to %s without a new command', stateName => {
    state.advice.pending = { request: { command_id: 'owned' } }; state.advice.receipt = { state: stateName }
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByRole('button', { name: 'Tạo phân tích AI' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết quả' })); expect(state.advice.lookup).toHaveBeenCalledTimes(1)
    expect(state.advice.generate).not.toHaveBeenCalled()
    if (stateName === 'unknown') {
      expect(screen.getByRole('status')).toHaveTextContent('không tự gửi lại')
      expect(screen.queryByRole('button', { name: 'Tiếp tục yêu cầu cũ' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Hủy yêu cầu chưa gửi' })).toBeNull()
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục yêu cầu cũ' })); expect(state.advice.resume).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: 'Hủy yêu cầu chưa gửi' })); expect(state.advice.cancel).toHaveBeenCalledTimes(1)
    }
  })
  it('shows safe failure even when there are no rule findings and never claims stable operations', () => {
    state.insights.data.ruleFindings = []; state.advice.notice = 'Dịch vụ tư vấn AI chưa sẵn sàng.'
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByRole('alert')).toHaveTextContent('chưa sẵn sàng')
    expect(screen.queryByText('Chưa có lời khuyên — vận hành đang ổn định.')).toBeNull()
  })
  it('empty rules and no AI are explicitly insufficient to conclude stable operations', () => {
    state.insights.data.ruleFindings = []; render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByText('Chưa có phân tích AI. Chưa đủ cơ sở để kết luận vận hành ổn định.')).toBeTruthy()
  })
  it.each(['permission', 'busy', 'storage'])('disables generation and hides stale AI for %s', mode => {
    state.advice.data = [{ title: 'Old private advice' }]
    if (mode === 'permission') state.advice.scopeEnabled = false
    if (mode === 'busy') state.advice.isBusy = true
    if (mode === 'storage') { state.advice.pendingReady = false; state.advice.data = []; state.advice.notice = 'Không thể đọc yêu cầu trước.' }
    render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByRole('button', { name: 'Tạo phân tích AI' })).toBeDisabled(); expect(screen.queryByText('Old private advice')).toBeNull()
  })
  it('distinguishes a cancelled request from an unknown outcome', () => {
    state.advice.receipt = { state: 'cancelled' }; render(<OperationsInsightsTab dateRange={operationsRange} />)
    expect(screen.getByRole('status')).toHaveTextContent('Đã hủy yêu cầu chưa gửi tới AI.')
  })
})
