import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ flow: null as any, save: vi.fn(), recover: vi.fn(), cancel: vi.fn(), refetch: vi.fn(), saved: vi.fn() }))
vi.mock('@/hooks/useReportTargets', () => ({ useReportTargets: () => state.flow }))
import { ReportTargetEditor } from './ReportTargetEditor'
const revision = `0:${'a'.repeat(64)}`
beforeEach(() => {
  vi.clearAllMocks()
  state.flow = { scope: 'a', scopeEnabled: true, data: { version: 1, kind: 'financial', period_month: '2026-10-01', hotel_id: 'hotel',
    revision, values: { adr: 10, occupancy: 75, gop: 50 }, can_manage: true, review_required: false },
    isPending: false, isFetching: false, isSaving: false, pendingReady: true, pending: [], notice: null,
    isCurrent: () => true, save: state.save, recover: state.recover, cancel: state.cancel, refetch: state.refetch }
  state.save.mockResolvedValue({ state: 'completed', report: { ...state.flow.data, revision: `1:${'a'.repeat(64)}` } })
  state.cancel.mockResolvedValue({ state: 'cancelled' })
  state.recover.mockResolvedValue({}); state.refetch.mockResolvedValue({})
})
const editor = () => <ReportTargetEditor kind="financial" month="2026-10-01" onSaved={state.saved} />
describe('target controlled batch form', () => {
  it('saves all values once, preserving untouched metrics and decimal input', async () => {
    render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '123.45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith({ adr: 123.45, gop: 50, occupancy: 75 }, revision, false))
    expect(state.save).toHaveBeenCalledTimes(1); await waitFor(() => expect(state.saved).toHaveBeenCalledTimes(1))
  })
  it('empty deletes only the chosen metric while zero and negative GOP survive', async () => {
    render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Lấp đầy (%)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('GOP (VNĐ/tháng)'), { target: { value: '-20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith({ gop: -20, occupancy: 0 }, revision, false))
  })
  it('invalid values keep the draft and never dispatch', async () => {
    render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '1.234.567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await screen.findByText(/Mục tiêu không hợp lệ/); expect(state.save).not.toHaveBeenCalled()
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('1.234.567')
  })
  it('a failed save keeps draft and does not close', async () => {
    state.save.mockRejectedValue(new Error('private details'))
    render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await screen.findByText(/Chưa xác nhận được lần lưu/); expect(state.saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('99')
  })
  it.each(['read-only', 'pending', 'saving', 'storage'])('disables writing when %s', mode => {
    if (mode === 'read-only') state.flow.data.can_manage = false
    if (mode === 'pending') state.flow.pending = [{ command: {} }]
    if (mode === 'saving') state.flow.isSaving = true
    if (mode === 'storage') state.flow.pendingReady = false
    render(editor()); expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toBeDisabled()
    expect(screen.getByRole('button', { name: mode === 'saving' ? 'Đang lưu…' : 'Lưu mục tiêu' })).toBeDisabled()
  })
  it('shows an actionable recovery button without clearing pending', async () => {
    state.flow.pending = [{ command: {} }]; render(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lần lưu trước' }))
    await waitFor(() => expect(state.recover).toHaveBeenCalledTimes(1)); expect(state.flow.pending).toHaveLength(1)
  })
  it('requests server cancellation without erasing the pending record or the draft', async () => {
    const h = render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    state.flow.pending = [{ command: {} }]; h.rerender(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Hủy lần lưu chưa áp dụng' }))
    await waitFor(() => expect(state.cancel).toHaveBeenCalledTimes(1))
    expect(state.flow.pending).toHaveLength(1); expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('99'); expect(state.saved).not.toHaveBeenCalled()
  })
  it('a save cancelled by another tab keeps the draft and cannot close the editor', async () => {
    state.save.mockResolvedValue({ state: 'cancelled' }); render(editor())
    fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await screen.findByText(/Lần lưu này đã được hủy/); expect(state.saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('99')
  })
  it('legacy values require explicit acknowledgement and a nonempty reviewed set', async () => {
    state.flow.data.review_required = true; state.flow.data.values = {}
    render(editor()); const save = screen.getByRole('button', { name: 'Lưu mục tiêu' })
    fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '100' } }); expect(save).toBeDisabled()
    const checkbox = screen.getByRole('checkbox'); expect(checkbox).not.toBeChecked(); fireEvent.click(checkbox)
    fireEvent.click(save); await waitFor(() => expect(state.save).toHaveBeenCalledWith({ adr: 100 }, revision, true))
  })
  it('legacy blank replacement cannot silently discard ambiguous rows', async () => {
    state.flow.data.review_required = true; state.flow.data.values = { adr: 10 }
    render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await screen.findByText(/Không dùng bộ trống/); expect(state.save).not.toHaveBeenCalled()
  })
  it('a refetch does not overwrite a dirty draft; changed revision blocks stale submission', () => {
    const h = render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    state.flow.data = { ...state.flow.data, values: { adr: 200 }, revision: `1:${'b'.repeat(64)}` }; h.rerender(editor())
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('99'); expect(screen.getByRole('button', { name: 'Lưu mục tiêu' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại và bỏ thay đổi' }))
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('200'); expect(state.refetch).toHaveBeenCalledTimes(1)
  })
  it('scope change resets draft and review checkbox', () => {
    state.flow.data.review_required = true; const h = render(editor())
    fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } }); fireEvent.click(screen.getByRole('checkbox'))
    state.flow.scope = 'b'; state.flow.data = { ...state.flow.data, values: { adr: 200 } }; h.rerender(editor())
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('200'); expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('denial masks form data but a later authorized refetch restores the unsent draft', () => {
    const h = render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    const report = state.flow.data
    state.flow.data = undefined; state.flow.notice = 'Quyền đã thay đổi'; h.rerender(editor())
    expect(screen.queryByLabelText('ADR (VNĐ/đêm)')).not.toBeInTheDocument()
    state.flow.data = report; state.flow.notice = null; h.rerender(editor())
    expect(screen.getByLabelText('ADR (VNĐ/đêm)')).toHaveValue('99')
  })
  it('late completion after a scope change cannot close a newer editor', async () => {
    let resolve!: (v: unknown) => void; state.save.mockImplementation(() => new Promise(r => { resolve = r }))
    const captured = state.flow; const h = render(editor()); fireEvent.change(screen.getByLabelText('ADR (VNĐ/đêm)'), { target: { value: '99' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    captured.isCurrent = () => false; state.flow = { ...captured, scope: 'b', isCurrent: () => true }; h.rerender(editor())
    await act(async () => { resolve({ report: { revision: `1:${'a'.repeat(64)}` } }) })
    expect(state.saved).not.toHaveBeenCalled()
  })
  it('monthly editor uses its own metrics and accepts a zero revenue target', async () => {
    state.flow.data.values = { revenue_target: 100, occupancy_target: 75 }
    render(<ReportTargetEditor kind="monthly" month="2026-10-01" />)
    fireEvent.change(screen.getByLabelText('Doanh thu mục tiêu (VND)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mục tiêu' }))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith({ occupancy_target: 75, revenue_target: 0 }, revision, false))
  })
})
