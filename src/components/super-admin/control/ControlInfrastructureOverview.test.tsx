import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlBackupPage, controlOverview } from '@/test/control-admin-fixture'
import { ControlInfrastructureOverview } from './ControlInfrastructureOverview'

const state = vi.hoisted(() => ({ overview: undefined as ReturnType<typeof controlOverview> | undefined,
  backups: undefined as ReturnType<typeof controlBackupPage> | undefined, error: null as string | null,
  enabled: true, fetching: false, refresh: vi.fn(), refreshBackups: vi.fn() }))
vi.mock('@/hooks/super-admin/useControlAdmin', () => ({ controlAdminClient: {}, useControlAdmin: (key: string[]) => ({
  data: state.enabled && !state.error ? key[0] === 'overview' ? state.overview : state.backups : undefined,
  enabled: state.enabled, isFetching: state.fetching, message: state.error,
  refetch: key[0] === 'overview' ? state.refresh : state.refreshBackups,
}) }))
const page = () => <MemoryRouter><ControlInfrastructureOverview /></MemoryRouter>
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); state.enabled = true; state.fetching = false; state.error = null
  state.overview = controlOverview({ clusterCount: 1005 })
  state.backups = controlBackupPage({ total: 1005, asOf: new Date().toISOString() })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })
describe('infrastructure overview', () => {
  it('uses authoritative totals instead of counting loaded pages and links to the exact missing cluster', () => {
    render(page())
    expect(screen.getByRole('link', { name: /Cụm dữ liệu/ })).toHaveTextContent('1.005')
    expect(screen.getByRole('link', { name: /Sao lưu đã ghi nhận/ })).toHaveTextContent('1.005')
    expect(screen.getByRole('link', { name: 'Kiểm tra local-a' })).toHaveAttribute('href', '/super-admin/infrastructure?cluster=local-a')
    expect(screen.getByText(/Gồm môi trường thử nghiệm/)).toBeInTheDocument()
  })
  it('shows unknown instead of zero or an open signup after an error or loss of authority', () => {
    const view = render(page())
    state.error = 'Không tải được dữ liệu'; view.rerender(page())
    expect(screen.getByRole('link', { name: /Cụm dữ liệu/ })).toHaveTextContent('—')
    expect(screen.getByRole('link', { name: /Sao lưu đã ghi nhận/ })).toHaveTextContent('—')
    expect(screen.queryByRole('link', { name: 'Kiểm tra local-a' })).not.toBeInTheDocument()
    state.enabled = false; view.rerender(page())
    expect(screen.getByRole('button', { name: 'Cập nhật tổng quan' })).toBeDisabled()
  })
  it('expires observations locally and never treats stale backup receipts as a current total', () => {
    render(page())
    act(() => vi.advanceTimersByTime(31_000))
    expect(screen.getByRole('link', { name: /Cụm dữ liệu/ })).toHaveTextContent('—')
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByRole('link', { name: /Sao lưu đã ghi nhận/ })).toHaveTextContent('—')
  })
  it('refreshes at bounded intervals, skips hidden tabs and overlapping reads, and cleans up', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const view = render(page())
    act(() => vi.advanceTimersByTime(20_000))
    expect(state.refresh).toHaveBeenCalledOnce(); expect(state.refreshBackups).not.toHaveBeenCalled()
    hidden.mockReturnValue(true)
    act(() => vi.advanceTimersByTime(60_000))
    expect(state.refresh).toHaveBeenCalledOnce()
    hidden.mockReturnValue(false); state.fetching = true; view.rerender(page())
    fireEvent(document, new Event('visibilitychange'))
    expect(state.refresh).toHaveBeenCalledOnce()
    state.fetching = false; view.rerender(page())
    fireEvent(document, new Event('visibilitychange'))
    expect(state.refresh).toHaveBeenCalledTimes(2); expect(state.refreshBackups).toHaveBeenCalledOnce()
    view.unmount(); act(() => vi.advanceTimersByTime(120_000))
    expect(state.refresh).toHaveBeenCalledTimes(2)
  })
  it('keeps signup conditions reachable and does not equate zero backups or alerts with healthy service', () => {
    state.backups = controlBackupPage({ total: 0, items: [], asOf: new Date().toISOString() })
    render(page())
    fireEvent.click(screen.getByRole('button', { name: /Nhận đăng ký mới/ }))
    expect(screen.getByRole('button', { name: /Nhận đăng ký mới/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/không chứng minh dữ liệu đã khôi phục được/)).toBeInTheDocument()
    expect(screen.getByText(/Không suy ra hệ thống bình thường/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Sao lưu đã ghi nhận/ })).toHaveTextContent('0')
  })
})
