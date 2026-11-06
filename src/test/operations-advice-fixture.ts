import { vi } from 'vitest'
import { AdviceClientError, type AdviceContext, type AdviceLock } from '@/lib/operations-advice-client'
import { emailActor, emailHotel, emailSession, emailTenant, emailToken } from './email-auth-fixture'
import type { AdviceReceipt, AdviceScope } from '../../supabase/functions/_shared/advice/contracts'
export const adviceScope: AdviceScope = { start: '2026-10-01', end: '2026-10-31', hotel: emailHotel, timezone: 'Asia/Ho_Chi_Minh' }
export const adviceContext: AdviceContext = { actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, runtime: 'owned-runtime' }
export const adviceItems = Array.from({ length: 3 }, (_, i) => ({ title: 'Advice ' + i, description: 'Synthetic aggregate.', action: 'Review source.', priority: 'medium' as const }))
export const deferredAdvice = () => { let release!: () => void; const wait = new Promise<void>(r => { release = r }); return { wait, release } }
export function adviceFixture() {
  let serial = 0
  const held = new Set<string>(), entries = new Map<string, AdviceReceipt>()
  const state = { session: { access_token: emailToken(), user: { id: emailActor } } as { access_token: string; user: { id: string } } | null,
    sessionError: false, loss: 'none', status: 200, generateState: 'completed' as AdviceReceipt['state'], malformed: false,
    reply: null as ((receipt: AdviceReceipt) => unknown) | null,
    beforeReply: null as ((action: string) => void | Promise<void>) | null, calls: [] as Record<string, unknown>[], effects: 0,
    canClose: false, closureEffects: 0 }
  const lock: AdviceLock = async (key, run) => {
    if (held.has(key)) throw new AdviceClientError('flow_busy', 'Owned fixture lock busy')
    held.add(key); try { return await run() } finally { held.delete(key) }
  }
  const http = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)); state.calls.push(body)
    if (state.loss === 'before') throw new Error('Private network details')
    if (state.status !== 200) return new Response(JSON.stringify({ code: 'PRIVATE_UPSTREAM_DETAIL', error: 'private PII' }), { status: state.status })
    const id = body.command_id, previous = entries.get(id)
    if (body.action === 'generate' && !previous) {
      state.effects++
      entries.set(id, { version: 1, command_id: id, state: state.generateState, request: {
        start: body.start, end: body.end, hotel: body.hotel, timezone: body.timezone }, context_hash: 'a'.repeat(64),
        advice: state.generateState === 'completed' ? adviceItems : null,
        ...(state.generateState === 'unknown' ? { can_close: state.canClose } : {}) })
    }
    if (body.action === 'cancel' && !['completed', 'unknown', 'closed_unknown'].includes(previous?.state ?? '')) {
      entries.set(id, { version: 1, command_id: id, state: 'cancelled', request: {
        start: body.start, end: body.end, hotel: body.hotel, timezone: body.timezone }, context_hash: null, advice: null })
    }
    if (body.action === 'close' && previous?.state === 'unknown') {
      if (!state.canClose) return new Response(JSON.stringify({ code: 'ADVICE_STILL_RUNNING' }), { status: 409 })
      state.closureEffects++
      const retained = { ...previous }; delete retained.can_close
      entries.set(id, { ...retained, state: 'closed_unknown', closed_at: '2026-10-27T14:00:00Z' })
    }
    await state.beforeReply?.(body.action)
    if (state.loss === 'after') throw new Error('Private accepted response lost')
    const receipt = entries.get(id) ?? { version: 1, command_id: id, state: 'not_found', request: null, context_hash: null, advice: null }
    const value = state.reply ? state.reply(receipt as AdviceReceipt) : receipt
    return new Response(state.malformed ? '{' : JSON.stringify(value), { status: receipt.state === 'unknown' && body.action !== 'lookup' ? 202 : 200 })
  }) as unknown as typeof fetch
  return { state, http, lock, entries, deps: {
    endpoint: 'https://owned.roomqc.invalid', publishableKey: 'public-fixture', storage: () => localStorage,
    fetch: http, lock, newId: () => '55555555-5555-4555-8555-' + String(++serial).padStart(12, '0'),
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: state.sessionError ? new Error('Private auth') : null })),
  } }
}
