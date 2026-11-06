import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useMyStaffInvitation } from './useMyStaffInvitation'

const invoke = vi.hoisted(()=>vi.fn())
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'staff-1'}})}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke}}}))
afterEach(cleanup)

it('stops exposing a cached invitation after the application profile becomes available', async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}})
  invoke.mockResolvedValue({data:{invitation:{id:'invite-1',passwordReady:true,expired:false}},error:null})
  const {result,rerender}=renderHook(({enabled})=>useMyStaffInvitation(enabled),{
    initialProps:{enabled:true},wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>,
  })
  await waitFor(()=>expect(result.current.data?.id).toBe('invite-1'))
  act(()=>rerender({enabled:false}))
  expect(result.current.data).toBeNull()
  expect(result.current.isError).toBe(false)
  client.clear()
})
