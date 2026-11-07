import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuestsPage from './GuestsPage'
import type { Guest } from '@/hooks/useGuests'
import type { GuestListParams } from '@/hooks/useGuestsV2'

const state = vi.hoisted(() => ({
  tenantId: 'tenant-a', manager: true,
  list: { data: { rows: [{ id: '1', full_name: 'Khách đang xem' }] as Guest[], total: 75 }, isLoading: false, isError: false, isSuccess: true, isFetching: false, refetch: vi.fn() },
  stats: { data: { total: 75 }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
  useList: vi.fn(), fetchAll: vi.fn(), exportCSV: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenantId, user: { id: 'user' } }) }))
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }))
vi.mock('@/hooks/usePermissions', () => ({ useHasModulePermission: () => ({ data: state.manager }) }))
vi.mock('@/lib/userAccess', () => ({ isAdminUser: () => false }))
vi.mock('@/hooks/useGuestsV2', () => ({
  useGuestsV2: (params: GuestListParams) => { state.useList(params); return state.list },
  useGuestStats: () => state.stats,
  fetchAllGuests: state.fetchAll, exportGuestsToCSV: state.exportCSV,
}))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }))
vi.mock('@/components/guests/GuestKpiBar', () => ({ GuestKpiBar: () => <div>Thống kê khách</div> }))
vi.mock('@/components/guests/GuestSegmentTabs', () => ({ GuestSegmentTabs: () => <div>Nhóm khách</div> }))
vi.mock('@/components/guests/GuestDataTable', () => ({ GuestDataTable: () => <div>Danh sách khách</div> }))
vi.mock('@/components/guests/GuestCardList', () => ({ GuestCardList: () => null }))
vi.mock('@/components/guests/GuestFormDialog', () => ({ GuestFormDialog: () => null }))
vi.mock('@/components/guests/MergeGuestsDialog', () => ({ MergeGuestsDialog: () => null }))
const app = (url = '/guests') => <MemoryRouter initialEntries={[url]}><GuestsPage /></MemoryRouter>

describe('guest list and complete export', () => {
  beforeEach(() => {
    state.tenantId = 'tenant-a'; state.manager = true
    state.list.isError = state.list.isFetching = state.list.isLoading = false
    state.list.isSuccess = true
    state.stats.isError = state.stats.isFetching = state.stats.isLoading = false
    for (const mock of [state.useList, state.fetchAll, state.exportCSV, state.success, state.error, state.list.refetch, state.stats.refetch]) mock.mockReset()
    state.fetchAll.mockResolvedValue(Array.from({ length: 75 }, (_, id) => ({ id: String(id) })))
  })
  it('retries the list independently of stats and never calls the CSV exporter after a failed read', () => {
    state.list.isError = true
    render(app())
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách khách hàng')
    expect(screen.getByText('Thống kê khách')).toBeInTheDocument()
    expect(screen.queryByText('Danh sách khách')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xuất tất cả CSV' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.list.refetch).toHaveBeenCalledOnce()
    expect(state.stats.refetch).not.toHaveBeenCalled()
  })
  it('leaves the directory usable when only statistics fail', () => {
    state.stats.isError = true
    render(app())
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được thống kê khách hàng')
    expect(screen.queryByText('Thống kê khách')).not.toBeInTheDocument()
    expect(screen.getByText('Danh sách khách')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.stats.refetch).toHaveBeenCalledOnce()
  })
  it('exports the entire current filter, not just the visible page', async () => {
    render(app('/guests?seg=vip&q=An'))
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    fireEvent.click(screen.getByRole('button', { name: 'Xuất tất cả CSV' }))
    await waitFor(() => expect(state.exportCSV).toHaveBeenCalledOnce())
    expect(state.fetchAll).toHaveBeenCalledWith('tenant-a', { segment: 'vip', search: 'An', sortBy: 'created_at', sortDir: 'desc' }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(state.exportCSV.mock.calls[0][0]).toHaveLength(75)
    expect(state.success).toHaveBeenCalledWith('Đã xuất 75 khách hàng theo bộ lọc đã chọn')
  })
  it('does not download partial data when the export fails', async () => {
    state.fetchAll.mockRejectedValue(new Error('later page disconnected'))
    render(app())
    fireEvent.click(screen.getByRole('button', { name: 'Xuất tất cả CSV' }))
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce())
    expect(state.exportCSV).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Xuất tất cả CSV' })).toBeEnabled()
  })
  it('cancels an in-flight export when the tenant changes', async () => {
    let finish: (rows: Guest[]) => void
    state.fetchAll.mockImplementation(() => new Promise<Guest[]>(resolve => { finish = resolve }))
    const { rerender } = render(app())
    fireEvent.click(screen.getByRole('button', { name: 'Xuất tất cả CSV' }))
    const signal = state.fetchAll.mock.calls[0][2].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    state.tenantId = 'tenant-b'
    rerender(app())
    expect(signal.aborted).toBe(true)
    await act(async () => finish([{ id: 'old-tenant-guest' }] as Guest[]))
    expect(state.exportCSV).not.toHaveBeenCalled()
    expect(state.error).not.toHaveBeenCalled()
  })
  it('keeps write/export actions hidden for employees without management permission', () => {
    state.manager = false
    render(app())
    expect(screen.queryByRole('button', { name: 'Xuất tất cả CSV' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thêm khách' })).not.toBeInTheDocument()
  })
})
