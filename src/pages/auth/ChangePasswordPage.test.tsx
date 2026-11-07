import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChangePasswordPage from './ChangePasswordPage'
import { PasswordChangeError } from '@/lib/password-change'
const state = vi.hoisted(() => ({ user: { id: 'owned-a' } as { id: string } | null,
  context: vi.fn(), reconcile: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, session: { access_token: 'owned-session' }, updatePassword: state.update }) }))
vi.mock('@/lib/password-change-client', () => ({ passwordChangeFlow: { context: state.context, reconcile: state.reconcile } }))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }))
vi.mock('@/components/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({ PasswordStrengthMeter: () => null }))
const saved = { id: 'owned-a', changeId: 'owned-operation', completion: 'submitted' }
const node = (client: QueryClient) => <QueryClientProvider client={client}>
  <MemoryRouter initialEntries={['/auth/change-password?type=recovery']}>
    <Routes><Route path="/auth/change-password" element={<ChangePasswordPage />} />
      <Route path="/auth/callback" element={<p>Confirmed callback</p>} /></Routes>
  </MemoryRouter>
</QueryClientProvider>
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { ...render(node(client)), client } }
async function fill(current = true) {
  await screen.findByRole('button', { name: 'Đổi mật khẩu' })
  await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toBeEnabled())
  if (current) fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'OwnedOld!123' } })
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'OwnedNew!123' } })
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), { target: { value: 'OwnedNew!123' } })
}
describe('forced/recovery page server-confirmed completion', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.user = { id: 'owned-a' }
    state.context.mockResolvedValue({ actorId: 'owned-a', sessionId: 'owned-session', isRecovery: false, mustChangePassword: true })
    state.reconcile.mockResolvedValue(null); state.update.mockResolvedValue({ error: null, data: saved })
  })
  it('does not trust a recovery query parameter and requires current password for ordinary forced change', async () => {
    setup(); await fill(false)
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    await screen.findByText('Vui lòng nhập mật khẩu hiện tại.')
    expect(state.update).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled()
  })
  it('uses current password and navigates only after confirmed protocol completion', async () => {
    setup(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    await screen.findByText('Confirmed callback')
    expect(state.update).toHaveBeenCalledWith('OwnedNew!123', 'OwnedOld!123')
    expect(state.success).toHaveBeenCalledOnce()
  })
  it('uses server-confirmed recovery context without asking for a forgotten current password', async () => {
    state.context.mockResolvedValue({ actorId: 'owned-a', sessionId: 'owned-session', isRecovery: true, mustChangePassword: true })
    setup(); await fill(false); expect(screen.queryByLabelText('Mật khẩu hiện tại')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' })); await screen.findByText('Confirmed callback')
    expect(state.update).toHaveBeenCalledWith('OwnedNew!123', undefined)
  })
  it.each([{ error: new PasswordChangeError('outcome_unknown', 'Chưa xác nhận kết quả.') }, { error: null, data: null }])('keeps input and refuses success for unconfirmed result %s', async result => {
    state.update.mockResolvedValue(result); setup(); await fill()
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    await waitFor(() => expect(state.error).toHaveBeenCalled())
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('OwnedNew!123')
    expect(state.success).not.toHaveBeenCalled(); expect(screen.queryByText('Confirmed callback')).toBeNull()
  })
  it('fails closed when the context RPC is unavailable', async () => {
    state.context.mockRejectedValue(new Error('private server error')); setup()
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Đổi mật khẩu' })).toBeDisabled()
    expect(screen.queryByText('private server error')).toBeNull(); expect(state.update).not.toHaveBeenCalled()
  })
  it('reconciles a persisted operation on remount without resending any password', async () => {
    state.reconcile.mockResolvedValue({ ...saved, completion: 'previous' }); setup()
    await screen.findByText('Confirmed callback'); expect(state.update).not.toHaveBeenCalled()
    expect(state.success).toHaveBeenCalledWith(expect.stringContaining('trước'))
  })
  it('suppresses late completion after switching users', async () => {
    let resolve!: (value: unknown) => void
    state.update.mockImplementation(() => new Promise(done => { resolve = done }))
    const view = setup(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }))
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    state.user = { id: 'owned-b' }; view.rerender(node(view.client)); resolve({ error: null, data: saved })
    await waitFor(() => expect(state.context).toHaveBeenCalledWith('owned-b'))
    expect(state.success).not.toHaveBeenCalled(); expect(screen.queryByText('Confirmed callback')).toBeNull()
  })
})
