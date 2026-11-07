import { afterEach, describe, expect, it, vi } from 'vitest'
import { clusterOperations, createControlAdminClient } from './control-admin'
import { ControlHttpError } from './control-http-error'
import { createClusterJournal } from './control-cluster-journal'
import { isControlAdminReadPath, isControlClusterWritePath } from './control-admin-routes'
import { controlActor, controlSession, controlCluster } from '@/test/control-admin-fixture'
import { controlClusterRequest, controlClusterReceipt } from '@/test/control-cluster-fixture'
import { emailOther, emailOtherSession } from '@/test/email-auth-fixture'

afterEach(() => { localStorage.clear(); vi.useRealTimers() })
const context = { ...controlActor, runtime: 'https://control.example.test|cluster-a' }
function fixture(operation = controlClusterRequest().operation) {
  const state = { response: controlClusterReceipt(operation) as unknown, current: true }
  const request = vi.fn(async () => state.response)
  return { state, request, client: createControlAdminClient({ request, getSession: async () => ({ data: { session: controlSession() }, error: null }) }) }
}
describe('cluster operational client and journal', () => {
  it('allows deployment queue reads and original-key lookup through the native transport without accepting arbitrary targets', () => {
    for (const path of ['/admin/deployment-specs?limit=25&clusterId=local-a', '/admin/deployment-jobs?state=running&cursor=next',
      '/admin/clusters/local-a/command-result?operation=queue_deployment', '/admin/clusters/local-a/command-result?operation=set_host_maintenance',
      '/admin/clusters/local-a/command-result?operation=set_host_active']) expect(isControlAdminReadPath(path)).toBe(true)
    for (const path of ['/admin/deployment-specs?host=1.1.1.1', '/admin/deployment-specs?state=running', '/admin/deployment-jobs?specId=arbitrary',
      '/admin/deployment-jobs?state=running&state=queued', '/admin/deployment-specs/execute', '/admin/clusters/local-a/command-result?operation=queue_deployment&key=other']) expect(isControlAdminReadPath(path)).toBe(false)
  })
  it('registers an approved candidate with a durable key and recovers the version-one receipt by GET', async () => {
    const f = fixture(), command = { key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', target: 'local-b', expectedVersion: 1 as const,
      operation: 'register_cluster' as const, reason: 'Ghi nhận cụm thử nghiệm',
      payload: { hostId: 'host-b', backendKind: 'self_hosted' as const, endpointRef: 'local-b', credentialRef: 'cred-b' } }
    f.state.response = { commandId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'succeeded', targetVersion: 1,
      result: controlCluster({ id: 'local-b', hostId: 'host-b', rowVersion: 1, validationState: 'pending', allocatedCount: 0, tenantLimit: 1 }) }
    const journal = createClusterJournal(() => localStorage), entry = journal.prepare(context, command)
    await f.client.clusterCommand(controlActor, entry.request)
    expect(f.request).toHaveBeenLastCalledWith('/admin/clusters/register', expect.objectContaining({ method: 'POST',
      body: JSON.stringify({ id: 'local-b', ...command.payload, expectedVersion: 1, reason: command.reason }) }))
    await f.client.clusterCommandResult(controlActor, entry.request)
    expect(f.request).toHaveBeenLastCalledWith('/admin/clusters/local-b/command-result?operation=register_cluster', expect.objectContaining({ method: 'GET' }))
    expect(journal.list(context)).toEqual([entry])
    expect(() => journal.prepare(context, { ...command, reason: 'Another request' })).toThrow()
    f.request.mockRejectedValueOnce(new ControlHttpError(409, { error: 'CLUSTER_ALREADY_REGISTERED' }))
    await expect(f.client.clusterCommand(controlActor, entry.request)).rejects.toMatchObject({ code: 'not_applied' })
    f.state.response = { ...(f.state.response as object), result: controlCluster({ id: 'local-b', hostId: 'other-host', rowVersion: 1, validationState: 'pending', tenantLimit: 1 }) }
    await expect(f.client.clusterCommandResult(controlActor, entry.request)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(isControlAdminReadPath('/admin/hosts?limit=25&environment=local')).toBe(true)
    expect(isControlAdminReadPath('/admin/hosts?endpoint=https://evil.invalid')).toBe(false)
    expect(isControlAdminReadPath('/admin/cluster-candidates?limit=25')).toBe(true)
    expect(isControlAdminReadPath('/admin/clusters/local-b/command-result?operation=register_cluster')).toBe(true)
  })
  it.each(clusterOperations)('executes and recovers %s through exact routes preserving the case-sensitive original key', async operation => {
    const f = fixture(operation), command = controlClusterRequest(operation); command.key = command.key.toUpperCase()
    await f.client.clusterCommand(controlActor, command)
    expect(f.request).toHaveBeenLastCalledWith('/admin/clusters/local-a/commands', expect.objectContaining({ method: 'POST',
      headers: { Authorization: 'Bearer ' + controlSession().access_token, 'Idempotency-Key': command.key },
      body: JSON.stringify({ operation, expectedVersion: 1, reason: command.reason, payload: command.payload }) }))
    await f.client.clusterCommandResult(controlActor, command)
    const [path, options] = f.request.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(path).toBe('/admin/clusters/local-a/command-result?operation=' + operation); expect(options.method).toBe('GET'); expect(options.body).toBeUndefined()
  })
  it.each(['target', 'version', 'row-version', 'effect', 'status', 'limit'])('refuses a receipt with inconsistent %s', async mode => {
    const operation = mode === 'limit' ? 'update_policy' : mode === 'status' ? 'set_draining' : 'close_admission'
    const f = fixture(operation), receipt = controlClusterReceipt(operation)
    if (mode === 'target') receipt.result.id = 'other-cluster'
    if (mode === 'version') receipt.targetVersion = 4
    if (mode === 'row-version') receipt.result.rowVersion = 3
    if (mode === 'effect') receipt.result.admission.decision = 'open'
    if (mode === 'status') receipt.result.status = 'active'
    if (mode === 'limit') receipt.result.tenantLimit = 16
    f.state.response = receipt
    await expect(f.client.clusterCommand(controlActor, controlClusterRequest(operation))).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it('rejects unsupported operations, unexpected payloads and unsafe versions before dispatch', async () => {
    const f = fixture(), command = controlClusterRequest()
    for (const input of [{ ...command, operation: 'register_cluster' }, { ...command, payload: { tenantLimit: 3 } },
      { ...command, expectedVersion: Number.MAX_SAFE_INTEGER }, { ...command, target: '../steal' },
      { ...controlClusterRequest('update_policy'), payload: { tenantLimit: 3, thresholds: {} } }])
      await expect(f.client.clusterCommand(controlActor, input as typeof command)).rejects.toMatchObject({ code: 'invalid_request' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('separates serialized rejection, absent lookup, denial, rate limit and unknown outcome without raw details', async () => {
    const f = fixture(), command = controlClusterRequest()
    for (const [status, code, expected] of [[409, 'VERSION_CONFLICT', 'not_applied'], [409, 'ADMISSION_BLOCKED', 'not_applied'],
      [404, 'CLUSTER_NOT_FOUND', 'not_applied'], [409, 'IDEMPOTENCY_CONFLICT', 'outcome_unknown'], [409, 'COMMAND_IN_PROGRESS', 'outcome_unknown'],
      [403, 'ADMIN_PERMISSION_REQUIRED', 'access_denied'], [429, 'RATE_LIMIT', 'rate_limited'], [503, 'CONTROL_UNAVAILABLE', 'outcome_unknown']] as const) {
      f.request.mockRejectedValueOnce(new ControlHttpError(status, { error: code, message: 'private SQL details' }))
      const error = await f.client.clusterCommand(controlActor, command).catch(e => e)
      expect(error.code).toBe(expected); expect(error.message).not.toContain('private SQL')
    }
    f.request.mockRejectedValueOnce(new ControlHttpError(404, { error: 'COMMAND_RESULT_UNKNOWN' }))
    await expect(f.client.clusterCommandResult(controlActor, command)).rejects.toMatchObject({ code: 'result_absent' })
  })
  it('times out ignored abort and discards success after identity/target invalidation', async () => {
    const f = fixture(), command = controlClusterRequest()
    f.request.mockImplementationOnce(async () => { f.state.current = false; return controlClusterReceipt() })
    await expect(f.client.clusterCommand(controlActor, command, { isCurrent: () => f.state.current })).rejects.toMatchObject({ code: 'identity_changed' })
    vi.useFakeTimers(); f.request.mockImplementation(() => new Promise(() => {}))
    const result = f.client.clusterCommand(controlActor, command).catch(error => error)
    await vi.advanceTimersByTimeAsync(30001); expect((await result).code).toBe('outcome_unknown')
  })
  it('keeps each original operation durable across reload/relogin and blocks another command for that cluster', () => {
    const journal = createClusterJournal(() => localStorage), command = controlClusterRequest('update_policy')
    const entry = journal.prepare(context, command), resumed = createClusterJournal(() => localStorage)
    expect(resumed.list({ ...context, sessionId: emailOtherSession })).toEqual([entry])
    expect(resumed.list({ ...context, actorId: emailOther })).toEqual([]); expect(resumed.list({ ...context, runtime: 'other' })).toEqual([])
    expect(() => resumed.prepare(context, controlClusterRequest('set_draining'))).toThrow()
    const other = resumed.prepare(context, { ...controlClusterRequest(), target: 'other-cluster' })
    resumed.complete(context, entry); resumed.complete(context, entry); expect(resumed.list(context)).toEqual([other])
    expect(JSON.stringify(localStorage)).not.toContain(controlSession().access_token)
  })
  it('fails closed on corruption/storage failure and only accepts definitive rejection codes', () => {
    const journal = createClusterJournal(() => localStorage), entry = journal.prepare(context, controlClusterRequest())
    expect(() => journal.reject(context, entry, 'RATE_LIMIT')).toThrow()
    const key = localStorage.key(0)!
    localStorage.setItem(key, JSON.stringify({ ...entry, request: { ...entry.request, reason: 'tampered reason' } }))
    expect(() => journal.complete(context, entry)).toThrow(); expect(localStorage.length).toBe(1)
    const blocked = createClusterJournal(() => { throw new Error('blocked') })
    expect(() => blocked.prepare(context, controlClusterRequest())).toThrow()
  })
  it('allows only exact native cluster paths and one approved operation in lookup', () => {
    expect(isControlClusterWritePath('/admin/clusters/cluster-a/commands')).toBe(true)
    expect(isControlClusterWritePath('/admin/clusters/register')).toBe(true)
    for (const path of ['/admin/clusters/register?target=other', '/admin/clusters/cluster-a/commands?target=other', '/admin/clusters/../commands']) expect(isControlClusterWritePath(path)).toBe(false)
    expect(isControlAdminReadPath('/admin/clusters/cluster-a/command-result?operation=close_admission')).toBe(true)
    for (const query of ['', '?operation=unknown', '?operation=close_admission&actor=other', '?operation=close_admission&operation=close_admission'])
      expect(isControlAdminReadPath('/admin/clusters/cluster-a/command-result' + query)).toBe(false)
  })
})
