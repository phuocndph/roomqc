import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserAdviceLock, createOperationsAdviceClient } from './operations-advice-client'
import { adviceContext as context, adviceFixture, adviceItems, adviceScope as scope, deferredAdvice } from '@/test/operations-advice-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'

let f: ReturnType<typeof adviceFixture>
const client = () => createOperationsAdviceClient(f.deps)
beforeEach(() => { localStorage.clear(); f = adviceFixture() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear() })
const lost = async () => { f.state.loss = 'before'; await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' }); f.state.loss = 'none' }
describe('manual advice durable client', () => {
  it('construction and reading pending never send a request', () => { const c = client(); expect(c.pending(context, scope)).toBeNull(); expect(f.http).not.toHaveBeenCalled() })
  it('persists only identity, key and scope before any HTTP, then removes a verified completion', async () => {
    let stored = ''
    f.state.beforeReply = () => { stored = localStorage.getItem(localStorage.key(0)!)! }
    const r = await client().generate(context, scope)
    expect(r.advice).toEqual(adviceItems); expect(f.state.calls).toEqual([{ action: 'generate', command_id: r.command_id, ...scope }])
    expect(stored).toContain(r.command_id); expect(stored).not.toContain(emailToken()); expect(stored).not.toContain('snapshot'); expect(stored).not.toContain('Advice 0')
    expect(localStorage.length).toBe(0); expect(f.state.effects).toBe(1)
  })
  it('uses only the fixed function endpoint, anonymous API key and current user bearer', async () => {
    await client().generate(context, scope)
    expect(f.http).toHaveBeenCalledWith('https://owned.roomqc.invalid/functions/v1/operations-advisor', expect.objectContaining({
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: expect.objectContaining({ apikey: 'public-fixture', Authorization: 'Bearer ' + emailToken() }) }))
    expect(f.deps.getSession).toHaveBeenCalledTimes(2)
  })
  it.each(['before', 'after'])('keeps the exact key across response loss %s and a new client instance', async loss => {
    f.state.loss = loss; await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' })
    const pending = client().pending(context, scope)!, id = pending.request.command_id
    f.state.loss = 'none'; const r = await client().lookup(context, scope)
    expect(r.state).toBe(loss === 'after' ? 'completed' : 'not_found'); expect(f.state.calls[1]).toEqual({ action: 'lookup', command_id: id })
    expect(f.state.effects).toBe(loss === 'after' ? 1 : 0)
    expect(client().pending(context, scope) === null).toBe(loss === 'after')
  })
  it('lookup not_found never silently generates, explicit resume uses the stored key', async () => {
    await lost(); const id = client().pending(context, scope)!.request.command_id
    await client().lookup(context, scope); expect(f.state.effects).toBe(0)
    await client().resume(context, scope); expect(f.state.effects).toBe(1)
    expect(f.state.calls.every(c => c.command_id === id)).toBe(true); expect(f.state.calls.map(c => c.action)).toEqual(['generate', 'lookup', 'lookup', 'generate'])
  })
  it('cancel before any server receipt creates a terminal tombstone using the stored scope', async () => {
    await lost(); const r = await client().cancel(context, scope)
    expect(r.state).toBe('cancelled'); expect(f.state.effects).toBe(0); expect(client().pending(context, scope)).toBeNull()
  })
  it('cancel cannot erase an already committed result', async () => {
    f.state.loss = 'after'; await expect(client().generate(context, scope)).rejects.toThrow(); f.state.loss = 'none'
    expect((await client().cancel(context, scope)).state).toBe('completed'); expect(f.state.effects).toBe(1)
  })
  it('unknown lookup, resume and cancel never repeat provider generation or clear pending', async () => {
    f.state.generateState = 'unknown'; const c = client(); const result = await c.generate(context, scope)
    expect(result.state).toBe('unknown'); await c.lookup(context, scope); await c.resume(context, scope); await c.cancel(context, scope)
    expect(f.state.calls.filter(c => c.action === 'generate')).toHaveLength(1); expect(c.pending(context, scope)).not.toBeNull()
    await expect(c.generate(context, scope)).rejects.toMatchObject({ code: 'pending_command' })
  })
  it('reserved requires explicit continuation and uses one key', async () => {
    f.state.generateState = 'reserved'; const c = client(); await c.generate(context, scope); const pending = c.pending(context, scope)!
    await c.lookup(context, scope); expect(f.state.calls.filter(c => c.action === 'generate')).toHaveLength(1)
    await c.resume(context, scope); expect(f.state.calls.filter(c => c.action === 'generate')).toHaveLength(2)
    expect(f.state.calls.every(c => c.command_id === pending.request.command_id)).toBe(true)
  })
  it('a second client/tab cannot generate while the first holds the common scope lock', async () => {
    const gate = deferredAdvice(); f.state.beforeReply = () => gate.wait
    const first = client().generate(context, scope); await vi.waitFor(() => expect(f.state.calls).toHaveLength(1))
    await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'flow_busy' }); expect(f.state.calls).toHaveLength(1)
    gate.release(); await first
  })
  it('a pending command from another client/tab blocks a fresh generation after response loss', async () => {
    await lost(); await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'pending_command' }); expect(f.state.calls).toHaveLength(1)
  })
  it('same actor can log in again and recover with the new session without changing the command key', async () => {
    f.state.loss = 'after'; await expect(client().generate(context, scope)).rejects.toThrow(); const id = client().pending(context, scope)!.request.command_id
    f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } }; f.state.loss = 'none'
    expect((await client().lookup({ ...context, sessionId: emailOtherSession }, scope)).command_id).toBe(id); expect(f.state.effects).toBe(1)
  })
  it.each(['actor', 'tenant', 'runtime', 'hotel', 'period', 'timezone'])('isolates stored pending across %s', async field => {
    await lost(); const c = { ...context }, s = { ...scope }
    if (field === 'actor') c.actorId = emailOther
    if (field === 'tenant') c.tenantId = emailOther
    if (field === 'runtime') c.runtime = 'other-runtime'
    if (field === 'hotel') s.hotel = emailOther
    if (field === 'period') s.start = '2026-10-02'
    if (field === 'timezone') s.timezone = 'UTC'
    expect(client().pending(c, s)).toBeNull(); expect(client().pending(context, scope)).not.toBeNull()
  })
  it.each([401, 403, 409, 429, 503, 500])('keeps pending and returns a safe error for HTTP%s', async status => {
    f.state.status = status; const e = await client().generate(context, scope).catch(e => e)
    expect(e.message).not.toContain('private'); expect(client().pending(context, scope)).not.toBeNull(); expect(f.state.effects).toBe(0)
    expect(e.code).toBe([401, 403].includes(status) ? 'permission_denied' : status === 409 ? 'command_conflict' : status === 429 ? 'quota_exceeded' : status === 503 ? 'unavailable' : 'outcome_unknown')
  })
  it.each(['malformed', 'wrong-key', 'wrong-scope', 'invalid-output', 'oversize'])('does not clear pending or release %s response', async mode => {
    if (mode === 'malformed') f.state.malformed = true
    if (mode === 'wrong-key') f.state.reply = r => ({ ...r, command_id: emailOther })
    if (mode === 'wrong-scope') f.state.reply = r => ({ ...r, request: { ...scope, hotel: emailOther } })
    if (mode === 'invalid-output') f.state.reply = r => ({ ...r, advice: [] })
    if (mode === 'oversize') f.state.reply = r => ({ ...r, padding: 'x'.repeat(49153) })
    await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' }); expect(client().pending(context, scope)).not.toBeNull()
  })
  it.each(['set-throws', 'set-discarded', 'read-throws'])('storage %s fails before sending', async mode => {
    const storage = { length: 0, getItem: () => { if (mode === 'read-throws') throw new Error(); return null },
      setItem: () => { if (mode === 'set-throws') throw new Error() }, removeItem: () => {} }
    await expect(createOperationsAdviceClient({ ...f.deps, storage: () => storage }).generate(context, scope)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).not.toHaveBeenCalled()
  })
  it.each(['json', 'extra', 'scope', 'session'])('rejects %s tampering instead of overwriting pending', async mode => {
    await lost(); const key = localStorage.key(0)!, item = JSON.parse(localStorage.getItem(key)!)
    if (mode === 'extra') item.access_token = 'private'
    if (mode === 'scope') item.request.hotel = emailOther
    if (mode === 'session') item.context.sessionId = 'not-a-session'
    const raw = mode === 'json' ? '{' : JSON.stringify(item); localStorage.setItem(key, raw)
    await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'storage_unavailable' }); expect(localStorage.getItem(key)).toBe(raw)
    expect(f.state.calls).toHaveLength(1)
  })
  it('identity changes after commit cannot remove pending or release old advice', async () => {
    f.state.beforeReply = () => { f.state.session = { access_token: emailToken(emailOther), user: { id: emailOther } } }
    await expect(client().generate(context, scope)).rejects.toMatchObject({ code: 'identity_changed' }); expect(client().pending(context, scope)).not.toBeNull()
  })
  it('A→B→A identity epoch rejects a late completion even when the same actor returns', async () => {
    let epoch = 0; f.state.beforeReply = () => { epoch += 2 }
    await expect(client().generate(context, scope, { isCurrent: () => epoch === 0 })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(client().pending(context, scope)).not.toBeNull()
  })
  it('a timeout preserves pending and does not retry an unobserved request', async () => {
    vi.useFakeTimers(); f.state.beforeReply = () => new Promise<void>(() => {})
    const task = client().generate(context, scope).catch(e => e); await vi.advanceTimersByTimeAsync(65001)
    expect(await task).toMatchObject({ code: 'outcome_unknown' }); expect(f.state.calls).toHaveLength(1); expect(client().pending(context, scope)).not.toBeNull()
  })
  it('abort before sending cannot create pending', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(client().generate(context, scope, { signal: controller.signal })).rejects.toMatchObject({ code: 'identity_changed' }); expect(localStorage.length).toBe(0)
  })
  it('a terminal receipt remains usable if storage removal fails; recovery stays possible', async () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error() })
    expect((await client().generate(context, scope)).state).toBe('completed'); expect(client().pending(context, scope)).not.toBeNull()
    remove.mockRestore(); expect((await client().lookup(context, scope)).state).toBe('completed'); expect(localStorage.length).toBe(0)
  })
  it('a missing Web Locks API fails closed before storage or HTTP', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks'); Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    try { await expect(createOperationsAdviceClient({ ...f.deps, lock: browserAdviceLock }).generate(context, scope)).rejects.toMatchObject({ code: 'lock_unavailable' }); expect(localStorage.length).toBe(0); expect(f.http).not.toHaveBeenCalled() }
    finally { if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks') }
  })
  it('uses the browser exclusive ifAvailable lock and denies an occupied lock', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks'), request = vi.fn(async (_name, options, run) => { expect(options).toEqual({ mode: 'exclusive', ifAvailable: true }); return run(null) })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    try { await expect(browserAdviceLock('owned', async () => 'no')).rejects.toMatchObject({ code: 'flow_busy' }) }
    finally { if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks') }
  })
  it.each(['https://name:password@example.invalid', 'javascript:void(0)', 'https://example.invalid/path', 'https://example.invalid/?url=other'])('rejects unsafe endpoint %s', endpoint => {
    expect(() => createOperationsAdviceClient({ ...f.deps, endpoint })).toThrow()
  })
})
