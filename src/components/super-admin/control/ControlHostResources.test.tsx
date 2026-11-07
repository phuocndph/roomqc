import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlHostResources } from './ControlHostResources'
import type { ControlHost } from '@/lib/control-admin'
const resources = (): NonNullable<ControlHost['resources']> => ({ source: 'ssh_readonly', observedAt: new Date().toISOString(),
  receivedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 120000).toISOString(), fresh: true,
  cpuCount: 4, cpuUsagePercent: 25, memoryTotalBytes: 8 * 1024 ** 3, memoryAvailableBytes: 4 * 1024 ** 3,
  diskTotalBytes: 100 * 1024 ** 3, diskAvailableBytes: 11 * 1024 ** 3, diskFreePercent: 11,
  dockerServerVersion: '29.1.3', deploymentAllowed: false, reasonCodes: ['DISK_HEADROOM_LOW'] })
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('VPS resource observations', () => {
  it('shows actual resource values and explains a blocked deployment', () => {
    render(<ControlHostResources resources={resources()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Đã kết nối giám sát VPS')
    expect(screen.getByRole('meter', { name: 'CPU' })).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('4 vCPU')).toBeInTheDocument()
    expect(screen.getByText('4 / 8 GB')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'RAM đang dùng' })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByText('89 / 100 GB')).toBeInTheDocument()
    expect(screen.getByText('Còn 11 GB · 11%')).toBeInTheDocument()
    expect(screen.getByText(/Ổ đĩa còn dưới 15%/)).toBeInTheDocument()
    expect(screen.queryByText(/Đủ điều kiện tài nguyên sơ bộ/)).not.toBeInTheDocument()
  })
  it('expires even if the last server response reported a fresh snapshot', () => {
    vi.useFakeTimers();render(<ControlHostResources resources={resources()} />)
    act(() => vi.advanceTimersByTime(120001))
    expect(screen.getByRole('status')).toHaveTextContent('Số đo đã cũ')
    expect(screen.getByText(/Dữ liệu lần đo cuối/)).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'CPU' })).toHaveAttribute('aria-valuetext', expect.stringContaining('Số đo đã cũ'))
    expect(screen.queryByText(/đang chặn cài thêm RoomQC/)).not.toBeInTheDocument()
  })
  it('distinguishes machine capacity from cluster readiness or signup permission', () => {
    render(<ControlHostResources resources={{ ...resources(), diskFreePercent: 50, deploymentAllowed: true, reasonCodes: [] }} />)
    expect(screen.getByText(/cần kiểm tra bản cài, dịch vụ và sao lưu trước khi nhận khách/)).toBeInTheDocument()
  })
})
