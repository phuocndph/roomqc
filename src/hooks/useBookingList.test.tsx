import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBookingList, useBookingList, type BookingListFilters } from './useBookingList'

const state = vi.hoisted(() => ({
  rows: [] as { id: string }[],
  requests: [] as { calls: [string, ...unknown[]][]; from: number; to: number }[],
  errorFrom: -1,
  pending: false,
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const request = { calls: [] as [string, ...unknown[]][], from: 0, to: 499 }
    state.requests.push(request)
    const query: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'order', 'or', 'gte', 'lte', 'range', 'abortSignal', 'returns']) {
      query[name] = (...args: unknown[]) => {
        request.calls.push([name, ...args])
        if (name === 'range') [request.from, request.to] = args as [number, number]
        return query
      }
    }
    query.then = (resolve: (value: unknown) => void) => state.pending ? new Promise(() => {}) : Promise.resolve(resolve({
      data: request.from === state.errorFrom ? null : state.rows.slice(request.from, request.to + 1),
      error: request.from === state.errorFrom ? new Error('offline') : null,
      count: state.rows.length,
    }))
    return query
  },
} }))
const filters: BookingListFilters = { tenantId: 'tenant-a', hotelId: 'hotel-a', allHotels: false, status: 'all', dateRange: '30d' }

describe('booking list reads', () => {
  beforeEach(() => {
    state.rows = Array.from({ length: 1201 }, (_, id) => ({ id: String(id) }))
    state.requests = []
    state.errorFrom = -1
    state.pending = false
  })
  it('loads beyond the old cap and scopes every page to tenant and hotel', async () => {
    const controller = new AbortController()
    expect(await fetchBookingList(filters, controller.signal)).toHaveLength(1201)
    expect(state.requests).toHaveLength(3)
    for (const { calls } of state.requests) {
      expect(calls).toContainEqual(['eq', 'tenant_id', 'tenant-a'])
      expect(calls).toContainEqual(['eq', 'hotel_id', 'hotel-a'])
      expect(calls).toContainEqual(['order', 'id', { ascending: true }])
      expect(calls).toContainEqual(['abortSignal', controller.signal])
      expect(calls.some(([name, expression]) => name === 'or' && String(expression).includes('status.eq.checked_in'))).toBe(true)
    }
  })
  it.each(['conflict', 'overdue', 'overdue_checkin', 'checked_in'])('keeps active %s records regardless of date window', async status => {
    await fetchBookingList({ ...filters, status })
    const calls = state.requests[0].calls
    expect(calls).toContainEqual(['eq', 'status', status === 'overdue_checkin' ? 'confirmed' : 'checked_in'])
    expect(calls.some(([name]) => ['gte', 'lte', 'or'].includes(name))).toBe(false)
  })
  it('all hotels mode retains tenant scope but omits hotel filter and date caps for all time', async () => {
    await fetchBookingList({ ...filters, allHotels: true, dateRange: 'all' })
    for (const { calls } of state.requests) {
      expect(calls).toContainEqual(['eq', 'tenant_id', 'tenant-a'])
      expect(calls.some(([name, column]) => name === 'eq' && column === 'hotel_id')).toBe(false)
      expect(calls.some(([name]) => ['gte', 'lte', 'or'].includes(name))).toBe(false)
    }
  })
  it('rejects missing context and later page errors instead of partial success', async () => {
    await expect(fetchBookingList({ ...filters, tenantId: undefined })).rejects.toThrow()
    await expect(fetchBookingList({ ...filters, hotelId: undefined })).rejects.toThrow()
    expect(state.requests).toHaveLength(0)
    state.errorFrom = 500
    await expect(fetchBookingList(filters)).rejects.toThrow('offline')
  })
  it('does not display a previous tenant list while the next tenant is loading', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, rerender, unmount } = renderHook(({ tenantId }) => useBookingList({ ...filters, tenantId }), { wrapper, initialProps: { tenantId: 'tenant-a' } })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    state.pending = true
    rerender({ tenantId: 'tenant-b' })
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
    unmount()
    client.clear()
  })
})
