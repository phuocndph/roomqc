import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionSummary } from '@/hooks/useUserModulePermissions'

// W1-PERMISSION-MENU-20261106: after rooms:view is withdrawn, the desktop
// Sidebar and the MobileSidebar must stop exposing "Phòng / Danh sách phòng"
// as soon as the effective permission summary is re-read (mount, focus,
// reconnect, or a permission mutation invalidating it).

const state = vi.hoisted(() => ({
  role: 'staff' as string,
  roomsView: true,
  rpc: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }))
vi.mock('@/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'staff-A', full_name: 'Staff A' }, role: state.role, tenantId: 'tenant-A', isLoading: false }),
}))
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: { name: 'Tenant A' }, isLoading: false }) }))
vi.mock('@/hooks/usePendingCounts', () => ({ usePendingCounts: () => ({ data: undefined }) }))
vi.mock('@/hooks/useUsageMode', () => ({ useUsageMode: () => ({ hasMode: () => true }) }))
vi.mock('@/lib/route-prefetch', () => ({ prefetchRoute: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/assets/logo-roomqc.png', () => ({ default: 'logo.png' }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: null, isAllHotelsMode: false }) }))
vi.mock('@/hooks/usePWAInstall', () => ({ usePWAInstall: () => ({ canInstall: false, installPWA: vi.fn(), isInstalled: true }) }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/pwa/InstallGuideSheet', () => ({ InstallGuideSheet: () => null }))

import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { invalidateEffectivePermissions } from '@/hooks/useUserModulePermissions'

const summary = (): PermissionSummary[] => [{
  module: 'rooms', can_view: state.roomsView, can_create: false, can_update: false, can_delete: false,
  can_export: false, can_approve: false, can_assign: false, can_manage: false,
}]

let client: QueryClient
const renderWithClient = (ui: React.ReactNode, path = '/rooms') => render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
  </QueryClientProvider>,
)

beforeEach(() => {
  state.role = 'staff'
  state.roomsView = true
  state.rpc.mockReset()
  state.rpc.mockImplementation(async () => ({ data: summary(), error: null }))
  // Same defaults as App.tsx: a long global staleTime and no focus refetch.
  // The permission hook must override them.
  client = new QueryClient({
    defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false } },
  })
})
afterEach(() => {
  cleanup()
  client.clear()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
})

describe('desktop Sidebar permission synchronisation', () => {
  it('shows Phòng and Danh sách phòng while rooms:view is granted', async () => {
    renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()
    expect(screen.getByText('rooms')).toBeInTheDocument()
  })

  it('hides Phòng and Danh sách phòng when rooms:view is not granted', async () => {
    state.roomsView = false
    renderWithClient(<Sidebar />)
    await waitFor(() => expect(state.rpc).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('roomsList')).not.toBeInTheDocument())
    expect(screen.queryByText('rooms')).not.toBeInTheDocument()
  })

  it('removes the revoked link when the window regains focus', async () => {
    renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()

    state.roomsView = false
    act(() => { focusManager.setFocused(false) })
    act(() => { focusManager.setFocused(true) })

    await waitFor(() => expect(screen.queryByText('roomsList')).not.toBeInTheDocument())
    expect(screen.queryByText('rooms')).not.toBeInTheDocument()
  })

  it('removes the revoked link when the network reconnects', async () => {
    renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()

    state.roomsView = false
    act(() => { onlineManager.setOnline(false) })
    act(() => { onlineManager.setOnline(true) })

    await waitFor(() => expect(screen.queryByText('roomsList')).not.toBeInTheDocument())
  })

  it('re-reads permissions on remount despite the long global staleTime', async () => {
    const first = renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()
    first.unmount()

    state.roomsView = false
    renderWithClient(<Sidebar />)
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('roomsList')).not.toBeInTheDocument())
  })

  it('removes the revoked link after a staff permission change invalidates the summary', async () => {
    renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()

    state.roomsView = false
    await act(async () => { invalidateEffectivePermissions(client, 'staff-A') })

    await waitFor(() => expect(screen.queryByText('roomsList')).not.toBeInTheDocument())
  })

  it('keeps the room menu for owners regardless of the summary', async () => {
    state.role = 'owner'
    state.roomsView = false
    renderWithClient(<Sidebar />)
    expect(await screen.findByText('roomsList')).toBeInTheDocument()
  })
})

describe('MobileSidebar permission synchronisation', () => {
  it('shows Phòng for staff while rooms:view is granted', async () => {
    renderWithClient(<MobileSidebar onClose={vi.fn()} />, '/')
    expect(await screen.findByText('Phòng')).toBeInTheDocument()
  })

  it('hides Phòng for staff without rooms:view', async () => {
    state.roomsView = false
    renderWithClient(<MobileSidebar onClose={vi.fn()} />, '/')
    await waitFor(() => expect(state.rpc).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Phòng')).not.toBeInTheDocument())
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('removes Phòng when focus triggers a refetch after withdrawal', async () => {
    renderWithClient(<MobileSidebar onClose={vi.fn()} />, '/')
    expect(await screen.findByText('Phòng')).toBeInTheDocument()

    state.roomsView = false
    act(() => { focusManager.setFocused(false) })
    act(() => { focusManager.setFocused(true) })

    await waitFor(() => expect(screen.queryByText('Phòng')).not.toBeInTheDocument())
  })
})
