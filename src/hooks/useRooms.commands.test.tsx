import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkRoomReady, useUpdateRoom } from './useRooms'

const state = vi.hoisted(() => ({ current: true, execute: Object.assign(vi.fn(), { isCurrent: () => state.current }), rpc: vi.fn(), from: vi.fn(), updates: [] as unknown[],
  reads: {} as Record<string, Array<{ data: unknown; error: unknown }>>, success: vi.fn(), warning: vi.fn(), error: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...args: unknown[]) => state.from(...args), rpc: (...args: unknown[]) => state.rpc(...args) } }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: { id: 'owner' }, tenantId: 'tenant' }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ availableHotels: [] }) }))
vi.mock('./useRoomCommandExecutor', () => ({ useRoomCommandExecutor: () => state.execute }))
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => state.success(...args),
  warning: (...args: unknown[]) => state.warning(...args), error: (...args: unknown[]) => state.error(...args) } }))
const room = { id: 'room', room_number: '101', hotel_id: 'hotel', status: 'vacant_dirty' }
function read(table: string, data: unknown, error: unknown = null) { (state.reads[table] ??= []).push({ data, error }) }
function hook<T>(useHook: () => T) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return renderHook(useHook, { wrapper: ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> })
}
beforeEach(() => {
  vi.clearAllMocks(); state.reads = {}; state.updates = []; state.current = true
  state.execute.mockResolvedValue({ room_id: 'room', to: 'vacant_clean', status_changed: true })
  state.rpc.mockResolvedValue({ error: null })
  state.from.mockImplementation((table: string) => {
    const next = () => Promise.resolve(state.reads[table]?.shift() ?? { data: null, error: null })
    const query = { select: () => query, eq: () => query, update: (data: unknown) => { state.updates.push(data); return query }, in: next, single: next }
    return query
  })
})
afterEach(cleanup)
describe('room source callers and separate task follow-ups', () => {
  it('metadata edits strip status without emitting a room command or fabricated workflow', async () => {
    read('rooms', room); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const h = hook(useUpdateRoom)
    await act(async () => { await h.result.current.mutateAsync({ id: room.id, data: { status: 'occupied_clean', notes: 'Metadata' }, previousStatus: 'vacant_clean' }) })
    expect(state.updates).toEqual([{ notes: 'Metadata' }]); expect(state.execute).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled()
    warning.mockRestore()
  })
  it('resumes from an already clean room and completes pending tasks through in_progress', async () => {
    read('rooms', { ...room, status: 'vacant_clean' }); read('rooms', { ...room, status: 'vacant_clean' })
    read('housekeeping_tasks', [{ id: 'pending', status: 'pending' }, { id: 'started', status: 'in_progress' }])
    const h = hook(useMarkRoomReady)
    await act(async () => { await h.result.current.mutateAsync({ roomId: room.id }) })
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ roomId: room.id, toStatus: 'vacant_clean' }))
    expect(state.rpc.mock.calls.map(([, args]) => [args._task_id, args._to_status])).toEqual([
      ['pending', 'in_progress'], ['pending', 'completed'], ['started', 'completed']])
    expect(state.rpc.mock.calls.every(([name, args]) => name === 'transition_task_status' && args._reason && !('_note' in args))).toBe(true)
    expect(state.success).toHaveBeenCalled(); expect(state.warning).not.toHaveBeenCalled()
  })
  it('does not complete a pending task whose start failed and reports partial task failures', async () => {
    read('rooms', room); read('rooms', { ...room, status: 'vacant_clean' })
    read('housekeeping_tasks', [{ id: 'pending', status: 'pending' }, { id: 'started', status: 'in_progress' }])
    state.rpc.mockResolvedValueOnce({ error: { message: 'internal private SQL' } }).mockResolvedValueOnce({ error: null })
    const h = hook(useMarkRoomReady); let result: Awaited<ReturnType<typeof h.result.current.mutateAsync>> | undefined
    await act(async () => { result = await h.result.current.mutateAsync({ roomId: room.id }) })
    expect(result?.taskFailures).toEqual(['pending']); expect(state.rpc.mock.calls.map(([, x]) => x._to_status)).toEqual(['in_progress', 'completed'])
    expect(state.warning).toHaveBeenCalledWith(expect.stringContaining('1 công việc')); expect(state.success).not.toHaveBeenCalled()
    expect(state.warning.mock.calls.flat().join()).not.toContain('internal private SQL')
  })
  it('reports task lookup failure separately after the room transition committed', async () => {
    read('rooms', room); read('rooms', { ...room, status: 'vacant_clean' }); read('housekeeping_tasks', null, { message: 'private task error' })
    const h = hook(useMarkRoomReady)
    await act(async () => { await h.result.current.mutateAsync({ roomId: room.id }) })
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.warning).toHaveBeenCalledWith(expect.stringContaining('chưa tải được công việc'))
    expect(state.error).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled()
  })
  it('does not turn a room refresh failure into a false transition failure', async () => {
    read('rooms', room); read('rooms', null, { message: 'private refresh error' }); const h = hook(useMarkRoomReady)
    await act(async () => { await h.result.current.mutateAsync({ roomId: room.id }) })
    expect(state.execute).toHaveBeenCalledOnce(); expect(state.from.mock.calls.map(([x]) => x)).toEqual(['rooms', 'rooms'])
    expect(state.warning).toHaveBeenCalledWith(expect.stringContaining('Đã xác nhận lệnh')); expect(state.error).not.toHaveBeenCalled()
  })
  it('does not complete tasks when replay discovers the room has changed again', async () => {
    read('rooms', room); read('rooms', { ...room, status: 'occupied_clean' }); const h = hook(useMarkRoomReady)
    await act(async () => { await h.result.current.mutateAsync({ roomId: room.id }) })
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.warning).toHaveBeenCalledWith(expect.stringContaining('hiện đã thay đổi'))
    expect(state.success).not.toHaveBeenCalled()
  })
  it('does not run task follow-ups when the room command is unconfirmed', async () => {
    read('rooms', room); state.execute.mockRejectedValue(new Error('Chưa xác nhận được kết quả.')); const h = hook(useMarkRoomReady)
    await act(async () => { await expect(h.result.current.mutateAsync({ roomId: room.id })).rejects.toThrow('Chưa xác nhận') })
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.from).toHaveBeenCalledOnce(); expect(state.success).not.toHaveBeenCalled()
  })
  it('does not continue tasks or show a stale result after scope changes during room refresh', async () => {
    read('rooms', room)
    const original = state.from.getMockImplementation()!
    state.from.mockImplementation((table: string) => {
      if (state.from.mock.calls.length === 2) return { select: () => ({ eq: () => ({ single: async () => {
        state.current = false; return { data: { ...room, status: 'vacant_clean' }, error: null }
      } }) }) }
      return original(table)
    })
    const h = hook(useMarkRoomReady)
    await act(async () => { await expect(h.result.current.mutateAsync({ roomId: room.id })).rejects.toMatchObject({ code: 'identity_changed' }) })
    expect(state.rpc).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(state.warning).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled()
  })
  it('does not send the next task transition after its scope changes', async () => {
    read('rooms', room); read('rooms', { ...room, status: 'vacant_clean' }); read('housekeeping_tasks', [{ id: 'pending', status: 'pending' }])
    state.rpc.mockImplementationOnce(async () => { state.current = false; return { error: null } })
    const h = hook(useMarkRoomReady)
    await act(async () => { await expect(h.result.current.mutateAsync({ roomId: room.id })).rejects.toMatchObject({ code: 'identity_changed' }) })
    expect(state.rpc).toHaveBeenCalledOnce(); expect(state.success).not.toHaveBeenCalled(); expect(state.warning).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled()
  })
})
