import { vi } from 'vitest'
import { createReportTargetClient, type TargetCommand, type TargetContext, type TargetOutcome, type TargetReceipt, type TargetScope } from '@/lib/report-targets'
import { emailActor, emailHotel, emailSession, emailTenant, emailToken } from './email-auth-fixture'

export const targetContext: TargetContext = { actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, runtime: 'owned-runtime' }
export const targetScope: TargetScope = { kind: 'financial', month: '2026-10-01', hotelId: emailHotel }
export const targetRevision = (n = 0) => `${n}:${'a'.repeat(64)}`
export function targetMemoryStorage() {
  const map = new Map<string, string>()
  return { get length() { return map.size }, key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) }, removeItem: (k: string) => { map.delete(k) } }
}
export function reportTargetFixture() {
  const receipts = new Map<string, TargetOutcome>(), commands = new Map<string, TargetCommand>()
  const state = { session: { access_token: emailToken(), user: { id: emailActor } }, sessionError: false, runtimeCurrent: true,
    values: { adr: 123.45, occupancy: 75 } as Record<string, number>, counter: 0, review: false, canManage: true,
    lose: 'none' as 'none' | 'before' | 'after', cancelLose: 'none' as 'none' | 'before' | 'after', cancelStatus: 200,
    readStatus: 200, writeStatus: 200, writeError: 'REPORT_TARGET_STALE_REVISION',
    beforeReply: null as null | ((rpc: string) => void | Promise<void>),
    transform: null as null | ((value: unknown, rpc: string) => unknown), effects: 0, cancellations: 0 }
  let next = 0
  const storage = targetMemoryStorage()
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const rpc = String(url).split('/').at(-1)!, body = JSON.parse(String(options?.body))
    const snapshot = (scope: TargetScope) => ({ version: 1, kind: scope.kind, period_month: scope.month, hotel_id: scope.hotelId,
      revision: targetRevision(state.counter), values: { ...state.values }, review_required: state.review, can_manage: state.canManage })
    let result: unknown, status = 200
    if (rpc === 'get_report_targets') {
      status = state.readStatus; result = status === 200 ? snapshot({ kind: body.p_kind, month: body.p_period_month, hotelId: body.p_hotel_id }) : { message: 'private server detail' }
    } else if (rpc === 'get_report_target_command') {
      result = receipts.get(body.p_command_id) ?? { state: 'not_found', command_id: body.p_command_id }
    } else if (rpc === 'replace_report_targets' || rpc === 'cancel_report_target_command') {
      const isCancel = rpc === 'cancel_report_target_command', loss = isCancel ? state.cancelLose : state.lose
      if (loss === 'before') throw new Error('private transport detail')
      const old = receipts.get(body.p_command_id)
      if (isCancel && state.cancelStatus !== 200) { status = state.cancelStatus; result = { message: 'private cancel detail' } }
      else if (old) {
        if (JSON.stringify(commands.get(body.p_command_id)) !== JSON.stringify(body)) { status = 409; result = { message: 'REPORT_TARGET_COMMAND_CONFLICT' } }
        else result = old
      } else if (isCancel) {
        state.cancellations++
        const cancelled: TargetOutcome = { state: 'cancelled', reason: 'not_applied', command_id: body.p_command_id,
          request: { kind: body.p_kind, month: body.p_period_month, hotel: body.p_hotel_id, values: body.p_values,
            expected_revision: body.p_expected_revision, resolve_legacy: body.p_resolve_legacy } }
        receipts.set(body.p_command_id, cancelled); commands.set(body.p_command_id, body); result = cancelled
      } else if (state.writeStatus !== 200) { status = state.writeStatus; result = { message: state.writeError } }
      else if (body.p_expected_revision !== targetRevision(state.counter)) { status = 409; result = { message: 'REPORT_TARGET_STALE_REVISION' } }
      else {
        state.values = { ...body.p_values }; state.counter++; state.effects++; state.review = false
        const committed: TargetReceipt = { state: 'completed', command_id: body.p_command_id,
          report: snapshot({ kind: body.p_kind, month: body.p_period_month, hotelId: body.p_hotel_id }) as TargetReceipt['report'] }
        receipts.set(body.p_command_id, committed); commands.set(body.p_command_id, body); result = committed
      }
      if (loss === 'after') throw new Error('private response loss')
    } else throw new Error('Unexpected RPC')
    await state.beforeReply?.(rpc)
    return new Response(JSON.stringify(state.transform ? state.transform(result, rpc) : result), { status })
  })
  const deps = { endpoint: 'https://owned.roomqc.invalid', publishableKey: 'public-fixture', storage: () => storage,
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: state.sessionError ? new Error('private auth detail') : null })),
    isRuntimeCurrent: () => state.runtimeCurrent, fetch: http,
    newId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, '0')}` }
  return { state, storage, http, deps, receipts, commands, client: createReportTargetClient(deps) }
}
