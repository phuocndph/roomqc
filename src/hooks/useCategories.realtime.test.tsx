import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { resetSharedSubscriptionsForTests } from '@/lib/realtime/sharedSubscription'
import { useCategories } from './useCategories'

// W1 open-browser matrix (2026-11-06): a department manager landing on the
// inventory items tab crashed with "cannot add postgres_changes callbacks for
// realtime:categories-realtime after subscribe()". supabase-js returns the
// existing channel for a repeated topic and rejects .on() once subscribed;
// this mock reproduces both behaviours.

const state = vi.hoisted(() => ({
  channels: new Map<string, { name: string; subscribed: boolean; on: (...args: unknown[]) => unknown; subscribe: () => unknown; filters: unknown[] }>(),
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
      const existing = state.channels.get(name)
      if (existing) return existing
      const channel = {
        name, subscribed: false, filters: [] as unknown[],
        on(_type: unknown, filter: unknown) {
          if (channel.subscribed) throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${name} after \`subscribe()\`.`)
          channel.filters.push(filter)
          return channel
        },
        subscribe() { channel.subscribed = true; return channel },
      }
      state.channels.set(name, channel)
      return channel
    },
    removeChannel: (channel: { name: string }) => { state.removeChannel(channel.name); state.channels.delete(channel.name) },
    rpc: vi.fn(),
  },
}))
vi.mock('./useUser', () => ({ useUser: () => ({ tenantId: 'tenant-a', hotelId: 'hotel-a' }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel-a' }, isAllHotelsMode: false }) }))
vi.mock('./use-toast', () => ({ toast: vi.fn() }))

beforeEach(() => {
  state.channels.clear()
  state.removeChannel.mockReset()
  state.invalidateQueries.mockReset()
})
afterEach(() => {
  cleanup()
  resetSharedSubscriptionsForTests()
})

describe('useCategories Realtime lifecycle', () => {
  it('lets several components mount the hook at the same time', () => {
    expect(() => {
      renderHook(() => useCategories())
      renderHook(() => useCategories())
      renderHook(() => useCategories())
    }).not.toThrow()
  })

  it('uses tenant-scoped channels filtered to the tenant', () => {
    renderHook(() => useCategories())
    expect([...state.channels.keys()].sort()).toEqual(['categories_item_categories_tenant-a', 'categories_items_tenant-a'])
    for (const channel of state.channels.values()) {
      expect(channel.filters).toEqual([expect.objectContaining({ filter: 'tenant_id=eq.tenant-a' })])
    }
  })

  it('removes the shared channels only after the last consumer unmounts', () => {
    const first = renderHook(() => useCategories())
    const second = renderHook(() => useCategories())
    first.unmount()
    expect(state.removeChannel).not.toHaveBeenCalled()
    second.unmount()
    expect(state.removeChannel.mock.calls.map(c => c[0]).sort()).toEqual(['categories_item_categories_tenant-a', 'categories_items_tenant-a'])
  })
})
