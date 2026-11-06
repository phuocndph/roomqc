import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentRoomCommandContext, recoverRoomTransition, cancelRoomTransition } from './room-transition-client'
import { emailActor as actor, emailOther as roomId, emailSession as sid, emailTenant as tenant, emailToken } from '@/test/email-auth-fixture'
const mocks = vi.hoisted(() => ({ session: vi.fn(), single: vi.fn(), recover: vi.fn(), cancel: vi.fn(), runtime: { supabaseUrl: 'http://localhost:6543', supabasePublishableKey: 'public-fixture' }, signal: null as AbortSignal | null }))
vi.mock('./runtime-config', () => ({ runtimeConfig: mocks.runtime }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: () => mocks.session() },
  from: () => ({ select: () => ({ eq: () => ({ abortSignal: (signal: AbortSignal) => { mocks.signal = signal; return { single: () => mocks.single() } } }) }) }) } }))
vi.mock('./room-transition-command', async importOriginal => ({ ...await importOriginal<typeof import('./room-transition-command')>(),
  createRoomTransitionClient: () => ({ recover: (...args: unknown[]) => mocks.recover(...args), cancel: (...args: unknown[]) => mocks.cancel(...args) }) }))
beforeEach(() => {
  vi.clearAllMocks(); mocks.runtime.supabaseUrl = 'http://localhost:6543'; mocks.signal = null
  mocks.session.mockResolvedValue({ data: { session: { access_token: emailToken(actor, sid), user: { id: actor } } }, error: null })
  mocks.single.mockResolvedValue({ data: { id: actor, tenant_id: tenant, status: 'active', account_locked: false, deleted_at: null }, error: null })
  mocks.recover.mockResolvedValue({ room_id: roomId }); mocks.cancel.mockResolvedValue({ room_id: roomId })
})
afterEach(() => vi.useRealTimers())
describe('room command adapter context and lifecycle fences', () => {
  it('passes cancellation and current-scope guards through recovery and cancellation', async () => {
    const options = { signal: new AbortController().signal, isCurrent: () => true }
    await recoverRoomTransition(roomId, options); await cancelRoomTransition(roomId, options)
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor, sessionId: sid, tenantId: tenant }), roomId, options)
    expect(mocks.cancel).toHaveBeenCalledWith(expect.objectContaining({ actorId: actor }), roomId, options)
  })
  it('bounds an Auth context read that never returns without dispatching a command', async () => {
    vi.useFakeTimers(); mocks.session.mockImplementation(() => new Promise(() => {}))
    const check = expect(recoverRoomTransition(roomId)).rejects.toMatchObject({ code: 'context_unavailable' })
    await vi.advanceTimersByTimeAsync(10001); await check
    expect(mocks.recover).not.toHaveBeenCalled()
  })
  it('aborts a hung profile read and hides raw database errors', async () => {
    vi.useFakeTimers(); mocks.single.mockImplementation(() => new Promise(() => {}))
    const check = expect(currentRoomCommandContext()).rejects.toMatchObject({ code: 'context_unavailable' })
    await vi.advanceTimersByTimeAsync(10001); await check; expect(mocks.signal?.aborted).toBe(true)
    mocks.single.mockRejectedValue(new Error('private DSN and SQL'))
    await expect(currentRoomCommandContext()).rejects.toThrow('Chưa kiểm tra được phiên')
  })
  it('does not dispatch if the panel scope changed while reading the profile', async () => {
    let resolve!: (value: unknown) => void, current = true
    mocks.single.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const check = expect(recoverRoomTransition(roomId, { isCurrent: () => current })).rejects.toMatchObject({ code: 'identity_changed' })
    await vi.waitFor(() => expect(mocks.single).toHaveBeenCalled())
    current = false; resolve({ data: { id: actor, tenant_id: tenant, status: 'active' }, error: null }); await check
    expect(mocks.recover).not.toHaveBeenCalled()
  })
  it('does not return a late command result when its scope guard has expired', async () => {
    let current = true; mocks.recover.mockImplementation(async () => { current = false; return { room_id: roomId } })
    await expect(recoverRoomTransition(roomId, { isCurrent: () => current })).rejects.toMatchObject({ code: 'identity_changed' })
  })
})
