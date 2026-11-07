import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LowStockItem, TransactionWithDetails } from '@/types/inventory.types'
import { InventoryOverviewSection } from './InventoryOverviewSection'
import { InventoryKpiGrid } from './hub/InventoryKpiGrid'
import { InventoryTodoCard } from './hub/InventoryTodoCard'
import { CombinedStockAlerts } from './hub/CombinedStockAlerts'
import { RecentTransactions } from './RecentTransactions'

const state = vi.hoisted(() => ({
  stats: { total_stock_value: 500000, total_product_types: 8, low_stock_count: 2, today_transactions: { total: 4, in: 1, out: 2 } },
  badges: { distributionsPending: 2, distributionsStale: 1, reorderPending: 3, adjustmentsPending: 1 },
  low: [] as LowStockItem[],
  transactions: [] as TransactionWithDetails[],
  statsError: false, badgeError: false, lowError: false, transactionsError: false,
  canCreate: true, navigate: vi.fn(), refetch: vi.fn(), onNavigate: vi.fn(),
}))
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => state.navigate }))
vi.mock('@/hooks/useInventoryDashboard', () => ({
  useInventoryDashboard: () => ({ data: state.stats, isLoading: false, isError: state.statsError, refetch: state.refetch }),
  useLowStockItems: () => ({ data: state.low, isLoading: false, isError: state.lowError, refetch: state.refetch }),
}))
vi.mock('@/hooks/useInventoryHubBadges', () => ({ useInventoryHubBadges: () => ({ data: state.badges, isLoading: false, isError: state.badgeError, refetch: state.refetch }) }))
vi.mock('@/hooks/useInventoryTransactions', () => ({ useInventoryTransactions: () => ({ data: { transactions: state.transactions }, isLoading: false, isError: state.transactionsError, refetch: state.refetch }) }))
vi.mock('@/components/auth/PermissionRoute', () => ({ useCanAccess: () => ({ canCreate: state.canCreate }) }))
vi.mock('./TransactionDetailDialog', () => ({ TransactionDetailDialog: ({ transactionId }: { transactionId: string }) => <div role="dialog">{transactionId}</div> }))
vi.mock('./InventoryValueChart', () => ({ InventoryValueChart: () => <div>Biểu đồ đã mở</div> }))
vi.mock('./hub/InventoryForecastWidget', () => ({ InventoryForecastWidget: () => <div>Dự báo đã mở</div> }))
vi.mock('./hub/InventoryTopConsumedWidget', () => ({ InventoryTopConsumedWidget: () => <div>Tiêu thụ đã mở</div> }))
vi.mock('./hub/InventoryHotelBreakdown', () => ({ InventoryHotelBreakdown: () => null }))

const open = (element: React.ReactNode) => render(<MemoryRouter>{element}</MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  state.stats = { total_stock_value: 500000, total_product_types: 8, low_stock_count: 2, today_transactions: { total: 4, in: 1, out: 2 } }
  state.badges = { distributionsPending: 2, distributionsStale: 1, reorderPending: 3, adjustmentsPending: 1 }
  state.low = []
  state.transactions = []
  state.statsError = state.badgeError = state.lowError = state.transactionsError = false
  state.canCreate = true
})
afterEach(cleanup)

describe('inventory overview', () => {
  it('keeps detailed analysis collapsed until requested and retains report destinations', async () => {
    open(<InventoryOverviewSection onNavigate={state.onNavigate} />)
    expect(screen.queryByText('Biểu đồ đã mở')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Phân tích kho'))
    await waitFor(() => expect(screen.getByText('Biểu đồ đã mở')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Hàng tồn trên 90 ngày' })).toHaveAttribute('href', '/inventory/dead-stock')
    expect(screen.getByRole('link', { name: 'Phân tích tiêu thụ' })).toHaveAttribute('href', '/inventory/analytics')
    expect(screen.getAllByRole('heading', { name: 'Phiếu cần xử lý' })).toHaveLength(1)
  })

  it('opens stock alerts at the actual filtered items list instead of a generic analytics screen', () => {
    open(<InventoryKpiGrid onNavigate={state.onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: /Cần bổ sung/ }))
    expect(state.navigate).toHaveBeenCalledWith('/items?stockStatus=low_stock')
    expect(screen.getByRole('button', { name: /Giao dịch hôm nay 4/ })).toHaveTextContent('1 nhập · 2 xuất')
    fireEvent.click(screen.getByRole('button', { name: /Giao dịch hôm nay/ }))
    expect(state.onNavigate).toHaveBeenCalledWith('operations', 'transactions')
  })

  it('does not show successful zero metrics when the dashboard query fails', () => {
    state.statsError = true
    open(<InventoryKpiGrid onNavigate={state.onNavigate} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được số liệu tổng quan.')
    expect(screen.queryByRole('button', { name: /Cần bổ sung/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('prioritizes stale work and opens the correct operation for each task', () => {
    open(<InventoryTodoCard onNavigate={state.onNavigate} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toHaveTextContent('Phiếu xuất cần xử lý')
    expect(buttons[0]).toHaveTextContent('1 phiếu đã chờ hơn 24 giờ')
    buttons.forEach(button => fireEvent.click(button))
    expect(state.onNavigate.mock.calls).toEqual([['operations', 'outbound'], ['operations', 'reorder'], ['operations', 'adjustments']])
  })

  it('distinguishes genuinely empty work from a failed count query', () => {
    state.badges = { distributionsPending: 0, distributionsStale: 0, reorderPending: 0, adjustmentsPending: 0 }
    const view = open(<InventoryTodoCard onNavigate={state.onNavigate} />)
    expect(screen.getByText('Không có phiếu chờ xử lý')).toBeInTheDocument()
    state.badgeError = true
    view.rerender(<MemoryRouter><InventoryTodoCard onNavigate={state.onNavigate} /></MemoryRouter>)
    expect(screen.queryByText('Không có phiếu chờ xử lý')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được các phiếu chờ xử lý.')
  })

  it('offers setup for an empty catalog only to users allowed to create items', () => {
    state.stats.total_product_types = 0
    const view = open(<CombinedStockAlerts />)
    expect(screen.getByText('Kho chưa có mặt hàng')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Thêm mặt hàng' })).toHaveAttribute('href', '/items/new')
    state.canCreate = false
    view.rerender(<MemoryRouter><CombinedStockAlerts /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Thêm mặt hàng' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/items?stockStatus=low_stock')
  })

  it('provides keyboard accessible item rows, stock numbers and access to the full list', () => {
    state.low = Array.from({ length: 8 }, (_, i) => ({ id: 'item-' + i, name: 'Khăn ' + i, code: 'K' + i, quantity_in_stock: i, minimum_stock: 10 } as LowStockItem))
    open(<CombinedStockAlerts />)
    expect(screen.getAllByRole('button')).toHaveLength(6)
    const item = screen.getByRole('button', { name: 'Khăn 0 K0 0 10' })
    fireEvent.click(item)
    expect(state.navigate).toHaveBeenCalledWith('/items/item-0')
    expect(screen.getByText(/Đang hiển thị 6 mặt hàng/)).toBeInTheDocument()
  })

  it('does not mistake failed stock retrieval for a healthy stock level', () => {
    state.lowError = true
    open(<CombinedStockAlerts />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Không có mặt hàng nào dưới định mức.')).not.toBeInTheDocument()
  })

  it('labels transaction kinds correctly without treating transfers as outbound and opens details', () => {
    state.transactions = [
      { id: 't-in', item_name: 'Khăn mới', transaction_type: 'in', quantity: 10, created_at: '2026-10-16T06:00:00Z' },
      { id: 't-transfer', item_name: 'Khăn chuyển', transaction_type: 'transfer', quantity: 5, created_at: '2026-10-16T06:00:00Z' },
    ] as TransactionWithDetails[]
    open(<RecentTransactions />)
    expect(screen.getByRole('button', { name: /Khăn mới/ })).toHaveTextContent('+10')
    const transfer = screen.getByRole('button', { name: /Khăn chuyển/ })
    expect(transfer).toHaveTextContent('Chuyển kho')
    expect(transfer).not.toHaveTextContent('−5')
    fireEvent.click(transfer)
    expect(within(screen.getByRole('dialog')).getByText('t-transfer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem lịch sử/ })).toHaveAttribute('href', '/inventory/transactions')
  })

  it('reports a transaction load failure instead of saying there are no transactions', () => {
    state.transactionsError = true
    open(<RecentTransactions />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được lịch sử giao dịch.')
    expect(screen.queryByText('Chưa có giao dịch nhập, xuất kho.')).not.toBeInTheDocument()
  })
})
