import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfile } from './useProfile'

const state = vi.hoisted(() => ({
  response: { data: null, error: null } as {data: unknown; error: unknown},
  user: {id: 'owned-self'} as {id: string} | null,
  toast: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(),
}))
vi.mock('@/hooks/use-toast', () => ({useToast: () => ({toast: state.toast})}))
vi.mock('./useUser', () => ({useUser: () => ({user: state.user})}))
vi.mock('@/integrations/supabase/client', () => ({supabase: {
  from: () => ({update: state.update}), auth: {updateUser: vi.fn()},
}}))
function setup() {
  const client = new QueryClient({defaultOptions: {mutations: {retry: false}}})
  const wrapper = ({children}: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useProfile(), {wrapper})
}
describe('self-profile saved-row confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.user = {id: 'owned-self'}
    state.response = {data: {id: 'owned-self', full_name: 'Owned name', phone: '', avatar_url: ''}, error: null}
    const query = {select: state.select, single: state.single,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(state.response).then(resolve)}
    state.update.mockReturnValue({eq: state.eq}); state.eq.mockReturnValue(query)
    state.select.mockReturnValue(query); state.single.mockImplementation(async () => state.response)
  })
  it.each([null, [], {id: 'other-owned-self'}])('never reports success for an unconfirmed saved row %s', async data => {
    state.response = {data, error: null}; const {result} = setup()
    act(() => result.current.updateProfile({full_name: 'Owned name'}))
    await waitFor(() => expect(state.toast).toHaveBeenCalled())
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({variant: 'destructive'}))
    expect(state.toast.mock.calls.some(([value]) => value.title === 'Cập nhật thành công')).toBe(false)
  })
  it('requests the exact saved row and preserves empty fields for clearing', async () => {
    const {result} = setup()
    act(() => result.current.updateProfile({full_name: 'Owned name', phone: '', avatar_url: ''}))
    await waitFor(() => expect(state.toast).toHaveBeenCalled())
    expect(state.update).toHaveBeenCalledWith({full_name: 'Owned name', phone: '', avatar_url: ''})
    expect(state.eq).toHaveBeenCalledWith('id', 'owned-self')
    expect(state.select).toHaveBeenCalledWith('id,full_name,phone,avatar_url')
    expect(state.single).toHaveBeenCalledOnce()
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({title: 'Cập nhật thành công'}))
  })
  it('preserves a server refusal without success', async () => {
    state.response = {data: null, error: {message: 'permission denied'}}; const {result} = setup()
    act(() => result.current.updateProfile({full_name: 'Owned name'}))
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({variant: 'destructive'})))
  })
})
