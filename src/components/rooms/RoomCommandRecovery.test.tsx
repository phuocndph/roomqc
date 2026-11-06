import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomCommandRecovery } from './RoomCommandRecovery'
import { RoomCommandError, type PendingRoomCommand } from '@/lib/room-transition-command'
import { emailActor as actor, emailOther as other, emailSession as sid, emailTenant as tenant,
  emailHotel as roomId, emailOperation as id, emailToken } from '@/test/email-auth-fixture'

const mocks = vi.hoisted(() => ({ auth: {} as { user: { id: string }; session: { access_token: string; user: { id: string } } },
  profile: {} as { id: string; tenant_id: string; status: string }, items: [] as PendingRoomCommand[],
  runtime: 'runtime-A', running: false, storageFails: false, recover: vi.fn(), cancel: vi.fn(), success: vi.fn(), info: vi.fn(), error: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: mocks.profile }) }))
vi.mock('@/lib/room-transition-client', () => ({ roomCommandPendingEvent: 'room-command-test',
  roomCommandRuntimeScope: () => mocks.runtime, isRoomCommandRunning: () => mocks.running,
  roomCommandClient: () => ({ pending: (context: { actorId: string; tenantId: string; runtime: string }) => {
    if (mocks.storageFails) throw new Error('private storage error')
    return mocks.items.filter(x => x.actorId === context.actorId && x.tenantId === context.tenantId && x.runtime === context.runtime)
  } }), recoverRoomTransition: (...args: unknown[]) => mocks.recover(...args), cancelRoomTransition: (...args: unknown[]) => mocks.cancel(...args) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ in: () => ({
  abortSignal: async () => ({ data: [{ id: roomId, room_number: '101' }], error: null }) }) }) }) } }))
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args),
  info: (...args: unknown[]) => mocks.info(...args), error: (...args: unknown[]) => mocks.error(...args) } }))
function identity(value = actor) {
  mocks.auth = { user: { id: value }, session: { access_token: emailToken(value, sid), user: { id: value } } }
  mocks.profile = { id: value, tenant_id: tenant, status: 'active' }
}
function pending(): PendingRoomCommand {
  return { version: 1, actorId: actor, tenantId: tenant, runtime: 'runtime-A', command: { _command_id: id, _room_id: roomId,
    _to_status: 'occupied_clean', _reason: null, _dnd_until: null, _oos_until: null, _force: false } }
}
function fixture() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }), invalidate = vi.spyOn(cache, 'invalidateQueries')
  const element = () => <QueryClientProvider client={cache}><RoomCommandRecovery /></QueryClientProvider>
  const view = render(element())
  return { ...view, refresh: () => view.rerender(element()), invalidate }
}
beforeEach(() => {
  vi.clearAllMocks(); identity(); mocks.items = []; mocks.runtime = 'runtime-A'; mocks.running = false; mocks.storageFails = false
})
afterEach(cleanup)
describe('visible room command recovery', () => {
  it('does not show a recurring prompt when no unresolved command exists', () => {
    fixture(); expect(screen.queryByRole('region', { name: 'Lệnh đổi trạng thái đang chờ' })).not.toBeInTheDocument()
  })
  it('shows room and intended status with both recovery actions', async () => {
    mocks.items = [pending()]; fixture()
    await screen.findByText(/Phòng 101/)
    expect(screen.getByRole('button', { name: 'Kiểm tra và tiếp tục' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Dừng lệnh chưa ghi' })).toBeEnabled()
  })
  it('recovers the exact room and invalidates room data only after a current response', async () => {
    mocks.items = [pending()]; mocks.recover.mockResolvedValue({ replayed: true }); const view = fixture()
    fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra và tiếp tục' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalled())
    expect(mocks.recover).toHaveBeenCalledWith(roomId, expect.objectContaining({ signal: expect.any(AbortSignal), isCurrent: expect.any(Function) })); expect(view.invalidate).toHaveBeenCalled()
  })
  it('reports a fenced cancellation without claiming the old change was undone', async () => {
    mocks.items = [pending()]; mocks.cancel.mockRejectedValue(new RoomCommandError('command_cancelled', 'Đã dừng lệnh chưa ghi.')); fixture()
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng lệnh chưa ghi' }))
    await waitFor(() => expect(mocks.info).toHaveBeenCalledWith('Đã dừng lệnh chưa ghi.'))
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('cancellation that discovers a committed result reports that existing success', async () => {
    mocks.items = [pending()]; mocks.cancel.mockResolvedValue({ replayed: true }); fixture()
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng lệnh chưa ghi' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('trước đó')))
    expect(mocks.info).not.toHaveBeenCalled()
  })
  it('hides another actor, tenant or runtime pending data', async () => {
    mocks.items = [pending()]; const view = fixture(); await screen.findByText(/Có lệnh đổi trạng thái/)
    identity(other); view.refresh(); expect(screen.queryByRole('button', { name: 'Kiểm tra và tiếp tục' })).not.toBeInTheDocument()
    identity(); mocks.profile.tenant_id = other; view.refresh(); expect(screen.queryByRole('button', { name: 'Kiểm tra và tiếp tục' })).not.toBeInTheDocument()
    identity(); mocks.runtime = 'runtime-B'; view.refresh(); expect(screen.queryByRole('button', { name: 'Kiểm tra và tiếp tục' })).not.toBeInTheDocument()
  })
  it('suppresses an old action response after actor switches away and back', async () => {
    let finish!: (value: unknown) => void
    mocks.items = [pending()]; mocks.recover.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const view = fixture(); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra và tiếp tục' }))
    identity(other); view.refresh(); identity(); view.refresh()
    const options = mocks.recover.mock.calls[0][1]
    expect(options.signal.aborted).toBe(true); expect(options.isCurrent()).toBe(false)
    await act(async () => { finish({ replayed: true }) })
    expect(mocks.success).not.toHaveBeenCalled(); expect(view.invalidate).not.toHaveBeenCalled()
  })
  it('suppresses action completion after unmount', async () => {
    let finish!: (value: unknown) => void
    mocks.items = [pending()]; mocks.recover.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const view = fixture(); fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra và tiếp tục' })); view.unmount()
    expect(mocks.recover.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => { finish({ replayed: true }) })
    expect(mocks.success).not.toHaveBeenCalled(); expect(view.invalidate).not.toHaveBeenCalled()
  })
  it('shows storage failure safely and never dispatches a replacement request', async () => {
    mocks.storageFails = true; fixture()
    expect(await screen.findByText('Không đọc được lệnh đổi trạng thái đang chờ')).toBeInTheDocument()
    expect(mocks.recover).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled()
    expect(screen.queryByText('private storage error')).not.toBeInTheDocument()
  })
  it('waits for the active request before presenting unresolved recovery actions', async () => {
    mocks.items = [pending()]; mocks.running = true; fixture()
    expect(screen.queryByRole('button', { name: 'Kiểm tra và tiếp tục' })).not.toBeInTheDocument()
    act(() => { mocks.running = false; window.dispatchEvent(new Event('room-command-test')) })
    expect(await screen.findByRole('button', { name: 'Kiểm tra và tiếp tục' })).toBeInTheDocument()
  })
})
