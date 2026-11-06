import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { controlActor, controlCluster, controlSession, registrationId } from '@/test/control-admin-fixture'
const state = vi.hoisted(() => ({ request: vi.fn(), get: vi.fn(), specs: [] as unknown[], jobs: [] as unknown[], runs: [] as unknown[], closed: true, lost: false }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: controlSession(), user: { id: controlActor.actorId }, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin' }, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/workspace', () => ({ controlRequest: state.request }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: { supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key', workspace: null } }))
import { InfrastructurePage } from './InfrastructurePage'
const snapshot = (version = 1) => controlCluster({ rowVersion: version, admission: { decision: state.closed ? 'manual_closed' : 'open', reasonCodes: [], policyVersion: 1, healthGeneration: null, evaluatedAt: new Date().toISOString() } })
function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/super-admin/infrastructure?view=deployments']}><InfrastructurePage /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); state.closed = true; state.lost = false; state.jobs = []; state.runs = []
  state.specs = [{ id: registrationId, clusterId: 'local-a', hostId: 'host-a', environment: 'local', releaseId: 'release-test',
    composeSha256: 'a'.repeat(64), executionSha256: 'b'.repeat(64), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() }]
  state.get.mockResolvedValue({ data: { session: controlSession() }, error: null })
  state.request.mockImplementation(async (path: string, options: RequestInit) => {
    if (options.method === 'POST') {
      if (state.lost) throw new Error('lost private response')
      return { commandId: registrationId, status: 'succeeded', targetVersion: 2, result: snapshot(2) }
    }
    if (path.includes('/command-result?')) return { commandId: registrationId, status: 'succeeded', targetVersion: 2, result: snapshot(2) }
    if (path.startsWith('/admin/deployment-specs?')) return { items: state.specs, nextCursor: null }
    if (path.startsWith('/admin/deployment-jobs?')) return { items: state.jobs, nextCursor: null }
    if (path.startsWith('/admin/deployments?')) return { items: state.runs, nextCursor: null }
    if (path === '/admin/clusters/local-a') return snapshot()
    return { items: [], nextCursor: null }
  })
})
it('shows actionable primary gate failures and distinguishes local tests from verified deployments', async () => {
  const run = { id: registrationId, clusterId: 'local-a', hostId: 'host-a', environment: 'staging', releaseId: 'release-gates',
    composeSha256: 'a'.repeat(64), state: 'not_started', phase: 'preflight', errorCode: 'DEPLOYMENT_BACKUP_UNVERIFIED',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), resolution: null,
    lastGate: { phase: 'stage_release', mode: 'primary_directory', decision: 'blocked',
      reasons: ['DEPLOYMENT_BACKUP_UNVERIFIED', 'DEPLOYMENT_RELEASE_NOT_APPROVED'], observedAt: new Date().toISOString(),
      approvalId: null, backupId: null, schemaManifestHash: null } }
  state.runs = [run]; const first = setup()
  expect(await screen.findByText('Chưa có bản sao lưu và kết quả thử khôi phục đạt yêu cầu.')).toBeInTheDocument()
  expect(screen.getByText('Phê duyệt bản cài không còn hiệu lực hoặc không khớp máy đích.')).toBeInTheDocument()
  first.unmount(); state.runs = [{ ...run, environment: 'local', lastGate: { ...run.lastGate, mode: 'local_test', decision: 'ready', reasons: [] } }]; setup()
  expect(await screen.findByText('Môi trường thử nghiệm local; chưa kiểm điều kiện triển khai staging/production.')).toBeInTheDocument()
})
afterEach(cleanup)
async function fill() {
  await screen.findByRole('option', { name: /release-test/ })
  fireEvent.change(screen.getByLabelText('Bản cài và cụm đích'), { target: { value: registrationId } })
  fireEvent.change(await screen.findByLabelText('Lý do triển khai'), { target: { value: 'Kiểm thử bản triển khai' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Đưa triển khai vào hàng đợi' })).toBeEnabled())
}
it('submits only an approved specification and current cluster version through the durable command journal', async () => {
  setup(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Đưa triển khai vào hàng đợi' }))
  await screen.findByText('Đã xác nhận nhận lệnh. Xem hàng đợi để biết kết quả triển khai.')
  const posts = state.request.mock.calls.filter(([, options]) => options.method === 'POST'); expect(posts).toHaveLength(1)
  expect(JSON.parse(posts[0][1].body)).toEqual({ operation: 'queue_deployment', expectedVersion: 1, reason: 'Kiểm thử bản triển khai', payload: { specId: registrationId, executionSha256: 'b'.repeat(64) } })
  expect(posts[0][1].headers['Idempotency-Key']).toMatch(/^[a-f0-9-]{36}$/)
})
it('recovers a lost response with the same original key and a read, without posting another deployment', async () => {
  state.lost = true; const first = setup(); await fill(); fireEvent.click(screen.getByRole('button', { name: 'Đưa triển khai vào hàng đợi' }))
  await screen.findByRole('button', { name: 'Kiểm tra kết quả nhận lệnh' }); first.unmount(); setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra kết quả nhận lệnh' }))
  await screen.findByText('Đã xác nhận nhận lệnh. Xem hàng đợi để biết kết quả triển khai.')
  const post = state.request.mock.calls.find(([, options]) => options.method === 'POST')!
  const lookup = state.request.mock.calls.find(([path]) => path.includes('/command-result?'))!
  expect(lookup[1].headers['Idempotency-Key']).toBe(post[1].headers['Idempotency-Key'])
  expect(state.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
})
it('requires admission closed and shows an interrupted job as needing reconciliation', async () => {
  state.closed = false; state.jobs = [{ id: registrationId, commandId: registrationId, specId: registrationId, clusterId: 'local-a', runId: registrationId,
    releaseId: 'release-test', state: 'needs_review', errorCode: 'DEPLOYMENT_EXECUTOR_INTERRUPTED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: null }]
  setup(); await screen.findByRole('option', { name: /release-test/ }); fireEvent.change(screen.getByLabelText('Bản cài và cụm đích'), { target: { value: registrationId } })
  expect(await screen.findByText('Cần đóng nhận khách mới ở chi tiết cụm trước khi triển khai.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Đưa triển khai vào hàng đợi' })).toBeDisabled()
  expect(await screen.findByText('Không gửi lại triển khai. Người vận hành cần đối soát lượt chạy cũ trước.')).toBeInTheDocument()
  expect(state.request.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
})
