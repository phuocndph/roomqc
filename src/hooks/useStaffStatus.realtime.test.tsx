import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

// StaffManagementPage and its ShiftHistoryTab both mount useStaffStatus.
// The supabase mock reproduces realtime-js 2.x: a repeated topic returns the
// existing channel, and .on('postgres_changes') after subscribe() throws.

const state = vi.hoisted(() => ({
  channels: new Map<string, { joined: boolean }>(),
  removed: [] as string[],
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => ({ data: undefined, options }),
  useMutation: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (topic: string) => {
      let entry = state.channels.get(topic)
      if (!entry) { entry = { joined: false }; state.channels.set(topic, entry) }
      const current = entry
      const channel = {
        topic,
        on: () => {
          if (current.joined) throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${topic} after \`subscribe()\`.`)
          return channel
        },
        subscribe: () => { current.joined = true; return channel },
        unsubscribe: vi.fn(),
      }
      return channel
    },
    removeChannel: (channel: { topic: string }) => { state.removed.push(channel.topic); state.channels.delete(channel.topic); return Promise.resolve('ok') },
    from: () => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'update', 'upsert', 'insert', 'eq', 'in', 'gte', 'lte', 'order']) builder[method] = () => builder
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
      return builder
    },
  },
}))
vi.mock('./useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a', user: { id: 'u1' } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel-a' }, isAllHotelsMode: false }) }))

import { useStaffStatus } from './useStaffStatus'

beforeEach(() => { state.channels.clear(); state.removed.length = 0 })
afterEach(cleanup)

describe('useStaffStatus Realtime lifecycle', () => {
  it('lets the staff page and its shift tab subscribe at the same time', () => {
    expect(() => {
      renderHook(() => useStaffStatus())
      renderHook(() => useStaffStatus())
    }).not.toThrow()
    expect(state.channels.size).toBe(2)
  })

  it('removes each instance channel on unmount', () => {
    const a = renderHook(() => useStaffStatus())
    const b = renderHook(() => useStaffStatus())
    a.unmount(); b.unmount()
    expect(state.removed).toHaveLength(2)
    expect(state.channels.size).toBe(0)
  })
})
