import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubmitRoomCheckLean } from './useRoomCheckLean'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

const params = { roomId: 'room-a', checkType: 'daily' as const, startedAt: '2026-11-04T11:00:00Z' }
// Match submit_room_check_lean's real JSON response: no room_id field.
const saved = { check_id: 'check-new', summary_issue_count: 0, summary_ok_count: 1, summary_minibar_count: 0 }
const clients: QueryClient[] = []
function mount(queryFn: () => Promise<unknown>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clients.push(client)
  client.setQueryDefaults(['room', 'room-a'], { queryFn, staleTime: 30000 })
  client.setQueryData(['room', 'room-a'], { recent_checks: [{ id: 'check-old' }] })
  client.setQueryData(['room', 'room-b'], { recent_checks: [{ id: 'other-room' }] })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useSubmitRoomCheckLean(), { wrapper }) }
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.rpc.mockResolvedValue({ data: saved, error: null }) })
afterEach(() => { for (const client of clients.splice(0)) client.clear() })

describe('lean submit room overview cache', () => {
  it('waits for an inactive room cache to contain the new check before submit navigation can continue', async () => {
    let release!: (value: unknown) => void
    const refresh = vi.fn(() => new Promise(resolve => { release = resolve }))
    const { result, client } = mount(refresh)
    localStorage.setItem('room-check-room-a', 'draft')
    let settled = false
    let submitted!: Promise<unknown>
    act(() => { submitted = result.current.mutateAsync(params).then(data => { settled = true; return data }) })
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    await act(async () => { release({ recent_checks: [{ id: 'check-new' }] }); await submitted })
    expect(client.getQueryData(['room', 'room-a'])).toEqual({ recent_checks: [{ id: 'check-new' }] })
    expect(client.getQueryData(['room', 'room-b'])).toEqual({ recent_checks: [{ id: 'other-room' }] })
    expect(localStorage.getItem('room-check-room-a')).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('keeps a committed check successful when its follow-up refresh fails, without writing twice', async () => {
    const { result } = mount(async () => { throw new Error('temporary read failure') })
    await act(async () => { expect(await result.current.mutateAsync(params)).toEqual(saved) })
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('keeps draft and old cache when submission itself is rejected', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'room_not_found' } })
    const refresh = vi.fn(async () => ({ recent_checks: [] }))
    const { result, client } = mount(refresh)
    localStorage.setItem('room-check-room-a', 'draft')
    await act(async () => { await expect(result.current.mutateAsync(params)).rejects.toThrow() })
    expect(refresh).not.toHaveBeenCalled()
    expect(client.getQueryData(['room', 'room-a'])).toEqual({ recent_checks: [{ id: 'check-old' }] })
    expect(localStorage.getItem('room-check-room-a')).toBe('draft')
  })
})
