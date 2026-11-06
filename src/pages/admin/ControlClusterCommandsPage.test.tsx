import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlActor, controlSession, controlCluster, controlOverview } from '@/test/control-admin-fixture'
import { controlClusterReceipt, freshControlCluster } from '@/test/control-cluster-fixture'
import { ControlHttpError } from '@/lib/control-http-error'
const state = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), cluster: null as ReturnType<typeof controlCluster> | null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: controlSession(), user: { id: controlActor.actorId }, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin' }, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/workspace', () => ({ controlRequest: (path: string, ...args: unknown[]) => path === '/admin/overview' ? Promise.resolve(controlOverview()) : state.request(path, ...args) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key', workspace: null } }))
import { InfrastructurePage } from './InfrastructurePage'
function setup(search = '?cluster=local-a') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/super-admin/infrastructure' + search]}><main><InfrastructurePage /></main></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); state.cluster = controlCluster()
  state.get.mockResolvedValue({ data: { session: controlSession() }, error: null })
  state.request.mockImplementation(async (path: string) => path === '/admin/clusters/local-a' ? state.cluster : { items: [state.cluster], nextCursor: null })
})
afterEach(() => { cleanup(); localStorage.clear() })
async function submit(label = 'Đóng nhận khách mới') {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  fireEvent.change(screen.getByLabelText('Lý do thao tác cụm'), { target: { value: 'Tạm đóng cụm để kiểm tra' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thao tác cụm' }))
}
describe('cluster operational UI', () => {
  it('keeps close/drain usable with unknown health, disables opening and requires an explicit reason', async () => {
    setup(); expect(await screen.findByRole('button', { name: 'Đóng nhận khách mới' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Bắt đầu rút tải' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Mở nhận khách mới' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng nhận khách mới' }))
    expect(screen.getByRole('button', { name: 'Xác nhận thao tác cụm' })).toBeDisabled()
    expect(screen.getByText(/Khách đang sử dụng giữ nguyên cụm và dữ liệu/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hủy thao tác' }))
    expect(state.request.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true)
  })
  it.each([['Đóng nhận khách mới', 'close_admission'], ['Bắt đầu rút tải', 'set_draining'], ['Chuyển sang hoạt động', 'set_serving']])('confirms %s and refreshes detail without reopening from a receipt', async (label, operation) => {
    if (operation === 'set_serving') state.cluster = controlCluster({ status: 'draining' })
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') { const receipt = controlClusterReceipt(operation as 'close_admission'); state.cluster = receipt.result; return receipt }
      return state.cluster
    })
    setup(); await submit(label); expect(await screen.findByText(/Máy chủ đã xác nhận lệnh/)).toBeInTheDocument()
    await waitFor(() => expect(localStorage.length).toBe(0))
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    const sent = JSON.parse(state.request.mock.calls.find(([, options]) => options.method === 'POST')![1].body)
    expect(sent.operation).toBe(operation); expect(sent.expectedVersion).toBe(1); expect(sent.payload).toEqual({})
    expect(await screen.findByRole('button', { name: 'Mở nhận khách mới' })).toBeDisabled()
  })
  it('validates a workspace limit and preserves the effect warning in the confirmation step', async () => {
    state.request.mockImplementation(async (_path: string, options: RequestInit) => options.method === 'POST' ? controlClusterReceipt('update_policy') : state.cluster)
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Đổi giới hạn không gian' }))
    expect(screen.getByText(/Không thay ngưỡng giám sát hoặc xóa khách đã cấp/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Lý do thao tác cụm'), { target: { value: 'Tăng giới hạn sau kiểm thử' } })
    fireEvent.change(screen.getByLabelText('Giới hạn workspace mới'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Xác nhận thao tác cụm' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Giới hạn workspace mới'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thao tác cụm' }))
    await screen.findByText(/Máy chủ đã xác nhận lệnh/)
    const sent = JSON.parse(state.request.mock.calls.find(([, options]) => options.method === 'POST')![1].body)
    expect(sent.payload).toEqual({ tenantLimit: 15 }); expect(sent.operation).toBe('update_policy')
  })
  it('shows unknown commands on the list after remount and recovers only with GET, keeping current cluster state', async () => {
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new Error('lost response private marker')
      return state.cluster
    })
    const first = setup(); await submit(); await screen.findByRole('region', { name: 'Lệnh cụm cần xác nhận' }); first.unmount()
    state.request.mockImplementation(async (path: string) => path.includes('/command-result?') ? controlClusterReceipt()
      : { items: [state.cluster], nextCursor: null })
    setup(''); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra kết quả lệnh' }))
    await screen.findByText(/Máy chủ đã xác nhận lệnh/)
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(localStorage.length).toBe(0); expect(screen.queryByText(/private marker/)).not.toBeInTheDocument()
    expect(screen.getByText(/Kết quả ghi nhận thời điểm xử lý/)).toBeInTheDocument()
  })
  it('lets the server reject opening after a fresh snapshot and permits dismissal only for that serialized rejection', async () => {
    state.cluster = freshControlCluster()
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new ControlHttpError(409, { error: 'ADMISSION_BLOCKED', message: 'private details' })
      return state.cluster
    })
    setup(); await submit('Mở nhận khách mới')
    expect(await screen.findByRole('button', { name: 'Đóng yêu cầu và tải lại cụm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gửi lại cùng lệnh' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).not.toHaveTextContent('private details')
    fireEvent.click(screen.getByRole('button', { name: 'Đóng yêu cầu và tải lại cụm' }))
    await waitFor(() => expect(localStorage.length).toBe(0))
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
  })
})
