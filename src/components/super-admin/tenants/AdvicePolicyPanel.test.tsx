import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { policyDraft } from '@/test/advice-policy-fixture'

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown>, save: vi.fn() }))
vi.mock('@/hooks/super-admin/useAdvicePolicy', () => ({ useAdvicePolicy: () => state.query }))
import { AdvicePolicyPanel } from './AdvicePolicyPanel'
beforeEach(() => {
  state.save.mockReset().mockResolvedValue({ state: 'succeeded' })
  state.query = { enabled: true, scope: 'scope-a', isPending: false, isFetching: false, isError: false, isSaving: false,
    pendingReady: true, pending: null, data: { revision: 0, policy: null }, notice: null,
    isCurrent: () => true, save: state.save,
    lookup: vi.fn(async () => ({ state: 'not_found' })), retry: vi.fn(async () => ({ state: 'succeeded' })),
    cancel: vi.fn(async () => ({ state: 'cancelled' })), refetch: vi.fn(async () => ({ isSuccess: true })) }
})
afterEach(cleanup)
const show = () => render(<AdvicePolicyPanel tenantId="00000000-0000-4000-8000-000000000001" active />)

describe('tenant advice policy editor', () => {
  it('starts disabled with no invented plan limits and never writes on mount', async () => {
    show(); await screen.findByLabelText('Số lượt tối đa mỗi ngày UTC')
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Số lượt tối đa mỗi ngày UTC')).toHaveValue('')
    expect(state.query.save).not.toHaveBeenCalled()
  })
  it('requires explicit valid fields and a reason before submitting', async () => {
    show(); const daily = await screen.findByLabelText('Số lượt tối đa mỗi ngày UTC')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình tư vấn' }))
    expect(state.query.save).not.toHaveBeenCalled()
    fireEvent.change(daily, { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Ngân sách nội bộ mỗi ngày'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Đơn vị nội bộ mỗi lượt'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Có hiệu lực đến'), { target: { value: policyDraft().valid_until } })
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: 'Operator reviewed quota' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình tư vấn' }))
    await waitFor(() => expect(state.query.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, daily_limit: 20 }), 0))
  })
  it('exposes distinct check, retry and cancellation actions while blocking new edits', async () => {
    state.query.pending = { command: { p_command_id: 'pending' } }; show()
    await screen.findByLabelText('Số lượt tối đa mỗi ngày UTC')
    expect(screen.getByRole('button', { name: 'Lưu cấu hình tư vấn' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết quả' }))
    await waitFor(() => expect(state.query.lookup).toHaveBeenCalledTimes(1)); expect(state.query.retry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục lần lưu' }))
    await waitFor(() => expect(state.query.retry).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Hủy lần lưu' }))
    await waitFor(() => expect(state.query.cancel).toHaveBeenCalledTimes(1))
  })
  it('keeps the draft when a version conflict is reported', async () => {
    state.query.data = { revision: 1, policy: policyDraft() }
    state.save.mockRejectedValue(new Error('conflict')); show()
    const reason = await screen.findByLabelText('Lý do thay đổi')
    fireEvent.change(reason, { target: { value: 'Preserve this edited reason' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình tư vấn' }))
    await waitFor(() => expect(state.query.save).toHaveBeenCalledTimes(1))
    expect(reason).toHaveValue('Preserve this edited reason')
  })
  it('does not render the editor for an ineligible identity', () => {
    state.query.enabled = false; show(); expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})
