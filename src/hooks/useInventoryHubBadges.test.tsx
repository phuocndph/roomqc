import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInventoryHubBadges } from './useInventoryHubBadges'

const state = vi.hoisted(() => ({
  failAt: '', allHotels: false, hotelId: 'hotel-A',
  calls: [] as { source: string; method: string; args: unknown[] }[],
}))
vi.mock('./useTenant', () => ({ useTenant: () => ({ tenant: { id: 'tenant-A' } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: state.hotelId ? { id: state.hotelId } : null, isAllHotelsMode: state.allHotels }) }))
vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return { supabase: {
    channel: () => channel, removeChannel: vi.fn(),
    from: (source: string) => {
      const builder = {
        select: (...args: unknown[]) => { state.calls.push({ source, method: 'select', args }); return builder },
        eq: (...args: unknown[]) => { state.calls.push({ source, method: 'eq', args }); return builder },
        in: (...args: unknown[]) => { state.calls.push({ source, method: 'in', args }); return builder },
        lt: (...args: unknown[]) => { state.calls.push({ source, method: 'lt', args }); return builder },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 2, error: state.failAt === source ? new Error('Unavailable') : null }).then(resolve),
      }
      return builder
    },
    rpc: (source: string, args: unknown) => {
      state.calls.push({ source, method: 'rpc', args: [args] })
      return Promise.resolve({ data: { low_stock_count: 4 }, error: state.failAt === source ? new Error('Unavailable') : null })
    },
  } }
})

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  state.failAt = ''; state.allHotels = false; state.hotelId = 'hotel-A'; state.calls = []
})
afterEach(() => { cleanup(); client.clear() })
const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

describe('inventory work counts', () => {
  it('scopes all counts to the active tenant and hotel and includes in-progress outbound work', async () => {
    const { result } = renderHook(() => useInventoryHubBadges(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    for (const source of ['reorder_suggestions', 'distribution_orders', 'stock_adjustments']) {
      expect(state.calls).toContainEqual({ source, method: 'eq', args: ['tenant_id', 'tenant-A'] })
      expect(state.calls).toContainEqual({ source, method: 'eq', args: ['hotel_id', 'hotel-A'] })
    }
    expect(state.calls).toContainEqual({ source: 'distribution_orders', method: 'in', args: ['status', ['pending', 'in_progress', 'released']] })
    expect(result.current.data?.lowStock).toBe(4)
  })

  it.each(['reorder_suggestions', 'distribution_orders', 'stock_adjustments', 'get_inventory_dashboard_stats'])('propagates %s errors instead of returning successful zeros', async source => {
    state.failAt = source
    const { result } = renderHook(() => useInventoryHubBadges(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('does not fetch tenant-wide counts while no hotel is selected', () => {
    state.hotelId = ''
    const { result } = renderHook(() => useInventoryHubBadges(), { wrapper: Wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(state.calls).toHaveLength(0)
  })

  it('preserves explicit all-hotels mode without removing tenant isolation', async () => {
    state.allHotels = true
    const { result } = renderHook(() => useInventoryHubBadges(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(state.calls.some(call => call.method === 'eq' && call.args[0] === 'hotel_id')).toBe(false)
    expect(state.calls).toContainEqual({ source: 'reorder_suggestions', method: 'eq', args: ['tenant_id', 'tenant-A'] })
  })
})
