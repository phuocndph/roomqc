import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuotaCheck } from './useQuotaCheck'
const state=vi.hoisted(()=>({refetch:vi.fn(),usage:{} as object|null,subscription:{} as object|null,toast:vi.fn()}))
vi.mock('./useTenantUsage',()=>({useCheckQuota:()=>({refetch:state.refetch,isLoading:false,data:undefined}),useTenantUsage:()=>({data:state.usage})}))
vi.mock('./useSubscription',()=>({useTenantSubscription:()=>({data:state.subscription})}))
vi.mock('sonner',()=>({toast:{error:state.toast}}))
beforeEach(()=>{state.refetch.mockReset();state.toast.mockReset();state.usage={};state.subscription={}})
describe('quota check fails closed',()=>{
  it('does not allow writes on query errors, even with stale allowed data',async()=>{
    state.refetch.mockResolvedValue({data:true,error:new Error('offline')})
    const {result}=renderHook(()=>useQuotaCheck('room'))
    expect(await result.current.checkQuota()).toBe(false)
    expect(state.toast).toHaveBeenCalledOnce()
  })
  it('requires loaded subscription and usage data',async()=>{
    state.refetch.mockResolvedValue({data:true});state.subscription=null
    const {result}=renderHook(()=>useQuotaCheck('room'))
    expect(await result.current.checkQuota()).toBe(false)
    expect(result.current.canAdd).toBe(false)
  })
  it('uses the fresh denial and opens the limit dialog',async()=>{
    state.refetch.mockResolvedValue({data:false})
    const {result}=renderHook(()=>useQuotaCheck('room'))
    await act(async()=>{expect(await result.current.checkQuota()).toBe(false)})
    expect(result.current.showDialog).toBe(true)
  })
  it('allows an explicitly successful fresh check',async()=>{
    state.refetch.mockResolvedValue({data:true})
    const {result}=renderHook(()=>useQuotaCheck('room'))
    expect(await result.current.checkQuota()).toBe(true)
  })
})
