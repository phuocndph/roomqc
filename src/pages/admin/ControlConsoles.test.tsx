import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlActor, controlCluster, controlSession, controlWorkspace, controlWorkspaceDetail, registrationId, controlBackup, controlBackupPage, controlTenantSummary, controlDeployment, controlOverview } from '@/test/control-admin-fixture'
const state = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), overview: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: controlSession(), user: { id: controlActor.actorId }, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin' }, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/workspace', () => ({ controlRequest: (path: string, ...args: unknown[]) => path === '/admin/overview' ? state.overview(path, ...args) : state.request(path, ...args) }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key', workspace: null } }))
import { InfrastructurePage } from './InfrastructurePage'
import { RegistrationsPage } from './RegistrationsPage'
function Location() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="Địa chỉ hiện tại">{location.pathname + location.search}</output><button onClick={() => navigate(-1)}>Lịch sử trình duyệt</button></>
}
function setup(page: 'infrastructure' | 'registrations', search = '') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/super-admin/' + page + search]}>
    <Location /><main>{page === 'infrastructure' ? <InfrastructurePage /> : <RegistrationsPage />}</main>
  </MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks(); state.get.mockResolvedValue({ data: { session: controlSession() }, error: null })
  state.overview.mockResolvedValue(controlOverview())
  state.request.mockImplementation(async (path: string) => path === '/admin/overview' ? controlOverview() : path.endsWith('/tenant-summary') ? controlTenantSummary() : path.startsWith('/admin/workspaces/' + registrationId)
    ? controlWorkspaceDetail() : path.startsWith('/admin/workspaces?') ? { items: [controlWorkspace()], nextCursor: null }
      : path.startsWith('/admin/backups?') ? controlBackupPage() : path === '/admin/clusters/local-a' ? controlCluster() : { items: [controlCluster()], nextCursor: null })
})
afterEach(() => { cleanup(); vi.useRealTimers() })
describe('control consoles navigation and real client wiring', () => {
  it('returns from a summary issue to the exact source section and filters', async () => {
    setup('infrastructure', '?view=backups&backupCluster=local-a&backupScope=bundle')
    fireEvent.click(await screen.findByRole('link', { name: 'Kiểm tra local-a' }))
    await screen.findByRole('region', { name: 'Chi tiết cụm local-a' })
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách sao lưu' }))
    await screen.findByRole('region', { name: 'Lịch sử sao lưu' })
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('backupCluster=local-a&backupScope=bundle&view=backups')
    expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('returnView=')
  })
  it('switches to the cluster list rather than a hidden previous cluster and retains list filters', async () => {
    state.request.mockImplementation(async (path: string) => path.startsWith('/admin/hosts?') ? { items: [], nextCursor: null }
      : path.startsWith('/admin/backups?') ? controlBackupPage() : { items: [controlCluster()], nextCursor: null })
    setup('infrastructure', '?view=hosts&cluster=local-a&returnView=hosts&hostEnvironment=staging&status=active&cursor=page-a')
    await screen.findByText('Chưa có máy chủ được ghi nhận phù hợp bộ lọc.')
    fireEvent.click(screen.getByRole('button', { name: 'Cụm dữ liệu' }))
    await screen.findByRole('button', { name: 'Xem cụm local-a' })
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('hostEnvironment=staging&status=active&cursor=page-a')
    expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('cluster=')
    expect(screen.queryByRole('region', { name: 'Chi tiết cụm local-a' })).not.toBeInTheDocument()
  })
  it('shows reconciliation separately from the original uncertain result and removes the unresolved warning', async () => {
    state.request.mockResolvedValue({ items: [controlDeployment({ resolution: { id: registrationId, outcome: 'candidate_healthy',
      currentReleaseId: 'release-demo', evidenceSha256: 'b'.repeat(64), observedAt: '2026-10-31T00:02:00Z', recordedAt: '2026-10-31T00:02:01Z' } })], nextCursor: null })
    setup('infrastructure', '?view=deployments')
    const record = await screen.findByRole('article', { name: 'Lần triển khai ' + registrationId })
    expect(record).toHaveTextContent('Đã đối soát kết quả'); expect(record).toHaveTextContent('Đối soát xác nhận bản mới chạy tốt tại thời điểm kiểm tra.')
    expect(within(record).queryByRole('alert')).not.toBeInTheDocument()
    expect(record).toHaveTextContent('Kết quả ban đầu'); expect(record).toHaveTextContent('Chưa xác nhận kết quả')
  })
  it('opens deployment history, preserves filters on paging and explains uncertain results without a deploy button', async () => {
    state.request.mockResolvedValue({ items: [controlDeployment()], nextCursor: 'next-deploy' })
    setup('infrastructure', '?view=deployments&deployCluster=local-a&deployState=outcome_unknown')
    const record = await screen.findByRole('article', { name: 'Lần triển khai ' + registrationId })
    expect(record).toHaveTextContent('Chưa xác nhận kết quả')
    expect(record).toHaveTextContent('Hệ thống chặn lượt mới trên cụm này')
    expect(screen.queryByRole('button', { name: 'Thêm cụm đã chuẩn bị' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Trang triển khai tiếp' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/deployments?limit=25&clusterId=local-a&state=outcome_unknown&cursor=next-deploy', expect.anything()))
    expect(screen.getByLabelText('Tình trạng triển khai')).toHaveValue('outcome_unknown')
  })
  it('keeps a running deployment unconfirmed and does not present an API error as empty history', async () => {
    state.request.mockResolvedValue({ items: [controlDeployment({ state: 'running', phase: 'start_release', finishedAt: null })], nextCursor: null })
    setup('infrastructure', '?view=deployments')
    expect(await screen.findByRole('article', { name: 'Lần triển khai ' + registrationId })).toHaveTextContent('Chưa có kết quả cuối')
    state.request.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại triển khai' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Lần triển khai ' + registrationId })).not.toBeInTheDocument())
    expect(screen.queryByText('Chưa có lượt triển khai được ghi nhận phù hợp bộ lọc.')).not.toBeInTheDocument()
  })
  it('opens registered VPS and returns from its cluster without losing the VPS filter', async () => {
    const host = { id: 'host-a', name: 'VPS thử nghiệm', providerLabel: 'Contabo', region: 'SG', environment: 'local', status: 'active',
      rowVersion: 1, createdAt: '2026-10-30T00:00:00Z', preflight: null, preflightReady: true, resources: null,
      cluster: controlCluster({ hostId: 'host-a' }) }
    state.request.mockImplementation(async (path: string) => path.startsWith('/admin/hosts?') ? { items: [host], nextCursor: null } : host.cluster)
    setup('infrastructure', '?view=hosts&hostEnvironment=local')
    expect(await screen.findByRole('article', { name: 'Máy chủ host-a' })).toHaveTextContent('Contabo')
    fireEvent.click(screen.getByRole('button', { name: 'Xem cụm local-a' }))
    await screen.findByRole('region', { name: 'Chi tiết cụm local-a' })
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách máy chủ' }))
    await screen.findByRole('article', { name: 'Máy chủ host-a' })
    expect(screen.getByLabelText('Môi trường máy chủ')).toHaveValue('local')
    expect(screen.getByRole('button', { name: 'Máy chủ VPS' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('adds only an approved candidate, starts with closed pending state and refreshes the actual lists', async () => {
    const candidate = { id: 'local-b', hostId: 'host-b', hostName: 'VPS B', environment: 'local', region: null, providerLabel: null,
      backendKind: 'self_hosted', endpointRef: 'local-b', credentialRef: 'cred-b', credentialConfigured: false, preflightReady: true }
    let added = false
    state.request.mockImplementation(async (path: string, options: RequestInit) => {
      if (path === '/admin/clusters/register') {
        const body = JSON.parse(String(options.body))
        expect(body).toMatchObject({ id: candidate.id, hostId: candidate.hostId, endpointRef: candidate.id, credentialRef: candidate.credentialRef, expectedVersion: 1 })
        expect(options.headers).toHaveProperty('Idempotency-Key')
        added = true
        return { commandId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'succeeded', targetVersion: 1,
          result: controlCluster({ id: 'local-b', hostId: 'host-b', rowVersion: 1, validationState: 'pending', allocatedCount: 0, tenantLimit: 1 }) }
      }
      if (path.startsWith('/admin/cluster-candidates?')) return { items: added ? [] : [candidate], nextCursor: null }
      return { items: [], nextCursor: null }
    })
    setup('infrastructure', '?view=hosts')
    await screen.findByText('Chưa có máy chủ được ghi nhận phù hợp bộ lọc.')
    fireEvent.click(screen.getByRole('button', { name: 'Thêm cụm đã chuẩn bị' }))
    fireEvent.click(await screen.findByRole('button', { name: 'VPS B · local-b' }))
    expect(await screen.findByText(/Chưa có cấu hình kết nối bảo mật/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác nhận thêm cụm' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lý do thêm cụm'), { target: { value: 'Ghi nhận cụm thử nghiệm đã chuẩn bị' } })
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thêm cụm' }))
    await screen.findByText('Chưa có cụm mới được duyệt để thêm. Cần chuẩn bị kết nối và cấu hình máy chủ trước.')
    expect(added).toBe(true)
    expect(state.request.mock.calls.filter(([path]) => path === '/admin/clusters/register')).toHaveLength(1)
  })
  it('does not misreport a failed VPS read as an empty server inventory', async () => {
    state.request.mockRejectedValue(new Error('private-marker'))
    setup('infrastructure', '?view=hosts')
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('private-marker')
    expect(screen.queryByText('Chưa có máy chủ được ghi nhận phù hợp bộ lọc.')).not.toBeInTheDocument()
  })
  it('shows actual zero counts and replaces them with unknown on summary refresh failure, then retries', async () => {
    setup('registrations', '?workspace=' + registrationId)
    const summary = await screen.findByRole('region', { name: 'Tổng quan doanh nghiệp' })
    await within(summary).findByText('Doanh nghiệp Demo')
    expect(within(summary).getAllByText('0')).toHaveLength(2)
    state.request.mockImplementation(async (path: string) => path.endsWith('/tenant-summary')
      ? controlTenantSummary({ status: 'unavailable', observedAt: null, tenant: null, errorCode: 'TENANT_SUMMARY_UNAVAILABLE' }) : controlWorkspaceDetail())
    fireEvent.click(within(summary).getByRole('button', { name: 'Tải lại tổng quan' }))
    await within(summary).findByText(/Chưa xác định số liệu/)
    expect(within(summary).queryByText('0')).not.toBeInTheDocument()
    expect(within(summary).queryByText('Doanh nghiệp Demo')).not.toBeInTheDocument()
    state.request.mockImplementation(async (path: string) => path.endsWith('/tenant-summary') ? controlTenantSummary() : controlWorkspaceDetail())
    fireEvent.click(within(summary).getByRole('button', { name: 'Tải lại tổng quan' }))
    await within(summary).findByText('Doanh nghiệp Demo')
  })
  it('discards summary data from another cluster and does not show its counts or name', async () => {
    state.request.mockImplementation(async (path: string) => path.endsWith('/tenant-summary') ? controlTenantSummary({ clusterId: 'other-cluster' }) : controlWorkspaceDetail())
    setup('registrations', '?workspace=' + registrationId)
    const summary = await screen.findByRole('region', { name: 'Tổng quan doanh nghiệp' })
    await within(summary).findByRole('alert')
    expect(within(summary).queryByText('Doanh nghiệp Demo')).not.toBeInTheDocument()
  })
  it('reaches backups from infrastructure and returns to the previous cluster view without losing its filters', async () => {
    setup('infrastructure', '?status=active&cursor=page-a')
    await screen.findByRole('button', { name: 'Xem cụm local-a' })
    fireEvent.click(screen.getByRole('button', { name: 'Sao lưu' }))
    expect(await screen.findByText('Chưa ghi nhận thử khôi phục')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xem cụm local-a' })).not.toBeInTheDocument()
    expect(screen.queryByText('Đang nhận khách mới')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cụm dữ liệu' }))
    await screen.findByRole('button', { name: 'Xem cụm local-a' })
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('?status=active&cursor=page-a')
  })
  it('shows the server total, keeps failed and untested backups visible, and follows its cursor', async () => {
    state.request.mockResolvedValue(controlBackupPage({ total: 1005, nextCursor: 'next-page', items: [controlBackup({ verificationState: 'failed', completedAt: null })] }))
    setup('infrastructure', '?view=backups&backupCluster=local-a')
    const card = await screen.findByRole('article', { name: 'Bản sao lưu bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    expect(within(card).getByText('Kiểm tra thất bại')).toBeInTheDocument()
    expect(within(card).getByText('Chưa ghi nhận hoàn tất')).toBeInTheDocument()
    expect(screen.getByText(/Có 1.005 bản ghi phù hợp/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Trang sao lưu tiếp' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/backups?limit=25&clusterId=local-a&cursor=next-page', expect.anything()))
    fireEvent.change(screen.getByLabelText('Loại sao lưu'), { target: { value: 'objects' } })
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/backups?limit=25&clusterId=local-a&scope=objects', expect.anything()))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('backupCursor=')
  })
  it('does not display a read failure as no backups and hides previously loaded metadata until retry succeeds', async () => {
    setup('infrastructure', '?view=backups')
    await screen.findByText('Chưa ghi nhận thử khôi phục')
    state.request.mockRejectedValueOnce(new Error('private-marker'))
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại sao lưu' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private-marker')
    expect(screen.queryByText('Chưa ghi nhận thử khôi phục')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có bản sao lưu được ghi nhận phù hợp bộ lọc.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }))
    expect(await screen.findByText('Chưa ghi nhận thử khôi phục')).toBeInTheDocument()
  })
  it('distinguishes an empty recorded history and restores the cluster filter through browser Back', async () => {
    state.request.mockResolvedValue(controlBackupPage({ items: [], total: 0 }))
    setup('infrastructure', '?view=backups&backupCluster=local-a&backupCursor=old-page')
    await screen.findByText('Chưa có bản sao lưu được ghi nhận phù hợp bộ lọc.')
    fireEvent.change(screen.getByLabelText('Mã cụm'), { target: { value: 'local-b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lọc theo cụm' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/backups?limit=25&clusterId=local-b', expect.anything()))
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử trình duyệt' }))
    await waitFor(() => expect(screen.getByLabelText('Mã cụm')).toHaveValue('local-a'))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('backupCursor=old-page')
  })
  it('opens a cluster from the server list and distinguishes unknown metrics from zero', async () => {
    setup('infrastructure')
    fireEvent.click(await screen.findByRole('button', { name: 'Xem cụm local-a' }))
    expect(await screen.findByRole('region', { name: 'Chi tiết cụm local-a' })).toBeInTheDocument()
    expect(screen.getByText('Chưa có số đo')).toBeInTheDocument(); expect(screen.queryByText('0%')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách cụm' }))
    expect(await screen.findByRole('button', { name: 'Xem cụm local-a' })).toBeInTheDocument()
  })
  it('does not claim admission is open from a missing health snapshot', async () => {
    state.request.mockResolvedValue({ items: [controlCluster({ admission: { decision: 'open', reasonCodes: [],
      policyVersion: 1, evaluatedAt: '2026-10-28T00:00:00Z', healthGeneration: null } })], nextCursor: null })
    setup('infrastructure'); expect(await screen.findByText('Cần tải lại số đo')).toBeInTheDocument()
    expect(screen.queryByText('Đang nhận khách mới')).not.toBeInTheDocument()
  })
  it('updates expired health without waiting for another server request', async () => {
    const now = Date.now(), health = { status: 'healthy', observedAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(),
      validUntil: new Date(now + 500).toISOString(), generation: 1, schemaVersion: 1, measurementScope: null, dataDisks: null, reasonCodes: [],
      metrics: { cpuUsedPercent: 10, memoryAvailableBytes: 50, memoryTotalBytes: 100, dataDiskFreeBytes: 50, dataDiskTotalBytes: 100,
        dataDiskInodeFreePercent: 50, dbConnectionsUsed: 1, dbConnectionBudget: 10 } }
    state.request.mockResolvedValue({ items: [controlCluster({ health, admission: { decision: 'open', reasonCodes: [], policyVersion: 1,
      evaluatedAt: new Date(now).toISOString(), healthGeneration: 1 } })], nextCursor: null })
    setup('infrastructure'); expect(await screen.findByText('Đang nhận khách mới')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Cần tải lại số đo')).toBeInTheDocument(), { timeout: 1500 })
    expect(state.request.mock.calls.filter(([path]) => path.startsWith('/admin/clusters?'))).toHaveLength(1)
  })
  it('sends search to the server, keeps filters through detail and returns to the same list', async () => {
    setup('registrations', '?status=active&search=Demo&clusterId=local-a&cursor=page-a')
    fireEvent.click(await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' }))
    expect(await screen.findByRole('region', { name: 'Chi tiết đăng ký demo-hotel' })).toBeInTheDocument()
    expect(screen.getByText('Đã đối soát khớp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách đăng ký' }))
    expect(await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('?status=active&search=Demo&clusterId=local-a&cursor=page-a')
    fireEvent.change(screen.getByLabelText('Tên, địa chỉ doanh nghiệp hoặc mã yêu cầu'), { target: { value: 'A & B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/workspaces?limit=25&status=active&search=A+%26+B&clusterId=local-a', expect.anything()))
    expect(screen.getByLabelText('Địa chỉ hiện tại')).not.toHaveTextContent('cursor=')
  })
  it('shows the authoritative global signup state instead of inferring it from one registration page', async () => {
    state.overview.mockResolvedValue(controlOverview({
      admissionOpenCount: 1, staleClusterIds: [], signup: { enabled: true, setupDispatchEnabled: true, state: 'open', openClusterCount: 1,
        availableWorkspaceSlots: 19, reasonCodes: [] },
    }))
    setup('registrations')
    const status = await screen.findByRole('region', { name: 'Trạng thái đăng ký mới' })
    await within(status).findByText('Đang nhận đăng ký mới')
    expect(status).toHaveTextContent('1 cụm đang mở · còn 19 chỗ cấp khách sạn mới.')
    expect(status).not.toHaveTextContent('SIGNUP_CLOSED_CONFIG')
  })
  it('does not present an old signup observation as a current open state', async () => {
    state.overview.mockResolvedValue(controlOverview({ asOf: new Date(Date.now() - 31_000).toISOString(),
      admissionOpenCount: 1, staleClusterIds: [], signup: { enabled: true, setupDispatchEnabled: true, state: 'open', openClusterCount: 1,
        availableWorkspaceSlots: 19, reasonCodes: [] } }))
    setup('registrations')
    const status = await screen.findByRole('region', { name: 'Trạng thái đăng ký mới' })
    await within(status).findByText('Trạng thái cần được cập nhật. Hãy tải lại để kiểm tra.')
    expect(status).not.toHaveTextContent('Đang nhận đăng ký mới')
  })
  it('hides an old open signup state during refresh and after failure, then recovers to closed', async () => {
    state.overview.mockResolvedValue(controlOverview({ admissionOpenCount: 1, staleClusterIds: [], signup: { enabled: true,
      setupDispatchEnabled: true, state: 'open', openClusterCount: 1, availableWorkspaceSlots: 19, reasonCodes: [] } }))
    setup('registrations')
    const status = await screen.findByRole('region', { name: 'Trạng thái đăng ký mới' })
    await within(status).findByText('Đang nhận đăng ký mới')
    let fail: (error: Error) => void = () => undefined
    state.overview.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
    fireEvent.click(within(status).getByRole('button', { name: 'Tải lại trạng thái' }))
    await within(status).findByText('Đang kiểm tra trạng thái đăng ký…')
    expect(status).not.toHaveTextContent('Đang nhận đăng ký mới')
    await waitFor(() => expect(state.overview).toHaveBeenCalledTimes(2))
    fail(new Error('private-secret'))
    expect(await within(status).findByRole('alert')).not.toHaveTextContent('private-secret')
    state.overview.mockResolvedValue(controlOverview())
    fireEvent.click(within(status).getByRole('button', { name: 'Tải lại trạng thái' }))
    await within(status).findByText('Đang đóng đăng ký mới')
  })
  it('follows the server cursor rather than paginating the loaded rows', async () => {
    state.request.mockResolvedValue({ items: [controlWorkspace()], nextCursor: 'next-page' })
    setup('registrations'); fireEvent.click(await screen.findByRole('button', { name: 'Trang tiếp' }))
    await waitFor(() => expect(state.request).toHaveBeenCalledWith('/admin/workspaces?limit=25&cursor=next-page', expect.anything()))
    expect(await screen.findByRole('button', { name: 'Về trang đầu' })).toBeInTheDocument()
  })
  it('separates unavailable receipt from missing data and never offers duplicate provisioning', async () => {
    const data = controlWorkspaceDetail(); data.receipt.status = 'unavailable'
    state.request.mockResolvedValue(data)
    setup('registrations', '?workspace=' + registrationId)
    expect(await screen.findByText('Chưa kết nối được cụm — chưa xác định kết quả')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /tạo lại/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Khách có thể tiếp tục sử dụng không gian đã cấp.')).not.toBeInTheDocument()
  })
  it('hides the old list after refresh fails and allows an explicit retry', async () => {
    setup('registrations'); await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' })
    state.request.mockRejectedValueOnce(new Error('private details'))
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private details')
    expect(screen.queryByRole('button', { name: 'Xem đăng ký demo-hotel' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }))
    expect(await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' })).toBeInTheDocument()
  })
  it('restores the search field as the URL changes through browser history', async () => {
    setup('registrations', '?search=Old'); await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' })
    fireEvent.change(screen.getByLabelText('Tên, địa chỉ doanh nghiệp hoặc mã yêu cầu'), { target: { value: 'New' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }))
    await waitFor(() => expect(screen.getByLabelText('Địa chỉ hiện tại')).toHaveTextContent('search=New'))
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử trình duyệt' }))
    await waitFor(() => expect(screen.getByLabelText('Tên, địa chỉ doanh nghiệp hoặc mã yêu cầu')).toHaveValue('Old'))
  })
  it('starts detail at the top and restores list scroll after its rows load', async () => {
    setup('registrations', '?status=active&cursor=page-a')
    const open = await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' }), main = screen.getByRole('main')
    main.scrollTop = 1200; fireEvent.scroll(main)
    fireEvent.click(open); await screen.findByRole('region', { name: 'Chi tiết đăng ký demo-hotel' })
    expect(main.scrollTop).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại danh sách đăng ký' }))
    await screen.findByRole('button', { name: 'Xem đăng ký demo-hotel' }); expect(main.scrollTop).toBe(1200)
  })
})
