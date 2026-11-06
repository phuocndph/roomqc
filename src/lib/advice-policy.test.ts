import { beforeEach, describe, expect, it } from 'vitest'
import { advicePolicy, createAdvicePolicyClient } from './advice-policy'
import { advicePolicyFixture, policyContext as context, policyDraft } from '@/test/advice-policy-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'

let f: ReturnType<typeof advicePolicyFixture>
beforeEach(() => { f = advicePolicyFixture() })
const body = (i: number) => JSON.parse(String(f.http.mock.calls[i][1]?.body))
const lost = async (where: 'before' | 'after') => {
  f.state.loss = where
  await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'outcome_unknown' })
  f.state.loss = 'none'
}
describe('advice policy input and server envelope', () => {
  it('retains microseconds and normalizes timezones without interpreting units as money', () => {
    const p = policyDraft()
    expect(advicePolicy({ ...p, reason: '  valid reason  ', valid_until: '2026-12-31T23:59:00.123456+07:00' }))
      .toMatchObject({ valid_until: '2026-12-31T16:59:00.123456Z', reason: 'valid reason' })
  })
  it.each([{ enabled: 'true' }, { daily_limit: 0 }, { daily_limit: 100001 }, { daily_limit: 1.5 },
    { daily_budget_units: 100000001 }, { units_per_request: 101 }, { reason: 'no' }, { extra: true },
    { valid_until: '2026-02-30T00:00:00Z' }, { valid_until: '2026-10-28T00:00:00' },
    { valid_until: '2026-10-28T00:00:00+24:00' }, { valid_until: 'infinity' }])('rejects invalid policy %#', delta => {
    expect(() => advicePolicy({ ...policyDraft(), ...delta })).toThrow()
  })
  it('reads missing configuration as disabled without generating a write or defaults', async () => {
    expect(await f.client.read(context)).toEqual({ revision: 0, policy: null })
    expect(f.state.effects).toBe(0); expect(f.storage.length).toBe(0)
  })
  it.each([{ version: 2 }, { tenant_id: emailOther }, { revision: '1' }, { revision: 1, policy: null }])('rejects mismatched reads %#', delta => {
    f.state.transform = x => ({ ...x as object, ...delta })
    return expect(f.client.read(context)).rejects.toThrow()
  })
  it('allows disabling an expired policy without inventing a new expiry', async () => {
    const p = { ...policyDraft(), enabled: false, valid_until: '2020-01-01T00:00:00Z' }
    expect(await f.client.save(context, p, 0)).toMatchObject({ state: 'succeeded' })
    expect(body(0).p_policy.valid_until).toBe('2020-01-01T00:00:00.000000Z')
  })
  it.each(['2020-01-01T00:00:00Z', '2090-01-01T00:00:00Z'])('refuses enabled expiry outside the window %s', valid_until => {
    return expect(f.client.save(context, { ...policyDraft(), valid_until }, 0)).rejects.toMatchObject({ code: 'invalid_policy' })
  })
})
describe('policy command durable recovery', () => {
  it('persists a token-free command before sending and validates the committed receipt', async () => {
    f.state.beforeReply = () => {
      expect(f.storage.length).toBe(1)
      expect(f.storage.getItem(f.storage.key(0)!)).not.toContain('access_token')
    }
    expect(await f.client.save(context, policyDraft(), 0)).toMatchObject({ state: 'succeeded', snapshot: { revision: 1 } })
    expect(f.state.effects).toBe(1); expect(f.storage.length).toBe(0)
    expect(f.http.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error' })
  })
  it('lookup after loss before commit retains the command and sends no new write', async () => {
    await lost('before')
    const command = f.client.pending(context)!.command
    expect(await f.client.lookup(context)).toEqual({ state: 'not_found', command_id: command.p_command_id })
    expect(f.state.effects).toBe(0); expect(f.storage.length).toBe(1)
    expect(f.http).toHaveBeenCalledTimes(2)
    await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'pending_command' })
    await f.client.retry(context)
    expect(body(2)).toEqual(command); expect(f.state.effects).toBe(1)
  })
  it('recovers a committed write after reload without sending it again', async () => {
    await lost('after')
    expect(f.state.effects).toBe(1)
    const reloaded = createAdvicePolicyClient(f.deps)
    expect(await reloaded.lookup(context)).toMatchObject({ state: 'succeeded' })
    expect(f.state.effects).toBe(1); expect(f.storage.length).toBe(0)
  })
  it('cancellation after commit returns success rather than claiming an undo', async () => {
    await lost('after')
    expect(await f.client.cancel(context)).toMatchObject({ state: 'succeeded' })
    expect(f.state.effects).toBe(1); expect(f.state.cancellations).toBe(0)
  })
  it('cancellation fences an old delayed request before a fresh key is allowed', async () => {
    await lost('before'); const old = f.client.pending(context)!.command
    expect(await f.client.cancel(context)).toMatchObject({ state: 'cancelled' })
    const late = await f.http('https://cluster-a.example.test/rest/v1/rpc/set_operations_advice_policy', { body: JSON.stringify(old) })
    expect(await late.json()).toMatchObject({ state: 'cancelled' }); expect(f.state.effects).toBe(0)
    await f.client.save(context, policyDraft(), 0); expect(f.state.effects).toBe(1)
  })
  it('recovers a lost cancellation response without inventing a fresh command', async () => {
    await lost('before'); f.state.loss = 'after'
    await expect(f.client.cancel(context)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.storage.length).toBe(1); expect(f.state.cancellations).toBe(1)
    f.state.loss = 'none'
    expect(await f.client.lookup(context)).toMatchObject({ state: 'cancelled' })
    expect(f.state.cancellations).toBe(1); expect(f.state.effects).toBe(0); expect(f.storage.length).toBe(0)
  })
  it.each([400, 401, 403, 409, 429, 503])('keeps pending after HTTP %i without exposing server details', async status => {
    f.state.writeStatus = status
    await expect(f.client.save(context, policyDraft(), 0)).rejects.not.toThrow('private')
    expect(f.client.pending(context)).not.toBeNull()
  })
  it('a revision conflict does not silently replace the version or erase the draft', async () => {
    f.state.revision = 2
    await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'version_conflict' })
    expect(f.client.pending(context)!.command.p_expected_version).toBe(0)
    await expect(f.client.retry(context)).rejects.toMatchObject({ code: 'version_conflict' })
    expect(body(1)).toEqual(body(0)); await f.client.cancel(context); expect(f.storage.length).toBe(0)
  })
  it('serializes two client instances sharing one scope before either can overwrite pending', async () => {
    f.state.loss = 'before'
    const second = createAdvicePolicyClient(f.deps)
    const replies = await Promise.allSettled([f.client.save(context, policyDraft(), 0), second.save(context, policyDraft(), 0)])
    expect(replies.map(r => r.status === 'rejected' ? r.reason.code : r.value.state)).toEqual(['outcome_unknown', 'pending_command'])
    expect(f.http).toHaveBeenCalledTimes(1); expect(f.storage.length).toBe(1)
  })
  it('does not fall back to an unsafe lock when Web Locks is unavailable', async () => {
    const client = createAdvicePolicyClient({ ...f.deps, lock: undefined })
    await expect(client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'locking_unavailable' })
    expect(f.http).not.toHaveBeenCalled(); expect(f.storage.length).toBe(0)
  })
  it('storage failure prevents network dispatch', async () => {
    const client = createAdvicePolicyClient({ ...f.deps, storage: () => ({ ...f.storage, setItem: () => { throw Error('private disk') } }) })
    await expect(client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).not.toHaveBeenCalled()
  })
  it('damaged pending blocks replacement without deleting recovery data', async () => {
    await lost('before'); f.storage.setItem(f.storage.key(0)!, '{broken')
    await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.storage.length).toBe(1); expect(f.http).toHaveBeenCalledTimes(1)
  })
  it.each([{ tenant_id: emailOther }, { command_id: emailOther }, { version: 9 }])('does not clear pending for a wrong receipt %#', async delta => {
    f.state.transform = x => ({ ...x as object, ...delta })
    await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.storage.length).toBe(1)
  })
  it('another actor, cluster or tenant cannot see pending; the same actor may recover after relogin', async () => {
    await lost('after')
    for (const other of [{ ...context, actorId: emailOther }, { ...context, tenantId: emailOther }, { ...context, runtime: 'cluster-b' }]) expect(f.client.pending(other)).toBeNull()
    f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } }
    expect(await f.client.lookup({ ...context, sessionId: emailOtherSession })).toMatchObject({ state: 'succeeded' })
  })
  it('rejects a response after session change and keeps the command', async () => {
    f.state.beforeReply = () => { f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } } }
    await expect(f.client.save(context, policyDraft(), 0)).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.storage.length).toBe(1)
  })
  it('rejects an obsolete identity epoch even when the same scope returns', async () => {
    let epoch = 1; const captured = epoch
    f.state.beforeReply = () => { epoch = 3 }
    await expect(f.client.save(context, policyDraft(), 0, { isCurrent: () => epoch === captured })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.storage.length).toBe(1)
  })
})
