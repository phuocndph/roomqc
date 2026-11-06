import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { PasswordChangeError } from '@/lib/password-change'
const state = vi.hoisted(() => ({
  session: { access_token: 'owned-token', user: { id: 'owned-a' } } as { access_token: string; user: { id: string } } | null,
  change: vi.fn(), toast: vi.fn(), updateUser: vi.fn(), listener: null as null | ((event: string, session: unknown) => void),
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: async () => ({ data: { session: state.session }, error: null }),
  refreshSession: async () => ({ data: { session: state.session }, error: null }),
  onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
    state.listener = listener; return { data: { subscription: { unsubscribe: vi.fn() } } }
  }, updateUser: state.updateUser,
} } }))
vi.mock('@/lib/password-change-client', () => ({ passwordChangeFlow: { change: state.change } }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback: string) => fallback || key }) }))
function setup() {
  const client = new QueryClient()
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>
  return renderHook(() => useAuth(), { wrapper })
}
describe('AuthContext password receipt boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.session = { access_token: 'owned-token', user: { id: 'owned-a' } }; state.listener = null
    state.change.mockResolvedValue({ id: 'owned-a', changeId: 'owned-change', completion: 'submitted' })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })
  it('returns only the shared protocol result, passes current password and emits no early success', async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false))
    let value: unknown
    await act(async () => { value = await result.current.updatePassword('OwnedNew!123', 'OwnedOld!123') })
    expect(value).toMatchObject({ error: null, data: { id: 'owned-a', completion: 'submitted' } })
    expect(state.change).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'owned-a', currentPassword: 'OwnedOld!123' }))
    expect(state.updateUser).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled()
  })
  it('keeps an unknown outcome as error rather than reporting Auth-only success', async () => {
    state.change.mockRejectedValue(new PasswordChangeError('outcome_unknown', 'Chưa xác nhận kết quả.'))
    const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await expect(result.current.updatePassword('OwnedNew!123')).resolves.toMatchObject({ error: { code: 'outcome_unknown' } })
    })
    expect(state.toast).not.toHaveBeenCalled()
  })
  it('suppresses late completion when the native app session switches actors', async () => {
    let resolve!: (value: unknown) => void
    state.change.mockImplementation(() => new Promise(done => { resolve = done }))
    const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false))
    let pending!: ReturnType<typeof result.current.updatePassword>
    act(() => { pending = result.current.updatePassword('OwnedNew!123') })
    await waitFor(() => expect(state.change).toHaveBeenCalledOnce())
    act(() => state.listener?.('SIGNED_IN', { access_token: 'owned-other-token', user: { id: 'owned-b' } }))
    // The protocol observes this predicate and rejects before returning a result.
    expect(state.change.mock.calls[0][0].isCurrent()).toBe(false)
    resolve({ id: 'owned-a', changeId: 'owned-change', completion: 'submitted' })
    await act(async () => { await expect(pending).resolves.toMatchObject({ error: { code: 'identity_changed' } }) })
    expect(state.toast).not.toHaveBeenCalled()
  })
  it('does not mutate when there is no authenticated identity', async () => {
    state.session = null; const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await expect(result.current.updatePassword('OwnedNew!123')).resolves.toMatchObject({ error: { code: 'session_required' } })
    })
    expect(state.change).not.toHaveBeenCalled()
  })
})
