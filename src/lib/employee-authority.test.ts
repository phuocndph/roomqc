import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalGrants, createEmployeeAuthorityClient, defaultHotelGrant, parseAuthorityConfiguration } from './employee-authority'
import { authorityConfiguration, authorityFixture, authorityReceipt, authorityCancellation, actor, target, sid, hotel, hotel2, requestId, context } from '@/test/employee-authority-fixture'
import { emailOtherSession, emailToken } from '@/test/email-auth-fixture'
const values = [{ module: 'rooms', action: 'update', enabled: true }]
afterEach(() => vi.useRealTimers())

describe('employee authority client: captured identity and durable commands', () => {
  it('reads the server catalog, additive provenance and long hotel names without inventing actions', async () => {
    const f = authorityFixture(); f.state.configuration.hotel_catalog[0].name = 'Tên khách sạn '.repeat(30)
    const data = await createEmployeeAuthorityClient(f.deps).read(context, target)
    expect(data.actions[0]).toMatchObject({ custom: false, inherited: true, effective: true })
    expect(data.actions).toHaveLength(3); expect(data.hotel_catalog[0].name.length).toBeGreaterThan(100)
    expect(f.http.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
  })
  it('canonicalizes edit/update by additive OR and keeps legacy entries for explicit review', () => {
    expect(canonicalGrants([{ module: 'old', action: 'edit', enabled: true }, { module: 'old', action: 'update', enabled: false }]))
      .toEqual([{ module: 'old', action: 'update', enabled: true }])
    const data = authorityConfiguration(); data.grants.push({ module: 'legacy_unknown', action: 'view', enabled: false })
    expect(parseAuthorityConfiguration(data, target).grants).toContainEqual({ module: 'legacy_unknown', action: 'view', enabled: false })
  })
  it('persists before dispatch, stores no session token, and clears only an exact receipt', async () => {
    const f = authorityFixture(), http = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, options) => {
      expect(f.storage.length).toBe(1)
      expect([...f.storage.rows.values()].join()).not.toContain(emailToken())
      return http(url, options)
    })
    const result = await createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')
    expect(result).toMatchObject({ request_id: requestId, version: '8', entries: values })
    expect(f.storage.length).toBe(0); expect(f.http).toHaveBeenCalledTimes(1)
  })
  it('recovers a committed response loss after remount and relogin via lookup without another mutation', async () => {
    const f = authorityFixture(), first = createEmployeeAuthorityClient(f.deps); f.state.loseWrite = true
    await expect(first.save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'outcome_unknown' })
    f.state.session = { access_token: emailToken(actor, emailOtherSession), user: { id: actor } }
    const second = createEmployeeAuthorityClient(f.deps), relogin = { ...context, sessionId: emailOtherSession }
    expect(second.pending(relogin, target, 'grants')[0].context.sessionId).toBe(sid)
    await expect(second.recover(relogin, target, 'grants')).resolves.toMatchObject({ request_id: requestId })
    expect(f.http.mock.calls.map(x => String(x[0]).split('/').at(-1))).toEqual(['replace_employee_authority', 'get_employee_authority_command_result'])
    expect(f.storage.length).toBe(0)
  })
  it('lookup not_found retries only the original key and complete payload', async () => {
    const f = authorityFixture(), client = createEmployeeAuthorityClient(f.deps); f.state.loseWrite = true
    await expect(client.save(context, target, 'hotels', [defaultHotelGrant(hotel)], '7')).rejects.toThrow()
    const original = JSON.parse(String(f.http.mock.calls[0][1]?.body)); f.state.committed = null; f.state.loseWrite = false
    await client.recover(context, target, 'hotels')
    expect(JSON.parse(String(f.http.mock.calls[2][1]?.body))).toEqual(original)
    expect(f.http.mock.calls[1][0]).toContain('get_employee_authority_command_result')
  })
  it('blocks a new request while an unresolved command exists without overwriting it', async () => {
    const f = authorityFixture(), client = createEmployeeAuthorityClient(f.deps); f.state.loseWrite = true
    await expect(client.save(context, target, 'grants', values, '5')).rejects.toThrow()
    const before = [...f.storage.rows.entries()]
    await expect(client.save(context, target, 'grants', [], '5')).rejects.toMatchObject({ code: 'pending_command' })
    expect([...f.storage.rows.entries()]).toEqual(before); expect(f.http).toHaveBeenCalledTimes(1)
    for (const isolated of [{ ...context, actorId: hotel }, { ...context, runtime: 'other-runtime' }, { ...context, tenantId: hotel2 }])
      expect(client.pending(isolated, target, 'grants')).toEqual([])
    expect(client.pending(context, hotel2, 'grants')).toEqual([]); expect(client.pending(context, target, 'hotels')).toEqual([])
  })
  it.each(['target', 'kind', 'key', 'entries', 'version'])('retains pending state on mismatched receipt (%s)', async mode => {
    const f = authorityFixture(); f.http.mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body)), receipt = authorityReceipt(body)
      if (mode === 'target') receipt.target_id = hotel
      if (mode === 'kind') receipt.kind = 'hotels'
      if (mode === 'key') receipt.request_id = hotel2
      if (mode === 'entries') receipt.entries = []
      if (mode === 'version') receipt.version = '5'
      return new Response(JSON.stringify(receipt))
    })
    const client = createEmployeeAuthorityClient(f.deps)
    await expect(client.save(context, target, 'grants', values, '5')).rejects.toThrow()
    expect(client.pending(context, target, 'grants')).toHaveLength(1)
  })
  it('fails before network when persistence is unavailable, malformed or full', async () => {
    const f = authorityFixture(), client = createEmployeeAuthorityClient({ ...f.deps, storage: () => { throw Error('private') } })
    await expect(client.save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'storage_unavailable' })
    for (let i = 0; i < 4096; i++) f.storage.setItem('other-key-' + i, 'unrelated')
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.storage.length).toBe(4096); expect(f.http).not.toHaveBeenCalled()
    f.storage.rows.clear(); f.state.loseWrite = true
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toThrow()
    const key = [...f.storage.rows.keys()][0]; f.storage.setItem(key, '{malformed')
    const calls = f.http.mock.calls.length
    await expect(createEmployeeAuthorityClient(f.deps).recover(context, target, 'grants')).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).toHaveBeenCalledTimes(calls)
  })
  it('enumerates separate per-request records without overwriting another unresolved key', async () => {
    const f = authorityFixture(); f.state.loseWrite = true
    // Emulate an already persisted second-tab record; real simultaneous browser tabs are a separate E2E case.
    const clients = [requestId, hotel2].map(id => createEmployeeAuthorityClient({ ...f.deps, newId: () => id }))
    await expect(clients[0].save(context, target, 'grants', values, '5')).rejects.toThrow()
    const original = [...f.storage.rows.entries()][0]
    const secondKey = original[0].replace(requestId, hotel2), second = JSON.parse(original[1]); second.command.p_request_id = hotel2
    f.storage.setItem(secondKey, JSON.stringify(second))
    expect(clients[1].pending(context, target, 'grants').map(x => x.command.p_request_id).sort()).toEqual([requestId, hotel2].sort())
    expect(f.storage.getItem(original[0])).toBe(original[1])
  })
  it('clears a monotonic stale-version rejection but keeps permission/unknown outcomes', async () => {
    for (const status of [409, 403, 503]) {
      const f = authorityFixture(); f.http.mockResolvedValue(new Response(JSON.stringify({ message: status === 409 ? 'EMPLOYEE_AUTHORITY_STALE_VERSION' : 'private database detail' }), { status }))
      await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toThrow()
      expect(f.storage.length).toBe(status === 409 ? 0 : 1)
    }
  })
  it('rejects after session changes while a successful response is in flight, keeping recovery data', async () => {
    const f = authorityFixture(), http = f.http.getMockImplementation()!
    f.http.mockImplementation(async (url, options) => {
      const result = await http(url, options); f.state.session = null; return result
    })
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.storage.length).toBe(1)
  })
  it('enforces a deadline even for a non-cooperating transport and retains the original pending key', async () => {
    vi.useFakeTimers(); const f = authorityFixture(); f.http.mockImplementation(() => new Promise(() => {}))
    const result = createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5').catch(error => error)
    await vi.advanceTimersByTimeAsync(20001)
    expect(await result).toMatchObject({ code: 'outcome_unknown' }); expect(f.storage.length).toBe(1)
  })
  it('rejects oversized response bodies and invalid effective provenance', async () => {
    const f = authorityFixture(); f.http.mockResolvedValue(new Response('x'.repeat(262145)))
    await expect(createEmployeeAuthorityClient(f.deps).read(context, target)).rejects.toThrow()
    const config = authorityConfiguration(); config.actions[0].effective = false
    expect(() => parseAuthorityConfiguration(config, target)).toThrow()
  })
  it('settles a validation response using the exact command before clearing pending', async () => {
    const f = authorityFixture(), original = f.http.getMockImplementation()!
    f.http.mockImplementation((url, options) => String(url).endsWith('/replace_employee_authority')
      ? Promise.resolve(new Response(JSON.stringify({ message: 'EMPLOYEE_AUTHORITY_INVALID_GRANT' }), { status: 400 })) : original(url, options))
    const client = createEmployeeAuthorityClient(f.deps)
    await expect(client.save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'command_cancelled' })
    expect(f.http.mock.calls.map(x => String(x[0]).split('/').at(-1))).toEqual(['replace_employee_authority', 'cancel_employee_authority_command'])
    expect(f.http.mock.calls.map(x => JSON.parse(String(x[1]?.body)))[1]).toEqual(JSON.parse(String(f.http.mock.calls[0][1]?.body)))
    expect(f.storage.length).toBe(0); expect(f.state.cancelled?.request_id).toBe(requestId)
  })
  it('preserves a concurrent same-key success even if this transport reported validation failure', async () => {
    const f = authorityFixture(), original = f.http.getMockImplementation()!
    f.http.mockImplementation((url, options) => {
      if (String(url).endsWith('/replace_employee_authority')) {
        f.state.committed = authorityReceipt(JSON.parse(String(options?.body)))
        return Promise.resolve(new Response('{}', { status: 400 }))
      }
      return original(url, options)
    })
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).resolves.toMatchObject({ state: 'completed', request_id: requestId })
    expect(f.state.cancelled).toBeNull(); expect(f.storage.length).toBe(0)
  })
  it('recovers a lost cancellation response after reload and same-actor relogin without resending a save', async () => {
    const f = authorityFixture(), original = f.http.getMockImplementation()!
    f.state.loseCancellation = true
    f.http.mockImplementation((url, options) => String(url).endsWith('/replace_employee_authority')
      ? Promise.resolve(new Response('{}', { status: 400 })) : original(url, options))
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.storage.length).toBe(1)
    f.state.session = { access_token: emailToken(actor, emailOtherSession), user: { id: actor } }
    await expect(createEmployeeAuthorityClient(f.deps).recover({ ...context, sessionId: emailOtherSession }, target, 'grants'))
      .rejects.toMatchObject({ code: 'command_cancelled' })
    expect(f.storage.length).toBe(0)
    expect(f.http.mock.calls.map(x => String(x[0]).split('/').at(-1))).toEqual(['replace_employee_authority', 'cancel_employee_authority_command', 'get_employee_authority_command_result'])
  })
  it.each(['target', 'kind', 'key', 'entries', 'version', 'reason'])('keeps pending when cancellation identity does not match (%s)', async mode => {
    const f = authorityFixture()
    f.http.mockImplementation(async (url, options) => {
      if (String(url).endsWith('/replace_employee_authority')) return new Response('{}', { status: 400 })
      const cancelled = authorityCancellation(JSON.parse(String(options?.body)))
      if (mode === 'target') cancelled.target_id = hotel
      if (mode === 'kind') cancelled.kind = 'hotels'
      if (mode === 'key') cancelled.request_id = hotel2
      if (mode === 'entries') cancelled.entries = []
      if (mode === 'version') cancelled.expected_version = '7'
      if (mode === 'reason') cancelled.reason = 'unknown'
      return new Response(JSON.stringify(cancelled))
    })
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toThrow()
    expect(f.storage.length).toBe(1)
  })
  it.each([401, 403, 409, 503])('keeps the original pending identity if settlement cannot be confirmed (%s)', async status => {
    const f = authorityFixture()
    f.http.mockImplementation(async url => new Response('{}', { status: String(url).endsWith('/replace_employee_authority') ? 400 : status }))
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toThrow()
    expect(f.storage.length).toBe(1)
  })
  it('does not abandon a command on malformed successful output, or after an actor change', async () => {
    const f = authorityFixture(); f.http.mockResolvedValue(new Response('{}'))
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toThrow()
    expect(f.http).toHaveBeenCalledTimes(1); expect(f.storage.length).toBe(1)
    const other = authorityFixture()
    other.http.mockImplementation(async () => { other.state.session = null; return new Response('{}', { status: 400 }) })
    await expect(createEmployeeAuthorityClient(other.deps).save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(other.http).toHaveBeenCalledTimes(1); expect(other.storage.length).toBe(1)
  })
  it('does not report success for a cancelled replay returned by the save RPC', async () => {
    const f = authorityFixture(); f.http.mockImplementation(async (_url, options) => new Response(JSON.stringify(authorityCancellation(JSON.parse(String(options?.body))))))
    await expect(createEmployeeAuthorityClient(f.deps).save(context, target, 'grants', values, '5')).rejects.toMatchObject({ code: 'command_cancelled' })
    expect(f.http).toHaveBeenCalledTimes(1); expect(f.storage.length).toBe(0)
  })
})
