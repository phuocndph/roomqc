import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdviceError, parseAdvice, parseAdviceReceipt, parseAdviceRequest, readBoundedJson } from '../../supabase/functions/_shared/advice/contracts'
import { createOperationsAdviceHandler, type AdviceDependencies } from '../../supabase/functions/_shared/advice/handler'
import { createAdviceProvider, projectAdviceContext } from '../../supabase/functions/_shared/advice/provider'
import { createAdviceDependencies, readAdviceConfig } from '../../supabase/functions/_shared/advice/runtime'

const actor = '11111111-1111-4111-8111-111111111111', session = '22222222-2222-4222-8222-222222222222'
const command = '33333333-3333-4333-8333-333333333333', hotel = '44444444-4444-4444-8444-444444444444'
const dispatchToken = '55555555-5555-4555-8555-555555555555', fingerprint = 'a'.repeat(64)
const scope = { start: '2026-10-01', end: '2026-10-31', hotel, timezone: 'Asia/Ho_Chi_Minh' }
const request = { action: 'generate', command_id: command, ...scope }
const items = Array.from({ length: 3 }, (_, i) => ({ title: 'Kiểm tra ' + i, description: 'Đối soát số liệu trong kỳ.', action: 'Kiểm tra chứng từ.', priority: 'medium' as const }))
const epoch = Date.parse('2026-10-27T12:00:00Z'), deadline = new Date(epoch + 30000).toISOString()
const makePeriod = (start: string, end: string) => ({ period_start: start, period_end: end,
  period_days: (Date.parse(end) - Date.parse(start)) / 86400000 + 1,
  room: { netRevenue: 200000, guest_email: 'must-not-leave@example.invalid' },
  no_show: { retainedAmount: 100000, refundDueAmount: 100000, cashMovement: 0 },
  cost_summary: { purchase_cost: 1000, laundry_cost: 2000, maintenance_cost: 3000, total_cost: 6000 },
  recognized_revenue: 300000, net_profit: 294000, earned_checkout_count: 1, checkout_room_nights: 1, occupied_room_days: 1, invalid_checkout_dates_count: 0 })
const context = () => ({ version: 1, period: { ...scope }, capacity: { total_rooms: 2, method: 'current_registered_rooms', is_estimate: true },
  current: makePeriod(scope.start, scope.end), previous: makePeriod('2026-08-31', '2026-09-30'), year_ago: makePeriod('2025-10-01', '2025-10-31'),
  recognition_timezone: scope.timezone, labor_is_estimate: true, labor_estimate: 100, targets_applicable: true, targets: { occupancy: 80, adr: 123.45 },
  laborByDepartment: { 'Private department': 99999 }, guest: { phone: 'never-forward-this-phone' }, service_key: 'never-forward-this-key' })
const output = (advice: unknown = items) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'submit_advice', arguments: JSON.stringify({ advice }) } }] } }] })
const response = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } })
const fetcher = (fn: (...args: Parameters<typeof fetch>) => Promise<Response>) => vi.fn(fn) as unknown as typeof fetch
const receipt = (state = 'completed') => ({ version: 1, command_id: command, state, request: scope, context_hash: fingerprint, advice: state === 'completed' ? items : null })
const env = (values: Record<string, string>) => (key: string) => values[key]
afterEach(() => vi.useRealTimers())

describe('advice input, receipt and output boundaries', () => {
  it('accepts only scope/key requests; strips server-only receipt fields', () => {
    expect(parseAdviceRequest(request)).toEqual(request)
    expect(parseAdviceReceipt({ ...receipt(), dispatch_token: dispatchToken, context: context(), secret: 'not-public' }, command)).toEqual(receipt())
    expect(parseAdviceReceipt({ version: 1, command_id: command, state: 'not_found' }, command).request).toBeNull()
  })
  it.each([
    { snapshot: {} }, { derived: {} }, { findings: [] }, { tenant: actor }, { action: 'dispatch' }, { command_id: 'invalid' },
    { start: '2026-02-30' }, { end: '2026-09-30' }, { start: '2025-01-01' }, { end: '2101-01-01' },
    { hotel: undefined }, { hotel: 'foreign-url' }, { timezone: 'a\r\nheader' }, { timezone: '' },
  ])('rejects forged, unbounded or malformed request %j', change => {
    expect(() => parseAdviceRequest({ ...request, ...change })).toThrow(AdviceError)
  })
  it('keeps lookup and cancel separate and bounds inclusive leap-year dates', () => {
    expect(parseAdviceRequest({ action: 'lookup', command_id: command }).action).toBe('lookup')
    expect(() => parseAdviceRequest({ action: 'lookup', command_id: command, hotel })).toThrow()
    expect(parseAdviceRequest({ ...request, action: 'cancel', start: '2024-01-01', end: '2024-12-31' }).action).toBe('cancel')
    expect(() => parseAdviceRequest({ ...request, start: '2024-01-01', end: '2025-01-01' })).toThrow()
  })
  it('canonicalizes UUID case before comparing server command and hotel identifiers', () => {
    const upper = 'ABCDEFAB-1234-4567-ABCD-ABCDEFABCDEF'
    expect(parseAdviceRequest({ ...request, command_id: upper, hotel: upper })).toMatchObject({ command_id: upper.toLowerCase(), hotel: upper.toLowerCase() })
    expect(parseAdviceRequest({ action: 'lookup', command_id: upper }).command_id).toBe(upper.toLowerCase())
  })
  it.each([null, {}, [], [null, null, null], [{ ...items[0], priority: 'urgent' }, ...items.slice(1)],
    [{ ...items[0], impactVnd: -1 }, ...items.slice(1)], [{ ...items[0], impactVnd: Infinity }, ...items.slice(1)],
    [{ ...items[0], title: 'a'.repeat(121) }, ...items.slice(1)], [{ ...items[0], source: 'private' }, ...items.slice(1)]])(
    'rejects invalid advice as upstream failure', value => {
      try { parseAdvice(value); expect.fail('must reject') } catch (e) { expect(e).toMatchObject({ status: 502, code: 'ADVICE_INVALID_OUTPUT' }) }
    })
  it.each([null, {}, { ...receipt(), command_id: actor }, { ...receipt(), request: { ...scope, tenant: actor } },
    { ...receipt(), context_hash: null }, { ...receipt('unknown'), advice: items }, { ...receipt(), advice: [] }])(
    'rejects malformed server receipt without returning its data', value => {
      expect(() => parseAdviceReceipt(value, command)).toThrow(AdviceError)
    })
  it('caps bytes while streaming, cancels oversize, rejects invalid UTF-8', async () => {
    let cancel = false
    const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(32)) }, cancel() { cancel = true } })
    await expect(readBoundedJson({ body: stream }, 31)).rejects.toMatchObject({ status: 413 })
    expect(cancel).toBe(true)
    await expect(readBoundedJson({ body: new Response(new Uint8Array([255])).body }, 32)).rejects.toMatchObject({ status: 400 })
  })
})

describe('provider aggregate and transport boundary', () => {
  it('projects financial meanings without identifiers, PII, wages or arbitrary text', () => {
    const projected = projectAdviceContext(context()), encoded = JSON.stringify(projected)
    expect(projected.current).toMatchObject({ recognized_revenue: 300000, checkout_room_net_revenue: 200000,
      retained_no_show_fee: 100000, refund_due_not_paid: 100000, profit_before_labor_and_fixed: 294000 })
    expect(projected.current_labor_estimate).toBe(100)
    for (const forbidden of [hotel, 'must-not-leave', 'Private department', 'never-forward', 'service_key', 'laborByDepartment']) expect(encoded).not.toContain(forbidden)
  })
  it('preserves the earliest allowed current period and prior year, without accepting invalid targets', () => {
    const c = context(); c.period.start = '1901-01-01'; c.period.end = '1901-01-31'
    c.current = makePeriod('1901-01-01', '1901-01-31'); c.previous = makePeriod('1900-12-01', '1900-12-31'); c.year_ago = makePeriod('1900-01-01', '1900-01-31')
    expect(projectAdviceContext(c).year_ago.start).toBe('1900-01-01')
    c.targets.occupancy = 105; expect(() => projectAdviceContext(c)).toThrow()
  })
  it.each(['missing_source', 'revenue_mismatch', 'cost_mismatch', 'wrong_period', 'capacity_overflow', 'invalid_estimate', 'unsafe_target'])('denies corrupt source: %s', mode => {
    const c = context()
    if (mode === 'missing_source') c.current.room = null as never
    if (mode === 'revenue_mismatch') c.current.recognized_revenue = 400000
    if (mode === 'cost_mismatch') c.current.cost_summary.total_cost = 0
    if (mode === 'wrong_period') c.current.period_start = '2026-09-30'
    if (mode === 'capacity_overflow') c.current.occupied_room_days = 999
    if (mode === 'invalid_estimate') c.labor_is_estimate = false
    if (mode === 'unsafe_target') c.targets = { customer_name: 'untrusted prompt' } as never
    expect(() => projectAdviceContext(c)).toThrow(AdviceError)
  })
  it('uses only the owned fixed sink in fixture mode, bounded structured output and no provider key', async () => {
    const send = fetcher(async () => response(output()))
    const provider = createAdviceProvider({ provider: 'fixture', fixtureOwner: '012345abcdef', key: 'not-forwarded' }, send, () => epoch)
    expect(await provider(context(), command, deadline)).toEqual(items)
    const [url, init] = vi.mocked(send).mock.calls[0]
    expect(url).toBe('http://api-gw:9083/v1/chat/completions'); expect(init?.redirect).toBe('error')
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    expect(new Headers(init?.headers).get('X-RoomQC-Fixture-Owner')).toBe('012345abcdef')
    const payload = JSON.parse(String(init?.body))
    expect(payload.tool_choice.function.name).toBe('submit_advice')
    expect(payload.messages[1].content).not.toContain(hotel)
  })
  it.each(['disabled', 'expired', 'future_deadline', 'missing_key', 'invalid_owner'])('does not send with invalid configuration/deadline: %s', async mode => {
    const send = fetcher(async () => response(output()))
    const provider = createAdviceProvider({ provider: mode === 'disabled' ? 'disabled' : mode === 'missing_key' ? 'lovable' : 'fixture',
      fixtureOwner: mode === 'invalid_owner' ? 'wrong' : '012345abcdef', key: '' }, send, () => epoch)
    await expect(provider(context(), command, mode === 'expired' ? new Date(epoch - 1).toISOString()
      : mode === 'future_deadline' ? new Date(epoch + 120000).toISOString() : deadline)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })
  it.each(['status', 'empty', 'arguments', 'extra', 'advice', 'huge', 'redirect'])('keeps provider failure unknown and sanitized: %s', async mode => {
    const send = fetcher(async () => {
      if (mode === 'redirect') throw new Error('private upstream diagnostic')
      if (mode === 'status') return response({ secret: 'private' }, 500)
      if (mode === 'empty') return response({ choices: [] })
      if (mode === 'arguments') return response({ choices: [{ message: { tool_calls: [{ function: { name: 'submit_advice', arguments: '{broken' } }] } }] })
      if (mode === 'extra') return response({ choices: [{ message: { tool_calls: [{ function: { name: 'submit_advice', arguments: JSON.stringify({ advice: items, secret: 'private' }) } }] } }] })
      if (mode === 'huge') return new Response('x'.repeat(32769))
      return response(output([]))
    })
    await expect(createAdviceProvider({ provider: 'fixture', fixtureOwner: '012345abcdef', key: '' }, send, () => epoch)(context(), command, deadline))
      .rejects.toMatchObject({ code: 'ADVICE_UNAVAILABLE', status: 503 })
  })
  it('aborts at the dispatch deadline and rejects a late successful response', async () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch)
    const send = fetcher(async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    const task = createAdviceProvider({ provider: 'fixture', fixtureOwner: '012345abcdef', key: '' }, send)(context(), command, new Date(epoch + 20).toISOString())
    const assertion = expect(task).rejects.toMatchObject({ status: 503 })
    await vi.advanceTimersByTimeAsync(21); await assertion
    const late = fetcher(async () => { vi.setSystemTime(epoch + 30001); return response(output()) })
    await expect(createAdviceProvider({ provider: 'fixture', fixtureOwner: '012345abcdef', key: '' }, late)(context(), command, new Date(epoch + 30020).toISOString())).resolves.toEqual(items)
    vi.setSystemTime(epoch)
    const tooLate = fetcher(async () => { vi.setSystemTime(epoch + 30001); return response(output()) })
    await expect(createAdviceProvider({ provider: 'fixture', fixtureOwner: '012345abcdef', key: '' }, tooLate)(context(), command, deadline)).rejects.toThrow()
  })
})

describe('verified Auth and credential separation', () => {
  const values = { SUPABASE_URL: 'http://fixture.invalid', SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' }
  const jwt = (change = {}) => 'header.' + Buffer.from(JSON.stringify({ sub: actor, session_id: session, role: 'authenticated', exp: Math.floor(epoch / 1000) + 60, ...change })).toString('base64url') + '.signature'
  it('defaults disabled even if an old Lovable key is present', () => {
    expect(readAdviceConfig(env({ LOVABLE_API_KEY: 'synthetic' })).provider).toBe('disabled')
  })
  it.each([{ ROOMQC_ADVICE_PROVIDER: 'other' }, { ROOMQC_ADVICE_PROVIDER: 'fixture' },
    { ROOMQC_ADVICE_PROVIDER: 'fixture', ROOMQC_ADVICE_ENVIRONMENT: 'production', ROOMQC_ADVICE_FIXTURE_OWNER: '012345abcdef' },
    { ROOMQC_ADVICE_PROVIDER: 'lovable', ROOMQC_ADVICE_ENVIRONMENT: 'fixture' }])('rejects unsafe deployment mode', change => {
    expect(() => readAdviceConfig(env(change))).toThrow(AdviceError)
  })
  it('verifies bearer through Auth before reading identity and keeps service key on worker RPC only', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const send = fetcher(async (url, init) => { calls.push([String(url), init]); return String(url).endsWith('/auth/v1/user') ? response({ id: actor }) : response(receipt()) })
    const deps = createAdviceDependencies(env(values), () => ({}), send, () => epoch), user = await deps.user(jwt())
    expect(user.actorId).toBe(actor); expect(user.sessionId).toBe(session)
    await user.rpc('get_operations_advice_command', { p_command_id: command })
    await deps.worker('dispatch_operations_advice', { p_actor_id: actor, p_command_id: command, p_session_id: session })
    expect(calls.map(c => c[0].split('/').at(-1))).toEqual(['user', 'get_operations_advice_command', 'dispatch_operations_advice'])
    expect(new Headers(calls[1][1]?.headers).get('apikey')).toBe('synthetic-public')
    expect(new Headers(calls[1][1]?.headers).get('authorization')).toBe('Bearer ' + jwt())
    expect(new Headers(calls[2][1]?.headers).get('apikey')).toBe('synthetic-service')
  })
  it.each([{ sub: hotel }, { session_id: null }, { role: 'service_role' }, { is_anonymous: true }, { exp: 0 }])('does not trust decoded claims alone', async change => {
    const send = fetcher(async () => response({ id: actor }))
    const deps = createAdviceDependencies(env(values), () => ({}), send, () => epoch)
    await expect(deps.user(jwt(change))).rejects.toMatchObject({ status: 401 })
    expect(send).toHaveBeenCalledTimes(1)
  })
  it('does not parse/route an Auth-rejected JWT and never exposes raw RPC diagnostics', async () => {
    const rejected = createAdviceDependencies(env(values), () => ({}), fetcher(async () => response({ message: 'raw private diagnostic' }, 401)), () => epoch)
    await expect(rejected.user(jwt())).rejects.toMatchObject({ code: 'ADVICE_SESSION_REQUIRED' })
    const deps = createAdviceDependencies(env(values), () => ({}), fetcher(async () => response({ code: 'XX000', message: 'private database information' }, 500)))
    await expect(deps.worker('finish_operations_advice', {})).rejects.toMatchObject({ code: 'ADVICE_UNAVAILABLE', message: 'ADVICE_UNAVAILABLE' })
  })
  it('maps invalid upstream JSON and oversized data to service errors, not caller validation errors', async () => {
    for (const body of ['{broken', 'x'.repeat(49153)]) {
      const deps = createAdviceDependencies(env(values), () => ({}), fetcher(async () => new Response(body)))
      await expect(deps.worker('get_operations_advice_command', {})).rejects.toMatchObject({ status: 503, code: 'ADVICE_UNAVAILABLE' })
    }
  })
})

function harness(options: { available?: boolean; deny?: boolean; malformed?: boolean; lostFinish?: boolean } = {}) {
  let state = 'not_found', saved: unknown = null
  const stats = { prepared: 0, dispatched: 0, provider: 0, finished: 0, unknown: 0 }
  const current = () => ({ ...receipt(state), advice: state === 'completed' ? saved : null })
  const rpc: AdviceDependencies['worker'] = async (name, args) => {
    if (name === 'get_operations_advice_command') { if (options.deny) throw new AdviceError(403, 'ADVICE_NOT_ALLOWED'); return current() }
    if (name === 'prepare_operations_advice') { if (state === 'not_found') { state = 'reserved'; stats.prepared++ }; return current() }
    if (name === 'cancel_operations_advice') { if (state === 'not_found' || state === 'reserved') state = 'cancelled'; return current() }
    if (name === 'dispatch_operations_advice') { if (state !== 'reserved') return current(); state = 'unknown'; stats.dispatched++
      return { version: 1, command_id: command, state: 'dispatch', dispatch_token: dispatchToken, context_hash: fingerprint, context: context(), deadline } }
    if (name === 'finish_operations_advice') { if (args.p_advice === null) { stats.unknown++; return current() }; saved = args.p_advice; state = 'completed'; stats.finished++
      if (options.lostFinish) throw new Error('lost response after commit'); return current() }
    throw new Error('unexpected RPC')
  }
  const deps: AdviceDependencies = { cors: () => ({ 'Access-Control-Allow-Origin': 'http://localhost:8082' }), available: () => options.available !== false,
    user: async () => ({ actorId: actor, sessionId: session, rpc }), worker: rpc,
    provider: async () => { stats.provider++; return options.malformed ? [] : items } }
  const handler = createOperationsAdviceHandler(deps)
  const call = (body: unknown = request) => handler(new Request('http://fixture.invalid/functions/v1/operations-advisor',
    { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify(body) }))
  return { stats, call, handler, deps, current }
}
describe('Edge orchestration outcome/replay boundary (dependency tests, not database proofs)', () => {
  it('completes once and replays a durable response without another provider call', async () => {
    const h = harness(), first = await h.call(), replay = await h.call()
    expect(first.status).toBe(200); expect(await first.json()).toEqual(receipt())
    expect(await replay.json()).toEqual(receipt()); expect(h.stats).toMatchObject({ prepared: 1, dispatched: 1, provider: 1, finished: 1 })
  })
  it('rejects changed scope on a completed command', async () => {
    const h = harness(); await h.call()
    expect((await h.call({ ...request, hotel: actor })).status).toBe(409)
    expect(h.stats.provider).toBe(1)
  })
  it('fails authorization or disabled provider before reserving/calling', async () => {
    for (const config of [{ deny: true }, { available: false }]) { const h = harness(config)
      expect((await h.call()).status).toBe(config.deny ? 403 : 503); expect(h.stats.prepared).toBe(0); expect(h.stats.provider).toBe(0) }
  })
  it('concurrent generates have one claim/provider; lookup observes durable state', async () => {
    const h = harness(), responses = await Promise.all([h.call(), h.call()])
    expect(responses.every(r => [200, 202].includes(r.status))).toBe(true)
    expect(h.stats).toMatchObject({ prepared: 1, dispatched: 1, provider: 1 })
    expect((await (await h.call({ action: 'lookup', command_id: command })).json()).state).toBe('completed')
  })
  it('malformed provider output remains unknown, never empty success or automatic resend', async () => {
    const h = harness({ malformed: true })
    expect((await h.call()).status).toBe(202)
    expect((await (await h.call()).json()).state).toBe('unknown'); expect(h.stats.provider).toBe(1); expect(h.stats.finished).toBe(0)
  })
  it('recovers a finish whose response was lost after commit without another provider dispatch', async () => {
    const h = harness({ lostFinish: true })
    expect((await (await h.call()).json()).state).toBe('completed')
    await h.call(); expect(h.stats.provider).toBe(1); expect(h.stats.finished).toBe(1)
  })
  it('cancel tombstone wins before generate and does not send', async () => {
    const h = harness(); expect((await (await h.call({ ...request, action: 'cancel' })).json()).state).toBe('cancelled')
    expect((await (await h.call()).json()).state).toBe('cancelled'); expect(h.stats.provider).toBe(0)
  })
  it('revocation after claim prevents external I/O and result release', async () => {
    const options = { deny: false }, h = harness(options), original = h.deps.worker
    h.deps.worker = async (name, args) => { const r = await original(name, args); if (name === 'dispatch_operations_advice') options.deny = true; return r }
    expect((await h.call()).status).toBe(403); expect(h.stats.dispatched).toBe(1); expect(h.stats.provider).toBe(0)
  })
  it('bounds body, refuses other methods/anonymous, and makes response no-store', async () => {
    const h = harness()
    expect((await h.handler(new Request('http://fixture.invalid', { method: 'GET' }))).status).toBe(405)
    expect((await h.handler(new Request('http://fixture.invalid', { method: 'POST', body: '{}' }))).status).toBe(401)
    const r = await h.call({ ...request, snapshot: 'x'.repeat(2048) })
    expect(r.status).toBe(413); expect(r.headers.get('cache-control')).toBe('no-store'); expect(h.stats.provider).toBe(0)
  })
})
