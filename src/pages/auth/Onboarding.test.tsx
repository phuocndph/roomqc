import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'

const state = vi.hoisted(() => ({ rpc: vi.fn(), refetch: vi.fn(), toast: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'new-owner', email: 'owner@example.invalid', user_metadata: { full_name: 'Owner' } }, signOut: vi.fn() }),
}))
vi.mock('@/hooks/useUser', () => ({
  useUser: () => ({ user: null, isLoading: false, error: null, refetch: state.refetch }),
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))

function openForm() {
  const router = createMemoryRouter([
    { path: '/onboarding', element: <Onboarding /> },
    { path: '/auth/callback', element: <div>Resolve account access</div> },
  ], { initialEntries: ['/onboarding'] })
  const view = render(<RouterProvider router={router} />)
  fireEvent.change(screen.getByPlaceholderText('VD: Công ty TNHH ABC'), { target: { value: 'Test company' } })
  fireEvent.change(screen.getByPlaceholderText('VD: Khách sạn Sunrise'), { target: { value: 'Test hotel' } })
  fireEvent.change(screen.getByPlaceholderText('0901234567'), { target: { value: '0901234567' } })
  fireEvent.change(screen.getByPlaceholderText('0282345678'), { target: { value: '0282345678' } })
  fireEvent.change(screen.getByPlaceholderText('123 Nguyễn Huệ, Q1, TP.HCM'), { target: { value: '123 Test Road' } })
  return { router, form: view.container.querySelector('form')! }
}

beforeEach(() => {
  state.rpc.mockReset()
  state.refetch.mockReset().mockResolvedValue({})
  state.toast.mockReset()
})
afterEach(cleanup)

describe('Onboarding submission', () => {
  it('sends one RPC for duplicate submissions while the request is pending', async () => {
    let finish: (value: unknown) => void = () => {}
    state.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { router, form } = openForm()
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(state.rpc).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Đang xử lý…' })).toBeDisabled()
    await act(async () => { finish({ data: { success: true, tenant_id: 'tenant-A', hotel_id: 'hotel-A' }, error: null }) })
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/callback'))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('preserves entered data and allows retry after a lost response', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const { router, form } = openForm()
    fireEvent.submit(form)
    await screen.findByText(/Không thể kết nối tới máy chủ/)
    expect(router.state.location.pathname).toBe('/onboarding')
    expect(screen.getByPlaceholderText('VD: Khách sạn Sunrise')).toHaveValue('Test hotel')
    expect(screen.getByRole('button', { name: 'Hoàn tất thiết lập' })).toBeEnabled()
    state.rpc.mockResolvedValue({ data: { success: true, tenant_id: 'tenant-A', hotel_id: 'hotel-A', idempotent: true }, error: null })
    fireEvent.submit(form)
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/callback'))
    expect(state.rpc).toHaveBeenCalledTimes(2)
  })

  it('does not declare success when the server response has no hotel', async () => {
    state.rpc.mockResolvedValue({ data: { success: true, tenant_id: 'tenant-A' }, error: null })
    const { router, form } = openForm()
    fireEvent.submit(form)
    await screen.findByText(/Không thể hoàn tất thiết lập/)
    expect(router.state.location.pathname).toBe('/onboarding')
    expect(state.refetch).not.toHaveBeenCalled()
  })
})
