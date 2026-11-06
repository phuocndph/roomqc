import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSetupProfile } from '@/lib/account-setup'
import AuthCallback from './AuthCallback'
import { AccountProfileError } from '@/lib/account-profile-error'

const state = vi.hoisted(() => ({
  authenticated: true,
  profile: null as (AccountSetupProfile & { must_change_password?: boolean }) | null,
  profileLoading: false,
  profileError: null as Error | null,
  permissionsLoading: false,
  firstRoute: '/' as string | null,
  refetch: vi.fn(),
  signOut: vi.fn(),
  invitation: { data: null as null | { passwordReady: boolean; expired: boolean }, isLoading: false, isError: false, refetch: vi.fn() },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.authenticated ? { id: 'test-user' } : null, loading: false, signOut: state.signOut }),
}))
vi.mock('@/hooks/useUser', () => ({
  useUser: () => ({ user: state.profile, isLoading: state.profileLoading, error: state.profileError, refetch: state.refetch }),
}))
vi.mock('@/hooks/useFirstAccessibleRoute', () => ({
  useFirstAccessibleRoute: () => ({ firstAccessibleRoute: state.firstRoute, isLoading: state.permissionsLoading }),
}))
vi.mock('@/hooks/useMyStaffInvitation', () => ({ useMyStaffInvitation: () => state.invitation }))
vi.mock('@/components/auth/ResumeStaffInvitation', () => ({ ResumeStaffInvitation: () => <div>Resume invitation</div> }))

function openCallback(path = '/auth/callback') {
  const router = createMemoryRouter([
    { path: '/auth/callback', element: <AuthCallback /> },
    ...['/', '/onboarding', '/auth/login', '/auth/change-password', '/settings/hotels'].map(path => ({ path, element: <div>{path}</div> })),
  ], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.useFakeTimers()
  state.authenticated = true
  state.profile = { tenant_id: 'tenant-A', hotel_id: 'hotel-A', status: 'active', user_level_code: 'tenant_owner', role: 'owner' }
  state.profileLoading = false
  state.profileError = null
  state.permissionsLoading = false
  state.firstRoute = '/'
  state.refetch.mockReset()
  state.invitation = { data: null, isLoading: false, isError: false, refetch: vi.fn() }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AuthCallback registration routing', () => {
  it('waits for invitation lookup before treating a missing profile as a new owner', () => {
    state.profile = null
    state.invitation.isLoading = true
    const router = openCallback()
    act(() => vi.advanceTimersByTime(10000))
    expect(router.state.location.pathname).toBe('/auth/callback')
  })

  it('resumes pending staff setup instead of opening owner onboarding', () => {
    state.profile = null
    state.invitation.data = { passwordReady: true, expired: false }
    expect(openCallback().state.location.pathname).toBe('/auth/callback')
    expect(screen.getByText('Resume invitation')).toBeInTheDocument()
  })

  it('fails closed when invitation lookup is unavailable', () => {
    state.profile = null
    state.invitation.isError = true
    expect(openCallback().state.location.pathname).toBe('/auth/callback')
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(state.invitation.refetch).toHaveBeenCalledOnce()
  })

  it('sends a new owner to onboarding without waiting for permissions', () => {
    state.profile = null
    state.permissionsLoading = true
    expect(openCallback().state.location.pathname).toBe('/onboarding')
  })

  it('does not let a next parameter skip first-time setup', () => {
    state.profile = null
    expect(openCallback('/auth/callback?next=/settings/hotels').state.location.pathname).toBe('/onboarding')
  })

  it('requires a password change before following next', () => {
    state.profile!.must_change_password = true
    expect(openCallback('/auth/callback?next=/settings/hotels').state.location.pathname).toBe('/auth/change-password')
  })

  it('allows a completed owner whose scope is all hotels', () => {
    state.profile!.hotel_id = null
    expect(openCallback().state.location.pathname).toBe('/')
  })

  it('does not send a super admin into tenant registration', () => {
    state.profile = { tenant_id: null, hotel_id: null, status: 'active', user_level_code: 'super_admin', is_super_admin: true }
    expect(openCallback().state.location.pathname).toBe('/')
  })

  it.each(['manager', 'department_manager', 'staff'])('asks an unassigned %s to contact their hotel administrator', level => {
    state.profile = { tenant_id: 'tenant-A', hotel_id: null, status: 'active', user_level_code: level }
    const router = openCallback()
    expect(router.state.location.pathname).toBe('/auth/callback')
    expect(screen.getByText('Tài khoản chưa được gán khách sạn')).toBeInTheDocument()
  })

  it('keeps a failed profile request on a retry screen', () => {
    state.profile = null
    state.profileError = new Error('Failed to fetch')
    const router = openCallback()
    act(() => vi.advanceTimersByTime(10000))
    expect(router.state.location.pathname).toBe('/auth/callback')
    expect(screen.getByText('Chưa tải được thông tin tài khoản')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it.each([false, true])('explains a workspace mismatch even if invitation lookup fails (%s)', invitationFailure => {
    state.profile = null
    state.profileError = new AccountProfileError('workspace_mismatch')
    state.invitation.isError = invitationFailure
    const router = openCallback()
    act(() => vi.advanceTimersByTime(10000))
    expect(router.state.location.pathname).toBe('/auth/callback')
    expect(screen.getByText('Tài khoản không thuộc doanh nghiệp này')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chọn doanh nghiệp khác' })).toHaveAttribute('href', '/start?mode=login')
    expect(screen.queryByRole('button', { name: 'Tải lại' })).not.toBeInTheDocument()
    expect(screen.queryByText('Vui lòng kiểm tra kết nối và thử tải lại để tiếp tục.')).not.toBeInTheDocument()
  })

  it('asks an unconfirmed workspace to reload its setup result', () => {
    state.profile = null
    state.profileError = new AccountProfileError('workspace_unconfirmed')
    openCallback()
    expect(screen.getByText('Doanh nghiệp chưa xác nhận thiết lập')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('never treats a slow profile request as a missing profile after the timeout', () => {
    state.profile = null
    state.profileLoading = true
    const router = openCallback()
    act(() => vi.advanceTimersByTime(10000))
    expect(router.state.location.pathname).toBe('/auth/callback')
  })
})
