import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportTargetClient, parseTargetReport, targetDraftValues, targetValues } from './report-targets'
import { reportTargetFixture, targetContext as context, targetScope as scope, targetRevision } from '@/test/report-target-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'

let f: ReturnType<typeof reportTargetFixture>
beforeEach(() => { f = reportTargetFixture() })
const body = (f: ReturnType<typeof reportTargetFixture>, i: number) => JSON.parse(String(f.http.mock.calls[i][1]?.body))
const report = () => ({ version: 1, kind: scope.kind, period_month: scope.month, hotel_id: scope.hotelId,
  revision: targetRevision(), values: { adr: 123.45 }, review_required: false, can_manage: true })
describe('report target DTO and decimal input', () => {
  it('retains decimals, zero, negative GOP and explicit deletion without guessing thousands separators', () => {
    expect(targetDraftValues('financial', { adr: '123.45', occupancy: '0', gop: '-500', gop_margin: '-1,25', revpar: ' ' }))
      .toEqual({ adr: 123.45, gop: -500, gop_margin: -1.25, occupancy: 0 })
    expect(targetDraftValues('monthly', { revenue_target: '', occupancy_target: '' })).toEqual({})
  })
  it.each(['1.234.567', '1,000,000', '1 000', '1e3', '1.234', 'NaN', 'Infinity', '12x', '--5'])('rejects ambiguous or invalid input %s', adr => {
    expect(() => targetDraftValues('financial', { adr })).toThrow('không hợp lệ')
  })
  it.each([{ adr: -1 }, { occupancy: 101 }, { occupancy: -1 }, { gop_margin: -1001 }, { gop_margin: 101 },
    { labor_ratio: 1001 }, { net_revenue: Infinity }, { adr: NaN }, { adr: 0.123 }, { adr: 1000000000000 }, { unknown: 1 }])('validates financial range %#', values => {
    expect(() => targetValues('financial', values)).toThrow()
  })
  it.each([{ revenue_target: 1.25 }, { revenue_target: -1 }, { occupancy_target: 101 }, { adr: 1 }])('validates monthly metrics %#', values => {
    expect(() => targetValues('monthly', values)).toThrow()
  })
  it.each([{ version: 2 }, { kind: 'monthly' }, { period_month: '2026-09-01' }, { hotel_id: emailOther }, { revision: '1' },
    { revision: `01:${'a'.repeat(64)}` }, { can_manage: 'true' }, { review_required: null }, { values: { adr: null } }])('rejects wrong DTO or scope %#', delta => {
    expect(() => parseTargetReport({ ...report(), ...delta }, scope)).toThrow()
  })
  it('preserves the distinct review and read-only flags', () => {
    expect(parseTargetReport({ ...report(), review_required: true, can_manage: false }, scope)).toMatchObject({ review_required: true, can_manage: false })
  })
})
describe('strict report target client and durable recovery', () => {
  it('reads a server scoped DTO without caller tenant and uses no-store credentials', async () => {
    expect(await f.client.read(context, scope)).toMatchObject({ values: f.state.values })
    expect(body(f, 0)).toEqual({ p_kind: 'financial', p_period_month: '2026-10-01', p_hotel_id: scope.hotelId })
    expect(f.http.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' })
  })
  it('saves the whole set once and removes only a validated completed receipt', async () => {
    expect(await f.client.save(context, scope, { occupancy: 0, adr: 123.45 }, targetRevision())).toMatchObject({ state: 'completed' })
    expect(f.http).toHaveBeenCalledTimes(1); expect(f.state.effects).toBe(1); expect(f.storage.length).toBe(0)
    expect(body(f, 0).p_values).toEqual({ adr: 123.45, occupancy: 0 })
  })
  it('empty replacement is an explicit delete', async () => {
    await f.client.save(context, scope, {}, targetRevision()); expect(f.state.values).toEqual({})
  })
  it('persists before network and never stores a token', async () => {
    f.state.beforeReply = () => { expect(f.storage.length).toBe(1); expect(f.storage.getItem(f.storage.key(0)!)).not.toContain('access_token') }
    await f.client.save(context, scope, {}, targetRevision())
  })
  it.each(['before', 'after'] as const)('recovers %s commit with the original key and payload after reload', async lose => {
    f.state.lose = lose
    await expect(f.client.save(context, scope, { gop: -10 }, targetRevision())).rejects.toMatchObject({ code: 'outcome_unknown' })
    const stored = f.client.pending(context, scope)[0].command
    expect(f.storage.length).toBe(1)
    const reloaded = createReportTargetClient(f.deps); f.state.lose = 'none'
    await reloaded.recover(context, scope)
    expect(f.state.effects).toBe(1); expect(f.storage.length).toBe(0)
    expect(f.http.mock.calls[1][0]).toContain('/get_report_target_command')
    if (lose === 'before') expect(body(f, 2)).toEqual(stored)
    else expect(f.http).toHaveBeenCalledTimes(2)
  })
  it('recovers under a fresh session of the same actor', async () => {
    f.state.lose = 'after'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    f.state.lose = 'none'; f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } }
    await f.client.recover({ ...context, sessionId: emailOtherSession }, scope); expect(f.state.effects).toBe(1)
  })
  it('another actor, hotel, runtime or month cannot see this pending command', async () => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    for (const other of [{ ...context, actorId: emailOther }, { ...context, runtime: 'other' }]) expect(f.client.pending(other, scope)).toEqual([])
    for (const other of [{ ...scope, hotelId: emailOther }, { ...scope, month: '2026-09-01' }]) expect(f.client.pending(context, other)).toEqual([])
  })
  it('blocks a new command in another tab while the same scope is unresolved', async () => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    const second = createReportTargetClient(f.deps)
    await expect(second.save(context, scope, { adr: 99 }, targetRevision())).rejects.toMatchObject({ code: 'pending_command' })
    expect(f.storage.length).toBe(1); expect(f.http).toHaveBeenCalledTimes(1)
  })
  it.each([400, 401, 403, 409, 429, 503])('keeps pending after HTTP %i without leaking server details', async status => {
    f.state.writeStatus = status
    await expect(f.client.save(context, scope, {}, targetRevision())).rejects.not.toThrow('private')
    expect(f.client.pending(context, scope)).toHaveLength(1)
  })
  it('does not abandon a stale-revision key merely because a lookup says not_found', async () => {
    f.state.writeStatus = 409
    await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toMatchObject({ code: 'stale_revision' })
    const first = body(f, 0)
    await expect(f.client.recover(context, scope)).rejects.toMatchObject({ code: 'stale_revision' })
    expect(body(f, 2)).toEqual(first); expect(f.storage.length).toBe(1)
  })
  it.each(['set', 'readback'] as const)('storage %s failure prevents network dispatch', async mode => {
    const storage = { ...f.storage, get length() { return f.storage.length },
      setItem: mode === 'set' ? () => { throw new Error('private disk') } : f.storage.setItem,
      getItem: mode === 'readback' ? () => null : f.storage.getItem }
    const client = createReportTargetClient({ ...f.deps, storage: () => storage })
    await expect(client.save(context, scope, {}, targetRevision())).rejects.toMatchObject({ code: 'storage_unavailable' })
    expect(f.http).not.toHaveBeenCalled()
  })
  it('a damaged pending record blocks new saves instead of erasing recovery data', async () => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    f.storage.setItem(f.storage.key(0)!, '{broken')
    expect(() => f.client.pending(context, scope)).toThrow('thiết bị')
    expect(f.storage.length).toBe(1)
  })
  it.each(['actor', 'session', 'runtime', 'abort'] as const)('rejects %s change after commit and retains the recoverable key', async change => {
    const controller = new AbortController()
    f.state.beforeReply = () => {
      if (change === 'actor') f.state.session = { access_token: emailToken(emailOther), user: { id: emailOther } }
      if (change === 'session') f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } }
      if (change === 'runtime') f.state.runtimeCurrent = false
      if (change === 'abort') controller.abort()
    }
    await expect(f.client.save(context, scope, {}, targetRevision(), false, { signal: controller.signal })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.effects).toBe(1); expect(f.storage.length).toBe(1)
  })
  it.each(['command', 'scope', 'values', 'revision', 'review'] as const)('retains pending if a success receipt has the wrong %s', async field => {
    f.state.transform = (x, rpc) => {
      if (rpc !== 'replace_report_targets') return x
      const r = x as { command_id: string; report: Record<string, unknown> }
      if (field === 'command') r.command_id = emailOther
      if (field === 'scope') r.report.hotel_id = emailOther
      if (field === 'values') r.report.values = { adr: 42 }
      if (field === 'revision') r.report.revision = targetRevision()
      if (field === 'review') r.report.review_required = true
      return r
    }
    await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.storage.length).toBe(1)
  })
  it('bounds response bytes rather than parsing an unlimited body', async () => {
    f.state.transform = () => ({ padding: 'x'.repeat(32769) })
    await expect(f.client.read(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' })
  })
  it('cancels the exact stale command and allows a new revision only after the terminal result', async () => {
    f.state.counter = 1
    await expect(f.client.save(context, scope, { adr: 9 }, targetRevision())).rejects.toMatchObject({ code: 'stale_revision' })
    const original = body(f, 0), oldValues = { ...f.state.values }
    expect(await f.client.cancel(context, scope)).toMatchObject({ state: 'cancelled', reason: 'not_applied' })
    expect(body(f, 1)).toEqual(original); expect(f.storage.length).toBe(0)
    expect(f.state.values).toEqual(oldValues); expect(f.state.effects).toBe(0)
    const late = await f.http('https://owned.roomqc.invalid/rest/v1/rpc/replace_report_targets', { body: JSON.stringify(original) })
    expect(await late.json()).toMatchObject({ state: 'cancelled' }); expect(f.state.effects).toBe(0)
    expect(await f.client.save(context, scope, { adr: 10 }, targetRevision(1))).toMatchObject({ state: 'completed' })
  })
  it('a save committed before cancellation returns completed without a cancellation effect', async () => {
    f.state.lose = 'after'; await expect(f.client.save(context, scope, { adr: 9 }, targetRevision())).rejects.toThrow()
    expect(await f.client.cancel(context, scope)).toMatchObject({ state: 'completed' })
    expect(f.state.effects).toBe(1); expect(f.state.cancellations).toBe(0); expect(f.storage.length).toBe(0)
  })
  it.each(['before', 'after'] as const)('keeps an unknown %s cancellation through reload and recovers one terminal result', async loss => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    f.state.cancelLose = loss
    await expect(f.client.cancel(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(f.storage.length).toBe(1); f.state.cancelLose = 'none'
    const reloaded = createReportTargetClient(f.deps)
    const result = loss === 'after' ? await reloaded.recover(context, scope) : await reloaded.cancel(context, scope)
    expect(result.state).toBe('cancelled'); expect(f.state.cancellations).toBe(1); expect(f.state.effects).toBe(0); expect(f.storage.length).toBe(0)
  })
  it.each([400, 401, 403, 409, 429, 503])('keeps pending and masks server details after cancellation HTTP %i', async status => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    f.state.cancelStatus = status
    await expect(f.client.cancel(context, scope)).rejects.not.toThrow('private')
    expect(f.storage.length).toBe(1); expect(f.state.cancellations).toBe(0)
  })
  it.each(['id', 'reason', 'kind', 'month', 'hotel', 'values', 'revision', 'resolve', 'extra', 'missing'] as const)('rejects a cancellation receipt with the wrong %s', async field => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, { adr: 9 }, targetRevision())).rejects.toThrow()
    f.state.transform = (input, rpc) => {
      if (rpc !== 'cancel_report_target_command') return input
      const r = structuredClone(input) as { command_id: string; reason: string; request: Record<string, unknown>; extra?: boolean }
      if (field === 'id') r.command_id = emailOther
      if (field === 'reason') r.reason = 'maybe'
      if (field === 'kind') r.request.kind = 'monthly'
      if (field === 'month') r.request.month = '2026-11-01'
      if (field === 'hotel') r.request.hotel = emailOther
      if (field === 'values') r.request.values = { adr: 10 }
      if (field === 'revision') r.request.expected_revision = targetRevision(1)
      if (field === 'resolve') r.request.resolve_legacy = true
      if (field === 'extra') r.extra = true
      if (field === 'missing') delete r.request.hotel
      return r
    }
    await expect(f.client.cancel(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' }); expect(f.storage.length).toBe(1)
    f.state.transform = null; expect((await f.client.recover(context, scope)).state).toBe('cancelled')
  })
  it.each(['actor', 'session', 'runtime', 'abort'] as const)('retains the cancellation key after %s changes while waiting', async change => {
    f.state.lose = 'before'; await expect(f.client.save(context, scope, {}, targetRevision())).rejects.toThrow()
    const controller = new AbortController()
    f.state.beforeReply = () => {
      if (change === 'actor') f.state.session = { access_token: emailToken(emailOther), user: { id: emailOther } }
      if (change === 'session') f.state.session = { access_token: emailToken(context.actorId, emailOtherSession), user: { id: context.actorId } }
      if (change === 'runtime') f.state.runtimeCurrent = false
      if (change === 'abort') controller.abort()
    }
    await expect(f.client.cancel(context, scope, { signal: controller.signal })).rejects.toMatchObject({ code: 'identity_changed' })
    expect(f.state.cancellations).toBe(1); expect(f.storage.length).toBe(1)
  })
  it('another tab fences an in-flight save and the original caller accepts cancelled without claiming completion', async () => {
    let release!: () => void; const gate = new Promise<void>(r => { release = r })
    const held = createReportTargetClient({ ...f.deps, fetch: async (url, options) => {
      if (String(url).endsWith('/replace_report_targets')) await gate
      return f.http(url, options)
    } })
    const saved = held.save(context, scope, { adr: 9 }, targetRevision())
    await vi.waitFor(() => expect(f.storage.length).toBe(1))
    expect((await f.client.cancel(context, scope)).state).toBe('cancelled'); release()
    expect((await saved).state).toBe('cancelled'); expect(f.state.effects).toBe(0)
  })
  it('times out a hanging transport and preserves pending', async () => {
    vi.useFakeTimers()
    try {
      const client = createReportTargetClient({ ...f.deps, fetch: () => new Promise<Response>(() => {}) })
      const p = client.save(context, scope, {}, targetRevision()).catch(e => e)
      await vi.advanceTimersByTimeAsync(20001)
      expect(await p).toMatchObject({ code: 'outcome_unknown' }); expect(f.storage.length).toBe(1)
    } finally { vi.useRealTimers() }
  })
})
