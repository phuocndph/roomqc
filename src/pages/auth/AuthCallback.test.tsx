import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSetupProfile } from '@/lib/account-setup'
import AuthCallback from './AuthCallback'

const state = vi.hoisted(() => ({
  authenticated: true,
  profile: null as (AccountSetupProfile & { must_change_password?: boolean }) | null,
  profileLoading: false,
  profileError: null as Error | null,
  permissionsLoading: false,
  firstRoute: '/' as string | null,
  refetch: vi.fn(),
  signOut: vi.fn(),
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
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AuthCallback registration routing', () => {
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

  it('never treats a slow profile request as a missing profile after the timeout', () => {
    state.profile = null
    state.profileLoading = true
    const router = openCallback()
    act(() => vi.advanceTimersByTime(10000))
    expect(router.state.location.pathname).toBe('/auth/callback')
  })
})
