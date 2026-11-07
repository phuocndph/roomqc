import { vi } from 'vitest'
import { createEmailAuthCoordinator } from '@/lib/email-auth-flow'

export const emailActor = '11111111-1111-4111-8111-111111111111'
export const emailOther = '22222222-2222-4222-8222-222222222222'
export const emailSession = '33333333-3333-4333-8333-333333333333'
export const emailOtherSession = '44444444-4444-4444-8444-444444444444'
export const emailOperation = '55555555-5555-4555-8555-555555555555'
export const emailTenant = '66666666-6666-4666-8666-666666666666'
export const emailHotel = '77777777-7777-4777-8777-777777777777'
export const emailInvitation = '88888888-8888-4888-8888-888888888888'
export const emailToken = (sub = emailActor, sid = emailSession, extra = {}) =>
  'e30.' + btoa(JSON.stringify({ sub, session_id: sid, ...extra })) + '.synthetic'
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
type OtpResult = Awaited<ReturnType<Parameters<typeof createEmailAuthCoordinator>[0]['verifyOtp']>>

export function emailAuthFixture() {
  const user = { id: emailActor, email: 'user@example.test' }
  const state = {
    session: null as { access_token: string; user: typeof user } | null,
    user, recovery: true, receipt: null as string | null, putMode: 'success',
    failAccept: false, failLogout: false, failClear: false, failStatus: false,
    tenantReply: emailTenant, wrongReceipt: false, wrongActor: false, sessionError: false,
    accepted: false, invitationRevoked: false, invitationExpired: false, failInvitationStatus: false,
    calls: [] as { url: string; options: RequestInit; body: Record<string, unknown> | null }[],
    puts: 0, accepts: 0, mines: 0, invitationReads: 0, logouts: 0, clears: 0,
    onPut: null as (() => void | Promise<void>) | null,
    onVerify: null as (() => void | Promise<void>) | null,
    onAccept: null as (() => void | Promise<void>) | null,
  }
  const http = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const target = String(url), body = options?.body ? JSON.parse(String(options.body)) : null
    state.calls.push({ url: target, options: options!, body })
    if (target.endsWith('/auth/v1/user')) {
      state.puts++; await state.onPut?.()
      if (state.putMode !== 'loss-before') state.receipt = body.roomqc_password_change_id
      if (state.putMode.startsWith('loss')) throw new Error('private transport detail')
      return response(200, { id: emailActor })
    }
    if (target.includes('/rpc/password_change_status')) {
      if (state.failStatus) return response(503, {})
      const match = body.p_change_id === state.receipt && state.receipt !== null
      return response(200, { actor_id: state.wrongActor ? emailOther : emailActor,
        session_id: state.wrongReceipt ? emailOtherSession : emailSession,
        is_recovery: state.recovery, must_change_password: false, change_id: match ? state.receipt : null,
        completed_at: match ? '2026-10-22T01:00:00Z' : null })
    }
    if (target.endsWith('/functions/v1/staff-invitations')) {
      const envelope = { version: 1, actor_id: emailActor, session_id: emailSession,
        invitation_id: emailInvitation, tenant_id: state.tenantReply, hotel_id: emailHotel }
      if (body.action === 'mine') {
        state.mines++
        return response(200, { ...envelope, invitation: { id: emailInvitation, tenantId: state.tenantReply,
          hotelId: emailHotel, name: 'Owned staff', passwordReady: !!state.receipt, expired: state.invitationExpired, revoked: state.invitationRevoked } })
      }
      if (body.action === 'status') {
        state.invitationReads++
        if (state.failInvitationStatus) return response(503, {})
        return response(200, { ...envelope, success: state.accepted, status: state.accepted ? 'accepted' : state.invitationRevoked ? 'revoked' : 'pending',
          idempotent: state.accepted, accepted_at: state.accepted ? '2026-10-22T01:01:00Z' : null, expired: state.invitationExpired })
      }
      state.accepts++; await state.onAccept?.()
      if (!state.failAccept) state.accepted = true
      return response(state.failAccept ? 503 : 200, state.failAccept ? { error: 'private SQL/PII' } : { ...envelope,
        success: true, status: 'accepted', idempotent: false, accepted_at: '2026-10-22T01:01:00Z' })
    }
    if (target.includes('/auth/v1/logout?scope=')) {
      state.logouts++
      return state.failLogout ? response(503, {}) : new Response(null, { status: 204 })
    }
    throw new Error('Unexpected owned fixture request')
  }) as typeof fetch
  const deps = {
    endpoint: 'https://owned.roomqc.invalid', publishableKey: 'public-fixture', tenantId: emailTenant,
    storage: localStorage, fetch: http, randomUUID: () => emailOperation,
    send: vi.fn(async () => {}),
    verifyOtp: vi.fn(async (): Promise<OtpResult> => {
      await state.onVerify?.()
      state.session = { access_token: emailToken(), user: { ...state.user } }
      return { data: { session: state.session, user: { ...state.user } }, error: null as unknown }
    }),
    getSession: vi.fn(async () => ({ data: { session: state.session }, error: state.sessionError ? new Error('private session detail') : null })),
    clearSession: vi.fn(async () => {
      state.clears++
      if (state.failClear) return { error: new Error('private cleanup detail') }
      state.session = null
      return { error: null }
    }),
  }
  return { state, deps, flow: createEmailAuthCoordinator(deps) }
}

