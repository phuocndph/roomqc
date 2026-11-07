import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManagementPage from './StaffManagementPage'

const state = vi.hoisted(() => ({
  staff: { data: [], isError: false, isLoading: false, isFetching: false, refetch: vi.fn() },
  activity: { data: { all: [] }, isError: false, isLoading: false, isFetching: false, refetch: vi.fn() },
  manager: true,
}))
vi.mock('@/hooks/useStaffStatus', () => ({
  useStaffStatus: () => state.staff,
  useStaffStatusStats: () => ({ total: 0 }),
}))
vi.mock('@/hooks/useStaffActivity', () => ({ useRecentStaffActivities: () => state.activity }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'user' } }) }))
vi.mock('@/lib/userAccess', () => ({ canCreateHousekeepingTask: () => state.manager }))
vi.mock('@/components/staff/StaffStatsCards', () => ({ StaffStatsCards: () => <div>Thống kê nhân sự</div> }))
vi.mock('@/components/staff/StaffList', () => ({ StaffList: () => <div>Danh sách nhân sự</div> }))
vi.mock('@/components/staff/StaffDetailSheet', () => ({ StaffDetailSheet: () => null }))
vi.mock('@/components/staff/StaffActivityTimeline', () => ({ StaffActivityTimeline: () => <div>Nhật ký nhân sự</div> }))
vi.mock('@/components/staff/ManagerTasksTab', () => ({ ManagerTasksTab: () => <div>Quản lý công việc</div> }))
vi.mock('@/components/staff/ShiftHistoryTab', () => ({ ShiftHistoryTab: () => <div>Quản lý ca</div> }))

describe('staff load states', () => {
  beforeEach(() => {
    state.staff.isError = state.staff.isLoading = state.staff.isFetching = false
    state.activity.isError = state.activity.isLoading = state.activity.isFetching = false
    state.staff.refetch.mockReset(); state.activity.refetch.mockReset()
    state.manager = true
  })
  it('shows retry, not a false empty list or zero statistics, when staff loading fails', () => {
    state.staff.isError = true
    render(<StaffManagementPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách nhân sự')
    expect(screen.queryByText('0 nhân viên')).not.toBeInTheDocument()
    expect(screen.queryByText('Thống kê nhân sự')).not.toBeInTheDocument()
    expect(screen.queryByText('Danh sách nhân sự')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.staff.refetch).toHaveBeenCalledOnce()
    expect(state.activity.refetch).not.toHaveBeenCalled()
  })
  it('shows independent activity retry and leaves management tabs reachable', () => {
    state.activity.isError = true
    render(<StaffManagementPage />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Hoạt động' }), { button: 0, ctrlKey: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được hoạt động nhân sự')
    expect(screen.queryByText('Nhật ký nhân sự')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.activity.refetch).toHaveBeenCalledOnce()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Công việc' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('Quản lý công việc')).toBeInTheDocument()
  })
  it('disables retry while fetching and keeps role-based tabs hidden', () => {
    state.staff.isError = state.staff.isFetching = true
    state.manager = false
    render(<StaffManagementPage />)
    expect(screen.getByRole('button', { name: 'Đang tải lại…' })).toBeDisabled()
    expect(screen.queryByRole('tab', { name: 'Công việc' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Ca làm việc' })).not.toBeInTheDocument()
  })
})
