import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMarkBookingNoShow } from './useMarkBookingNoShow'
const f = vi.hoisted(() => ({ execute: Object.assign(vi.fn(), { isCurrent: vi.fn() }), success: vi.fn(), error: vi.fn() }))
vi.mock('./useRoomOperationExecutor', () => ({ useRoomOperationExecutor: () => f.execute }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))
vi.mock('sonner', () => ({ toast: { success: f.success, error: f.error } }))
const input = { bookingId: '00000000-0000-4000-8000-000000000001', roomId: '00000000-0000-4000-8000-000000000002', reason: 'Khách không đến', refundDeposit: true }
const resolution = { id: '00000000-0000-4000-8000-000000000003', decision: 'refund_due', deposit_amount: 100000, amount_paid: 0,
  retained_amount: 0, refund_due_amount: 100000, cash_movement: 0, recorded_at: '2026-10-27T00:00:00Z' }
beforeEach(() => { vi.clearAllMocks(); f.execute.isCurrent.mockReturnValue(true); f.execute.mockResolvedValue({ data: { deposit_resolution: resolution } }) })
afterEach(() => vi.restoreAllMocks())
function setup() {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } }), invalidate = vi.spyOn(cache, 'invalidateQueries')
  return { ...renderHook(() => useMarkBookingNoShow('owned-view'), { wrapper: ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> }), invalidate }
}
describe('no-show hook uses verified recoverable commands', () => {
  it('submits the financial choice through the executor and reports a refund obligation once', async () => {
    const f0 = setup(); await act(async () => { await f0.result.current.mutateAsync(input) })
    expect(f.execute).toHaveBeenCalledWith('resolve_booking_no_show', { p_booking_id: input.bookingId, p_reason: input.reason, p_refund_deposit: true }, [input.roomId])
    expect(f.success).toHaveBeenCalledTimes(1); expect(f.success.mock.calls[0][1].description).toContain('Cần hoàn cọc')
    expect(f0.invalidate).toHaveBeenCalledWith({ queryKey: ['booking-no-show-resolution'] })
  })
  it('does not apply a receipt to another identity or view', async () => {
    f.execute.isCurrent.mockReturnValue(false)
    const f0 = setup(); await act(async () => { await f0.result.current.mutateAsync(input) })
    expect(f.success).not.toHaveBeenCalled(); expect(f0.invalidate).not.toHaveBeenCalled()
  })
  it('reports an uncertain outcome without success or raw backend errors', async () => {
    f.execute.mockRejectedValue(new Error('private backend data'))
    const f0 = setup(); await act(async () => { await expect(f0.result.current.mutateAsync(input)).rejects.toThrow() })
    expect(f.success).not.toHaveBeenCalled(); expect(f.error).toHaveBeenCalledTimes(1)
    expect(f.error.mock.calls[0][0]).not.toContain('private')
  })
})
