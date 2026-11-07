import { emailActor, emailHotel, emailSession, emailTenant, emailToken } from './email-auth-fixture'
export const controlActor = { actorId: emailActor, sessionId: emailSession }
export const controlSession = () => ({ access_token: emailToken(), user: { id: emailActor } })
export const registrationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export function controlBackup(overrides = {}) {
  return { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clusterId: 'local-a', scope: 'bundle', backupId: 'backup-demo-1',
    manifestHash: 'a'.repeat(64), verificationState: 'verified', completedAt: '2026-10-29T00:00:00Z', restoreTestAt: null,
    createdAt: '2026-10-29T00:01:00Z', ...overrides }
}
export const controlBackupPage = (overrides = {}) => ({ items: [controlBackup()], nextCursor: null, total: 1, asOf: '2026-10-29T00:02:00Z', ...overrides })
export function controlDeployment(overrides = {}) {
  return { id: registrationId, clusterId: 'local-a', hostId: 'host-a', environment: 'local', releaseId: 'release-demo',
    composeSha256: 'a'.repeat(64), state: 'outcome_unknown', phase: 'commit_release', errorCode: 'VPS_DEPLOY_COMMIT_RESULT_UNKNOWN',
    createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:01:00Z', finishedAt: '2026-10-31T00:01:00Z', resolution: null, ...overrides }
}
export function controlWorkspace(overrides = {}) {
  return { id: registrationId, slug: 'demo-hotel', displayName: 'Khách sạn Demo', clusterId: 'local-a',
    tenantId: emailTenant, hotelId: emailHotel, ownerId: emailActor, status: 'active', routingVersion: 1, lastErrorCode: null,
    expiresAt: null, createdAt: '2026-10-28T00:00:00Z', updatedAt: '2026-10-28T00:01:00Z', ...overrides }
}
export function controlCluster(overrides = {}) {
  return { id: 'local-a', status: 'active', rowVersion: 1, validationState: 'valid', hostId: 'host-a', hostStatus: 'active', backendKind: 'self_hosted',
    tenantLimit: 20, allocatedCount: 1, credentialConfigured: true, releaseId: 'release-a', health: null,
    admission: { decision: 'blocked', reasonCodes: ['METRICS_STALE'], policyVersion: 1,
      evaluatedAt: '2026-10-28T00:00:00Z', healthGeneration: null }, ...overrides }
}
export function controlOverview(overrides = {}) {
  return { asOf: new Date().toISOString(), clusterCount: 1, admissionOpenCount: 0,
    workspaceCounts: { reserved: 0, provisioning: 0, active: 1, suspended: 0, migrating: 0, expired: 0 },
    openCriticalAlerts: 0, staleClusterIds: ['local-a'],
    signup: { enabled: false, setupDispatchEnabled: false, state: 'closed', openClusterCount: 0, availableWorkspaceSlots: 0, reasonCodes: ['SIGNUP_CLOSED_CONFIG'] },
    ...overrides }
}
export function controlWorkspaceDetail() {
  return { workspace: controlWorkspace(), receipt: { status: 'verified', binding: { workspace_id: registrationId,
    tenant_id: emailTenant, hotel_id: emailHotel, owner_id: emailActor } }, job: null, timeline: { items: [], nextCursor: null } }
}
export function controlTenantSummary(overrides = {}) {
  return { workspaceId: registrationId, routingVersion: 1, clusterId: 'local-a', tenantId: emailTenant, status: 'available',
    observedAt: '2026-10-29T00:00:00Z', errorCode: null, tenant: { id: emailTenant, name: 'Doanh nghiệp Demo',
      subscriptionStatus: 'trial', trialEndsAt: null, hotelCount: 1, staffCount: 0, roomCount: 0 }, ...overrides }
}
