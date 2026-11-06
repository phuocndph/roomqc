import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlActor, controlSession, registrationId, controlTenantSummary } from '@/test/control-admin-fixture'
import { controlRecheckDetail, controlRecheckReceipt, recheckKey } from '@/test/control-recheck-fixture'
const state = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), detail: null as ReturnType<typeof controlRecheckDetail> | null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: controlSession(), user: { id: controlActor.actorId }, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin' }, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key-a', workspace: null } }))
vi.mock('@/lib/workspace', () => ({ controlRequest: state.request }))
import { RegistrationsPage } from './RegistrationsPage'
function setup(detail = true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/super-admin/registrations' + (detail ? '?workspace=' + registrationId : '')]}>
    <main><RegistrationsPage /></main></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); vi.spyOn(crypto, 'randomUUID').mockReturnValue(recheckKey)
  state.detail = controlRecheckDetail(); state.detail.workspace.status = 'provisioning'
  state.detail.workspace.tenantId = null; state.detail.workspace.hotelId = null; state.detail.receipt = { status: 'missing' }
  state.get.mockResolvedValue({ data: { session: controlSession() }, error: null })
  state.request.mockImplementation(async (path: string, options: RequestInit) => options.method === 'POST' || path.endsWith('/recheck-result') ? controlRecheckReceipt()
    : path.endsWith('/tenant-summary') ? controlTenantSummary({ tenantId: null, status: 'unavailable', observedAt: null, tenant: null, errorCode: 'TENANT_SUMMARY_UNBOUND' })
    : path.startsWith('/admin/workspaces?') ? { items: [state.detail!.workspace], nextCursor: null } : state.detail)
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
async function submit() {
  const start = await screen.findByRole('button', { name: 'Kiểm tra lại' }); await waitFor(() => expect(start).toBeEnabled()); fireEvent.click(start)
  expect(screen.getByRole('button', { name: 'Xác nhận kiểm tra' })).toBeDisabled()
  const reason = screen.getByLabelText('Lý do kiểm tra lại'); expect(reason).toHaveFocus()
  fireEvent.change(reason, { target: { value: 'Kiểm tra kết quả khách đang chờ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kiểm tra' }))
}
describe('workspace recheck path in registrations', () => {
  it('requires confirmation and reason, shows queued work separately from active status and refreshes detail', async () => {
    setup(); await submit(); await screen.findByText('Đã có công việc đối soát. Hệ thống tiếp tục xử lý công việc hiện có.')
    await waitFor(() => expect(localStorage.length).toBe(0))
    const posts = state.request.mock.calls.filter(([, options]) => options.method === 'POST'); expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0][1].body)).toMatchObject({ expectedVersion: 1, expectedSnapshotSha256: 'a'.repeat(64), reason: 'Kiểm tra kết quả khách đang chờ' })
    expect(screen.getByText('Đang cấp dữ liệu')).toBeInTheDocument()
    await waitFor(() => expect(state.request.mock.calls.filter(([path]) => path.startsWith('/admin/workspaces/' + registrationId + '?')).length).toBeGreaterThan(1))
  })
  it('keeps lost-response intent reachable from the list after remount and recovers with GET only', async () => {
    state.request.mockImplementation(async (path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new Error('private provider marker')
      if (path.endsWith('/recheck-result')) return controlRecheckReceipt()
      return path.startsWith('/admin/workspaces?') ? { items: [state.detail!.workspace], nextCursor: null } : state.detail
    })
    const first = setup(); await submit(); await screen.findByRole('button', { name: 'Kiểm tra kết quả' }); first.unmount()
    setup(false); fireEvent.click(await screen.findByRole('button', { name: 'Mở đăng ký chờ xác nhận' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra kết quả' }))
    await screen.findByText('Đã có công việc đối soát. Hệ thống tiếp tục xử lý công việc hiện có.')
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(localStorage.length).toBe(0); expect(screen.queryByText(/private provider/)).not.toBeInTheDocument()
  })
  it('does not offer a new command without a current fingerprint', async () => {
    state.detail!.recheck = null; setup()
    expect(await screen.findByRole('button', { name: 'Kiểm tra lại' })).toBeDisabled()
    expect(state.request.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
  })
})
