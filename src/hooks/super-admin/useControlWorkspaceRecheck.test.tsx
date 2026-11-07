import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { controlActor, controlSession } from '@/test/control-admin-fixture'
import { controlRecheckRequest, controlRecheckReceipt } from '@/test/control-recheck-fixture'
import { emailOther, emailOtherSession, emailToken } from '@/test/email-auth-fixture'
import { ControlHttpError } from '@/lib/control-http-error'
const auth = vi.hoisted(() => ({ session: null as ReturnType<typeof controlSession> | null, user: null as { id: string } | null,
  profile: null as Record<string, unknown> | null, get: vi.fn(), request: vi.fn() }))
const runtime = vi.hoisted(() => ({ supabaseUrl: 'https://cluster-a.example.test', supabasePublishableKey: 'public-key-a', workspace: null }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: auth.session, user: auth.user, loading: false }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: auth.profile, isLoading: false }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: auth.get } } }))
vi.mock('@/lib/runtime-config', () => ({ runtimeConfig: runtime }))
vi.mock('@/lib/workspace', () => ({ controlRequest: auth.request }))
import { useControlWorkspaceRecheck } from './useControlWorkspaceRecheck'
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(crypto, 'randomUUID').mockReturnValue('cccccccc-cccc-4ccc-8ccc-cccccccccccc'); localStorage.clear(); auth.session = controlSession(); auth.user = { id: controlActor.actorId }
  auth.profile = { id: controlActor.actorId, status: 'active', user_level_code: 'super_admin', updated_at: 'v1' }
  runtime.supabaseUrl = 'https://cluster-a.example.test'; runtime.supabasePublishableKey = 'public-key-a'
  auth.get.mockImplementation(async () => ({ data: { session: auth.session }, error: null }))
  auth.request.mockResolvedValue(controlRecheckReceipt())
})
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
const setup = (callback = vi.fn()) => ({ callback, ...renderHook(({ version }) => useControlWorkspaceRecheck('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () => callback(version)), { initialProps: { version: 1 } }) })
async function ready(h: ReturnType<typeof setup>) { await waitFor(() => expect(h.result.current.enabled).toBe(true)) }
describe('workspace recheck mutation identity and durable recovery', () => {
  it('durably stores the original request before network and clears only a validated success', async () => {
    auth.request.mockImplementation(async () => {
      expect(localStorage.length).toBe(1)
      expect(JSON.stringify(localStorage)).not.toContain(controlSession().access_token)
      return controlRecheckReceipt()
    })
    const h = setup(); await ready(h)
    await act(() => h.result.current.execute(controlRecheckRequest()))
    expect(h.result.current.receipt?.commandId).toBe(controlRecheckReceipt().commandId)
    expect(h.result.current.pending).toEqual([]); expect(localStorage.length).toBe(0); expect(h.callback).toHaveBeenCalledTimes(1)
  })
  it('keeps a lost response across remount and session renewal, then uses GET with the same original key', async () => {
    auth.request.mockRejectedValueOnce(new Error('response lost after commit'))
    const first = setup(); await ready(first); await act(() => first.result.current.execute(controlRecheckRequest()))
    const entry = first.result.current.pending[0]; expect(entry).toBeDefined(); first.unmount()
    auth.session!.access_token = emailToken(controlActor.actorId, emailOtherSession)
    const resumed = setup(); await ready(resumed); expect(resumed.result.current.pending[0]).toEqual(entry)
    await act(() => resumed.result.current.lookup(entry))
    expect(auth.request).toHaveBeenLastCalledWith('/admin/workspaces/' + entry.request.target + '/recheck-result', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ 'Idempotency-Key': entry.request.key }),
    }))
    expect(auth.request.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1)
    expect(localStorage.length).toBe(0); expect(resumed.callback).toHaveBeenCalledTimes(1)
  })
  it('does not silently create another key after absent lookup; explicit retry rechecks and posts the same body/key', async () => {
    auth.request.mockRejectedValueOnce(new Error('network'))
    const h = setup(); await ready(h); await act(() => h.result.current.execute(controlRecheckRequest())); const entry = h.result.current.pending[0]
    const firstBody = auth.request.mock.calls[0][1].body
    await act(() => h.result.current.retry(entry)); expect(auth.request).toHaveBeenCalledTimes(1)
    auth.request.mockRejectedValueOnce(new ControlHttpError(404, { error: 'WORKSPACE_RECHECK_RESULT_UNKNOWN' }))
    await act(() => h.result.current.lookup(entry)); expect(h.result.current.absentKey).toBe(entry.request.key)
    auth.request.mockRejectedValueOnce(new ControlHttpError(404, { error: 'WORKSPACE_RECHECK_RESULT_UNKNOWN' })).mockResolvedValueOnce(controlRecheckReceipt())
    await act(() => h.result.current.retry(entry))
    expect(auth.request.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'GET', 'GET', 'POST'])
    expect(auth.request.mock.calls[3][1].body).toBe(firstBody)
    expect(auth.request.mock.calls.every(([, options]) => options.headers['Idempotency-Key'] === entry.request.key)).toBe(true)
  })
  it.each(['denied', 'malformed', 'conflict'])('retains journal for %s and never lets unknown be dismissed', async mode => {
    if (mode === 'denied') auth.request.mockRejectedValue(new ControlHttpError(403, { error: 'ADMIN_PERMISSION_REQUIRED', message: 'private SQL' }))
    if (mode === 'malformed') auth.request.mockResolvedValue({ success: true })
    if (mode === 'conflict') auth.request.mockRejectedValue(new ControlHttpError(409, { error: 'WORKSPACE_RECHECK_KEY_CONFLICT' }))
    const h = setup(); await ready(h); await act(() => h.result.current.execute(controlRecheckRequest()))
    expect(h.result.current.pending).toHaveLength(1); const entry = h.result.current.pending[0]
    await act(() => h.result.current.dismiss(entry)); expect(localStorage.length).toBe(1)
    expect(h.callback).not.toHaveBeenCalled(); expect(h.result.current.message).not.toContain('private SQL')
  })
  it('allows dismissal only after DB-serialized rejection; the next attempt requires refreshed workspace snapshot', async () => {
    auth.request.mockRejectedValueOnce(new ControlHttpError(409, { error: 'WORKSPACE_SNAPSHOT_CHANGED' }))
    const h = setup(); await ready(h); await act(() => h.result.current.execute(controlRecheckRequest()))
    const entry = h.result.current.pending[0]; expect(entry.state).toBe('not_applied')
    await act(() => h.result.current.dismiss(entry)); expect(localStorage.length).toBe(0); expect(h.callback).toHaveBeenCalledTimes(1)
    expect(auth.request).toHaveBeenCalledTimes(1)
  })
  it('prevents duplicate clicks from creating a second command and refreshes the current filter callback after completion', async () => {
    let release!: (value: unknown) => void
    auth.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const h = setup(); await ready(h); let first!: Promise<void>
    act(() => { first = h.result.current.execute(controlRecheckRequest()) }); await waitFor(() => expect(auth.request).toHaveBeenCalledTimes(1))
    await act(() => h.result.current.execute(controlRecheckRequest())); expect(localStorage.length).toBe(1)
    h.rerender({ version: 2 }); await act(async () => { release(controlRecheckReceipt()); await first })
    expect(h.callback).toHaveBeenCalledWith(2); expect(h.callback).toHaveBeenCalledTimes(1)
  })
  it.each(['user', 'session', 'runtime', 'profile'])('A→B→A cannot revive a captured callback or late result after %s changes', async mode => {
    let release!: (value: unknown) => void
    auth.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const h = setup(); await ready(h); const oldAction = h.result.current.execute; let inFlight!: Promise<void>
    act(() => { inFlight = oldAction(controlRecheckRequest()) }); await waitFor(() => expect(auth.request).toHaveBeenCalledTimes(1))
    const session = auth.session, user = auth.user, profile = auth.profile
    if (mode === 'user') { auth.user = { id: emailOther }; auth.session = { access_token: emailToken(emailOther), user: { id: emailOther } }; auth.profile = { ...auth.profile, id: emailOther } }
    if (mode === 'session') auth.session = { access_token: emailToken(controlActor.actorId, emailOtherSession), user: { id: controlActor.actorId } }
    if (mode === 'runtime') runtime.supabaseUrl = 'https://other-cluster.example.test'
    if (mode === 'profile') auth.profile = { ...auth.profile, account_locked: true }
    h.rerender({ version: 2 }); expect(h.result.current.receipt).toBeNull()
    auth.session = session; auth.user = user; auth.profile = profile; runtime.supabaseUrl = 'https://cluster-a.example.test'; h.rerender({ version: 3 })
    await ready(h); await act(async () => { release(controlRecheckReceipt()); await inFlight })
    expect(h.result.current.receipt).toBeNull(); expect(localStorage.length).toBe(1); expect(h.callback).not.toHaveBeenCalled()
    await act(() => oldAction(controlRecheckRequest())); expect(auth.request).toHaveBeenCalledTimes(1)
  })
  it('does not send when persistent storage cannot read back the new command', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    try {
      const h = setup(); await ready(h); await act(() => h.result.current.execute(controlRecheckRequest()))
      expect(auth.request).not.toHaveBeenCalled(); expect(h.result.current.message).toContain('Không thể lưu')
    } finally { set.mockRestore() }
  })
  it('does not revive a late command or old callback after target A→B→A navigation', async () => {
    let release!: (value: unknown) => void
    auth.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const callback = vi.fn(), h = renderHook(({ target }) => useControlWorkspaceRecheck(target, callback), { initialProps: { target: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } })
    await waitFor(() => expect(h.result.current.enabled).toBe(true))
    const old = h.result.current.execute; let pending!: Promise<void>
    act(() => { pending = old(controlRecheckRequest()) }); await waitFor(() => expect(auth.request).toHaveBeenCalledTimes(1))
    h.rerender({ target: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }); h.rerender({ target: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    await waitFor(() => expect(h.result.current.enabled).toBe(true))
    await act(async () => { release(controlRecheckReceipt()); await pending })
    expect(h.result.current.receipt).toBeNull(); expect(localStorage.length).toBe(1); expect(callback).not.toHaveBeenCalled()
    await act(() => old(controlRecheckRequest())); expect(auth.request).toHaveBeenCalledTimes(1)
  })
})
