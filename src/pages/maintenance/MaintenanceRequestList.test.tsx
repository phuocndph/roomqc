import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import MaintenanceRequestList from './MaintenanceRequestList'

const requests = [
  {
    id: 'urgent-active',
    title: 'Khẩn cấp đang chờ',
    status: 'waiting',
    priority: 'urgent',
  },
  {
    id: 'urgent-completed',
    title: 'Khẩn cấp đã xong',
    status: 'completed',
    priority: 'urgent',
  },
  { id: 'work', title: 'Đang sửa', status: 'in_progress', priority: 'medium' },
  { id: 'cancelled', title: 'Đã hủy', status: 'cancelled', priority: 'low' },
]
vi.mock('@/hooks/useMaintenanceRequests', () => ({
  useMaintenanceRequests: () => ({
    data: requests,
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/lib/breakpoints', () => ({
  useBreakpoint: () => ({ isMobile: false }),
}))
vi.mock('@/components/maintenance/MobileMaintenanceRequestList', () => ({
  MobileMaintenanceRequestList: () => null,
}))
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/auth/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/maintenance/MaintenanceRequestTable', () => ({
  MaintenanceRequestTable: ({
    requests: rows,
  }: {
    requests: typeof requests
  }) => (
    <div data-testid="requests">
      {rows.map((row) => (
        <p key={row.id}>{row.title}</p>
      ))}
    </div>
  ),
}))

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}
const app = (url: string) => (
  <MemoryRouter initialEntries={[url]}>
    <MaintenanceRequestList />
    <Location />
  </MemoryRouter>
)

describe('maintenance list navigation and work queues', () => {
  it('opens an urgent link with only outstanding urgent requests', () => {
    render(app('/maintenance/requests?view=urgent'))
    expect(screen.getByTestId('requests')).toHaveTextContent(
      'Khẩn cấp đang chờ',
    )
    expect(screen.getByTestId('requests')).not.toHaveTextContent(
      'Khẩn cấp đã xong',
    )
    expect(screen.getByTestId('requests')).not.toHaveTextContent('Đang sửa')
  })
  it('keeps cancelled requests accessible and clears the exact-status filter when selecting active work', () => {
    render(app('/maintenance/requests?status=cancelled'))
    expect(screen.getByTestId('requests')).toHaveTextContent('Đã hủy')
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Cần xử lý/ }), {
      button: 0,
      ctrlKey: false,
    })
    expect(screen.getByTestId('requests')).toHaveTextContent('Đang sửa')
    expect(screen.getByTestId('requests')).not.toHaveTextContent('Đã hủy')
    expect(screen.getByTestId('location')).toHaveTextContent('view=active')
    expect(screen.getByTestId('location')).not.toHaveTextContent(
      'status=cancelled',
    )
  })
})
