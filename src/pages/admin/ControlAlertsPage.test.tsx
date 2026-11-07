import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlActor, controlSession, controlOverview } from '@/test/control-admin-fixture'
import { controlAlert, controlAlertReceipt } from '@/test/control-alert-fixture'
import { ControlHttpError } from '@/lib/control-http-error'
const state = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), locked: false }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: controlSession(), user: { id: controlActor.actorId }, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin', account_locked: state.locked }, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/workspace', () => ({ controlRequest: (path: string, ...args: unknown[]) => path === '/admin/overview' ? Promise.resolve(controlOverview()) : state.request(path, ...args) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key', workspace: null } }))
import { InfrastructurePage } from './InfrastructurePage'
function Location() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="Địa chỉ hiện tại">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Lịch sử trình duyệt</button></>
}
function setup(search = '?view=alerts') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/super-admin/infrastructure' + search]}>
    <Location /><main><InfrastructurePage /></main></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); state.locked = false; state.get.mockResolvedValue({ data: { session: controlSession() }, error: null })
  state.request.mockImplementation(async () => ({ items: [controlAlert()], nextCursor: null }))
})
afterEach(() => { cleanup(); localStorage.clear() })
async function submit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Nhận xử lý' }))
  fireEvent.change(screen.getByLabelText('Ghi chú nhận xử lý'), { target: { value: 'Đang kiểm tra ổ dữ liệu' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận xử lý' }))
}
describe('infrastructure alert UI', () => {
  it('has a visible menu entry, defaults to unacknowledged alerts and uses server filters/cursors', async () => {
    state.request.mockResolvedValue({ items: [controlAlert()], nextCursor: 'next-alerts' })
    setup(); expect(screen.getByRole('button', { name: 'Cảnh báo', pressed: true })).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: 'Ổ dữ liệu gần đầy — cluster-a' })).toBeInTheDocument()
    expect(state.request).toHaveBeenCalledWith('/admin/alerts?limit=25&state=open', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Trang cảnh báo tiếp' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/alerts?limit=25&state=open&cursor=next-alerts', expect.anything()))
    fireEvent.change(screen.getByLabelText('Mức độ'), { target: { value: 'critical' } })
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/alerts?limit=25&state=open&severity=critical', expect.anything()))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('alertCursor=')
    fireEvent.change(screen.getByLabelText('Tình trạng cảnh báo'), { target: { value: '' } })
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/alerts?limit=25&severity=critical', expect.anything()))
    expect(screen.getByLabelText('Tình trạng cảnh báo')).toHaveValue('')
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('alertState=')
    expect(state.request.mock.calls.every(([path, options]) => options.method === 'GET'
      && (path.startsWith('/admin/alerts?') || path === '/admin/backups?limit=25'))).toBe(true)
  })
  it('requires a reason, posts one acknowledgement, refreshes and never offers to resolve or reopen admission', async () => {
    let acked = false
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') { acked = true; return controlAlertReceipt() }
      return { items: acked ? [] : [controlAlert()], nextCursor: null }
    })
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Nhận xử lý' }))
    expect(screen.getByRole('button', { name: 'Xác nhận nhận xử lý' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Ghi chú nhận xử lý'), { target: { value: 'Đang kiểm tra ổ dữ liệu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhận xử lý' }))
    expect(await screen.findByText(/Đã xác nhận nhận xử lý/)).toBeInTheDocument()
    expect(await screen.findByText('Không có cảnh báo phù hợp bộ lọc.')).toBeInTheDocument()
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(localStorage.length).toBe(0); expect(screen.queryByRole('button', { name: /phục hồi|mở nhận khách|đóng cảnh báo/i })).not.toBeInTheDocument()
  })
  it('preserves an unknown outcome across reload and recovers via GET without sending another mutation', async () => {
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new Error('private marker, response lost')
      return { items: [controlAlert()], nextCursor: null }
    })
    const h = setup(); await submit()
    const pending = await screen.findByRole('region', { name: 'Yêu cầu nhận xử lý đang chờ' })
    expect(within(pending).getByText(/Đang kiểm tra ổ dữ liệu/)).toBeInTheDocument()
    const body = state.request.mock.calls.find(([, options]) => options.method === 'POST')![1]
    h.unmount(); state.request.mockImplementation(async (path: string) => path.endsWith('/acknowledgement-result')
      ? controlAlertReceipt() : { items: [], nextCursor: null })
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra kết quả' }))
    expect(await screen.findByText(/Đã xác nhận nhận xử lý/)).toBeInTheDocument()
    expect(state.request).toHaveBeenCalledWith('/admin/alerts/' + controlAlert().id + '/acknowledgement-result', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ 'Idempotency-Key': body.headers['Idempotency-Key'] }),
    }))
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(localStorage.length).toBe(0); expect(screen.queryByText(/private marker/)).not.toBeInTheDocument()
  })
  it('separates absence from success and exposes only retry of the same saved request', async () => {
    state.request.mockImplementation(async (path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new Error('network')
      if (path.endsWith('/acknowledgement-result')) throw new ControlHttpError(404, { error: 'ALERT_COMMAND_RESULT_UNKNOWN' })
      return { items: [controlAlert()], nextCursor: null }
    })
    setup(); await submit(); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra kết quả' }))
    expect(await screen.findByRole('button', { name: 'Gửi lại cùng yêu cầu' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đóng yêu cầu và tải lại' })).not.toBeInTheDocument()
    const first = state.request.mock.calls.find(([, options]) => options.method === 'POST')![1]
    state.request.mockImplementation(async (path: string, options: RequestInit) => {
      if (options.method === 'POST') return controlAlertReceipt()
      if (path.endsWith('/acknowledgement-result')) throw new ControlHttpError(404, { error: 'ALERT_COMMAND_RESULT_UNKNOWN' })
      return { items: [], nextCursor: null }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại cùng yêu cầu' }))
    await screen.findByText(/Đã xác nhận nhận xử lý/)
    const last = state.request.mock.calls.filter(([, options]) => options.method === 'POST').at(-1)![1]
    expect(last.body).toBe(first.body); expect(last.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key'])
  })
  it('offers dismissal after version rejection and reloads without replaying a mutation', async () => {
    state.request.mockImplementation(async (_path: string, options: RequestInit) => {
      if (options.method === 'POST') throw new ControlHttpError(409, { error: 'VERSION_CONFLICT' })
      return { items: [controlAlert()], nextCursor: null }
    })
    setup(); await submit(); fireEvent.click(await screen.findByRole('button', { name: 'Đóng yêu cầu và tải lại' }))
    await waitFor(() => expect(localStorage.length).toBe(0))
    expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Nhận xử lý' })).toBeInTheDocument()
  })
  it('keeps acknowledged/resolved lifecycle labels read-only and reports errors instead of an empty healthy list', async () => {
    state.request.mockResolvedValue({ items: [controlAlertReceipt().result], nextCursor: null })
    setup('?view=alerts&alertState=acknowledged'); await screen.findByRole('article', { name: 'Ổ dữ liệu gần đầy — cluster-a' })
    expect(within(screen.getByRole('article')).getByText('Đã nhận xử lý')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nhận xử lý' })).not.toBeInTheDocument()
    state.request.mockRejectedValueOnce(new Error('private response details'))
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại cảnh báo' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private response details')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
  it('restores filter and scroll after cursor history navigation', async () => {
    state.request.mockImplementation(async (path: string) => ({ items: [controlAlert({ type: path.includes('cursor=next-page') ? 'INODE_LOW' : 'DISK_CRITICAL' })], nextCursor: 'next-page' }))
    setup('?view=alerts&alertState=open&alertSeverity=critical')
    await screen.findByRole('article', { name: 'Ổ dữ liệu gần đầy — cluster-a' }); const main = screen.getByRole('main')
    main.scrollTop = 850; fireEvent.scroll(main)
    fireEvent.click(screen.getByRole('button', { name: 'Trang cảnh báo tiếp' }))
    await screen.findByRole('article', { name: 'Số tệp tăng cao — cluster-a' }); expect(main.scrollTop).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử trình duyệt' }))
    await screen.findByRole('article', { name: 'Ổ dữ liệu gần đầy — cluster-a' })
    await waitFor(() => expect(main.scrollTop).toBe(850)); expect(screen.getByLabelText('Mức độ')).toHaveValue('critical')
  })
})
