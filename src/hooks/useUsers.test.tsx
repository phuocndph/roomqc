import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUpdateUser } from './useUsers'

const state = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), logUpdate: vi.fn(), success: vi.fn(), error: vi.fn(),
  actor: { id: 'owned-actor', tenant_id: 'owned-tenant' } as {id: string; tenant_id: string} | null,
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (...args: unknown[]) => state.rpc(...args), from: (...args: unknown[]) => state.from(...args),
} }))
vi.mock('./useUser', () => ({ useUser: () => ({ user: state.actor }) }))
vi.mock('./useTenant', () => ({ useTenant: () => ({ tenant: null }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({}) }))
vi.mock('@/lib/activityLogger', () => ({ logUpdate: (...args: unknown[]) => state.logUpdate(...args), logDelete: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => state.success(...args), error: (...args: unknown[]) => state.error(...args) } }))

const input = {
  id: 'owned-staff', expectedUpdatedAt: '2026-10-21T00:00:00Z',
  data: { fullName: '  Owned staff  ', email: 'owned@roomqc.invalid', userLevelCode: 'staff' as const,
    hotelId: 'owned-hotel', positionId: 'owned-position', reportsTo: 'owned-manager' },
}
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { gcTime: 0 } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({children}: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { ...renderHook(() => useUpdateUser(), { wrapper }), invalidate }
}
describe('atomic employee metadata caller', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.actor = { id: 'owned-actor', tenant_id: 'owned-tenant' }
    state.rpc.mockResolvedValue({ data: { id: input.id, full_name: 'Owned staff' }, error: null })
  })
  it('uses one bounded RPC with the loaded version; never writes roles or client audit', async () => {
    const {result, invalidate} = setup()
    await act(async () => { await result.current.mutateAsync(input) })
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('edit_employee_profile', {
      p_target_id: input.id, p_changes: {full_name: 'Owned staff', hotel_id: 'owned-hotel',
        position_id: 'owned-position', reports_to: 'owned-manager'},
      p_expected_updated_at: input.expectedUpdatedAt, p_request_id: expect.any(String),
    })
    expect(state.from).not.toHaveBeenCalled(); expect(state.logUpdate).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({queryKey: ['users']})
    expect(invalidate).toHaveBeenCalledWith({queryKey: ['user-hotels']})
    expect(state.success).toHaveBeenCalledOnce()
  })
  it('reuses the request ID after an ambiguous failure, including lost response after commit', async () => {
    state.rpc.mockRejectedValueOnce(new Error('Network interrupted'))
    const {result} = setup()
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow() })
    const first = state.rpc.mock.calls[0][1].p_request_id
    await act(async () => { await result.current.mutateAsync(input) })
    expect(state.rpc.mock.calls[1][1].p_request_id).toBe(first)
    expect(state.success).toHaveBeenCalledOnce()
  })
  it('changes request identity for changed payload/version and clears it after success', async () => {
    const {result} = setup()
    await act(async () => { await result.current.mutateAsync(input) })
    const first = state.rpc.mock.calls[0][1].p_request_id
    await act(async () => { await result.current.mutateAsync({...input, expectedUpdatedAt: '2026-10-22T00:00:00Z'}) })
    expect(state.rpc.mock.calls[1][1].p_request_id).not.toBe(first)
  })
  it('does not reuse an ambiguous request for a different actor', async () => {
    state.rpc.mockRejectedValueOnce(new Error('Network interrupted'))
    const {result, rerender} = setup()
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow() })
    const first = state.rpc.mock.calls[0][1].p_request_id
    state.actor = {id: 'another-owned-actor', tenant_id: 'owned-tenant'}; rerender()
    await act(async () => { await result.current.mutateAsync(input) })
    expect(state.rpc.mock.calls[1][1].p_request_id).not.toBe(first)
  })
  it.each([null, [], {id: 'wrong-owned-id'}])('rejects an unverified result %s without success', async (data) => {
    state.rpc.mockResolvedValue({data, error: null}); const {result} = setup()
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Chưa xác minh') })
    expect(state.success).not.toHaveBeenCalled()
  })
  it.each(['EMPLOYEE_EDIT_STALE_VERSION', 'EMPLOYEE_EDIT_NOT_ALLOWED',
    'EMPLOYEE_EDIT_ACTIVE_SESSION_REQUIRED', 'EMPLOYEE_EDIT_INVALID_POSITION',
    'EMPLOYEE_EDIT_REQUEST_CONFLICT'])('preserves server refusal and shows a safe error (%s)', async (message) => {
    state.rpc.mockResolvedValue({data: null, error: {message}}); const {result} = setup()
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toEqual({message}) })
    expect(state.error).toHaveBeenCalledOnce(); expect(state.error.mock.calls[0][0]).not.toContain('EMPLOYEE_EDIT_')
    expect(state.success).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled()
  })
  it('requires a current actor before sending', async () => {
    state.actor = null; const {result} = setup()
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('đăng nhập lại') })
    expect(state.rpc).not.toHaveBeenCalled()
  })
})
