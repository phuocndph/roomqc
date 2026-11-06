import { vi } from 'vitest'
import { defaultHotelGrant, type AuthorityCommand, type AuthorityConfiguration, type AuthorityContext } from '@/lib/employee-authority'
import { emailActor as actor, emailOther as target, emailSession as sid, emailTenant as tenant,
  emailHotel as hotel, emailInvitation as hotel2, emailOperation as requestId, emailToken } from './email-auth-fixture'
export { actor, target, sid, tenant, hotel, hotel2, requestId }
export const context: AuthorityContext = { actorId: actor, sessionId: sid, tenantId: tenant, runtime: 'owned-runtime-A' }
export function authorityConfiguration(): AuthorityConfiguration {
  const flags = { can_create_managers: true, can_create_staff: true, can_view_reports: true, can_export_data: true, can_approve_requests: true }
  return { target_id: target, semantics: 'additive', versions: { grants: '5', hotels: '7' }, primary_hotel_id: hotel,
    grants: [{ module: 'rooms', action: 'update', enabled: false }],
    hotels: [{ ...defaultHotelGrant(hotel), can_view_reports: true }],
    actions: [{ module: 'rooms', action: 'update', custom: false, inherited: true, effective: true, delegatable: true },
      { module: 'bookings', action: 'create', custom: false, inherited: false, effective: false, delegatable: false },
      { module: 'extra_catalog', action: 'view', custom: false, inherited: false, effective: false, delegatable: true }],
    hotel_catalog: [{ id: hotel, name: 'Khách sạn Một', code: 'ONE', status: 'active', assignable: true, allowed: { ...flags } },
      { id: hotel2, name: 'Khách sạn Hai', code: 'TWO', status: 'active', assignable: true, allowed: { ...flags } }] }
}
export function authorityReceipt(command: AuthorityCommand) {
  return { state: 'completed', target_id: command.p_target_id, kind: command.p_kind, request_id: command.p_request_id,
    version: (BigInt(command.p_expected_version) + BigInt(3)).toString(), entries: command.p_entries }
}
export function authorityCancellation(command: AuthorityCommand) {
  return { state: 'cancelled', reason: 'not_applied', target_id: command.p_target_id, kind: command.p_kind,
    request_id: command.p_request_id, expected_version: command.p_expected_version, entries: command.p_entries }
}
export function memoryStorage() {
  const rows = new Map<string, string>()
  return { rows, get length() { return rows.size }, key: (i: number) => [...rows.keys()][i] ?? null,
    getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value) },
    removeItem: (key: string) => { rows.delete(key) } }
}
export function authorityFixture() {
  const state = { session: { access_token: emailToken(), user: { id: actor } } as { access_token: string; user: { id: string } } | null,
    configuration: authorityConfiguration(), loseWrite: false, loseCancellation: false,
    committed: null as ReturnType<typeof authorityReceipt> | null, cancelled: null as ReturnType<typeof authorityCancellation> | null }
  const storage = memoryStorage(), getSession = vi.fn(async () => ({ data: { session: state.session }, error: null }))
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const rpc = String(url).split('/').at(-1), body = JSON.parse(String(options?.body))
    if (rpc === 'get_employee_authority_configuration') return new Response(JSON.stringify({ ...state.configuration, target_id: body.p_target_id }))
    if (rpc === 'get_employee_authority_command_result') return new Response(JSON.stringify(
      state.committed?.request_id === body.p_request_id ? state.committed
        : state.cancelled?.request_id === body.p_request_id ? state.cancelled : { state: 'not_found' }))
    if (rpc === 'cancel_employee_authority_command') {
      if (state.committed?.request_id === body.p_request_id) return new Response(JSON.stringify(state.committed))
      if (state.cancelled?.request_id === body.p_request_id) return new Response(JSON.stringify(state.cancelled))
      state.cancelled = authorityCancellation(body)
      if (state.loseCancellation) throw new Error('private cancellation transport diagnostic')
      return new Response(JSON.stringify(state.cancelled))
    }
    if (state.cancelled?.request_id === body.p_request_id) return new Response(JSON.stringify(state.cancelled))
    state.committed = authorityReceipt(body)
    if (state.loseWrite) throw new Error('private transport diagnostic')
    return new Response(JSON.stringify(state.committed))
  })
  return { state, storage, getSession, http, deps: { endpoint: 'https://owned.roomqc.invalid', publishableKey: 'public-fixture',
    storage: () => storage, getSession, fetch: http as typeof fetch, newId: () => requestId } }
}
