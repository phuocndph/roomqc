import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlAdminClient } from './control-admin'
import { isControlAdminReadPath } from './control-admin-routes'
import { controlActor, controlSession, controlCluster, controlWorkspace, controlWorkspaceDetail, registrationId, controlBackup, controlBackupPage, controlTenantSummary, controlDeployment, controlOverview } from '@/test/control-admin-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture() {
  const state = { session: controlSession(), current: true, response: { items: [controlCluster()], nextCursor: null } as unknown }
  const request = vi.fn(async () => state.response)
  const getSession = vi.fn(async () => ({ data: { session: state.session }, error: null }))
  return { state, request, getSession, client: createControlAdminClient({ request, getSession }) }
}
describe('control admin read client', () => {
  it('uses the exact native overview route and rejects contradictory signup readiness', async () => {
    const f = fixture(); f.state.response = controlOverview()
    expect((await f.client.overview(controlActor)).signup.state).toBe('closed')
    expect(f.request).toHaveBeenCalledWith('/admin/overview', expect.objectContaining({ method: 'GET' }))
    expect(isControlAdminReadPath('/admin/overview')).toBe(true)
    for (const suffix of ['?', '?limit=25', '?clusterId=local-a', '/enable']) expect(isControlAdminReadPath('/admin/overview' + suffix)).toBe(false)
    for (const change of [{ state: 'open' }, { openClusterCount: 1 }, { availableWorkspaceSlots: 1 }, { enabled: true },
      { reasonCodes: [] }, { secretKey: 'private-marker' }]) {
      const response = controlOverview(); f.state.response = { ...response, signup: { ...response.signup, ...change } }
      await expect(f.client.overview(controlActor)).rejects.toMatchObject({ code: 'invalid_response' })
    }
    f.state.response = controlOverview({ clusterCount: 1001, staleClusterIds: Array.from({ length: 1001 }, (_, index) => 'cluster-' + index) })
    expect((await f.client.overview(controlActor)).clusterCount).toBe(1001)
  })
  it('reads gate reasons without accepting private or malformed readiness evidence', async () => {
    const f = fixture(), lastGate = { phase: 'stage_release', mode: 'primary_directory', decision: 'blocked',
      reasons: ['DEPLOYMENT_BACKUP_UNVERIFIED'], observedAt: '2026-10-31T00:02:00Z', approvalId: null, backupId: null, schemaManifestHash: null }
    f.state.response = { items: [controlDeployment({ lastGate })], nextCursor: null }
    expect((await f.client.deployments(controlActor)).items[0].lastGate?.reasons).toEqual(['DEPLOYMENT_BACKUP_UNVERIFIED'])
    for (const change of [{ mode: 'production_approved' }, { decision: 'skip' }, { reasons: ['https://private'] }, { sshKey: 'private-marker' }]) {
      f.state.response = { items: [controlDeployment({ lastGate: { ...lastGate, ...change } })], nextCursor: null }
      await expect(f.client.deployments(controlActor)).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })
  it('reads deployment receipts with exact filters and a read-only native route', async () => {
    const f = fixture(); f.state.response = { items: [controlDeployment()], nextCursor: null }
    const result = await f.client.deployments(controlActor, { clusterId: 'local-a', state: 'outcome_unknown' })
    expect(result.items[0].state).toBe('outcome_unknown')
    expect(f.request).toHaveBeenCalledWith('/admin/deployments?limit=25&clusterId=local-a&state=outcome_unknown', expect.objectContaining({ method: 'GET' }))
    expect(isControlAdminReadPath('/admin/deployments?state=running&clusterId=local-a')).toBe(true)
    for (const path of ['/admin/deployments/execute', '/admin/deployments?host=remote', '/admin/deployments?state=running&state=running'])
      expect(isControlAdminReadPath(path)).toBe(false)
  })
  it('retains a separate resolution without rewriting the original deployment failure', async () => {
    const f = fixture(), resolution = { id: registrationId, outcome: 'candidate_healthy', currentReleaseId: 'release-demo',
      evidenceSha256: 'b'.repeat(64), observedAt: '2026-10-31T00:02:00Z', recordedAt: '2026-10-31T00:02:01Z' }
    f.state.response = { items: [controlDeployment({ resolution })], nextCursor: null }
    const result = await f.client.deployments(controlActor)
    expect(result.items[0].state).toBe('outcome_unknown'); expect(result.items[0].resolution?.outcome).toBe('candidate_healthy')
    for (const change of [{ currentReleaseId: 'wrong-release' }, { evidenceSha256: 'invalid' }, { outcome: 'empty' }, { secret: 'private-marker' }]) {
      f.state.response = { items: [controlDeployment({ resolution: { ...resolution, ...change } })], nextCursor: null }
      await expect(f.client.deployments(controlActor)).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })
  it.each([{ clusterId: 'other' }, { state: 'deployed' }, { sshKey: 'private-marker' }, { state: 'running', finishedAt: '2026-10-31T00:01:00Z' },
    { state: 'deployed', phase: 'start_release' }])('rejects mismatched or inconsistent deployment receipts: %j', async change => {
    const f = fixture(); f.state.response = { items: [controlDeployment(change)], nextCursor: null }
    await expect(f.client.deployments(controlActor, { clusterId: 'local-a', state: 'outcome_unknown' })).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('rejects unsafe deployment filters before any dispatch', () => {
    const f = fixture()
    for (const filters of [{ clusterId: '../wrong' }, { state: 'unknown' }]) expect(() => f.client.deployments(controlActor, filters)).toThrow()
    expect(f.request).not.toHaveBeenCalled()
  })
  it('reads a summary only for the exact workspace, tenant, cluster and routing version', async () => {
    const f = fixture(); f.state.response = controlTenantSummary()
    const result = await f.client.tenantSummary(controlActor, controlWorkspace())
    expect(result.status).toBe('available')
    expect(f.request).toHaveBeenCalledWith('/admin/workspaces/' + registrationId + '/tenant-summary', expect.objectContaining({ method: 'GET' }))
    for (const change of [{ clusterId: 'other-cluster' }, { tenantId: registrationId }, { workspaceId: controlActor.actorId },
      { routingVersion: 2 }, { errorCode: 'TENANT_SUMMARY_MISSING' }, { status: 'unavailable' }, { observedAt: null }]) {
      f.state.response = controlTenantSummary(change)
      await expect(f.client.tenantSummary(controlActor, controlWorkspace())).rejects.toMatchObject({ code: 'invalid_response' })
    }
  })
  it('keeps unavailable as null and allows only the exact native summary path with no query', async () => {
    const f = fixture(); f.state.response = controlTenantSummary({ status: 'unavailable', tenant: null, observedAt: null, errorCode: 'TENANT_SUMMARY_MISSING' })
    const result = await f.client.tenantSummary(controlActor, controlWorkspace())
    expect(result.tenant).toBeNull(); expect(result.status).toBe('unavailable')
    expect(isControlAdminReadPath('/admin/workspaces/' + registrationId + '/tenant-summary')).toBe(true)
    for (const suffix of ['?tenantId=' + registrationId, '?', '/extra', '#anchor'])
      expect(isControlAdminReadPath('/admin/workspaces/' + registrationId + '/tenant-summary' + suffix)).toBe(false)
  })
  it('reads backup totals and restore evidence from the server with exact cluster filters', async () => {
    const f = fixture(); f.state.response = controlBackupPage({ total: 1005, nextCursor: 'next-page' })
    const result = await f.client.backups(controlActor, { clusterId: 'local-a', scope: 'bundle', verificationState: 'verified', cursor: 'old-page' })
    expect(result.total).toBe(1005); expect(result.items[0].restoreTestAt).toBeNull()
    expect(f.request).toHaveBeenCalledWith('/admin/backups?limit=25&clusterId=local-a&scope=bundle&verificationState=verified&cursor=old-page', expect.objectContaining({ method: 'GET' }))
  })
  it.each(['cluster', 'scope', 'state', 'total', 'missing-total', 'url'])('rejects invalid backup %s without turning it into an empty page', async mode => {
    const f = fixture(), data = controlBackupPage({ total: 10 })
    if (mode === 'cluster') data.items[0].clusterId = 'other-cluster'
    if (mode === 'scope') data.items[0].scope = 'objects'
    if (mode === 'state') data.items[0].verificationState = 'failed'
    if (mode === 'total') data.total = 0
    if (mode === 'missing-total') delete (data as Partial<typeof data>).total
    if (mode === 'url') data.items[0].backupId = 'https://private.invalid/object?signature=private'
    f.state.response = data
    await expect(f.client.backups(controlActor, { clusterId: 'local-a', scope: 'bundle', verificationState: 'verified' })).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('preserves pending and failed backup records, null verification evidence, and strips server extras', async () => {
    const f = fixture(); f.state.response = controlBackupPage({ total: 2, items: [controlBackup({ scope: 'directory', clusterId: null,
      verificationState: 'pending', completedAt: null, manifestHash: null, backupId: null, signedUrl: 'private-marker' }),
    controlBackup({ id: registrationId, verificationState: 'failed' })] })
    const result = await f.client.backups(controlActor)
    expect(result.items[0].completedAt).toBeNull(); expect(result.items[1].verificationState).toBe('failed')
    expect(JSON.stringify(result)).not.toContain('private-marker')
  })
  it.each([{ clusterId: '../other' }, { scope: 'unknown' }, { verificationState: 'unknown' }])('rejects bad backup filters before dispatch: %j', async filters => {
    const f = fixture()
    expect(() => f.client.backups(controlActor, filters)).toThrow()
    expect(f.request).not.toHaveBeenCalled()
  })
  it('allows only the declared backup read path in the native bridge', () => {
    expect(isControlAdminReadPath('/admin/backups?limit=25&clusterId=local-a&scope=bundle&verificationState=failed')).toBe(true)
    for (const path of ['/admin/backups/file', '/admin/backups?url=https://private.invalid', '/admin/backups?scope=bundle&scope=cluster'])
      expect(isControlAdminReadPath(path)).toBe(false)
  })
  it('preserves the server cursor and encodes search without storing the bearer', async () => {
    const f = fixture(); f.state.response = { items: [controlWorkspace()], nextCursor: 'server-cursor' }
    const result = await f.client.workspaces(controlActor, { search: 'A & B', cursor: 'previous' })
    expect(result.nextCursor).toBe('server-cursor')
    expect(f.request).toHaveBeenCalledWith('/admin/workspaces?limit=25&search=A+%26+B&cursor=previous', expect.objectContaining({
      method: 'GET', headers: { Authorization: 'Bearer ' + controlSession().access_token }, signal: expect.any(AbortSignal),
    }))
    expect(JSON.stringify(result)).not.toContain(controlSession().access_token)
  })
  it('strips unexpected secret fields from a valid response', async () => {
    const f = fixture(); f.state.response = { items: [controlCluster({ serviceKey: 'private-value' })], nextCursor: null }
    expect(JSON.stringify(await f.client.clusters(controlActor))).not.toContain('private-value')
  })
  it('accepts explicitly unknown metric values from the declared server contract', async () => {
    const f = fixture(), at = new Date().toISOString()
    f.state.response = { items: [controlCluster({ health: { status: 'unknown', observedAt: at, receivedAt: at, validUntil: at,
      generation: 1, schemaVersion: 1, measurementScope: null, dataDisks: null, reasonCodes: ['METRICS_STALE'], metrics: {
        cpuUsedPercent: null, memoryAvailableBytes: null, memoryTotalBytes: 0, dataDiskFreeBytes: null, dataDiskTotalBytes: 0,
        dataDiskInodeFreePercent: null, dbConnectionsUsed: null, dbConnectionBudget: 0 } } })], nextCursor: null }
    const result = await f.client.clusters(controlActor)
    expect(result.items[0].health.metrics.cpuUsedPercent).toBeNull()
  })
  it.each(['target', 'binding', 'job', 'timeline'])('rejects wrong %s in workspace details', async mode => {
    const f = fixture(), data = controlWorkspaceDetail()
    if (mode === 'target') data.workspace.id = emailOther
    if (mode === 'binding') data.receipt.binding.owner_id = emailOther
    if (mode === 'job') Object.assign(data, { job: { id: emailOther, workspaceId: emailOther, state: 'queued', attempts: 0,
      nextAttemptAt: data.workspace.createdAt, leaseUntil: null, lastErrorCode: null, updatedAt: data.workspace.updatedAt } })
    if (mode === 'timeline') Object.assign(data.timeline, { items: [{ id: '1', clusterId: 'other-b', type: 'success', source: 'provisioning',
      actorId: null, requestId: null, commandId: null, createdAt: data.workspace.createdAt }] })
    f.state.response = data
    await expect(f.client.workspace(controlActor, registrationId)).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('rejects a valid cluster response for a different target', async () => {
    const f = fixture(); f.state.response = controlCluster({ id: 'other-b' })
    await expect(f.client.cluster(controlActor, 'local-a')).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it.each(['other-user', 'other-session', 'cancelled', 'runtime'])('never dispatches after %s changes', async mode => {
    const f = fixture(), controller = new AbortController()
    if (mode === 'other-user') f.state.session = { access_token: emailToken(emailOther), user: { id: emailOther } }
    if (mode === 'other-session') f.state.session.access_token = emailToken(controlActor.actorId, emailOtherSession)
    if (mode === 'cancelled') controller.abort()
    if (mode === 'runtime') f.state.current = false
    await expect(f.client.clusters(controlActor, {}, { signal: controller.signal, isCurrent: () => f.state.current })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('discards an in-flight result after the actual session changes', async () => {
    const f = fixture(); f.request.mockImplementation(async () => {
      f.state.session.access_token = emailToken(controlActor.actorId, emailOtherSession)
      return f.state.response
    })
    await expect(f.client.clusters(controlActor)).rejects.toMatchObject({ code: 'identity_changed' })
  })
  it('rejects malformed data rather than treating an unavailable list as empty', async () => {
    const f = fixture(); f.state.response = { items: [], nextCursor: 5 }
    await expect(f.client.clusters(controlActor)).rejects.toMatchObject({ code: 'invalid_response' })
    f.request.mockRejectedValueOnce(new Error('private database details'))
    await expect(f.client.clusters(controlActor)).rejects.toMatchObject({ code: 'read_unavailable' })
  })
  it('cancels a slow request after 30 seconds even with a caller signal', async () => {
    vi.useFakeTimers(); const f = fixture()
    f.request.mockImplementation((_path?: string, options?: RequestInit) => new Promise((_, reject) =>
      options!.signal!.addEventListener('abort', () => reject(new Error('aborted')))))
    const result = f.client.clusters(controlActor, {}, { signal: new AbortController().signal }).catch(error => error)
    await vi.advanceTimersByTimeAsync(30001)
    expect(await result).toMatchObject({ code: 'read_unavailable' })
  })
  it.each(['/admin/clusters/../workspaces', '/admin/clusters?redirect=https://evil.invalid', '//evil.invalid/admin/clusters',
    '/admin/alerts?redirect=foreign', '/admin/workspaces?status=active&status=reserved', '/admin/clusters#anything'])('rejects unapproved native path %s', path => {
    expect(isControlAdminReadPath(path)).toBe(false)
  })
})
