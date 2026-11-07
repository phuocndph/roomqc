import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emailActor as actor, emailSession as session, emailOtherSession as other,
  emailTenant as tenant, emailHotel as hotel, emailInvitation as id, emailToken } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ session: null as { access_token: string; user: { id: string } } | null,
  authUser: null as { id: string } | null, user: null as Record<string, unknown> | null,
  hotelId: '', all: false, get: vi.fn(), request: vi.fn(), success: vi.fn(), error: vi.fn() }))
const config = vi.hoisted(() => ({ supabaseUrl: 'https://owned.roomqc.invalid', supabasePublishableKey: 'public-fixture',
  workspace: { cluster: { id: 'a' }, workspace: { id: 'w-a', tenantId: '', routingVersion: 1 } } }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.authUser, session: state.session }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.user }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: state.hotelId ? { id: state.hotelId } : null, isAllHotelsMode: state.all }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: state.get } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: config }))
vi.mock('@/lib/workspace', () => ({ workspacePath: (path: string) => path }))
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }))
import { useStaffInvitationAdmin } from './useStaffInvitationAdmin'
import { useCreateUser } from './useUsers'
vi.mock('./useTenant', () => ({ useTenant: () => ({ tenant: null }) }))
vi.mock('@/lib/activityLogger', () => ({ logDelete: vi.fn() }))

const at = '2026-10-22T01:02:03Z', draft = { email: 'owned@roomqc.invalid', fullName: 'Owned Staff', userLevelCode: 'staff' as const,
  hotelId: hotel, positionId: '77777777-7777-4777-8777-777777777777' }
function reply(options: RequestInit) {
  const claims = JSON.parse(atob((options.headers as Record<string, string>).Authorization.split('.')[1]))
  const body = JSON.parse(options.body as string)
  const envelope = { version: 1, actor_id: claims.sub, session_id: claims.session_id, tenant_id: body.tenantId }
  return new Response(JSON.stringify(body.action === 'list' ? { ...envelope, hotel_id: body.hotelId,
    page_size: 50, page_cursor: body.cursor, next_cursor: null,
    invitations: [{ id, hotel_id: body.hotelId ?? hotel, email: draft.email, full_name: draft.fullName,
      user_level_code: 'staff', expires_at: at, sent_at: at, created_at: at }] }
    : body.action === 'revoke' ? { ...envelope, success: true, invitation_id: id, hotel_id: hotel, status: 'revoked', idempotent: false }
      : { ...envelope, success: true, invitation_id: id, hotel_id: hotel, status: 'invited',
        invitation: { id, email: draft.email, full_name: draft.fullName } }))
}
beforeEach(() => {
  vi.clearAllMocks(); state.session = { access_token: emailToken(), user: { id: actor } }; state.authUser = { id: actor }
  state.user = { id: actor, tenant_id: tenant, user_level_code: 'tenant_owner', hotel_id: hotel, status: 'active' }
  state.hotelId = hotel; state.all = false; config.workspace.workspace.id = 'w-a'
  config.workspace.workspace.tenantId = tenant; config.workspace.workspace.routingVersion = 1; config.supabasePublishableKey = 'public-fixture'
  state.get.mockImplementation(async () => ({ data: { session: state.session }, error: null }))
  state.request.mockImplementation(async (_url: string, options: RequestInit) => reply(options)); vi.stubGlobal('fetch', state.request)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function setup(createOnly = false) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(cache, 'invalidateQueries')
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  return { cache, invalidate, ...renderHook(() => useStaffInvitationAdmin(!createOnly), { wrapper }) }
}
const ready = async (f: ReturnType<typeof setup>) => waitFor(() => expect(f.result.current.data).toHaveLength(1))
const countMutations = () => state.request.mock.calls.filter(x => JSON.parse(x[1].body).action !== 'list').length
function paginatedReplies() {
  state.request.mockImplementation(async (_url: string, options: RequestInit) => {
    const data = await reply(options).json(), body = JSON.parse(options.body as string)
    if (body.action !== 'list') return new Response(JSON.stringify(data))
    const rows = body.cursor === null ? Array.from({ length: 50 }, (_, i) => ({ ...data.invitations[0],
      id: '99999999-9999-4999-8999-' + (100 - i).toString(16).padStart(12, '0') }))
      : [{ ...data.invitations[0], created_at: '2026-10-21T00:00:00Z' }]
    const last = rows.at(-1)!
    return new Response(JSON.stringify({ ...data, invitations: rows,
      next_cursor: body.cursor === null ? { createdAt: last.created_at, id: last.id } : null }))
  })
}
describe('management UI captured context and bounded effects', () => {
  it('navigates cursor pages without accumulating PII or allowing old-page actions', async () => {
    paginatedReplies(); const f = setup()
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    const oldRow = f.result.current.data[0]
    act(() => { f.result.current.next(); f.result.current.next() })
    await waitFor(() => expect(f.result.current.page).toBe(2))
    await ready(f)
    expect(f.result.current.hasNext).toBe(false); expect(f.result.current.hasPrevious).toBe(true)
    await expect(f.result.current.act(oldRow, 'revoke')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(countMutations()).toBe(0)
    act(() => f.result.current.previous())
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    expect(f.result.current.page).toBe(1)
  })
  it('refreshes from page one and resets pagination on hotel context change', async () => {
    paginatedReplies(); const f = setup()
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    act(() => f.result.current.next()); await ready(f)
    await act(async () => { await f.result.current.refresh() })
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    expect(f.result.current.page).toBe(1)
    act(() => f.result.current.next()); await ready(f)
    state.hotelId = other; f.rerender()
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    expect(f.result.current.page).toBe(1); expect(f.result.current.data[0].hotel_id).toBe(other)
  })
  it('does not retain actionable rows when the next page fails and permits returning', async () => {
    paginatedReplies(); const f = setup()
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
    state.request.mockRejectedValueOnce(new Error('Owned page transport fault'))
    act(() => f.result.current.next())
    await waitFor(() => expect(f.result.current.isError).toBe(true))
    expect(f.result.current.data).toEqual([]); expect(f.result.current.hasPrevious).toBe(true)
    act(() => f.result.current.previous())
    await waitFor(() => expect(f.result.current.data).toHaveLength(50))
  })
  it('lists through the strict client with current hotel and exact native-session cache', async () => {
    const f = setup(); await ready(f)
    const key = f.cache.getQueryCache().getAll()[0].queryKey
    expect(key).toContain(actor); expect(key).toContain(session); expect(key).toContain(tenant); expect(key).toContain(hotel)
    expect(JSON.stringify(key)).not.toContain(emailToken())
  })
  it.each(['signed-out', 'profile-mismatch', 'tenant-mismatch', 'locked', 'inactive', 'staff'])('hides cached data and does not dispatch without current authority (%s)', async mode => {
    const f = setup(); await ready(f)
    if (mode === 'signed-out') { state.session = null; state.authUser = null }
    if (mode === 'profile-mismatch') state.user!.id = other
    if (mode === 'tenant-mismatch') config.workspace.workspace.tenantId = other
    if (mode === 'locked') state.user!.account_locked = true
    if (mode === 'inactive') state.user!.status = 'inactive'
    if (mode === 'staff') state.user!.user_level_code = 'staff'
    f.rerender()
    expect(f.result.current.data).toEqual([]); expect(f.result.current.canManage).toBe(false)
    await expect(f.result.current.create(draft)).rejects.toMatchObject({ code: 'identity_changed' })
    expect(countMutations()).toBe(0)
  })
  it.each(['session', 'hotel', 'workspace', 'routing', 'level'])('starts a new list/cache when %s changes', async mode => {
    const f = setup(); await ready(f); const old = f.result.current.scope
    if (mode === 'session') state.session = { access_token: emailToken(actor, other), user: { id: actor } }
    if (mode === 'hotel') state.hotelId = other
    if (mode === 'workspace') config.workspace.workspace.id = 'w-b'
    if (mode === 'routing') config.workspace.workspace.routingVersion++
    if (mode === 'level') state.user!.user_level_code = 'manager'
    f.rerender(); await ready(f)
    expect(f.result.current.scope).not.toBe(old); expect(state.request).toHaveBeenCalledTimes(2)
  })
  it('aborts the old list and never publishes its late data under the new hotel', async () => {
    let release!: () => void
    state.request.mockImplementationOnce(async (_url: string, options: RequestInit) => {
      await new Promise<void>(r => { release = r }); return reply(options)
    })
    const f = setup(); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1))
    const signal = state.request.mock.calls[0][1].signal as AbortSignal
    state.hotelId = other; f.rerender(); await ready(f)
    expect(signal.aborted).toBe(true)
    await act(async () => release())
    expect(f.result.current.data[0].hotel_id).toBe(other)
  })
  it('has a synchronous single-flight guard for double click before React disables buttons', async () => {
    const f = setup(); await ready(f)
    let release!: () => void
    state.request.mockImplementationOnce(async (_url: string, options: RequestInit) => {
      await new Promise<void>(r => { release = r }); return reply(options)
    })
    let first!: Promise<unknown>
    act(() => { first = f.result.current.act(f.result.current.data[0], 'resend') })
    await expect(f.result.current.act(f.result.current.data[0], 'revoke')).rejects.toMatchObject({ code: 'flow_busy' })
    await waitFor(() => expect(countMutations()).toBe(1))
    await act(async () => { release(); await first })
    expect(countMutations()).toBe(1); expect(state.success).toHaveBeenCalledOnce()
  })
  it.each(['session', 'hotel', 'workspace', 'logout', 'away-and-back'])('suppresses stale mutation success/error/invalidation after %s', async mode => {
    const f = setup(); await ready(f); let release!: () => void
    state.request.mockImplementationOnce(async (_url: string, options: RequestInit) => {
      await new Promise<void>(r => { release = r }); return reply(options)
    })
    let outcome!: Promise<unknown>
    act(() => { outcome = f.result.current.act(f.result.current.data[0], 'resend').catch(x => x) })
    await waitFor(() => expect(countMutations()).toBe(1))
    if (mode === 'session') state.session = { access_token: emailToken(actor, other), user: { id: actor } }
    if (mode === 'hotel' || mode === 'away-and-back') state.hotelId = other
    if (mode === 'workspace') config.workspace.workspace.id = 'w-b'
    if (mode === 'logout') { state.session = null; state.authUser = null }
    f.rerender()
    if (mode === 'away-and-back') { state.hotelId = hotel; f.rerender() }
    await act(async () => { release(); expect(await outcome).toMatchObject({ code: 'identity_changed' }) })
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled()
  })
  it('keeps transport uncertainty visible, reads back only and never blindly resends', async () => {
    const f = setup(); await ready(f)
    state.request.mockRejectedValueOnce(new TypeError('private transport details'))
    await act(async () => { await expect(f.result.current.act(f.result.current.data[0], 'resend')).rejects.toMatchObject({ code: 'outcome_unknown' }) })
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(3))
    expect(countMutations()).toBe(1); expect(state.success).not.toHaveBeenCalled()
    expect(f.result.current.notice).toContain('Chưa xác nhận'); expect(state.error.mock.calls[0][0]).not.toContain('private')
  })
  it('rejects rows not in the current verified list', async () => {
    const f = setup(); await ready(f)
    await expect(f.result.current.act({ ...f.result.current.data[0], id: other }, 'revoke')).rejects.toMatchObject({ code: 'identity_changed' })
    expect(countMutations()).toBe(0)
  })
  it('aborts on unmount with no toast or invalidation', async () => {
    const f = setup(); await ready(f)
    state.request.mockImplementationOnce(() => new Promise(() => {}))
    let outcome!: Promise<unknown>
    act(() => { outcome = f.result.current.act(f.result.current.data[0], 'revoke').catch(x => x) })
    await waitFor(() => expect(countMutations()).toBe(1)); f.unmount()
    expect(await outcome).toMatchObject({ code: 'identity_changed' })
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled()
  })
  it('invalidates only the captured actor/session/tenant invitation scope on success', async () => {
    const f = setup(); await ready(f)
    f.cache.setQueryData(['staff-invitations', 'other-runtime', other, other, other], [])
    await act(async () => { await f.result.current.act(f.result.current.data[0], 'revoke') })
    const predicate = f.invalidate.mock.calls[0][0]!.predicate!
    const queries = f.cache.getQueryCache().getAll()
    expect(predicate(queries.find(q => q.queryKey[2] === actor)!)).toBe(true)
    expect(predicate(queries.find(q => q.queryKey[1] === 'other-runtime')!)).toBe(false)
    expect(state.success).toHaveBeenCalledExactlyOnceWith('Đã thu hồi lời mời')
  })
  it('create-only hook uses strict alias without listing employees or invalidating unrelated user caches', async () => {
    const cache = new QueryClient(), invalidate = vi.spyOn(cache, 'invalidateQueries')
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const f = renderHook(() => useCreateUser(), { wrapper })
    expect(state.request).not.toHaveBeenCalled()
    await act(async () => { await f.result.current.mutateAsync(draft) })
    expect(state.request.mock.calls[0][0]).toContain('/create-user'); expect(countMutations()).toBe(1)
    expect(invalidate.mock.calls.every(x => !!x[0]?.predicate)).toBe(true)
    expect(state.success).toHaveBeenCalledOnce()
  })
  it('does not expose a completed create receipt in another native-session mutation observer', async () => {
    const cache = new QueryClient()
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const f = renderHook(() => useCreateUser(), { wrapper })
    await act(async () => { await f.result.current.mutateAsync(draft) })
    await waitFor(() => expect(f.result.current.data).toMatchObject({ id }))
    state.session = { access_token: emailToken(actor, other), user: { id: actor } }; f.rerender()
    await waitFor(() => expect(f.result.current.data).toBeUndefined())
    expect(countMutations()).toBe(1)
  })
})
