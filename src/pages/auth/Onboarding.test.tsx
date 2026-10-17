import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'
import { runtimeConfig } from '@/lib/runtime-config'

const state = vi.hoisted(() => ({ rpc: vi.fn(), refetch: vi.fn(), toast: vi.fn(), getSession: vi.fn(), controlRequest: vi.fn(),
  invitation: { data: null as null | { passwordReady: boolean; expired: boolean }, isLoading: false, isError: false, refetch: vi.fn() } }))
vi.mock('@/hooks/useMyStaffInvitation', () => ({ useMyStaffInvitation: () => state.invitation }))
vi.mock('@/components/auth/ResumeStaffInvitation', () => ({ ResumeStaffInvitation: () => <div>Resume invitation</div> }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc, auth: { getSession: state.getSession } } }))
vi.mock('@/lib/workspace', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/workspace')>(), controlRequest: state.controlRequest }))
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
  fireEvent.change(screen.getByPlaceholderText('VD: Khách sạn Sunrise'), { target: { value: 'Test hotel' } })
  fireEvent.change(screen.getByPlaceholderText('0901234567'), { target: { value: '0901234567' } })
  fireEvent.change(screen.getByPlaceholderText('123 Nguyễn Huệ, Q1, TP.HCM'), { target: { value: '123 Test Road' } })
  return { router, form: view.container.querySelector('form')! }
}

beforeEach(() => {
  runtimeConfig.workspace = null
  state.rpc.mockReset()
  state.controlRequest.mockReset()
  state.getSession.mockReset().mockResolvedValue({data:{session:{access_token:'owner-session'}}})
  state.refetch.mockReset().mockResolvedValue({})
  state.toast.mockReset()
  state.invitation = { data: null, isLoading: false, isError: false, refetch: vi.fn() }
})
afterEach(() => { cleanup(); runtimeConfig.workspace = null })

describe('Onboarding submission', () => {
  it('does not expose hotel creation to a pending staff invitation', () => {
    state.invitation.data = { passwordReady: true, expired: false }
    render(<MemoryRouter><Onboarding /></MemoryRouter>)
    expect(screen.getByText('Resume invitation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoàn tất thiết lập' })).not.toBeInTheDocument()
    expect(state.rpc).not.toHaveBeenCalled()
  })

  function useWorkspace() {
    runtimeConfig.workspace = {version:1, workspace:{id:'workspace',slug:'anthuy',displayName:'An Thủy',tenantId:null,status:'reserved',routingVersion:1},
      cluster:{id:'cluster-a',url:'https://example.supabase.co',publishableKey:'public',vapidPublicKey:'public'}}
  }

  it('starts with four main fields and reuses the hotel name and primary contact', async () => {
    state.rpc.mockResolvedValue({data:{success:true,tenant_id:'tenant-A',hotel_id:'hotel-A'},error:null})
    const {form}=openForm()
    expect(screen.getByText('Thông tin bổ sung (không bắt buộc)').closest('details')).not.toHaveAttribute('open')
    fireEvent.submit(form)
    await waitFor(()=>expect(state.rpc).toHaveBeenCalledOnce())
    expect(state.rpc.mock.calls[0][1]).toMatchObject({
      p_tenant_name:'Test hotel',p_hotel_name:'Test hotel',p_phone:'0901234567',
      p_hotel_phone:'0901234567',p_hotel_email:'owner@example.invalid',p_total_rooms:10,
    })
  })

  it('honors separately supplied business and hotel contact details', async () => {
    state.rpc.mockResolvedValue({data:{success:true,tenant_id:'tenant-A',hotel_id:'hotel-A'},error:null})
    const {form}=openForm()
    fireEvent.change(screen.getByLabelText('Tên công ty / đơn vị quản lý'),{target:{value:'Test company'}})
    fireEvent.change(screen.getByLabelText('Điện thoại khách sạn (nếu khác)'),{target:{value:'0282345678'}})
    fireEvent.change(screen.getByLabelText('Email khách sạn (nếu khác)'),{target:{value:'hotel@example.invalid'}})
    fireEvent.submit(form)
    await waitFor(()=>expect(state.rpc).toHaveBeenCalledOnce())
    expect(state.rpc.mock.calls[0][1]).toMatchObject({p_tenant_name:'Test company',p_hotel_phone:'0282345678',p_hotel_email:'hotel@example.invalid'})
  })

  it('opens optional details when an entered value needs correction', async () => {
    const {form}=openForm()
    fireEvent.change(screen.getByLabelText('Email khách sạn (nếu khác)'),{target:{value:'invalid-email'}})
    fireEvent.submit(form)
    await screen.findByText('Email không hợp lệ')
    expect(screen.getByText('Thông tin bổ sung (không bắt buộc)').closest('details')).toHaveAttribute('open')
    expect(state.rpc).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('VD: Khách sạn Sunrise')).toHaveValue('Test hotel')
  })

  it('uses the authenticated directory endpoint and retains fields on connection loss', async () => {
    useWorkspace()
    state.controlRequest.mockRejectedValue(new Error('Failed to fetch'))
    const { form } = openForm()
    fireEvent.submit(form)
    await waitFor(() => expect(state.controlRequest).toHaveBeenCalledOnce())
    expect(state.controlRequest.mock.calls[0][0]).toBe('/workspaces/anthuy/provision')
    expect(state.controlRequest.mock.calls[0][1].headers.Authorization).toBe('Bearer owner-session')
    expect(JSON.parse(state.controlRequest.mock.calls[0][1].body).hotelName).toBe('Test hotel')
    expect(state.rpc).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', {name:'Hoàn tất thiết lập'})).toBeEnabled())
    expect(screen.getByPlaceholderText('VD: Khách sạn Sunrise')).toHaveValue('Test hotel')
  })

  it('does not use legacy provisioning when a workspace session is missing', async () => {
    useWorkspace()
    state.getSession.mockResolvedValue({data:{session:null}})
    const { form } = openForm()
    fireEvent.submit(form)
    await waitFor(() => expect(state.toast).toHaveBeenCalled())
    expect(state.controlRequest).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
    expect(state.refetch).not.toHaveBeenCalled()
  })
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
