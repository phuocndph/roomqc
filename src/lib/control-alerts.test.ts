import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlAdminClient, type ControlAlertRequest } from './control-admin'
import { ControlHttpError } from './control-http-error'
import { createAlertJournal } from './control-alert-journal'
import { controlActor, controlSession } from '@/test/control-admin-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'
import { controlAlert, controlAlertReceipt } from '@/test/control-alert-fixture'
import { isControlAdminReadPath, isControlAlertWritePath } from './control-admin-routes'

afterEach(() => { localStorage.clear(); vi.useRealTimers() })
function fixture() {
  const state = { session: controlSession(), current: true, response: controlAlertReceipt() as unknown }
  const request = vi.fn(async () => state.response)
  const client = createControlAdminClient({ request, getSession: async () => ({ data: { session: state.session }, error: null }) })
  return { state, request, client }
}
const command = (): ControlAlertRequest => ({ key: crypto.randomUUID(), target: controlAlert().id, expectedVersion: 1, reason: 'Đang kiểm tra ổ dữ liệu' })
const context = { ...controlActor, runtime: 'https://control.example.test|cluster-a|v1' }
describe('control alert typed client and durable journal', () => {
  it('lists strict server filters/cursor and strips unknown fields', async () => {
    const f = fixture(); f.state.response = { items: [{ ...controlAlert(), secret: 'private-marker' }], nextCursor: 'next-page' }
    const result = await f.client.alerts(controlActor, { state: 'open', severity: 'critical', cursor: 'old-page' })
    expect(f.request).toHaveBeenCalledWith('/admin/alerts?limit=25&state=open&severity=critical&cursor=old-page', expect.objectContaining({ method: 'GET' }))
    expect(result.nextCursor).toBe('next-page'); expect(JSON.stringify(result)).not.toContain('private-marker')
    expect(() => f.client.alerts(controlActor, { state: 'random' })).toThrow()
  })
  it('posts the original normalized key/version/reason and reads a receipt using only that key', async () => {
    const f = fixture(), c = command(); c.target = c.target.toUpperCase(); c.key = c.key.toUpperCase()
    const receipt = await f.client.acknowledgeAlert(controlActor, c)
    expect(receipt.result.acknowledgedBy).toBe(controlActor.actorId)
    expect(f.request).toHaveBeenCalledWith('/admin/alerts/' + c.target.toLowerCase() + '/acknowledge', expect.objectContaining({
      method: 'POST', headers: { Authorization: 'Bearer ' + controlSession().access_token, 'Idempotency-Key': c.key.toLowerCase() },
      body: JSON.stringify({ expectedVersion: 1, reason: c.reason }),
    }))
    await f.client.alertAcknowledgement(controlActor, c)
    const [path, options] = f.request.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(path).toBe('/admin/alerts/' + c.target.toLowerCase() + '/acknowledgement-result')
    expect(options.method).toBe('GET'); expect(options.body).toBeUndefined()
  })
  it.each(['target', 'actor', 'version', 'row-version', 'ack-time', 'resolved'])('rejects an inconsistent %s receipt without claiming success', async mode => {
    const f = fixture(), receipt = controlAlertReceipt()
    if (mode === 'target') receipt.result.id = emailOther
    if (mode === 'actor') receipt.result.acknowledgedBy = emailOther
    if (mode === 'version') receipt.targetVersion = 3
    if (mode === 'row-version') receipt.result.rowVersion = 3
    if (mode === 'ack-time') receipt.result.acknowledgedAt = null
    if (mode === 'resolved') receipt.result.resolvedAt = new Date().toISOString()
    f.state.response = receipt
    await expect(f.client.acknowledgeAlert(controlActor, command())).rejects.toBeInstanceOf(Error)
  })
  it('distinguishes absent result, DB-serialized rejection, denied access, limits and unknown outcome without raw details', async () => {
    const f = fixture(), c = command()
    for (const [status, code, expected] of [[409, 'VERSION_CONFLICT', 'not_applied'], [404, 'ALERT_NOT_FOUND', 'not_applied'],
      [409, 'IDEMPOTENCY_CONFLICT', 'outcome_unknown'], [409, 'ALERT_COMMAND_PENDING', 'outcome_unknown'],
      [403, 'ADMIN_PERMISSION_REQUIRED', 'access_denied'], [429, 'RATE_LIMIT', 'rate_limited'], [503, 'CONTROL_UNAVAILABLE', 'outcome_unknown']] as const) {
      f.request.mockRejectedValueOnce(new ControlHttpError(status, { error: code, message: 'private SQL marker' }))
      const error = await f.client.acknowledgeAlert(controlActor, c).catch(e => e)
      expect(error.code).toBe(expected); expect(error.message).not.toContain('private SQL')
    }
    f.request.mockRejectedValueOnce(new ControlHttpError(404, { error: 'ALERT_COMMAND_RESULT_UNKNOWN' }))
    await expect(f.client.alertAcknowledgement(controlActor, c)).rejects.toMatchObject({ code: 'result_absent' })
  })
  it('prevents dispatch after session change and discards late successful or denied responses', async () => {
    const f = fixture(), c = command(); f.state.session.access_token = emailToken(controlActor.actorId, emailOtherSession)
    await expect(f.client.acknowledgeAlert(controlActor, c)).rejects.toMatchObject({ code: 'identity_changed' }); expect(f.request).not.toHaveBeenCalled()
    f.state.session = controlSession()
    f.request.mockImplementation(async () => { f.state.current = false; return controlAlertReceipt() })
    await expect(f.client.acknowledgeAlert(controlActor, c, { isCurrent: () => f.state.current })).rejects.toMatchObject({ code: 'identity_changed' })
  })
  it('deadlines even a transport that ignores abort and retains a journal before dispatch', async () => {
    vi.useFakeTimers(); const f = fixture(), journal = createAlertJournal(() => localStorage)
    const entry = journal.prepare(context, { target: controlAlert().id, expectedVersion: 1, reason: command().reason })
    f.request.mockImplementation(() => new Promise(() => {}))
    const result = f.client.acknowledgeAlert(controlActor, entry.request).catch(error => error)
    await vi.advanceTimersByTimeAsync(30001)
    expect((await result).code).toBe('outcome_unknown'); expect(journal.list(context)).toHaveLength(1)
  })
  it.each(['before-dispatch', 'after-response'])('bounds a stalled session lookup %s without losing the saved command', async phase => {
    vi.useFakeTimers()
    const request = vi.fn(async () => controlAlertReceipt()), getSession = vi.fn()
    getSession.mockImplementation(() => new Promise(() => {}))
    if (phase === 'after-response') getSession.mockResolvedValueOnce({ data: { session: controlSession() }, error: null })
    const journal = createAlertJournal(() => localStorage)
    const entry = journal.prepare(context, { target: controlAlert().id, expectedVersion: 1, reason: command().reason })
    const client = createControlAdminClient({ request, getSession })
    const result = client.acknowledgeAlert(controlActor, entry.request).catch(error => error)
    await vi.advanceTimersByTimeAsync(30001)
    expect((await result).code).toBe('identity_changed')
    expect(request).toHaveBeenCalledTimes(phase === 'after-response' ? 1 : 0)
    expect(journal.list(context)).toEqual([entry]); expect(vi.getTimerCount()).toBe(0)
  })
  it('recovers immutable entries after reload/relogin while isolating other actors and control runtimes', () => {
    const journal = createAlertJournal(() => localStorage), c = command()
    const entry = journal.prepare(context, { target: c.target, expectedVersion: c.expectedVersion, reason: c.reason })
    const resumed = createAlertJournal(() => localStorage)
    expect(resumed.list({ ...context, sessionId: emailOtherSession })).toEqual([entry])
    expect(resumed.list({ ...context, actorId: emailOther })).toEqual([])
    expect(resumed.list({ ...context, runtime: 'different-control-runtime' })).toEqual([])
    expect(() => resumed.prepare(context, { target: c.target, expectedVersion: 1, reason: c.reason })).toThrow()
    const other = resumed.prepare(context, { target: emailOther, expectedVersion: 1, reason: c.reason })
    expect(resumed.list(context)).toHaveLength(2)
    resumed.complete(context, entry); resumed.complete(context, entry); expect(resumed.list(context)).toEqual([other])
    expect(JSON.stringify(localStorage)).not.toContain(controlSession().access_token)
  })
  it('fails closed on blocked, corrupted or failed readback storage and never silently overwrites a command', () => {
    const journal = createAlertJournal(() => localStorage), c = command()
    const entry = journal.prepare(context, { target: c.target, expectedVersion: 1, reason: c.reason }), key = localStorage.key(0)!
    localStorage.setItem(key, JSON.stringify({ ...entry, actorId: emailOther }))
    expect(() => journal.list(context)).toThrow(); expect(() => journal.complete(context, entry)).toThrow(); expect(localStorage.length).toBe(1)
    const blocked = createAlertJournal(() => { throw new Error('blocked') })
    expect(() => blocked.prepare(context, { target: c.target, expectedVersion: 1, reason: c.reason })).toThrow()
    localStorage.clear()
    const silent = createAlertJournal(() => ({ length: 0, key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {} }))
    expect(() => silent.prepare(context, { target: c.target, expectedVersion: 1, reason: c.reason })).toThrow()
  })
  it('allows narrowly approved native alert list, result and mutation paths, never arbitrary admin writes', () => {
    const id = controlAlert().id
    expect(isControlAdminReadPath('/admin/alerts?limit=25&state=open')).toBe(true)
    expect(isControlAdminReadPath('/admin/alerts/' + id + '/acknowledgement-result')).toBe(true)
    expect(isControlAlertWritePath('/admin/alerts/' + id + '/acknowledge')).toBe(true)
    for (const path of ['/admin/alerts?state=open&state=resolved', '/admin/alerts?redirect=foreign', '/admin/alerts/' + id + '/acknowledgement-result?key=x']) expect(isControlAdminReadPath(path)).toBe(false)
    for (const path of ['/admin/clusters/register', '/admin/alerts/' + id + '/acknowledge?x=y', '/admin/alerts/../acknowledge']) expect(isControlAlertWritePath(path)).toBe(false)
  })
})
