import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBulkUpdateRoomStatus } from './useBulkRoomActions'
const mocks = vi.hoisted(() => ({ current: true, execute: Object.assign(vi.fn(), { isCurrent: () => mocks.current }), notify: vi.fn(), toast: vi.fn(), read: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ in: (...args: unknown[]) => mocks.read(...args) }) }) } }))
vi.mock('./useRoomCommandExecutor', () => ({ useRoomCommandExecutor: () => mocks.execute }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant' }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: (...args: unknown[]) => mocks.toast(...args) }))
vi.mock('@/hooks/useNotificationTriggers', () => ({ triggerRoomCheckoutNotification: (...args: unknown[]) => mocks.notify(...args) }))
function hook() {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderHook(useBulkUpdateRoomStatus, { wrapper: ({ children }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider> })
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.current = true; mocks.notify.mockResolvedValue(undefined)
  mocks.read.mockResolvedValue({ data: ['changed', 'failed', 'noop', 'replayed', 'other'].map(id => ({ id, room_number: id, hotel_id: 'hotel' })), error: null })
  mocks.execute.mockImplementation(async ({ roomId }: { roomId: string }) => {
    if (roomId === 'failed') throw new Error('Chưa xác nhận được kết quả.')
    return { hotel_id: roomId === 'other' ? 'different-hotel' : 'hotel', status_changed: roomId !== 'noop', replayed: roomId === 'replayed' }
  })
})
afterEach(cleanup)
describe('bulk room commands report confirmed effects', () => {
  it('counts partial results and notifies only an actual matching new transition', async () => {
    const h = hook(); let result: Awaited<ReturnType<typeof h.result.current.mutateAsync>> | undefined
    await act(async () => { result = await h.result.current.mutateAsync({ roomIds: ['changed', 'failed', 'noop', 'replayed', 'other'], status: 'check_out' }) })
    expect(result).toMatchObject({ count: 4, failedCount: 1, status: 'vacant_dirty' })
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ tenantId: 'tenant', hotelId: 'hotel', roomId: 'changed', roomNumber: 'changed' })
    expect(mocks.execute.mock.calls.every(([x]) => x.toStatus === 'vacant_dirty')).toBe(true)
    expect(mocks.toast.mock.calls[0][0].description).toContain('4 phòng')
    expect(mocks.toast.mock.calls[0][0].variant).toBe('destructive')
  })
  it('does not claim success when all room commands remain unconfirmed', async () => {
    const h = hook(); await act(async () => { await expect(h.result.current.mutateAsync({ roomIds: ['failed'], status: 'vacant_dirty' })).rejects.toThrow() })
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.toast.mock.calls[0][0].title).toBe('Lỗi cập nhật')
  })
  it('does not count a duplicate selected room twice', async () => {
    const h = hook(); await act(async () => { const r = await h.result.current.mutateAsync({ roomIds: ['changed', 'changed'], status: 'vacant_dirty' }); expect(r.count).toBe(1) })
    expect(mocks.execute).toHaveBeenCalledOnce(); expect(mocks.notify).toHaveBeenCalledOnce()
  })
  it('rejects an empty selection before making any request', async () => {
    const h = hook(); await act(async () => { await expect(h.result.current.mutateAsync({ roomIds: [], status: 'vacant_dirty' })).rejects.toThrow('chọn ít nhất') })
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled()
  })
  it('keeps confirmed room results when notification metadata cannot be read', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: 'private SQL' } }); const h = hook()
    await act(async () => { const r = await h.result.current.mutateAsync({ roomIds: ['changed'], status: 'vacant_dirty' }); expect(r.count).toBe(1) })
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.toast.mock.calls[0][0].description).toContain('Chưa tải được thông tin')
    expect(mocks.toast.mock.calls[0][0].description).not.toContain('private SQL')
  })
  it('stops the batch and suppresses notifications after the captured scope changes', async () => {
    mocks.execute.mockImplementationOnce(async () => { mocks.current = false; return { hotel_id: 'hotel', status_changed: true, replayed: false } })
    const h = hook()
    await act(async () => { await expect(h.result.current.mutateAsync({ roomIds: ['changed', 'noop'], status: 'vacant_dirty' })).rejects.toMatchObject({ code: 'identity_changed' }) })
    expect(mocks.execute).toHaveBeenCalledOnce(); expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled()
  })
})
