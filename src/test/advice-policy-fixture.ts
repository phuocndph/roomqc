import { vi } from 'vitest'
import { createAdvicePolicyClient, type AdvicePolicy, type PolicyCommand, type PolicyContext } from '@/lib/advice-policy'
import { emailActor, emailSession, emailTenant, emailToken } from './email-auth-fixture'
import { targetMemoryStorage } from './report-target-fixture'

export const policyContext: PolicyContext = { actorId: emailActor, sessionId: emailSession, tenantId: emailTenant, runtime: 'fixture-cluster-a' }
export const policyDraft = (): AdvicePolicy => ({ enabled: true, daily_limit: 20, daily_budget_units: 100, units_per_request: 5,
  valid_until: new Date(Date.now() + 86400000).toISOString(), reason: 'Fixture policy change' })
export function advicePolicyFixture() {
  const receipts = new Map<string, unknown>(), storage = targetMemoryStorage(), locks = new Map<string, Promise<unknown>>()
  const state = { session: { access_token: emailToken(), user: { id: emailActor } }, runtimeCurrent: true,
    revision: 0, policy: null as AdvicePolicy | null, effects: 0, cancellations: 0,
    loss: 'none' as 'none' | 'before' | 'after', writeStatus: 200, readStatus: 200,
    beforeReply: null as null | ((rpc: string) => void | Promise<void>),
    transform: null as null | ((reply: unknown, rpc: string) => unknown) }
  const snap = () => ({ tenant_id: emailTenant, revision: state.revision,
    policy: state.policy ? { ...state.policy, tenant_id: emailTenant, version: state.revision } : null })
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const rpc = String(url).split('/').at(-1)!, body = JSON.parse(String(options?.body)) as PolicyCommand
    let result: unknown, status = 200
    if (rpc === 'get_operations_advice_policy') {
      status = state.readStatus; result = status === 200 ? { version: 1, ...snap() } : { message: 'private diagnostic' }
    } else if (rpc === 'get_operations_advice_policy_command') {
      result = receipts.get(body.p_command_id) ?? { version: 1, tenant_id: emailTenant, command_id: body.p_command_id, state: 'not_found' }
    } else {
      if (state.loss === 'before') throw new Error('private transport detail')
      const old = receipts.get(body.p_command_id)
      if (old) result = old
      else if (rpc === 'cancel_operations_advice_policy_command') {
        state.cancellations++
        result = { version: 1, tenant_id: emailTenant, command_id: body.p_command_id, state: 'cancelled' }
        receipts.set(body.p_command_id, result)
      } else if (state.writeStatus !== 200 || body.p_expected_version !== state.revision) {
        status = state.writeStatus !== 200 ? state.writeStatus : 409
        result = { message: 'ADVICE_POLICY_VERSION_CONFLICT', details: 'private diagnostic' }
      } else {
        state.effects++; state.revision++; state.policy = body.p_policy
        result = { version: 1, tenant_id: emailTenant, command_id: body.p_command_id, state: 'succeeded', result: snap() }
        receipts.set(body.p_command_id, result)
      }
      if (state.loss === 'after') throw new Error('private transport detail')
    }
    await state.beforeReply?.(rpc)
    return new Response(JSON.stringify(state.transform?.(result, rpc) ?? result), { status })
  })
  let ids = 0
  const deps = { endpoint: 'https://cluster-a.example.test', publishableKey: 'public-test-key', storage: () => storage,
    getSession: async () => ({ data: { session: state.session }, error: null }), fetch: http as typeof fetch,
    isRuntimeCurrent: () => state.runtimeCurrent,
    newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    lock: async <T,>(key: string, task: () => Promise<T>): Promise<T> => {
      const previous = locks.get(key) ?? Promise.resolve()
      const next = previous.catch(() => {}).then(task); locks.set(key, next)
      try { return await next } finally { if (locks.get(key) === next) locks.delete(key) }
    },
  }
  return { state, storage, http, deps, receipts, client: createAdvicePolicyClient(deps) }
}
