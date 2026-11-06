import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ControlHost } from '@/lib/control-admin'
import { ControlHostsPanel } from './ControlHostsPanel'

const state = vi.hoisted(() => ({
  items: [] as ControlHost[], enabled: true, message: null as string | null, fetching: false, refetch: vi.fn(),
}))
vi.mock('@/hooks/super-admin/useControlAdmin', () => ({
  controlAdminClient: {},
  useControlAdmin: (key: string[]) => key[0] === 'hosts'
    ? { enabled: state.enabled, message: state.message, data: state.enabled ? { items: state.items, nextCursor: null } : undefined, isFetching: state.fetching, refetch: state.refetch }
    : { enabled: false, data: undefined, isFetching: false, message: null, refetch: vi.fn() },
}))
vi.mock('./ControlClusterCommands', () => ({ ControlClusterCommands: () => null }))
const host = (): ControlHost => ({
  id: 'contabo-trial-01', name: 'Contabo thử nghiệm', region: null, providerLabel: 'Contabo',
  environment: 'staging', status: 'active', rowVersion: 1, createdAt: new Date().toISOString(),
  preflight: null, preflightReady: false, cluster: null,
  resources: { source: 'ssh_readonly', observedAt: new Date(Date.now() - 86400000).toISOString(),
    receivedAt: new Date(Date.now() - 86400000).toISOString(), validUntil: new Date(Date.now() - 86280000).toISOString(),
    fresh: false, cpuCount: 4, cpuUsagePercent: 20, memoryTotalBytes: 8000000000, memoryAvailableBytes: 4000000000,
    diskTotalBytes: 100000000000, diskAvailableBytes: 11000000000, diskFreePercent: 11, dockerServerVersion: '29.1.3',
    deploymentAllowed: false, reasonCodes: ['DISK_HEADROOM_LOW'] },
})
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); state.items = [host()]; state.enabled = true; state.message = null; state.fetching = false })
afterEach(() => { cleanup(); vi.useRealTimers() })
const onReady = vi.fn()
const page = () => <MemoryRouter><ControlHostsPanel onReady={onReady} /></MemoryRouter>

describe('host measurement refresh', () => {
  it('distinguishes reloading the list from waiting for a new VPS measurement', () => {
    render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách' }))
    expect(state.refetch).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Đang chờ lượt đo VPS mới/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    expect(screen.getByText(/Đang chờ lượt đo VPS mới/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Đang kiểm tra số đo…' })).toBeDisabled()
  })

  it('never claims success for unchanged or merely unexpired old measurements', () => {
    const view = render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    state.items = [{ ...state.items[0], resources: { ...state.items[0].resources!, fresh: true, validUntil: new Date(Date.now() + 120000).toISOString() } }]
    view.rerender(page())
    expect(screen.queryByText(/Đã nhận số đo mới lúc/)).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(90001))
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa nhận được số đo mới sau 90 giây.')
    expect(screen.getByRole('button', { name: 'Kiểm tra số đo mới' })).toBeEnabled()
  })

  it('confirms a strictly newer, fresh collector timestamp and stops rapid polling', () => {
    const view = render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    act(() => vi.advanceTimersByTime(5000))
    const newDate = new Date().toISOString()
    state.items = [{ ...state.items[0], resources: { ...state.items[0].resources!, observedAt: newDate, fresh: true, validUntil: new Date(Date.now() + 120000).toISOString() } }]
    view.rerender(page())
    expect(screen.getByText(/Đã nhận số đo mới lúc/)).toHaveTextContent(new Date(newDate).toLocaleString('vi-VN'))
    const calls = state.refetch.mock.calls.length
    act(() => vi.advanceTimersByTime(10000))
    expect(state.refetch).toHaveBeenCalledTimes(calls)
  })

  it('keeps host cards visible during a background reload', () => {
    const view = render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    state.fetching = true
    view.rerender(page())
    expect(screen.getByRole('region', { name: 'Tài nguyên VPS' })).toBeInTheDocument()
    expect(screen.getByText(/Đang chờ lượt đo VPS mới/)).toBeInTheDocument()
  })

  it('does not show success after read failure or lost authority and cleans up on unmount', () => {
    const view = render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    state.message = 'Không thể tải dữ liệu quản trị.'
    view.rerender(page())
    expect(screen.getByRole('alert')).toHaveTextContent(state.message)
    expect(screen.queryByText(/Đã nhận số đo mới lúc/)).not.toBeInTheDocument()
    const calls = state.refetch.mock.calls.length
    view.unmount()
    act(() => vi.advanceTimersByTime(100000))
    expect(state.refetch).toHaveBeenCalledTimes(calls)
  })

  it('clears pending feedback when the environment filter changes', () => {
    render(page())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra số đo mới' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Môi trường máy chủ' }), { target: { value: 'production' } })
    expect(screen.queryByText(/Đang chờ lượt đo VPS mới/)).not.toBeInTheDocument()
  })
})
