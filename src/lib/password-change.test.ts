import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPasswordChangeFlow, PasswordIdentityChangedError } from './password-change'
const actor = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const sessionId = '33333333-3333-4333-8333-333333333333'
const otherSession = '44444444-4444-4444-8444-444444444444'
const operation = '55555555-5555-4555-8555-555555555555'
const token = (sub = actor, sid = sessionId, extra = {}) => 'e30.' + btoa(JSON.stringify({ sub, session_id: sid, ...extra })) + '.synthetic'
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function fixture() {
  const state = {
    session: { access_token: token(), user: { id: actor } },
    recovery: false, mode: 'success', puts: 0, statusCalls: 0, receipt: null as string | null,
    calls: [] as { url: string; options: RequestInit }[],
    onPut: null as (() => void) | null, onContext: null as (() => void) | null,
    wrongActor: false, wrongSession: false, badAfterPut: false, flag: false,
  }
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)); state.calls.push({ url: String(url), options: options! })
    if (String(url).endsWith('/auth/v1/user')) {
      state.puts++; state.onPut?.()
      if (['success', 'loss-after', '500-after'].includes(state.mode)) state.receipt = body.roomqc_password_change_id
      if (state.mode === 'loss-after' || state.mode === 'loss-before') throw new TypeError('private network detail')
      if (state.mode === 'invalid') return reply(400, { code: 400, error_code: 'current_password_invalid', msg: 'private password detail' })
      return reply(state.mode === '500-after' ? 500 : 200, { id: actor })
    }
    state.statusCalls++
    if (!body.p_change_id) state.onContext?.()
    if (state.puts && state.badAfterPut) return reply(200, null)
    return reply(200, { actor_id: state.wrongActor ? other : actor,
      session_id: state.wrongSession ? otherSession : sessionId, is_recovery: state.recovery,
      must_change_password: state.flag, change_id: body.p_change_id && state.receipt === body.p_change_id ? state.receipt : null,
      completed_at: body.p_change_id && state.receipt === body.p_change_id ? '2026-10-21T17:00:00Z' : null })
  }) as typeof fetch
  const deps = { endpoint: 'https://owned.roomqc.invalid', publishableKey: 'public-fixture', storage: localStorage,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })), fetch: http, randomUUID: () => operation }
  return { state, deps, flow: createPasswordChangeFlow(deps) }
}
const input = { actorId: actor, currentPassword: 'OwnedOld!123', newPassword: 'OwnedNew!123' }

describe('captured-session password receipt protocol', () => {
  beforeEach(() => localStorage.clear())
  it('captures one token/target, sends current password and operation ID, confirms exact server receipt', async () => {
    const { flow, state } = fixture()
    await expect(flow.change(input)).resolves.toEqual({ id: actor, changeId: operation, completion: 'submitted' })
    expect(state.puts).toBe(1); expect(localStorage.length).toBe(0)
    const put = state.calls.find(x => x.url.endsWith('/auth/v1/user'))!
    expect(JSON.parse(String(put.options.body))).toEqual({ password: input.newPassword, current_password: input.currentPassword, roomqc_password_change_id: operation })
    for (const c of state.calls) {
      expect(c.url).toMatch(/^https:\/\/owned\.roomqc\.invalid\//)
      expect(c.options).toMatchObject({ redirect: 'error', cache: 'no-store', credentials: 'omit' })
      expect(c.options.headers).toMatchObject({ Authorization: 'Bearer ' + token() })
    }
  })
  it.each(['noop', 'loss-before'])('never treats200 or transport ambiguity as completion: %s', async mode => {
    const { flow, state } = fixture(); state.mode = mode
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(state.puts).toBe(1); expect(localStorage.length).toBe(1)
    const stored = localStorage.getItem(localStorage.key(0)!)!
    expect(stored).not.toContain(input.newPassword); expect(stored).not.toContain(input.currentPassword)
    expect(stored).not.toContain(token())
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(state.puts).toBe(1)
  })
  it.each(['loss-after', '500-after'])('uses receipt after an ambiguous Auth response without repeating PUT: %s', async mode => {
    const { flow, state } = fixture(); state.mode = mode
    await expect(flow.change(input)).resolves.toMatchObject({ completion: 'submitted' })
    expect(state.puts).toBe(1); expect(localStorage.length).toBe(0)
  })
  it('resumes persisted intent in a new flow without claiming the newly typed password was sent', async () => {
    const { flow, state, deps } = fixture(); state.mode = 'loss-before'
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    state.receipt = operation
    const remounted = createPasswordChangeFlow(deps)
    await expect(remounted.change({ ...input, newPassword: 'NotSent!456' })).resolves.toMatchObject({ completion: 'previous' })
    expect(state.puts).toBe(1); expect(localStorage.length).toBe(0)
  })
  it('rechecks a previous operation without receiving any password input', async () => {
    const { flow, state, deps } = fixture(); state.mode = 'loss-before'
    await expect(flow.change(input)).rejects.toBeTruthy()
    state.receipt = operation
    await expect(createPasswordChangeFlow(deps).reconcile(actor)).resolves.toMatchObject({ changeId: operation, completion: 'previous' })
    expect(state.puts).toBe(1)
  })
  it('revalidates a confirmed receipt before a later workflow step, without another PUT', async () => {
    const { flow, state } = fixture()
    const saved = await flow.change(input)
    await expect(flow.confirm(saved)).resolves.toEqual({ ...saved, completion: 'previous' })
    expect(state.puts).toBe(1)
    state.wrongSession = true
    await expect(flow.confirm(saved)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(state.puts).toBe(1)
  })
  it('cannot confirm after a session switch, receipt loss or lifecycle invalidation', async () => {
    const { flow, state } = fixture()
    const saved = await flow.change(input)
    await expect(flow.confirm(saved, () => false)).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    state.receipt = null
    await expect(flow.confirm(saved)).rejects.toMatchObject({ code: 'outcome_unknown' })
    state.session = { access_token: token(other), user: { id: other } }
    await expect(flow.confirm(saved)).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    expect(state.puts).toBe(1)
  })
  it.each(['actor', 'session', 'null', 'flag'])('rejects malformed/wrong receipt context %s without false success', async which => {
    const { flow, state } = fixture()
    state.onPut = () => { state.wrongActor = which === 'actor'; state.wrongSession = which === 'session'; state.badAfterPut = which === 'null'; state.flag = which === 'flag' }
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(localStorage.length).toBe(1)
  })
  it('maps actual vendor error_code and clears only a known refused, receipt-free operation', async () => {
    const { flow, state } = fixture(); state.mode = 'invalid'
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'current_password_invalid', message: 'Mật khẩu hiện tại không đúng.' })
    expect(localStorage.length).toBe(0); expect(state.puts).toBe(1)
  })
  it('requires server recovery context, never trusts forged URL/user metadata/JWT AMR', async () => {
    const { flow, state } = fixture()
    state.session.access_token = token(actor, sessionId, { amr: [{ method: 'recovery' }], user_metadata: { recovery: true } })
    await expect(flow.change({ ...input, currentPassword: '' })).rejects.toMatchObject({ code: 'current_password_required' })
    expect(state.puts).toBe(0)
  })
  it('allows no current password only after server attests native recovery context', async () => {
    const { flow, state } = fixture(); state.recovery = true
    await expect(flow.change({ ...input, currentPassword: '' })).resolves.toMatchObject({ completion: 'submitted' })
    const body = JSON.parse(String(state.calls.find(c => c.url.endsWith('/auth/v1/user'))?.options.body))
    expect(body).not.toHaveProperty('current_password')
  })
  it('does not dispatch when identity switches during context loading', async () => {
    const { flow, state } = fixture(); state.onContext = () => { state.session = { access_token: token(other), user: { id: other } } }
    await expect(flow.change(input)).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    expect(state.puts).toBe(0); expect(localStorage.length).toBe(0)
  })
  it('suppresses completion for another identity and retains original intent', async () => {
    const { flow, state } = fixture(); state.onPut = () => { state.session = { access_token: token(other), user: { id: other } } }
    await expect(flow.change(input)).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    expect(localStorage.length).toBe(1)
  })
  it('rejects a different same-user session while retaining captured Authorization', async () => {
    const { flow, state } = fixture(); state.onPut = () => { state.session.access_token = token(actor, otherSession) }
    await expect(flow.change(input)).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    expect(state.calls.every(c => (c.options.headers as Record<string, string>).Authorization === 'Bearer ' + token())).toBe(true)
  })
  it('allows token refresh only within the exact same session; request token cannot silently switch', async () => {
    const { flow, state } = fixture(); state.onPut = () => { state.session.access_token = token(actor, sessionId, { nonce: 'refreshed' }) }
    await expect(flow.change(input)).resolves.toMatchObject({ completion: 'submitted' })
    expect(state.calls.every(c => (c.options.headers as Record<string, string>).Authorization === 'Bearer ' + token())).toBe(true)
  })
  it('fails before PUT when durable storage is unavailable', async () => {
    const { deps, state } = fixture()
    const broken = createPasswordChangeFlow({ ...deps, storage: { length: 0, key: () => null, getItem: () => null,
      setItem: () => { throw new Error('private storage failure') }, removeItem: () => {} } })
    await expect(broken.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(state.puts).toBe(0)
  })
  it('never deletes another actor/session/endpoint record when reconciling', async () => {
    const { flow } = fixture(); localStorage.setItem('roomqc-password-change:v1:other-target:other-actor:other-session:' + operation, 'owned-other-context')
    await expect(flow.reconcile(actor)).resolves.toBeNull()
    expect(localStorage.length).toBe(1)
  })
  it('validates server identity/context even before the first password mutation', async () => {
    const { flow, state } = fixture(); state.wrongActor = true
    await expect(flow.context(actor)).rejects.toMatchObject({ code: 'outcome_unknown' })
    await expect(flow.change(input)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(state.puts).toBe(0)
  })
  it('does not dispatch after local logout even if an SDK session has not cleared yet', async () => {
    const { flow, state } = fixture()
    await expect(flow.change({ ...input, isCurrent: () => false })).rejects.toBeInstanceOf(PasswordIdentityChangedError)
    expect(state.puts).toBe(0)
  })
})
