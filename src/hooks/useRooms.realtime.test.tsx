import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useRooms } from './useRooms'

const state = vi.hoisted(() => ({
  tenantId: 'tenant-a' as string | null,
  channelCalls: [] as string[],
  channels: [] as Array<{ name: string; on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }>,
  removeChannel: vi.fn(),
  invalidateQueries: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: state.invalidateQueries }),
}))

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (name: string) => {
      const channel = {
        name,
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      }
      state.channelCalls.push(name)
      state.channels.push(channel)
      return channel
    },
    removeChannel: state.removeChannel,
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

vi.mock('./useUser', () => ({
  useUser: () => ({ tenantId: state.tenantId }),
}))

vi.mock('@/contexts/HotelContext', () => ({
  useHotelContext: () => ({ selectedHotel: { id: 'hotel-a' }, isAllHotelsMode: false }),
}))

vi.mock('@/hooks/useNotificationTriggers', () => ({
  triggerRoomCheckoutNotification: vi.fn(),
  triggerRoomCheckinNotification: vi.fn(),
}))

vi.mock('@/lib/triggerWorkflow', () => ({
  triggerWorkflow: vi.fn(),
  WorkflowTriggerTypes: {},
}))

vi.mock('@/lib/userAccess', () => ({ isAdminUser: () => true }))

describe('useRooms Realtime lifecycle', () => {
  beforeEach(() => {
    state.tenantId = 'tenant-a'
    state.channelCalls.length = 0
    state.channels.length = 0
    state.removeChannel.mockReset()
    state.invalidateQueries.mockReset()
  })

  afterEach(() => cleanup())

  it('subscribes once for the tenant and removes the channel on unmount', () => {
    const view = renderHook(() => useRooms())

    expect(state.channelCalls).toEqual(['room_items_tenant-a'])
    expect(state.channels[0].on).toHaveBeenCalledOnce()
    expect(state.channels[0].subscribe).toHaveBeenCalledOnce()

    view.unmount()

    expect(state.removeChannel).toHaveBeenCalledOnce()
    expect(state.removeChannel).toHaveBeenCalledWith(state.channels[0])
  })

  it('cleans the previous tenant channel before subscribing to a changed tenant', () => {
    const view = renderHook(() => useRooms())
    state.tenantId = 'tenant-b'
    view.rerender()

    expect(state.channelCalls).toEqual(['room_items_tenant-a', 'room_items_tenant-b'])
    expect(state.removeChannel).toHaveBeenCalledWith(state.channels[0])

    view.unmount()

    expect(state.removeChannel).toHaveBeenCalledTimes(2)
    expect(state.removeChannel).toHaveBeenLastCalledWith(state.channels[1])
  })

  it('shares one subscribed channel between two consumers and cleans it after the last one unmounts', () => {
    const first = renderHook(() => useRooms())
    const second = renderHook(() => useRooms())

    expect(state.channelCalls).toEqual(['room_items_tenant-a'])
    expect(state.channels[0].on).toHaveBeenCalledOnce()
    expect(state.channels[0].subscribe).toHaveBeenCalledOnce()

    first.unmount()
    expect(state.removeChannel).not.toHaveBeenCalled()

    second.unmount()
    expect(state.removeChannel).toHaveBeenCalledOnce()
    expect(state.removeChannel).toHaveBeenCalledWith(state.channels[0])
  })
})
