import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCheckoutToday, useCleaningProgressToday, useStaffPerformanceToday } from './useHousekeepingDashboardPanels'
import { useHousekeepingOpsSummary } from './useHousekeepingOpsSummary'

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], error: null as null | { message: string }, filters: [] as string[], equalities: [] as unknown[][] }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { tenant_id: 'tenant-A' } }) }))
vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  const builder = {
    select: () => builder,
    eq: (...args: unknown[]) => { state.equalities.push(args); return builder },
    in: () => builder,
    not: () => builder,
    order: () => builder,
    or: (filter: string) => { state.filters.push(filter); return builder },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: state.rows, error: state.error }).then(resolve),
  }
  return { supabase: { from: () => builder, channel: () => channel, removeChannel: vi.fn() } }
})
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  state.rows = []; state.error = null; state.filters = []; state.equalities = []
})
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers() })
const Wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>

describe('housekeeping daily panels', () => {
  it('never calls an occupied dirty room a completed checkout, handles legacy clean and missing joins', async () => {
    state.rows = [
      { id: 'active', status: 'checked_in', room: { id: 'r1', room_number: '101', status: 'occupied_dirty' } },
      { id: 'old', status: 'checked_out', room: { id: 'r2', room_number: '102', status: 'vacant' } },
      { id: 'repair', status: 'checked_out', room: { id: 'r3', room_number: '103', status: 'out_of_order' } },
      { id: 'deleted', status: 'checked_out', room: null },
    ]
    const { result } = renderHook(() => useCheckoutToday('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map(room => room.status)).toEqual(['occupied', 'cleaned', 'blocked'])
    expect(result.current.data?.map(room => room.roomId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('includes unfinished review and rework in cleaning totals instead of silently dropping them', async () => {
    state.rows = ['completed', 'approved', 'completed_pending_review', 'rejected_rework', 'in_progress', 'pending', 'cancelled'].map((status, id) => ({ id, status, room_id: 'room-' + id }))
    const { result } = renderHook(() => useCleaningProgressToday('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ total: 6, completed: 2, inProgress: 1, pending: 2, awaitingReview: 1, inProgressRoomIds: ['room-4'], awaitingReviewRoomIds: ['room-2'], reworkRoomIds: ['room-3'] })
    expect(state.filters[0]).toContain('rejected_rework,completed_pending_review')
    expect(state.filters[0]).toMatch(/created_at.gte.\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z/)
  })

  it('keeps review work in the staff denominator without treating it as approved', async () => {
    state.rows = [
      { status: 'approved', assigned_user: { id: 'staff-A', full_name: 'Mai', avatar_url: null } },
      { status: 'completed_pending_review', assigned_user: { id: 'staff-A', full_name: 'Mai', avatar_url: null } },
    ]
    const { result } = renderHook(() => useStaffPerformanceToday('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ userId: 'staff-A', fullName: 'Mai', avatarUrl: null, completed: 1, total: 2 }])
    expect(state.filters[0]).toContain('completed_pending_review')
  })

  it('reports failed queries as errors', async () => {
    state.error = { message: 'Network unavailable' }
    const { result } = renderHook(() => useCheckoutToday('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('uses the local hotel working day shortly after midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 17, 0, 30))
    const { result } = renderHook(() => useCheckoutToday('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(state.equalities).toContainEqual(['check_out_date', '2026-10-17'])
    expect(state.equalities).toContainEqual(['tenant_id', 'tenant-A'])
    expect(state.equalities).toContainEqual(['hotel_id', 'hotel-A'])
  })

  it('does not turn a failed related-operations count into a successful zero', async () => {
    state.error = { message: 'Permission denied' }
    const { result } = renderHook(() => useHousekeepingOpsSummary('hotel-A'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
