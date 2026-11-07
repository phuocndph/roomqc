import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlAdminClient } from './control-admin'
import { ControlHttpError } from './control-http-error'
import { createWorkspaceRecheckJournal } from './control-workspace-recheck-journal'
import { isControlAdminReadPath, isControlRecheckWritePath } from './control-admin-routes'
import { controlActor, controlSession } from '@/test/control-admin-fixture'
import { controlRecheckRequest, controlRecheckReceipt, controlRecheckDetail } from '@/test/control-recheck-fixture'

afterEach(() => { localStorage.clear() })
const context = { ...controlActor, runtime: 'https://control.example.test|authority-a' }
function fixture() {
  const request = vi.fn(async () => controlRecheckReceipt())
  return { request, client: createControlAdminClient({ request, getSession: async () => ({ data: { session: controlSession() }, error: null }) }) }
}
describe('workspace recheck intent and result', () => {
  it('can inspect a committed remote receipt before directory activation without treating it as active', async () => {
    const detail = controlRecheckDetail(); detail.workspace.status = 'provisioning'
    detail.workspace.tenantId = null; detail.workspace.hotelId = null
    const request = vi.fn(async () => detail)
    const client = createControlAdminClient({ request, getSession: async () => ({ data: { session: controlSession() }, error: null }) })
    expect((await client.workspace(controlActor, detail.workspace.id)).workspace.status).toBe('provisioning')
    detail.workspace.tenantId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    await expect(client.workspace(controlActor, detail.workspace.id)).rejects.toMatchObject({ code: 'invalid_response' })
    detail.workspace.tenantId = null; detail.workspace.ownerId = null
    await expect(client.workspace(controlActor, detail.workspace.id)).rejects.toMatchObject({ code: 'invalid_response' })
  })
  it('uses exact POST and no-query GET with normalized key and original snapshot', async () => {
    const f = fixture(), command = controlRecheckRequest(); command.key = command.key.toUpperCase()
    await f.client.recheckWorkspace(controlActor, command)
    expect(f.request).toHaveBeenLastCalledWith('/admin/workspaces/' + command.target + '/recheck', expect.objectContaining({ method: 'POST',
      headers: { Authorization: 'Bearer ' + controlSession().access_token, 'Idempotency-Key': command.key.toLowerCase() },
      body: JSON.stringify({ expectedVersion: 1, expectedSnapshotSha256: command.expectedSnapshotSha256, reason: command.reason }) }))
    await f.client.recheckWorkspace(controlActor, command, true)
    expect(f.request).toHaveBeenLastCalledWith('/admin/workspaces/' + command.target + '/recheck-result', expect.objectContaining({ method: 'GET' }))
  })
  it.each(['workspaceId', 'requestKey', 'routingVersion'])('rejects a result from another %s', async field => {
    const f = fixture(), receipt = controlRecheckReceipt()
    f.request.mockResolvedValueOnce({ ...receipt, [field]: field === 'routingVersion' ? 2 : 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })
    await expect(f.client.recheckWorkspace(controlActor, controlRecheckRequest())).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it.each([[409, 'WORKSPACE_SNAPSHOT_CHANGED', 'not_applied'], [404, 'WORKSPACE_NOT_FOUND', 'not_applied'],
    [409, 'WORKSPACE_RECHECK_KEY_CONFLICT', 'outcome_unknown'], [503, 'CONTROL_UNAVAILABLE', 'outcome_unknown'],
    [403, 'SUPPORT_ADMIN_REQUIRED', 'access_denied']])('classifies %s/%s without leaking details', async (status, code, expected) => {
    const f = fixture(); f.request.mockRejectedValueOnce(new ControlHttpError(Number(status), { error: code, message: 'private SQL' }))
    const error = await f.client.recheckWorkspace(controlActor, controlRecheckRequest()).catch(e => e)
    expect(error.code).toBe(expected); expect(error.message).not.toContain('private SQL')
  })
  it('retains durable intent across session renewal and isolates runtime/actor namespaces', () => {
    const journal = createWorkspaceRecheckJournal(() => localStorage, () => controlRecheckRequest().key)
    const entry = journal.prepare(context, controlRecheckRequest())
    expect(journal.list({ ...context, sessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })).toEqual([entry])
    expect(journal.list({ ...context, runtime: 'other' })).toEqual([])
    expect(journal.list({ ...context, actorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })).toEqual([])
    expect(JSON.stringify(localStorage)).not.toContain(controlSession().access_token)
    expect(() => journal.prepare(context, controlRecheckRequest())).toThrow()
    expect(() => journal.reject(context, entry, 'WORKSPACE_RECHECK_KEY_CONFLICT')).toThrow()
    const rejected = journal.reject(context, entry, 'WORKSPACE_SNAPSHOT_CHANGED'); journal.complete(context, rejected)
    expect(localStorage.length).toBe(0)
  })
  it('allowlists only exact routes and rejects query or traversal mutations', () => {
    const path = '/admin/workspaces/' + controlRecheckRequest().target
    expect(isControlRecheckWritePath(path + '/recheck')).toBe(true)
    expect(isControlAdminReadPath(path + '/recheck-result')).toBe(true)
    expect(isControlAdminReadPath(path + '/recheck-result?owner=other')).toBe(false)
    for (const suffix of ['/recheck?x=1', '/../recheck', '/recheck/extra']) expect(isControlRecheckWritePath(path + suffix)).toBe(false)
  })
})
