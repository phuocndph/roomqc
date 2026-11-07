import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdviceError, parseAdviceReceipt, parseAdviceRequest } from '../../supabase/functions/_shared/advice/contracts'
import { createOperationsAdviceHandler, type AdviceDependencies } from '../../supabase/functions/_shared/advice/handler'
import { createOperationsAdviceClient } from './operations-advice-client'
import { adviceContext as context, adviceFixture, adviceScope as scope, deferredAdvice } from '@/test/operations-advice-fixture'

const command = '77777777-7777-4777-8777-777777777777'
const closed = () => ({ version: 1, command_id: command, state: 'closed_unknown', request: scope,
  context_hash: 'a'.repeat(64), advice: null, closed_at: '2026-10-27T14:00:00+00:00' })
const body = { action: 'close', command_id: command, ...scope }
const request = (value: unknown) => new Request('http://fixture.invalid', { method: 'POST',
  headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify(value) })
let f: ReturnType<typeof adviceFixture>
beforeEach(() => { localStorage.clear(); f = adviceFixture() })
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

describe('explicit unknown closure contract', () => {
  it('accepts only the exact original key and scope, without a client deadline or refund flag', () => {
    expect(parseAdviceRequest(body)).toEqual(body)
    for (const change of [{ deadline: '2026-01-01' }, { refund: true }, { actor_id: context.actorId }]) {
      expect(() => parseAdviceRequest({ ...body, ...change })).toThrow(AdviceError)
    }
    expect(() => parseAdviceRequest({ action: 'close', command_id: command })).toThrow(AdviceError)
  })
  it('requires an authoritative terminal receipt with a valid closure timestamp', () => {
    expect(parseAdviceReceipt(closed(), command)).toEqual(closed())
    for (const change of [{ closed_at: undefined }, { closed_at: 'invalid' }, { context_hash: null },
      { advice: [] }, { can_close: true }, { state: 'completed' }]) {
      expect(() => parseAdviceReceipt({ ...closed(), ...change }, command)).toThrow(AdviceError)
    }
  })
  it('keeps compatibility with old unknown receipts and validates the server close capability', () => {
    const old = { ...closed(), state: 'unknown', closed_at: undefined }
    expect(parseAdviceReceipt(old, command).can_close).toBeUndefined()
    expect(parseAdviceReceipt({ ...old, can_close: false }, command).can_close).toBe(false)
    expect(parseAdviceReceipt({ ...old, can_close: true }, command).can_close).toBe(true)
    for (const can_close of ['true', 1, null]) expect(() => parseAdviceReceipt({ ...old, can_close }, command)).toThrow()
  })
  it('closes with current user credentials even when the provider is disabled, without worker or provider calls', async () => {
    const rpc = vi.fn(async () => closed()), worker = vi.fn(), provider = vi.fn()
    const deps: AdviceDependencies = { cors: () => ({}), available: () => false,
      user: vi.fn(async () => ({ actorId: context.actorId, sessionId: context.sessionId, rpc })), worker, provider }
    const response = await createOperationsAdviceHandler(deps)(request(body))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(closed())
    expect(rpc).toHaveBeenCalledExactlyOnceWith('close_operations_advice', { p_command_id: command,
      p_start_date: scope.start, p_end_date: scope.end, p_hotel_id: scope.hotel, p_timezone: scope.timezone })
    expect(worker).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled()
  })
  it.each([[403, 'ADVICE_NOT_ALLOWED'], [409, 'ADVICE_STILL_RUNNING'], [503, 'ADVICE_UNAVAILABLE']] as const)(
    'keeps server denial %s safe without trying another key', async (status, code) => {
      const rpc = vi.fn(async () => { throw new AdviceError(status, code) }), worker = vi.fn(), provider = vi.fn()
      const deps: AdviceDependencies = { cors: () => ({}), available: () => true,
        user: async () => ({ actorId: context.actorId, sessionId: context.sessionId, rpc }), worker, provider }
      const response = await createOperationsAdviceHandler(deps)(request(body))
      expect(response.status).toBe(status); expect((await response.json()).code).toBe(code)
      expect(rpc).toHaveBeenCalledTimes(1); expect(worker).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled()
    })
})

describe('closure caller durability', () => {
  const client = () => createOperationsAdviceClient(f.deps)
  const pending = async () => { f.state.generateState = 'unknown'; return client().generate(context, scope) }
  it('retains pending and usage before the deadline, then closes without starting another generation', async () => {
    const original = await pending()
    await expect(client().close(context, scope)).rejects.toMatchObject({ code: 'still_processing' })
    expect(client().pending(context, scope)?.request.command_id).toBe(original.command_id)
    expect(f.state.closureEffects).toBe(0)
    f.state.canClose = true
    const result = await client().close(context, scope)
    expect(result.state).toBe('closed_unknown'); expect(client().pending(context, scope)).toBeNull()
    expect(f.state.effects).toBe(1); expect(f.state.closureEffects).toBe(1)
    expect(f.state.calls.map(c => c.action)).toEqual(['generate', 'close', 'close'])
    await client().generate(context, scope)
    expect(f.state.effects).toBe(2); expect(f.state.calls.at(-1)?.command_id).not.toBe(original.command_id)
  })
  it('recovers a committed closure after a lost response through a new client and the same key', async () => {
    const original = await pending(); f.state.canClose = true; f.state.loss = 'after'
    await expect(client().close(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(client().pending(context, scope)?.request.command_id).toBe(original.command_id)
    expect(f.state.closureEffects).toBe(1); f.state.loss = 'none'
    expect((await client().lookup(context, scope)).state).toBe('closed_unknown')
    expect(client().pending(context, scope)).toBeNull(); expect(f.state.effects).toBe(1); expect(f.state.closureEffects).toBe(1)
  })
  it('never clears pending from a malformed or mismatched closure receipt', async () => {
    await pending(); f.state.canClose = true
    f.state.reply = receipt => ({ ...receipt, closed_at: undefined })
    await expect(client().close(context, scope)).rejects.toMatchObject({ code: 'outcome_unknown' })
    expect(client().pending(context, scope)).not.toBeNull(); expect(f.state.effects).toBe(1)
  })
  it('masks a late closure after identity changes and allows explicit later recovery', async () => {
    await pending(); f.state.canClose = true; const gate = deferredAdvice(); let current = true
    f.state.beforeReply = action => action === 'close' ? gate.wait : undefined
    const task = client().close(context, scope, { isCurrent: () => current }).catch(e => e)
    await vi.waitFor(() => expect(f.state.closureEffects).toBe(1)); current = false; gate.release()
    expect(await task).toMatchObject({ code: 'identity_changed' }); expect(client().pending(context, scope)).not.toBeNull()
    f.state.beforeReply = null; current = true
    expect((await client().lookup(context, scope)).state).toBe('closed_unknown'); expect(f.state.effects).toBe(1)
  })
})
