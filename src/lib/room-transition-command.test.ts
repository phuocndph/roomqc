import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoomTransitionClient, normalizeRoomCommandStatus, type RoomCommand, type RoomCommandContext } from './room-transition-command'
import { emailActor as actor, emailSession as sid, emailOtherSession as sid2, emailTenant as tenant,
  emailHotel as hotel, emailOther as roomId, emailOperation as commandId, emailToken } from '@/test/email-auth-fixture'

const context: RoomCommandContext = { actorId: actor, sessionId: sid, tenantId: tenant, runtime: 'runtime-A' }
const input = { roomId, toStatus: 'occupied_clean', reason: 'Khách nhận phòng' }
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status })
function fixture() {
  const rows = new Map<string, string>(), receipts = new Map<string, Record<string, unknown>>()
  const storage = { get length() { return rows.size }, key: (i: number) => [...rows.keys()][i] ?? null,
    getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value) }, removeItem: (key: string) => { rows.delete(key) } }
  const state = { session: { access_token: emailToken(), user: { id: actor } }, loss: '', runtimeCurrent: true, status: 200, cancelFails: false, writes: 0 }
  const completed = (c: RoomCommand) => ({ room_id: c._room_id, command_id: c._command_id, tenant_id: tenant, hotel_id: hotel,
    from: 'vacant_clean', to: c._to_status, legacy_status: 'occupied', changed: true, status_changed: true,
    workflow_event_id: hotel, workflow_dispatch_state: 'pending', replayed: false })
  const cancelled = (c: RoomCommand) => ({ state: 'cancelled', room_id: c._room_id, command_id: c._command_id,
    tenant_id: tenant, hotel_id: hotel, changed: false, status_changed: false, workflow_event_id: null, workflow_dispatch_state: 'not_required' })
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const rpc = String(url).split('/').at(-1), c = JSON.parse(String(options?.body)) as RoomCommand
    if (rpc === 'get_room_transition_result') return reply(200, receipts.get((c as unknown as { p_command_id: string }).p_command_id) ?? null)
    if (rpc === 'cancel_room_transition_command') {
      if (state.cancelFails) return reply(503, {})
      const value = receipts.get(c._command_id) ?? cancelled(c); receipts.set(c._command_id, value); return reply(200, value)
    }
    if (state.status !== 200) return reply(state.status, { message: 'INVALID_TRANSITION' })
    if (state.loss === 'before') throw new Error('private transport detail')
    if (!receipts.has(c._command_id)) { state.writes++; receipts.set(c._command_id, completed(c)) }
    if (state.loss === 'after') throw new Error('private transport detail')
    return reply(200, receipts.get(c._command_id))
  })
  const deps = { endpoint: 'http://owned.invalid', publishableKey: 'owned-public', storage: () => storage,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })), isRuntimeCurrent: () => state.runtimeCurrent,
    fetch: http as typeof fetch, newId: () => commandId }
  return { rows, receipts, storage, state, http, deps, completed, cancelled }
}
afterEach(() => vi.useRealTimers())
describe('room command correlation, recovery and terminal fencing', () => {
  it('persists before network and removes only a correctly bound completed result', async () => {
    const f = fixture(), original = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, options) => {
      expect(f.rows.size).toBe(1); expect([...f.rows.values()].join()).not.toContain(emailToken())
      return original(url, options)
    })
    await expect(createRoomTransitionClient(f.deps).save(context, input)).resolves.toMatchObject({ command_id: commandId, to: 'occupied_clean' })
    expect(f.rows.size).toBe(0); expect(f.state.writes).toBe(1)
    expect(f.http.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
  })
  it('recovers a response lost after commit across reload and a fresh session without another mutation', async () => {
    const f = fixture(); f.state.loss = 'after'
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    f.state.session = { access_token: emailToken(actor, sid2), user: { id: actor } }
    await expect(createRoomTransitionClient(f.deps).recover({ ...context, sessionId: sid2 }, roomId)).resolves.toMatchObject({ command_id: commandId })
    expect(f.http.mock.calls.map(c => String(c[0]).split('/').at(-1))).toEqual(['transition_room_status', 'get_room_transition_result'])
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it('lookup missing after request loss retries the same complete body and key', async () => {
    const f = fixture(), client = createRoomTransitionClient(f.deps); f.state.loss = 'before'
    await expect(client.save(context, input)).rejects.toThrow(); const body = f.http.mock.calls[0][1]?.body
    f.state.loss = ''; await client.recover(context, roomId)
    expect(f.http.mock.calls[2][1]?.body).toEqual(body); expect(f.state.writes).toBe(1)
  })
  it('an identical manual retry recovers, while a different intent cannot overwrite pending data', async () => {
    const f = fixture(), client = createRoomTransitionClient(f.deps); f.state.loss = 'after'
    await expect(client.save(context, input)).rejects.toThrow(); const saved = [...f.rows.entries()]
    await expect(client.save(context, { ...input, toStatus: 'dnd' })).rejects.toMatchObject({ code: 'pending_command' })
    expect([...f.rows.entries()]).toEqual(saved); expect(f.http).toHaveBeenCalledTimes(1)
    await client.save(context, input); expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it('keeps commands isolated by actor, tenant, runtime and room', async () => {
    const f = fixture(), client = createRoomTransitionClient(f.deps); f.state.loss = 'after'
    await expect(client.save(context, input)).rejects.toThrow()
    for (const c of [{ ...context, actorId: hotel }, { ...context, tenantId: hotel }, { ...context, runtime: 'runtime-B' }]) expect(client.pending(c)).toEqual([])
    expect(client.pending(context, hotel)).toEqual([]); expect(client.pending(context, roomId)).toHaveLength(1)
  })
  it.each(['room', 'tenant', 'key', 'hotel', 'event', 'event-noop', 'to'])('retains pending on a malformed or mismatched result (%s)', async mode => {
    const f = fixture(); f.http.mockImplementation(async (_url, options) => {
      const result = f.completed(JSON.parse(String(options?.body)))
      if (mode === 'room') result.room_id = hotel
      if (mode === 'tenant') result.tenant_id = actor
      if (mode === 'key') result.command_id = actor
      if (mode === 'hotel') result.hotel_id = 'invalid'
      if (mode === 'event') result.workflow_event_id = 'invalid'
      if (mode === 'event-noop') result.status_changed = false
      if (mode === 'to') result.to = 'dnd'
      return reply(200, result)
    })
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.rows.size).toBe(1)
  })
  it('accepts a genuine no-op without inventing an event', async () => {
    const f = fixture(); f.http.mockImplementation(async (_url, options) => reply(200, { ...f.completed(JSON.parse(String(options?.body))),
      from: 'occupied_clean', changed: false, status_changed: false, workflow_event_id: null, workflow_dispatch_state: 'not_required' }))
    await expect(createRoomTransitionClient(f.deps).save(context, input)).resolves.toMatchObject({ changed: false, workflow_event_id: null })
  })
  it('a 400 fences cancellation before releasing pending and retains the safe validation message', async () => {
    const f = fixture(); f.state.status = 400
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toMatchObject({ code: 'command_cancelled', message: expect.stringContaining('trạng thái hiện tại') })
    expect(f.http.mock.calls.map(c => String(c[0]).split('/').at(-1))).toEqual(['transition_room_status', 'cancel_room_transition_command'])
    expect(f.rows.size).toBe(0); expect(f.receipts.get(commandId)?.state).toBe('cancelled')
  })
  it('a concurrent committed result returned by cancellation is reported as success', async () => {
    const f = fixture(); f.state.status = 400
    const original = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/transition_room_status')) {
        const c = JSON.parse(String(options?.body)); f.receipts.set(c._command_id, f.completed(c))
      }
      return original(url, options)
    })
    await expect(createRoomTransitionClient(f.deps).save(context, input)).resolves.toMatchObject({ to: 'occupied_clean' })
    expect(f.rows.size).toBe(0)
  })
  it('does not clear a failed validation while terminal cancellation is unavailable', async () => {
    const f = fixture(); f.state.status = 400; f.state.cancelFails = true
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.rows.size).toBe(1)
  })
  it.each([401, 403, 409, 429, 503])('retains pending when server returns %i', async status => {
    const f = fixture(); f.state.status = status
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toThrow()
    expect(f.rows.size).toBe(1); expect(f.http).toHaveBeenCalledTimes(1)
  })
  it('explicit cancellation returns an existing committed result without undoing it', async () => {
    const f = fixture(), client = createRoomTransitionClient(f.deps); f.state.loss = 'after'
    await expect(client.save(context, input)).rejects.toThrow()
    await expect(client.cancel(context, roomId)).resolves.toMatchObject({ command_id: commandId })
    expect(f.state.writes).toBe(1); expect(f.rows.size).toBe(0)
  })
  it('cancelling an uncommitted command clears only after receiving its terminal fence', async () => {
    const f = fixture(), client = createRoomTransitionClient(f.deps); f.state.loss = 'before'
    await expect(client.save(context, input)).rejects.toThrow()
    await expect(client.cancel(context, roomId)).rejects.toMatchObject({ code: 'command_cancelled' })
    expect(f.state.writes).toBe(0); expect(f.rows.size).toBe(0)
  })
  it('fails before dispatch when storage is unavailable, malformed or silently drops a write', async () => {
    const f = fixture()
    await expect(createRoomTransitionClient({ ...f.deps, storage: () => { throw Error('private') } }).save(context, input)).rejects.toMatchObject({ code: 'storage_unavailable' })
    await expect(createRoomTransitionClient({ ...f.deps, storage: () => ({ ...f.storage, setItem: () => {} }) }).save(context, input)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).not.toHaveBeenCalled(); f.state.loss = 'after'
    await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toThrow()
    f.rows.set([...f.rows.keys()][0], '{malformed')
    await expect(createRoomTransitionClient(f.deps).recover(context, roomId)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).toHaveBeenCalledTimes(1)
  })
  it('changed identity or runtime suppresses late success without deleting recovery data', async () => {
    for (const mode of ['actor', 'session', 'runtime']) {
      const f = fixture(), original = f.http.getMockImplementation()!
      f.http.mockImplementation(async (url, options) => {
        const result = await original(url, options)
        if (mode === 'actor') f.state.session = { access_token: emailToken(hotel, sid2), user: { id: hotel } }
        if (mode === 'session') f.state.session = { access_token: emailToken(actor, sid2), user: { id: actor } }
        if (mode === 'runtime') f.state.runtimeCurrent = false
        return result
      })
      await expect(createRoomTransitionClient(f.deps).save(context, input)).rejects.toMatchObject({ code: 'identity_changed' })
      expect(f.rows.size).toBe(1)
    }
  })
  it('abort cannot turn an unconfirmed request into a cleared or successful command', async () => {
    const f = fixture(), controller = new AbortController()
    f.http.mockImplementation(async () => { controller.abort(); return new Promise<Response>(() => {}) })
    await expect(createRoomTransitionClient(f.deps).save(context, input, { signal: controller.signal })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.rows.size).toBe(1)
  })
  it('bounds stalled requests and oversized or malformed responses without exposing transport detail', async () => {
    vi.useFakeTimers(); const f = fixture(); f.http.mockImplementation(async () => new Promise<Response>(() => {}))
    const operation = createRoomTransitionClient(f.deps).save(context, input)
    const assertion = expect(operation).rejects.toMatchObject({ code: 'outcome_unknown' })
    await vi.advanceTimersByTimeAsync(20001); await assertion; expect(f.rows.size).toBe(1); vi.useRealTimers()
    for (const value of ['private upstream detail', 'x'.repeat(17000)]) {
      const bad = fixture(); bad.http.mockImplementation(async () => new Response(value))
      await expect(createRoomTransitionClient(bad.deps).save(context, input)).rejects.toMatchObject({ code: 'outcome_unknown', message: expect.not.stringContaining('private upstream') })
      expect(bad.rows.size).toBe(1)
    }
  })
  it('normalizes known legacy aliases and rejects arbitrary statuses before network', async () => {
    expect(normalizeRoomCommandStatus('check_out')).toBe('vacant_dirty'); expect(normalizeRoomCommandStatus('vacant')).toBe('vacant_clean')
    const f = fixture()
    await expect(createRoomTransitionClient(f.deps).save(context, { ...input, toStatus: '__proto__' })).rejects.toThrow()
    expect(f.http).not.toHaveBeenCalled()
  })
})
