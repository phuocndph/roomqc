import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useRoomCommandExecutor } from './useRoomCommandExecutor'
import { emailActor as actor, emailOther as other, emailSession as sid, emailTenant as tenant, emailToken } from '@/test/email-auth-fixture'
const state = vi.hoisted(() => ({ actor: '', token: '', tenant: '', runtime: 'A', submit: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.actor }, session: { user: { id: state.actor }, access_token: state.token } }) }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: { tenant_id: state.tenant, status: 'active' } }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandRuntimeScope: () => state.runtime,
  submitRoomTransition: (...args: unknown[]) => state.submit(...args) }))
beforeEach(() => { vi.clearAllMocks(); state.actor = actor; state.token = emailToken(actor, sid); state.tenant = tenant; state.runtime = 'A' })
afterEach(cleanup)
const input = { roomId: other, toStatus: 'occupied_clean' }
it('binds execution to the current scope and aborts on unmount', async () => {
  state.submit.mockResolvedValue({ room_id: other }); const hook = renderHook(useRoomCommandExecutor)
  await act(async () => { await hook.result.current(input) })
  const options = state.submit.mock.calls[0][1]
  expect(options.isCurrent()).toBe(true); expect(options.signal.aborted).toBe(false)
  hook.unmount(); expect(options.isCurrent()).toBe(false); expect(options.signal.aborted).toBe(false)
  expect(hook.result.current.isCurrent()).toBe(false)
})
it('aborts an active operation after tenant or runtime changes and fences an ABA return', async () => {
  let finish!: (value: unknown) => void
  state.submit.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const hook = renderHook(useRoomCommandExecutor); let operation!: Promise<unknown>
  act(() => { operation = hook.result.current(input) })
  const options = state.submit.mock.calls[0][1]
  state.runtime = 'B'; hook.rerender(); state.runtime = 'A'; hook.rerender()
  expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false)
  await act(async () => { finish({}); await operation })
})
it('does not dispatch when the native session is incoherent', async () => {
  state.token = 'invalid'; const hook = renderHook(useRoomCommandExecutor)
  await expect(hook.result.current(input)).rejects.toMatchObject({ code: 'identity_changed' })
  expect(state.submit).not.toHaveBeenCalled()
})
