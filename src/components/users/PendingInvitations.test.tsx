import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown>, act: vi.fn(), refresh: vi.fn(), next: vi.fn(), previous: vi.fn() }))
vi.mock('@/hooks/useStaffInvitationAdmin', () => ({ useStaffInvitationAdmin: () => state.value }))
import { PendingInvitations } from './PendingInvitations'
const row = { id: 'owned', hotel_id: 'hotel', email: 'owned@roomqc.invalid', full_name: 'Owned Staff', user_level_code: 'staff',
  expires_at: '2099-01-01T00:00:00Z', sent_at: '2026-10-22T00:00:00Z', created_at: '2026-10-22T00:00:00Z' }
beforeEach(() => {
  vi.clearAllMocks(); state.act.mockResolvedValue({}); state.refresh.mockResolvedValue({})
  state.value = { canManage: true, isReady: true, data: [row], isError: false, isLoading: false,
    isFetching: false, busyId: null, notice: null, refresh: state.refresh, act: state.act,
    page: 1, hasNext: false, hasPrevious: false, next: state.next, previous: state.previous }
})
it('does not render invitation PII when management is disabled', () => {
  state.value.canManage = false; render(<PendingInvitations />)
  expect(screen.queryByText(row.email)).not.toBeInTheDocument()
})
it('shows reservation-aware text without claiming confirmed delivery from sent_at', () => {
  render(<PendingInvitations />)
  expect(screen.getByText(/Đã yêu cầu gửi/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }))
  expect(state.act).toHaveBeenCalledWith(row, 'resend')
})
it('requires confirmation for revoke and passes the exact row', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  render(<PendingInvitations />)
  fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' })); expect(state.act).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' })); expect(state.act).toHaveBeenCalledWith(row, 'revoke')
  confirm.mockRestore()
})
it('disables both actions during a request or background read', () => {
  state.value.isFetching = true; render(<PendingInvitations />)
  expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Thu hồi' })).toBeDisabled()
})
it('keeps unknown outcome visible and offers readback without claiming absence is success', () => {
  state.value.notice = 'Chưa xác nhận được kết quả.'; render(<PendingInvitations />)
  expect(screen.getByText(/Danh sách không còn lời mời/)).toHaveTextContent('chưa đủ để xác nhận')
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lời mời' }))
  expect(state.refresh).toHaveBeenCalledOnce(); expect(state.act).not.toHaveBeenCalled()
})
it('explains missing hotel selection instead of an endless loading message', () => {
  state.value.isReady = false; state.value.data = []; render(<PendingInvitations />)
  expect(screen.getByText(/Chọn một khách sạn/)).toBeInTheDocument()
  expect(screen.queryByText('Đang tải lời mời…')).not.toBeInTheDocument()
})
it('offers accessible previous and next controls with a page-local count, not a total', () => {
  state.value.page = 2; state.value.hasPrevious = true; state.value.hasNext = true
  render(<PendingInvitations />)
  fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }))
  fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }))
  expect(state.previous).toHaveBeenCalledOnce(); expect(state.next).toHaveBeenCalledOnce()
  expect(screen.getByText('Trang 2 · 1 lời mời trên trang')).toBeInTheDocument()
})
it('keeps previous available on an empty or failed later page', () => {
  state.value.page = 3; state.value.hasPrevious = true; state.value.isError = true; state.value.data = []
  render(<PendingInvitations />)
  expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
})
