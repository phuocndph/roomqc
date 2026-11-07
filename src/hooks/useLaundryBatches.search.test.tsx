import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useLaundryBatches } from './useLaundryBatches'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }))
vi.mock('./useUser', () => ({
  useUser: () => ({ tenantId: 'tenant', user: { id: 'staff' } }),
}))
vi.mock('@/contexts/HotelContext', () => ({
  useHotelContext: () => ({
    selectedHotel: { id: 'hotel' },
    isAllHotelsMode: false,
  }),
}))

const wrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('laundry list search API', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: [], error: null })
  })
  it('sends the trimmed search with hotel scope, status and pagination', async () => {
    const { result } = renderHook(
      () => useLaundryBatches({ search: '  LG-010  ', status: 'ready' }, 2, 20),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(rpc).toHaveBeenCalledWith(
      'get_laundry_batches_filtered',
      expect.objectContaining({
        p_tenant_id: 'tenant',
        p_hotel_id: 'hotel',
        p_search: 'LG-010',
        p_status: 'ready',
        p_page: 2,
        p_page_size: 20,
      }),
    )
  })
  it('uses null for an empty search and exposes failures instead of returning success with zero rows', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection failed' },
    })
    const { result } = renderHook(() => useLaundryBatches({ search: '   ' }), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(rpc).toHaveBeenCalledWith(
      'get_laundry_batches_filtered',
      expect.objectContaining({ p_search: null }),
    )
  })
})
