import { z } from 'zod'
import { controlRequest } from './workspace'
import { staffInvitationSession } from './staff-invitation'
import { ControlHttpError } from './control-http-error'

const id = z.string().uuid(), clusterId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/)
const text = z.string().max(1000), integer = z.number().int().nonnegative()
const date = z.string().refine(value => Number.isFinite(Date.parse(value)))
const codes = z.array(z.string().max(120)).max(100)
export const registrationStates = ['reserved', 'provisioning', 'active', 'suspended', 'migrating', 'expired'] as const
export const clusterStates = ['active', 'draining', 'offline'] as const
const metric = z.number().nonnegative().nullable()
const metrics = z.object({ cpuUsedPercent: z.number().min(0).max(100).nullable(), memoryAvailableBytes: metric,
  memoryTotalBytes: metric, dataDiskFreeBytes: metric, dataDiskTotalBytes: metric,
  dataDiskInodeFreePercent: z.number().min(0).max(100).nullable(), dbConnectionsUsed: metric, dbConnectionBudget: metric })
const health = z.object({ status: z.enum(['healthy', 'degraded', 'unreachable', 'unknown']), observedAt: date,
  receivedAt: date, validUntil: date, generation: integer.min(1), metrics,
  schemaVersion: z.union([z.literal(1), z.literal(2)]), measurementScope: z.enum(['linux-host', 'docker-desktop-vm']).nullable(),
  dataDisks: z.array(z.object({ id: text, freeBytes: z.number().nonnegative(), totalBytes: z.number().positive(),
    inodeFreePercent: z.number().min(0).max(100) })).min(1).max(16).nullable(), reasonCodes: codes })
export const clusterSchema = z.object({ id: clusterId, status: z.enum(clusterStates), rowVersion: integer.min(1),
  validationState: z.enum(['pending', 'valid', 'invalid']), hostId: text.nullable(), hostStatus: z.enum(['active', 'maintenance', 'retired']).nullable(), backendKind: z.enum(['self_hosted', 'managed']),
  tenantLimit: integer.min(1), allocatedCount: integer, credentialConfigured: z.boolean(), releaseId: text.nullable(), health: health.nullable(),
  admission: z.object({ decision: z.enum(['open', 'blocked', 'manual_closed']), reasonCodes: codes,
    policyVersion: integer.min(1), evaluatedAt: date, healthGeneration: integer.min(1).nullable() }) })
export const workspaceSchema = z.object({ id, slug: z.string().regex(/^[a-z][a-z0-9-]{2,47}$/), displayName: text,
  clusterId, tenantId: id.nullable(), hotelId: id.nullable(), ownerId: id.nullable(), status: z.enum(registrationStates),
  routingVersion: integer.min(1), lastErrorCode: text.nullable(), expiresAt: date.nullable(), createdAt: date, updatedAt: date })
const eventSchema = z.object({ id: z.string().max(64), clusterId, type: text,
  source: z.enum(['admin', 'collector', 'admission', 'provisioning', 'system']), actorId: id.nullable(),
  requestId: id.nullable(), commandId: id.nullable(), createdAt: date })
const page = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item).max(100), nextCursor: z.string().max(1024).nullable() })
const clusterPage = page(clusterSchema), workspacePage = page(workspaceSchema)
const workspaceCountsSchema = z.object({ reserved: integer, provisioning: integer, active: integer, suspended: integer, migrating: integer, expired: integer }).strict()
export const controlOverviewSchema = z.object({
  asOf: date, clusterCount: integer, admissionOpenCount: integer, workspaceCounts: workspaceCountsSchema,
  openCriticalAlerts: integer, staleClusterIds: z.array(clusterId),
  signup: z.object({ enabled: z.boolean(), setupDispatchEnabled: z.boolean(), state: z.enum(['open', 'closed', 'no_capacity']),
    openClusterCount: integer, availableWorkspaceSlots: integer, reasonCodes: codes }).strict(),
}).strict().superRefine((value, context) => {
  const signup = value.signup
  if (value.admissionOpenCount > value.clusterCount || signup.openClusterCount !== value.admissionOpenCount
    || value.staleClusterIds.length > value.clusterCount || new Set(value.staleClusterIds).size !== value.staleClusterIds.length
    || (signup.openClusterCount === 0) !== (signup.availableWorkspaceSlots === 0)
    || signup.state !== (!signup.enabled ? 'closed' : signup.openClusterCount > 0 ? 'open' : 'no_capacity')
    || JSON.stringify(signup.reasonCodes) !== JSON.stringify(!signup.enabled ? ['SIGNUP_CLOSED_CONFIG'] : signup.openClusterCount > 0 ? [] : ['NO_OPEN_CLUSTER']))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent signup overview' })
})
export type ControlOverview = z.infer<typeof controlOverviewSchema>
export const backupScopes = ['directory', 'cluster', 'objects', 'bundle'] as const
export const backupVerificationStates = ['pending', 'verified', 'failed'] as const
export const backupSchema = z.object({ id, clusterId: clusterId.nullable(), scope: z.enum(backupScopes),
  backupId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,119}$/i).nullable(), manifestHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  verificationState: z.enum(backupVerificationStates), completedAt: date.nullable(), restoreTestAt: date.nullable(), createdAt: date })
const backupPage = page(backupSchema).extend({ total: integer.safe(), asOf: date })
export type ControlBackup = z.infer<typeof backupSchema>
export const deploymentStates = ['running', 'blocked', 'not_started', 'deployed', 'rolled_back', 'rollback_failed', 'outcome_unknown'] as const
export const deploymentPhases = ['preflight', 'stage_release', 'validate_compose', 'start_release', 'health_gate', 'commit_release'] as const
const deploymentResolutionSchema = z.object({ id, outcome: z.enum(['candidate_healthy', 'previous_healthy', 'empty']),
  currentReleaseId: clusterId.nullable(), evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/), observedAt: date, recordedAt: date }).strict()
  .refine(value => (value.outcome === 'empty') === (value.currentReleaseId === null))
const deploymentGateSchema = z.object({ phase: z.enum(deploymentPhases), mode: z.enum(['local_test', 'primary_directory']),
  decision: z.enum(['ready', 'blocked']), reasons: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/)).max(40), observedAt: date, approvalId: id.nullable(), backupId: id.nullable(),
  schemaManifestHash: z.string().regex(/^[a-f0-9]{64}$/).nullable() }).strict()
export const deploymentSchema = z.object({ id, clusterId, hostId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  environment: z.enum(['local', 'staging', 'production']), releaseId: clusterId, composeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(deploymentStates), phase: z.enum(deploymentPhases), errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/).nullable(),
  createdAt: date, updatedAt: date, finishedAt: date.nullable(), resolution: deploymentResolutionSchema.nullable().default(null), lastGate: deploymentGateSchema.nullable().default(null) }).strict().superRefine((value, context) => {
    if ((value.state === 'running') !== (value.finishedAt === null) || (value.state === 'deployed' && value.phase !== 'commit_release'))
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent deployment receipt' })
    if (value.resolution && ((value.resolution.outcome === 'candidate_healthy' && value.resolution.currentReleaseId !== value.releaseId)
      || (value.resolution.outcome === 'previous_healthy' && value.resolution.currentReleaseId === value.releaseId)))
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Inconsistent reconciliation receipt' })
  })
export type ControlDeployment = z.infer<typeof deploymentSchema>
export const alertStates = ['open', 'acknowledged', 'resolved'] as const
export const alertSeverities = ['critical', 'warning'] as const
export const alertSchema = z.object({ id, resourceId: z.string().min(1).max(200), type: z.string().min(1).max(120),
  severity: z.enum(alertSeverities), openedAt: date, lastSeenAt: date, acknowledgedAt: date.nullable(),
  acknowledgedBy: id.nullable(), resolvedAt: date.nullable(), rowVersion: integer.min(1) })
const alertPage = page(alertSchema)
const alertReceiptSchema = z.object({ commandId: id, status: z.literal('succeeded'), targetVersion: integer.min(2), result: alertSchema })
export type ControlAlert = z.infer<typeof alertSchema>
export type ControlAlertReceipt = z.infer<typeof alertReceiptSchema>
export const alertRequestSchema = z.object({ key: id.transform(v => v.toLowerCase()), target: id.transform(v => v.toLowerCase()),
  expectedVersion: integer.min(1).max(Number.MAX_SAFE_INTEGER - 1), reason: z.string().trim().min(5).max(1000) }).strict()
export type ControlAlertRequest = z.infer<typeof alertRequestSchema>
export const clusterOperations = ['close_admission', 'open_admission', 'set_draining', 'set_serving', 'update_policy', 'set_host_maintenance', 'set_host_active'] as const
const clusterOperationRequestSchema = z.object({ key: id, target: clusterId, expectedVersion: integer.min(1).max(Number.MAX_SAFE_INTEGER - 1),
  reason: z.string().trim().min(5).max(1000), operation: z.enum(clusterOperations),
  payload: z.union([z.object({}).strict(), z.object({ tenantLimit: integer.min(1).max(1000000) }).strict()]) }).strict()
  .superRefine((value, context) => {
    if (value.operation === 'update_policy' ? !('tenantLimit' in value.payload) : Object.keys(value.payload).length !== 0)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid operation payload' })
  })
const reference = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)
export const clusterCandidateSchema = z.object({ id: clusterId, hostId: reference, hostName: z.string().min(1).max(200),
  environment: z.enum(['local', 'staging', 'production']), region: z.string().max(200).nullable(), providerLabel: z.string().max(200).nullable(),
  backendKind: z.enum(['self_hosted', 'managed']), endpointRef: reference, credentialRef: reference, credentialConfigured: z.boolean(), preflightReady: z.boolean() }).strict()
export type ControlClusterCandidate = z.infer<typeof clusterCandidateSchema>
const clusterRegistrationRequestSchema = z.object({ key: id, target: clusterId, expectedVersion: z.literal(1), operation: z.literal('register_cluster'),
  reason: z.string().trim().min(5).max(1000), payload: clusterCandidateSchema.pick({ hostId: true, backendKind: true, endpointRef: true, credentialRef: true }) }).strict()
  .refine(value => value.target === value.payload.endpointRef)
const deploymentRequestSchema = z.object({ key: id, target: clusterId, expectedVersion: integer.min(1).max(Number.MAX_SAFE_INTEGER - 1),
  reason: z.string().trim().min(5).max(1000), operation: z.literal('queue_deployment'),
  payload: z.object({ specId: id, executionSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict() }).strict()
export const clusterRequestSchema = z.union([clusterOperationRequestSchema, clusterRegistrationRequestSchema, deploymentRequestSchema])
export type ControlClusterRequest = z.infer<typeof clusterRequestSchema>
export type ControlClusterCommand = Omit<z.infer<typeof clusterOperationRequestSchema>, 'key'> | Omit<z.infer<typeof clusterRegistrationRequestSchema>, 'key'> | Omit<z.infer<typeof deploymentRequestSchema>, 'key'>
export const deploymentSpecSchema = z.object({ id, clusterId, hostId: text, environment: z.enum(['local', 'staging']),
  releaseId: clusterId, composeSha256: z.string().regex(/^[a-f0-9]{64}$/), executionSha256: z.string().regex(/^[a-f0-9]{64}$/), createdAt: date, expiresAt: date }).strict()
export const deploymentJobStates = ['queued', 'running', 'succeeded', 'failed', 'needs_review'] as const
export const deploymentJobSchema = z.object({ id, commandId: id, specId: id, clusterId, runId: id.nullable(), state: z.enum(deploymentJobStates),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,119}$/).nullable(), releaseId: clusterId, createdAt: date, updatedAt: date, finishedAt: date.nullable() }).strict()
export type ControlDeploymentSpec = z.infer<typeof deploymentSpecSchema>
const clusterReceiptSchema = z.object({ commandId: id, status: z.literal('succeeded'), targetVersion: integer.min(1), result: clusterSchema })
export type ControlClusterReceipt = z.infer<typeof clusterReceiptSchema>
const hostPreflightSchema = z.object({ capturedAt: date, deploymentAllowed: z.boolean(), diskFreePercent: z.number().min(0).max(100),
  dockerServerVersion: z.string().max(80).nullable() }).strict()
export const hostResourcesSchema = z.object({ source: z.literal('ssh_readonly'), observedAt: date, receivedAt: date, validUntil: date,
  fresh: z.boolean(), cpuCount: integer.min(1).max(4096), cpuUsagePercent: z.number().min(0).max(100),
  memoryTotalBytes: integer.min(1), memoryAvailableBytes: integer.min(0), diskTotalBytes: integer.min(1),
  diskAvailableBytes: integer.min(0), diskFreePercent: z.number().min(0).max(100), dockerServerVersion: z.string().max(80).nullable(),
  deploymentAllowed: z.boolean(), reasonCodes: z.array(z.enum(['DISK_HEADROOM_LOW', 'DOCKER_UNAVAILABLE'])) }).strict()
export const hostSchema = z.object({ id: reference, name: z.string().min(1).max(200), region: z.string().max(200).nullable(),
  providerLabel: z.string().max(200).nullable(), environment: z.enum(['local', 'staging', 'production']), status: z.enum(['active', 'maintenance', 'retired']),
  rowVersion: integer.min(1), createdAt: date, preflight: hostPreflightSchema.nullable(), preflightReady: z.boolean(),
  resources: hostResourcesSchema.nullable(), cluster: clusterSchema.nullable() }).strict()
export type ControlHost = z.infer<typeof hostSchema>
export const workspaceRecheckRequestSchema = z.object({ key: id.transform(v => v.toLowerCase()), target: id.transform(v => v.toLowerCase()),
  expectedVersion: integer.min(1), expectedSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(5).max(1000) }).strict()
export type ControlWorkspaceRecheckRequest = z.infer<typeof workspaceRecheckRequestSchema>
const workspaceRecheckReceiptSchema = z.object({ commandId: id, requestKey: id, status: z.literal('succeeded'), workspaceId: id, clusterId,
  routingVersion: integer.min(1), outcome: z.enum(['queued', 'reused_job', 'running', 'activated', 'verified_active', 'waiting_owner', 'needs_review', 'unavailable']),
  reasonCode: z.string().regex(/^SETUP_[A-Z0-9_]{1,80}$/), jobId: id.nullable(), recordedAt: date })
export type ControlWorkspaceRecheckReceipt = z.infer<typeof workspaceRecheckReceiptSchema>
export class ControlRecheckActionError extends Error {
  constructor(readonly code: ControlClusterActionError['code'], readonly serverCode?: string, readonly supportId?: string | null) {
    const messages = { identity_changed: 'Phiên quản trị đã thay đổi. Giữ yêu cầu để kiểm tra sau.', invalid_request: 'Cần snapshot đăng ký hiện tại và lý do từ 5 đến 1.000 ký tự.',
      outcome_unknown: 'Chưa xác nhận được kết quả kiểm tra đăng ký. Giữ nguyên yêu cầu đang chờ.',
      not_applied: 'Đăng ký đã thay đổi hoặc không tồn tại. Lệnh chưa áp dụng; hãy tải lại chi tiết.',
      result_absent: 'Chưa tìm thấy kết quả. Chỉ gửi lại cùng mã và nội dung yêu cầu.', access_denied: 'Phiên quản trị đã hết hiệu lực hoặc không đủ quyền.',
      rate_limited: 'Có quá nhiều yêu cầu. Hãy chờ rồi kiểm tra kết quả.', storage_unavailable: 'Không thể lưu yêu cầu an toàn trong trình duyệt. Chưa gửi lệnh mới.' }
    super(messages[code]); this.name = 'ControlRecheckActionError'
  }
}
export class ControlClusterActionError extends Error {
  constructor(readonly code: 'identity_changed' | 'invalid_request' | 'outcome_unknown' | 'not_applied' | 'result_absent' | 'access_denied' | 'rate_limited' | 'storage_unavailable',
    readonly serverCode?: string, readonly supportId?: string | null) {
    const messages = { identity_changed: 'Phiên hoặc cụm đang xem đã thay đổi. Yêu cầu được giữ để kiểm tra lại.',
      invalid_request: 'Cần cụm, thao tác, phiên bản, giới hạn và lý do hợp lệ từ 5 đến 1.000 ký tự.',
      outcome_unknown: 'Chưa xác nhận được kết quả thao tác cụm. Hãy kiểm tra yêu cầu đang chờ.',
      not_applied: 'Lệnh chưa được áp dụng: cấu hình đã thay đổi, cụm không tồn tại hoặc chưa đủ điều kiện nhận khách. Hãy tải lại chi tiết.',
      result_absent: 'Máy chủ chưa có kết quả xác nhận. Giữ nguyên yêu cầu; chỉ gửi lại cùng mã và nội dung.',
      access_denied: 'Phiên quản trị không đủ quyền hoặc đã hết hiệu lực. Yêu cầu đang chờ được giữ lại.',
      rate_limited: 'Có quá nhiều yêu cầu. Hãy chờ rồi kiểm tra lại kết quả.',
      storage_unavailable: 'Không đọc hoặc lưu được yêu cầu an toàn trong trình duyệt. Không thể bắt đầu lệnh mới.' }
    super(messages[code]); this.name = 'ControlClusterActionError'
  }
}
export class ControlAlertActionError extends Error {
  constructor(readonly code: 'identity_changed' | 'invalid_request' | 'outcome_unknown' | 'not_applied' | 'result_absent' | 'access_denied' | 'rate_limited' | 'storage_unavailable',
    readonly serverCode?: string, readonly supportId?: string | null) {
    const messages = { identity_changed: 'Phiên quản trị đã thay đổi. Yêu cầu đang chờ vẫn được giữ để kiểm tra sau.',
      invalid_request: 'Cần cảnh báo, phiên bản và lý do từ 5 đến 1.000 ký tự hợp lệ.',
      outcome_unknown: 'Chưa xác nhận được kết quả. Hãy kiểm tra lại yêu cầu đang chờ.',
      not_applied: 'Yêu cầu chưa được áp dụng vì cảnh báo đã thay đổi hoặc không còn phù hợp. Hãy tải lại danh sách.',
      result_absent: 'Máy chủ chưa có kết quả xác nhận. Yêu cầu có thể vẫn đang xử lý; chỉ gửi lại cùng yêu cầu này.',
      access_denied: 'Phiên quản trị không đủ quyền hoặc đã hết hiệu lực. Yêu cầu đang chờ được giữ lại.',
      rate_limited: 'Có quá nhiều yêu cầu. Hãy chờ rồi kiểm tra lại kết quả.',
      storage_unavailable: 'Không đọc hoặc lưu được yêu cầu an toàn trong trình duyệt. Chưa gửi yêu cầu mới.' }
    super(messages[code]); this.name = 'ControlAlertActionError'
  }
}
export const workspaceDetailsSchema = z.object({ workspace: workspaceSchema,
  recheck: z.object({ routingVersion: integer.min(1), snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/) }).nullable().optional(),
  receipt: z.object({ status: z.enum(['verified', 'missing', 'conflict', 'unavailable']),
    binding: z.object({ workspace_id: id.nullable(), tenant_id: id.nullable(), hotel_id: id.nullable(), owner_id: id.nullable() }).nullable().optional() }),
  job: z.object({ id, workspaceId: id, state: z.enum(['queued', 'leased', 'retry', 'waiting_owner', 'needs_review', 'succeeded', 'cancelled']),
    attempts: integer, nextAttemptAt: date, leaseUntil: date.nullable(), lastErrorCode: text.nullable(), updatedAt: date }).nullable(),
  timeline: page(eventSchema) })
export const tenantSummaryErrors = ['TENANT_SUMMARY_UNBOUND', 'TENANT_SUMMARY_MISSING', 'TENANT_SUMMARY_CONFIGURATION_REQUIRED',
  'TENANT_SUMMARY_CREDENTIAL_INVALID', 'TENANT_SUMMARY_CREDENTIAL_DENIED', 'TENANT_SUMMARY_UNAVAILABLE', 'TENANT_SUMMARY_INVALID_RESPONSE'] as const
const tenantSummaryBase = { workspaceId: id, routingVersion: integer.min(1), clusterId, tenantId: id.nullable() }
export const tenantSummarySchema = z.discriminatedUnion('status', [
  z.object({ ...tenantSummaryBase, tenantId: id, status: z.literal('available'), observedAt: date, errorCode: z.null(),
    tenant: z.object({ id, name: text.min(1), subscriptionStatus: z.string().min(1).max(100), trialEndsAt: date.nullable(),
      hotelCount: integer.safe(), staffCount: integer.safe(), roomCount: integer.safe() }).strict() }).strict(),
  z.object({ ...tenantSummaryBase, status: z.literal('unavailable'), observedAt: z.null(), tenant: z.null(), errorCode: z.enum(tenantSummaryErrors) }).strict(),
])
export type ControlTenantSummary = z.infer<typeof tenantSummarySchema>
export type ControlCluster = z.infer<typeof clusterSchema>
export type ControlWorkspace = z.infer<typeof workspaceSchema>
export type ControlWorkspaceDetails = z.infer<typeof workspaceDetailsSchema>
export type ControlPage<T> = { items: T[]; nextCursor: string | null }
export type ControlIdentity = { actorId: string; sessionId: string }
export type ControlReadOptions = { signal?: AbortSignal; isCurrent?: () => boolean }
type Session = { access_token: string; user: { id: string } }
export class ControlAdminError extends Error {
  constructor(public readonly code: 'identity_changed' | 'invalid_request' | 'invalid_response' | 'read_unavailable', message: string) {
    super(message); this.name = 'ControlAdminError'
  }
}
const changed = () => new ControlAdminError('identity_changed', 'Phiên quản trị đã thay đổi. Vui lòng tải lại.')
const invalid = () => new ControlAdminError('invalid_request', 'Bộ lọc hoặc địa chỉ không hợp lệ.')
function params(input: Record<string, string | undefined>) {
  const result = new URLSearchParams({ limit: '25' })
  for (const [key, value] of Object.entries(input)) if (value) {
    if (value.length > (key === 'cursor' ? 1024 : 120)) throw invalid()
    result.set(key, value)
  }
  return '?' + result.toString()
}

export function createControlAdminClient(deps: {
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>
  request?: typeof controlRequest
}) {
  const request = deps.request ?? controlRequest
  async function read<T>(path: string, schema: z.ZodType<T>, identity: ControlIdentity, options: ControlReadOptions = {},
    command?: { operation: 'acknowledge' | 'lookup'; request: ControlAlertRequest }
      | { operation: 'cluster' | 'cluster_lookup'; request: ControlClusterRequest }
      | { operation: 'recheck' | 'recheck_lookup'; request: ControlWorkspaceRecheckRequest }): Promise<T> {
    const deadline = Date.now() + 30000
    const check = () => { if (options.signal?.aborted || options.isCurrent?.() === false) throw changed() }
    const session = async () => {
      check()
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw changed()
      let timeout: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined
      let result: Awaited<ReturnType<typeof deps.getSession>>
      try {
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(changed())
          timeout = setTimeout(abort, remaining)
          options.signal?.addEventListener('abort', abort, { once: true })
        })
        result = await Promise.race([Promise.resolve().then(deps.getSession), interrupted])
      } catch { throw changed() }
      finally { clearTimeout(timeout); if (abort) options.signal?.removeEventListener('abort', abort) }
      check()
      if (result.error || !result.data.session) throw changed()
      let value: ControlIdentity
      try { value = staffInvitationSession(result.data.session) } catch { throw changed() }
      if (value.actorId !== identity.actorId || value.sessionId !== identity.sessionId) throw changed()
      return result.data.session
    }
    const initial = await session()
    let body: unknown
    const controller = new AbortController(), abort = () => controller.abort()
    const timeout = setTimeout(abort, Math.max(0, deadline - Date.now()))
    options.signal?.addEventListener('abort', abort, { once: true })
    let rejectAbort: (() => void) | undefined
    try {
      check()
      const interrupted = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error('CONTROL_REQUEST_ABORTED'))
        if (controller.signal.aborted) rejectAbort(); else controller.signal.addEventListener('abort', rejectAbort, { once: true })
      })
      const write = command?.operation === 'acknowledge' || command?.operation === 'cluster' || command?.operation === 'recheck'
      body = await Promise.race([request(path, { method: write ? 'POST' : 'GET', signal: controller.signal,
        headers: { Authorization: `Bearer ${initial.access_token}`, ...(command ? { 'Idempotency-Key': command.request.key } : {}) },
        ...(command?.operation === 'acknowledge' ? { body: JSON.stringify({ expectedVersion: command.request.expectedVersion, reason: command.request.reason }) }
          : command?.operation === 'cluster' ? { body: JSON.stringify(command.request.operation === 'register_cluster'
            ? { id: command.request.target, ...command.request.payload, expectedVersion: 1, reason: command.request.reason }
            : { operation: command.request.operation, expectedVersion: command.request.expectedVersion, reason: command.request.reason, payload: command.request.payload }) }
            : command?.operation === 'recheck' ? { body: JSON.stringify({ expectedVersion: command.request.expectedVersion,
              expectedSnapshotSha256: command.request.expectedSnapshotSha256, reason: command.request.reason }) } : {}) }), interrupted])
    } catch (error) {
      check()
      if (command) {
        const cluster = command.operation === 'cluster' || command.operation === 'cluster_lookup'
        const ActionError = cluster ? ControlClusterActionError : ['recheck', 'recheck_lookup'].includes(command.operation) ? ControlRecheckActionError : ControlAlertActionError
        if (Date.now() >= deadline) throw new ActionError('outcome_unknown')
        await session(); check()
        if (error instanceof ControlHttpError) {
          const code = error.code
          if (command.operation === 'recheck_lookup' && error.status === 404 && code === 'WORKSPACE_RECHECK_RESULT_UNKNOWN') throw new ActionError('result_absent', code, error.requestId)
          if (command.operation === 'recheck' && ((error.status === 409 && code === 'WORKSPACE_SNAPSHOT_CHANGED')
            || (error.status === 404 && code === 'WORKSPACE_NOT_FOUND'))) throw new ActionError('not_applied', code!, error.requestId)
          if (command.operation === 'cluster_lookup' && error.status === 404 && code === 'COMMAND_RESULT_UNKNOWN') throw new ActionError('result_absent', code, error.requestId)
          if (command.operation === 'cluster' && ((error.status === 409 && ['VERSION_CONFLICT', 'ADMISSION_BLOCKED', 'DEPLOYMENT_QUEUE_BLOCKED', 'DEPLOYMENT_SPEC_UNAVAILABLE'].includes(code ?? ''))
            || (error.status === 404 && code === 'CLUSTER_NOT_FOUND'))) throw new ActionError('not_applied', code!, error.requestId)
          if (command.operation === 'cluster' && command.request.operation === 'register_cluster'
            && ((error.status === 400 && ['INVALID_COMMAND', 'INVENTORY_REQUIRED'].includes(code ?? ''))
              || (error.status === 409 && code === 'CLUSTER_ALREADY_REGISTERED'))) throw new ActionError('not_applied', code!, error.requestId)
          if (command.operation === 'lookup' && error.status === 404 && code === 'ALERT_COMMAND_RESULT_UNKNOWN') throw new ActionError('result_absent', code, error.requestId)
          if (command.operation === 'acknowledge' && ((error.status === 409 && ['VERSION_CONFLICT', 'ALERT_ALREADY_HANDLED'].includes(code ?? ''))
            || (error.status === 404 && code === 'ALERT_NOT_FOUND'))) throw new ControlAlertActionError('not_applied', code!, error.requestId)
          if ([401, 403].includes(error.status)) throw new ActionError('access_denied', code ?? undefined, error.requestId)
          if (error.status === 429) throw new ActionError('rate_limited', code ?? undefined, error.requestId)
        }
        throw new ActionError('outcome_unknown')
      }
      throw new ControlAdminError('read_unavailable', 'Không thể tải dữ liệu. Kiểm tra phiên quản trị và kết nối rồi thử lại.')
    }
    finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort) }
    await session(); check()
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ControlAdminError('invalid_response', 'Dữ liệu máy chủ chưa hợp lệ. Vui lòng thử tải lại.')
    return parsed.data
  }
  function alertRequest(value: ControlAlertRequest) {
    const parsed = alertRequestSchema.safeParse(value)
    if (!parsed.success) throw new ControlAlertActionError('invalid_request')
    return parsed.data
  }
  async function alertCommand(identity: ControlIdentity, value: ControlAlertRequest, operation: 'acknowledge' | 'lookup', options?: ControlReadOptions) {
    const command = alertRequest(value)
    const result = await read('/admin/alerts/' + command.target + (operation === 'acknowledge' ? '/acknowledge' : '/acknowledgement-result'),
      alertReceiptSchema, identity, options, { operation, request: command })
    if (result.result.id !== command.target || result.targetVersion !== command.expectedVersion + 1 || result.result.rowVersion !== result.targetVersion
      || result.result.acknowledgedBy !== identity.actorId || !result.result.acknowledgedAt || result.result.resolvedAt !== null)
      throw new ControlAlertActionError('outcome_unknown')
    return result
  }
  async function clusterCommand(identity: ControlIdentity, value: ControlClusterRequest, lookup: boolean, options?: ControlReadOptions) {
    const parsed = clusterRequestSchema.safeParse(value)
    if (!parsed.success) throw new ControlClusterActionError('invalid_request')
    const command = parsed.data
    const registration = command.operation === 'register_cluster'
    const result = await read(lookup ? '/admin/clusters/' + command.target + '/command-result?operation=' + command.operation
      : registration ? '/admin/clusters/register' : '/admin/clusters/' + command.target + '/commands',
      clusterReceiptSchema, identity, options, { operation: lookup ? 'cluster_lookup' : 'cluster', request: command })
    const snapshot = result.result
    if (snapshot.id !== command.target || result.targetVersion !== (registration ? 1 : command.expectedVersion + 1) || snapshot.rowVersion !== result.targetVersion
      || (!registration && (command.operation === 'open_admission' ? snapshot.admission.decision !== 'open' || snapshot.status !== 'active' : snapshot.admission.decision !== 'manual_closed'))
    || (command.operation === 'set_draining' && snapshot.status !== 'draining')
    || (command.operation === 'set_host_maintenance' && (snapshot.status !== 'draining' || snapshot.hostStatus !== 'maintenance'))
    || (command.operation === 'set_host_active' && (snapshot.status !== 'active' || snapshot.hostStatus !== 'active'))
      || (command.operation === 'set_serving' && snapshot.status !== 'active')
      || (registration && (snapshot.hostId !== command.payload.hostId || snapshot.backendKind !== command.payload.backendKind
        || snapshot.validationState !== 'pending' || snapshot.allocatedCount !== 0 || snapshot.tenantLimit !== 1))
      || (command.operation === 'update_policy' && (!('tenantLimit' in command.payload) || snapshot.tenantLimit !== command.payload.tenantLimit)))
      throw new ControlClusterActionError('outcome_unknown')
    return result
  }
  return {
    async recheckWorkspace(identity: ControlIdentity, value: ControlWorkspaceRecheckRequest, lookup = false, options?: ControlReadOptions) {
      const parsed = workspaceRecheckRequestSchema.safeParse(value)
      if (!parsed.success) throw new ControlRecheckActionError('invalid_request')
      const command = parsed.data
      const result = await read('/admin/workspaces/' + command.target + (lookup ? '/recheck-result' : '/recheck'), workspaceRecheckReceiptSchema,
        identity, options, { operation: lookup ? 'recheck_lookup' : 'recheck', request: command })
      if (result.workspaceId !== command.target || result.routingVersion !== command.expectedVersion || result.requestKey !== command.key)
        throw new ControlRecheckActionError('outcome_unknown')
      return result
    },
    clusterCommand: (identity: ControlIdentity, command: ControlClusterRequest, options?: ControlReadOptions) => clusterCommand(identity, command, false, options),
    clusterCommandResult: (identity: ControlIdentity, command: ControlClusterRequest, options?: ControlReadOptions) => clusterCommand(identity, command, true, options),
    hosts(identity: ControlIdentity, filters: { environment?: string; status?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if ((filters.environment && !['local', 'staging', 'production'].includes(filters.environment))
        || (filters.status && !['active', 'maintenance', 'retired'].includes(filters.status))) throw invalid()
      return read('/admin/hosts' + params(filters), page(hostSchema), identity, options).then(result => {
        if (result.items.some(host => (filters.environment && host.environment !== filters.environment) || (filters.status && host.status !== filters.status)
          || (host.cluster && host.cluster.hostId !== host.id))) throw new ControlAdminError('invalid_response', 'Máy chủ không khớp danh sách đang xem.')
        return result
      })
    },
    clusterCandidates(identity: ControlIdentity, cursor = '', options?: ControlReadOptions) {
      return read('/admin/cluster-candidates' + params({ cursor }), page(clusterCandidateSchema), identity, options).then(result => {
        if (result.items.some(candidate => candidate.id !== candidate.endpointRef)) throw new ControlAdminError('invalid_response', 'Cụm chưa khớp cấu hình được duyệt.')
        return result
      })
    },
    alerts(identity: ControlIdentity, filters: { state?: string; severity?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if (filters.state && !alertStates.includes(filters.state as typeof alertStates[number])) throw invalid()
      if (filters.severity && !alertSeverities.includes(filters.severity as typeof alertSeverities[number])) throw invalid()
      return read('/admin/alerts' + params(filters), alertPage, identity, options)
    },
    acknowledgeAlert: (identity: ControlIdentity, command: ControlAlertRequest, options?: ControlReadOptions) => alertCommand(identity, command, 'acknowledge', options),
    alertAcknowledgement: (identity: ControlIdentity, command: ControlAlertRequest, options?: ControlReadOptions) => alertCommand(identity, command, 'lookup', options),
    clusters(identity: ControlIdentity, filters: { status?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if (filters.status && !clusterStates.includes(filters.status as typeof clusterStates[number])) throw invalid()
      return read('/admin/clusters' + params(filters), clusterPage, identity, options)
    },
    overview(identity: ControlIdentity, options?: ControlReadOptions) {
      return read('/admin/overview', controlOverviewSchema, identity, options)
    },
    deploymentSpecs(identity: ControlIdentity, filters: { clusterId?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if (filters.clusterId && !clusterId.safeParse(filters.clusterId).success) throw invalid()
      return read('/admin/deployment-specs' + params(filters), page(deploymentSpecSchema), identity, options).then(result => {
        if (result.items.some(item => filters.clusterId && item.clusterId !== filters.clusterId)) throw new ControlAdminError('invalid_response', 'Bản cài không khớp cụm đang xem.')
        return result
      })
    },
    deploymentJobs(identity: ControlIdentity, filters: { clusterId?: string; state?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if ((filters.clusterId && !clusterId.safeParse(filters.clusterId).success)
        || (filters.state && !deploymentJobStates.includes(filters.state as typeof deploymentJobStates[number]))) throw invalid()
      return read('/admin/deployment-jobs' + params(filters), page(deploymentJobSchema), identity, options).then(result => {
        if (result.items.some(item => (filters.clusterId && item.clusterId !== filters.clusterId) || (filters.state && item.state !== filters.state))) throw new ControlAdminError('invalid_response', 'Công việc không khớp bộ lọc đang xem.')
        return result
      })
    },
    deployments(identity: ControlIdentity, filters: { clusterId?: string; state?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if ((filters.clusterId && !clusterId.safeParse(filters.clusterId).success)
        || (filters.state && !deploymentStates.includes(filters.state as typeof deploymentStates[number]))) throw invalid()
      return read('/admin/deployments' + params(filters), page(deploymentSchema), identity, options).then(result => {
        if (result.items.some(item => (filters.clusterId && item.clusterId !== filters.clusterId) || (filters.state && item.state !== filters.state)))
          throw new ControlAdminError('invalid_response', 'Lịch sử triển khai không khớp bộ lọc đang xem.')
        return result
      })
    },
    backups(identity: ControlIdentity, filters: { clusterId?: string; scope?: string; verificationState?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if ((filters.clusterId && !clusterId.safeParse(filters.clusterId).success)
        || (filters.scope && !backupScopes.includes(filters.scope as typeof backupScopes[number]))
        || (filters.verificationState && !backupVerificationStates.includes(filters.verificationState as typeof backupVerificationStates[number]))) throw invalid()
      return read('/admin/backups' + params(filters), backupPage, identity, options).then(result => {
        if (result.total < result.items.length || (result.items.length === 0 && result.nextCursor !== null)
          || result.items.some(item => (filters.clusterId && item.clusterId !== filters.clusterId)
            || (filters.scope && item.scope !== filters.scope) || (filters.verificationState && item.verificationState !== filters.verificationState)))
          throw new ControlAdminError('invalid_response', 'Dữ liệu sao lưu không khớp bộ lọc đang xem.')
        return result
      })
    },
    cluster(identity: ControlIdentity, target: string, options?: ControlReadOptions) {
      if (!clusterId.safeParse(target).success) throw invalid()
      return read('/admin/clusters/' + target, clusterSchema, identity, options).then(result => {
        if (result.id !== target) throw new ControlAdminError('invalid_response', 'Dữ liệu trả về không đúng cụm đang mở.')
        return result
      })
    },
    workspaces(identity: ControlIdentity, filters: { status?: string; clusterId?: string; search?: string; cursor?: string } = {}, options?: ControlReadOptions) {
      if (filters.status && !registrationStates.includes(filters.status as typeof registrationStates[number])) throw invalid()
      if (filters.clusterId && !clusterId.safeParse(filters.clusterId).success) throw invalid()
      return read('/admin/workspaces' + params(filters), workspacePage, identity, options)
    },
    tenantSummary(identity: ControlIdentity, workspace: Pick<ControlWorkspace, 'id' | 'clusterId' | 'tenantId' | 'routingVersion'>, options?: ControlReadOptions) {
      if (!id.safeParse(workspace.id).success || !clusterId.safeParse(workspace.clusterId).success) throw invalid()
      return read('/admin/workspaces/' + workspace.id + '/tenant-summary', tenantSummarySchema, identity, options).then(result => {
        if (result.workspaceId !== workspace.id || result.clusterId !== workspace.clusterId || result.tenantId !== workspace.tenantId
          || result.routingVersion !== workspace.routingVersion || (result.status === 'available' && result.tenant.id !== workspace.tenantId))
          throw new ControlAdminError('invalid_response', 'Tổng quan không khớp đăng ký đang mở. Hãy tải lại chi tiết.')
        return result
      })
    },
    workspace(identity: ControlIdentity, target: string, cursor?: string, options?: ControlReadOptions) {
      if (!id.safeParse(target).success) throw invalid()
      return read('/admin/workspaces/' + target + params({ cursor }), workspaceDetailsSchema, identity, options).then(result => {
        if (result.workspace.id !== target || (result.job && result.job.workspaceId !== target)
          || (result.recheck && result.recheck.routingVersion !== result.workspace.routingVersion)
          || result.timeline.items.some(event => event.clusterId !== result.workspace.clusterId)
          || (result.receipt.status === 'verified'
            && (!result.receipt.binding || result.receipt.binding.workspace_id !== target || !result.workspace.ownerId
              || !result.receipt.binding.tenant_id || !result.receipt.binding.hotel_id
              || (result.workspace.tenantId !== null && result.receipt.binding.tenant_id !== result.workspace.tenantId)
              || (result.workspace.hotelId !== null && result.receipt.binding.hotel_id !== result.workspace.hotelId)
              || result.receipt.binding.owner_id !== result.workspace.ownerId))) {
          throw new ControlAdminError('invalid_response', 'Dữ liệu trả về không đúng đăng ký đang mở.')
        }
        return result
      })
    },
  }
}
