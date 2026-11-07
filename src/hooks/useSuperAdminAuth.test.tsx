import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlSession } from '@/test/control-admin-fixture'
import { emailActor, emailOther } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ user: null as { id: string } | null, session: null as ReturnType<typeof controlSession> | null,
  profile: null as Record<string, unknown> | null, loading: false, directory: true, workspace: null as object | null, navigate: vi.fn(), toast: vi.fn(), signOut: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user, session: state.session, loading: state.loading, signOut: state.signOut }) }))
vi.mock('@/lib/workspace', () => ({ get directoryEnabled() { return state.directory } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { get workspace() { return state.workspace } } }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: state.profile, isLoading: false }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))
import { useSuperAdminAuth } from './useSuperAdminAuth'
beforeEach(() => {
  vi.clearAllMocks(); state.directory = true; state.workspace = null; state.loading = false; state.user = { id: emailActor }; state.session = controlSession()
  state.profile = { id: emailActor, user_level_code: 'super_admin', status: 'active', account_locked: false, deleted_at: null }
})
afterEach(() => cleanup())
describe('super-admin layout authorization guard', () => {
  it('admits a correlated active platform profile', () => {
    const h = renderHook(() => useSuperAdminAuth()); expect(h.result.current.isSuperAdmin).toBe(true)
    expect(state.navigate).not.toHaveBeenCalled()
  })
  it.each(['no-auth', 'no-session', 'wrong-profile', 'owner', 'locked', 'inactive', 'deleted'])('blocks %s before an admin outlet can mount', mode => {
    if (mode === 'no-auth') state.user = null
    if (mode === 'no-session') state.session = null
    if (mode === 'wrong-profile') state.profile!.id = emailOther
    if (mode === 'owner') state.profile!.user_level_code = 'tenant_owner'
    if (mode === 'locked') state.profile!.account_locked = true
    if (mode === 'inactive') state.profile!.status = 'inactive'
    if (mode === 'deleted') state.profile!.deleted_at = '2026-10-28T00:00:00Z'
    const h = renderHook(() => useSuperAdminAuth()); expect(h.result.current.isSuperAdmin).toBe(false)
    expect(state.navigate).toHaveBeenCalled()
  })
  it('waits for authentication without redirecting during initialization', () => {
    state.loading = true; const h = renderHook(() => useSuperAdminAuth())
    expect(h.result.current.isLoading).toBe(true); expect(state.navigate).not.toHaveBeenCalled()
  })
  it('uses a reachable platform login when directory mode has no workspace', () => {
    state.user = null; renderHook(() => useSuperAdminAuth())
    expect(state.navigate).toHaveBeenCalledWith('/admin/login')
  })
  it.each(['legacy', 'workspace'])('preserves the customer login context in %s mode', mode => {
    state.user = null; state.directory = mode !== 'legacy'; state.workspace = mode === 'workspace' ? {} : null
    renderHook(() => useSuperAdminAuth()); expect(state.navigate).toHaveBeenCalledWith('/auth/login')
  })
  it('returns to platform login only after sign-out finishes', async () => {
    let finish!: () => void
    state.signOut.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve }))
    const h = renderHook(() => useSuperAdminAuth()); const pending = h.result.current.signOut()
    expect(state.navigate).not.toHaveBeenCalled(); finish(); await pending
    expect(state.signOut).toHaveBeenCalledOnce(); expect(state.navigate).toHaveBeenCalledWith('/admin/login')
  })
})
