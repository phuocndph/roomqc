import {act, renderHook} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {PropsWithChildren} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {useDeleteHotel} from './useHotels'

const state = vi.hoisted(() => ({from: vi.fn(), logDelete: vi.fn(), success: vi.fn(), error: vi.fn()}))
vi.mock('@/integrations/supabase/client', () => ({supabase: {from: (...args: unknown[]) => state.from(...args)}}))
vi.mock('./useUser', () => ({useUser: vi.fn()}))
vi.mock('@/lib/activityLogger', () => ({logCreate: vi.fn(), logUpdate: vi.fn(), logDelete: (...args: unknown[]) => state.logDelete(...args)}))
vi.mock('sonner', () => ({toast: {success: (...args: unknown[]) => state.success(...args), error: (...args: unknown[]) => state.error(...args)}}))

const hotel = {id: 'owned-hotel', name: 'Owned fixture'}
function setup({count = 0, countError = null, data = hotel, deleteError = null}: {
  count?: number; countError?: unknown; data?: typeof hotel | null; deleteError?: unknown
} = {}) {
  const deletion = {eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({data, error: deleteError})}
  deletion.eq.mockReturnValue(deletion); deletion.select.mockReturnValue(deletion)
  const remove = vi.fn(() => deletion)
  state.from.mockImplementation((table: string) => table === 'users'
    ? {select: vi.fn(() => ({eq: vi.fn().mockResolvedValue({count, error: countError})}))}
    : {delete: remove})
  const client = new QueryClient({defaultOptions: {mutations: {retry: false}, queries: {gcTime: 0}}})
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({children}: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useDeleteHotel(), {wrapper})
  return {...hook, remove, deletion, invalidate}
}

describe('hotel deletion outcome', () => {
  beforeEach(() => {vi.clearAllMocks(); state.logDelete.mockResolvedValue(undefined)})

  it('only audits and reports success for the row returned by DELETE', async () => {
    const {result, deletion, invalidate} = setup()
    await act(async () => {expect(await result.current.mutateAsync(hotel.id)).toEqual(hotel)})
    expect(deletion.eq).toHaveBeenCalledWith('id', hotel.id)
    expect(deletion.select).toHaveBeenCalledWith('*')
    expect(state.logDelete).toHaveBeenCalledWith('hotel', hotel.id, hotel.name, hotel)
    expect(state.success).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({queryKey: ['hotels']})
    expect(invalidate).toHaveBeenCalledWith({queryKey: ['hotel']})
  })

  it('does not treat an RLS-filtered or missing row as a successful deletion', async () => {
    const {result, invalidate} = setup({data: null})
    await act(async () => {await expect(result.current.mutateAsync(hotel.id)).rejects.toThrow('không có quyền xóa')})
    expect(state.logDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled(); expect(state.error).toHaveBeenCalledOnce()
  })

  it.each(['23503', '42501', 'XX000'])('does not audit a refused or failed DELETE (%s)', async (code) => {
    const error = {code, message: 'Owned refusal'}
    const {result} = setup({data: null, deleteError: error})
    await act(async () => {await expect(result.current.mutateAsync(hotel.id)).rejects.toBeDefined()})
    expect(state.logDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled()
    expect(state.error).toHaveBeenCalledOnce()
    if (code !== 'XX000') expect(state.error.mock.calls[0][0]).not.toContain(code)
  })

  it.each([{count: 1}, {countError: {code: '42501', message: 'Owned count unavailable'}}])(
    'does not proceed when the assigned-user precheck is blocked or unavailable', async (input) => {
      const {result, remove} = setup(input)
      await act(async () => {await expect(result.current.mutateAsync(hotel.id)).rejects.toBeDefined()})
      expect(remove).not.toHaveBeenCalled(); expect(state.logDelete).not.toHaveBeenCalled()
      expect(state.success).not.toHaveBeenCalled()
    },
  )
})
