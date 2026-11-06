import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfile } from './useProfile'
import { PasswordChangeError } from '@/lib/password-change'
const state = vi.hoisted(() => ({ user: { id: 'owned-a' } as { id: string } | null,
  change: vi.fn(), reconcile: vi.fn(), toast: vi.fn() }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.user }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }))
vi.mock('@/lib/password-change-client', () => ({ passwordChangeFlow: { change: state.change, reconcile: state.reconcile } }))
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useProfile(), { wrapper })
}
const input = { currentPassword: 'OwnedOld!123', newPassword: 'OwnedNew!123' }
describe('ordinary password caller', () => {
  beforeEach(() => { vi.clearAllMocks(); state.user = { id: 'owned-a' }
    state.change.mockResolvedValue({ id: 'owned-a', changeId: 'owned-operation', completion: 'submitted' })
    state.reconcile.mockResolvedValue(null) })
  it('sends current password and captured identity through the receipt protocol, not SDK-only success', async () => {
    const { result } = setup(); await act(async () => { await result.current.changePasswordAsync(input) })
    expect(state.change).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'owned-a', ...input, isCurrent: expect.any(Function) }))
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cập nhật thành công' }))
  })
  it.each([null, undefined, { id: 'owned-b' }])('refuses unconfirmed/mismatched protocol result %s', async saved => {
    state.change.mockResolvedValue(saved); const { result } = setup()
    await act(async () => { await expect(result.current.changePasswordAsync(input)).rejects.toThrow() })
    expect(state.toast.mock.calls.some(([x]) => x.title === 'Cập nhật thành công')).toBe(false)
  })
  it.each(['current_password_mismatch', 'current_password_invalid'])('preserves safe server refusal %s without raw detail', async code => {
    state.change.mockRejectedValue(new PasswordChangeError(code, 'Mật khẩu hiện tại không đúng.'))
    const { result } = setup(); await act(async () => { await expect(result.current.changePasswordAsync(input)).rejects.toBeTruthy() })
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Mật khẩu hiện tại không đúng.', variant: 'destructive' }))
  })
  it('suppresses completion after an identity switch and supplies a live identity predicate', async () => {
    let resolve!: (value: unknown) => void
    state.change.mockImplementation(() => new Promise(done => { resolve = done }))
    const { result, rerender } = setup(); let pending!: Promise<unknown>
    act(() => { pending = result.current.changePasswordAsync(input) })
    await act(async () => { await Promise.resolve() })
    const predicate = state.change.mock.calls[0][0].isCurrent
    expect(predicate()).toBe(true); state.user = { id: 'owned-b' }; rerender(); expect(predicate()).toBe(false)
    await act(async () => { resolve({ id: 'owned-a', completion: 'submitted' }); await expect(pending).rejects.toThrow() })
    expect(state.toast).not.toHaveBeenCalled()
  })
  it('does not call the password protocol without an identity', async () => {
    state.user = null; const { result } = setup()
    await act(async () => { await expect(result.current.changePasswordAsync(input)).rejects.toThrow() })
    expect(state.change).not.toHaveBeenCalled()
  })
  it('keeps the current-password-required error and never shows success', async () => {
    state.change.mockRejectedValue(new PasswordChangeError('current_password_required', 'Vui lòng nhập mật khẩu hiện tại.'))
    const { result } = setup()
    await act(async () => { await expect(result.current.changePasswordAsync({ ...input, currentPassword: '' })).rejects.toThrow() })
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Vui lòng nhập mật khẩu hiện tại.', variant: 'destructive' }))
  })
  it('offers password-free reconciliation after remount without resending the password', async () => {
    state.reconcile.mockResolvedValue({ id: 'owned-a', changeId: 'prior-operation', completion: 'previous' })
    const { result } = setup(); await act(async () => { await result.current.checkPasswordChangeAsync() })
    expect(state.change).not.toHaveBeenCalled()
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('Mật khẩu vừa nhập chưa được gửi') }))
  })
})
