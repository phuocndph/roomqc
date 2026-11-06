import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// W1 (2026-11-06): a manager's "Tiếp quản" deleted 0 rows under RLS and the
// following insert conflicted (409). Takeover must go through the atomic RPC.

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: state.rpc,
    from: state.from,
    auth: { getUser: async () => ({ data: { user: { id: 'manager-1' } } }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel: vi.fn(),
  },
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a', user: { id: 'manager-1' } }) }))
vi.mock('@/lib/realtime/sharedSubscription', () => ({ subscribeSharedPostgresChanges: () => () => undefined }))

import { useRoomCheckSession } from './useRoomCheckSession'

beforeEach(() => {
  state.rpc.mockReset()
  state.toast.mockReset()
  state.from.mockReset()
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'delete', 'insert', 'update']) builder[m] = () => builder
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.single = async () => ({ data: null, error: null })
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  state.from.mockReturnValue(builder)
})
afterEach(cleanup)

describe('useRoomCheckSession.takeOverSession', () => {
  it('replaces the session through the atomic RPC instead of delete + insert', async () => {
    state.rpc.mockResolvedValue({ data: { id: 's2', user_id: 'manager-1', check_type: 'daily' }, error: null })
    const { result } = renderHook(() => useRoomCheckSession('room-1'))
    state.from.mockClear()

    let session: unknown
    await act(async () => { session = await result.current.takeOverSession('room-1', 'daily', 'Quản lý A', 'tenant-a') })

    expect(state.rpc).toHaveBeenCalledWith('take_over_room_check_session', { p_room_id: 'room-1', p_check_type: 'daily', p_user_name: 'Quản lý A' })
    expect(state.from).not.toHaveBeenCalledWith('room_check_sessions')
    expect(session).toEqual(expect.objectContaining({ user_id: 'manager-1' }))
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Đã tiếp quản' }))
  })

  it('reports a refused takeover and returns null', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'ROOM_CHECK_TAKEOVER_NOT_ALLOWED' } })
    const { result } = renderHook(() => useRoomCheckSession('room-1'))

    let session: unknown = 'unset'
    await act(async () => { session = await result.current.takeOverSession('room-1', 'daily', 'Nhân viên', 'tenant-a') })

    expect(session).toBeNull()
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lỗi', variant: 'destructive' }))
  })
})
