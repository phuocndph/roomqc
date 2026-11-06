import {act,cleanup,renderHook,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {runtimeConfig} from '@/lib/runtime-config'
import {ControlHttpError} from '@/lib/control-http-error'
const state=vi.hoisted(()=>({get:vi.fn(),load:vi.fn()}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:state.get}}}))
vi.mock('@/lib/workspace-setup-status',()=>({loadWorkspaceSetupStatus:state.load}))
import {useWorkspaceSetupStatus} from './useWorkspaceSetupStatus'

const id='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222'
const requestId='33333333-3333-4333-8333-333333333333'
const ready={workspaceId:id,routingVersion:1,step:'ready_to_setup',nextAction:'continue_setup',lastErrorCode:null,retryAfter:null,requestId}
function session(token='owner-token',user=owner){return {data:{session:{access_token:token,user:{id:user}}},error:null}}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
beforeEach(()=>{
  vi.clearAllMocks()
  runtimeConfig.workspace={version:1,workspace:{id,slug:'owned-hotel',displayName:'Owned',tenantId:null,status:'reserved',routingVersion:1},
    cluster:{id:'cluster-a',url:'https://owned.invalid',publishableKey:'public',vapidPublicKey:'vapid'}}
  state.get.mockReset().mockResolvedValue(session())
  state.load.mockReset().mockImplementation(async()=>({...ready,workspaceId:runtimeConfig.workspace!.workspace.id,routingVersion:runtimeConfig.workspace!.workspace.routingVersion}))
})
afterEach(()=>{cleanup();runtimeConfig.workspace=null;vi.useRealTimers()})
function setup(enabled=true,user:string|undefined=owner,token='owner-token'){
  return renderHook(({enabled,user,token})=>useWorkspaceSetupStatus(enabled,user,token),{initialProps:{enabled,user,token}})
}
describe('setup status lifecycle',()=>{
  it('does not read without a current registration identity',async()=>{
    const f=setup(false)
    await act(async()=>{})
    expect(f.result.current.data).toBeNull();expect(f.result.current.isLoading).toBe(false)
    expect(await f.result.current.refresh()).toBeNull()
    expect(state.get).not.toHaveBeenCalled();expect(state.load).not.toHaveBeenCalled()
  })
  it.each(['missing','other-owner','other-session'])('does not dispatch with %s session',async mode=>{
    state.get.mockResolvedValue(mode==='missing'?{data:{session:null},error:null}:mode==='other-owner'?session('owner-token',requestId):session('replaced-token'))
    const f=setup();await waitFor(()=>expect(f.result.current.error).toBeTruthy())
    expect(f.result.current.data).toBeNull();expect(state.load).not.toHaveBeenCalled()
  })
  it.each(['workspace','routing','cluster','origin','token','logout'])('aborts and discards a late native reply after %s changes',async mode=>{
    const pending=deferred<typeof ready>()
    state.load.mockImplementationOnce(()=>pending.promise)
    const f=setup();await waitFor(()=>expect(state.load).toHaveBeenCalledTimes(1))
    const signal=state.load.mock.calls[0][0].signal as AbortSignal
    let token='owner-token',user:string|undefined=owner
    if(mode==='workspace')runtimeConfig.workspace!.workspace.id=requestId
    if(mode==='routing')runtimeConfig.workspace!.workspace.routingVersion=2
    if(mode==='cluster')runtimeConfig.workspace!.cluster.id='cluster-b'
    if(mode==='origin')runtimeConfig.workspace!.cluster.url='https://new.invalid'
    if(mode==='token'){token='replaced-token';state.get.mockResolvedValue(session(token))}
    if(mode==='logout')user=undefined
    f.rerender({enabled:true,user,token})
    expect(signal.aborted).toBe(true);expect(f.result.current.data).toBeNull()
    await act(async()=>pending.resolve(ready))
    if(mode==='logout'){expect(f.result.current.data).toBeNull();expect(state.load).toHaveBeenCalledTimes(1)}
    else await waitFor(()=>expect(f.result.current.data).toMatchObject({workspaceId:runtimeConfig.workspace!.workspace.id,routingVersion:runtimeConfig.workspace!.workspace.routingVersion}))
  })
  it('rejects in-place runtime changes even before a React rerender',async()=>{
    const pending=deferred<typeof ready>();state.load.mockImplementationOnce(()=>pending.promise)
    const f=setup();await waitFor(()=>expect(state.load).toHaveBeenCalledOnce())
    runtimeConfig.workspace!.workspace.routingVersion=2
    await act(async()=>pending.resolve(ready))
    expect(f.result.current.data).toBeNull()
    expect(await f.result.current.refresh()).toBeNull()
    expect(state.load).toHaveBeenCalledOnce()
  })
  it('a retained old refresh cannot cancel a new workspace request',async()=>{
    const f=setup();await waitFor(()=>expect(f.result.current.data).toEqual(ready))
    const oldRefresh=f.result.current.refresh,pending=deferred<typeof ready>()
    state.load.mockImplementationOnce(()=>pending.promise)
    runtimeConfig.workspace!.workspace.id=requestId;f.rerender({enabled:true,user:owner,token:'owner-token'})
    await waitFor(()=>expect(state.load).toHaveBeenCalledTimes(2))
    const signal=state.load.mock.calls[1][0].signal as AbortSignal
    expect(await oldRefresh()).toBeNull();expect(signal.aborted).toBe(false)
    await act(async()=>pending.resolve({...ready,workspaceId:requestId}))
    expect(f.result.current.data?.workspaceId).toBe(requestId)
  })
  it('supersedes overlapping refreshes and never reinstates an older answer',async()=>{
    const first=deferred<typeof ready>();state.load.mockImplementationOnce(()=>first.promise)
    const f=setup();await waitFor(()=>expect(state.load).toHaveBeenCalledOnce())
    const signal=state.load.mock.calls[0][0].signal as AbortSignal
    await act(async()=>{await f.result.current.refresh()})
    expect(signal.aborted).toBe(true);expect(f.result.current.data).toEqual(ready)
    await act(async()=>first.resolve({...ready,step:'active',nextAction:'open_workspace'}))
    expect(f.result.current.data).toEqual(ready)
  })
  it('does not dispatch after logout during the local session read or publish after unmount',async()=>{
    const local=deferred<ReturnType<typeof session>>();state.get.mockReturnValueOnce(local.promise)
    const f=setup();await waitFor(()=>expect(state.get).toHaveBeenCalledOnce())
    f.rerender({enabled:true,user:undefined,token:'owner-token'})
    await act(async()=>local.resolve(session()));expect(state.load).not.toHaveBeenCalled()
    const remote=deferred<typeof ready>();state.load.mockReturnValueOnce(remote.promise)
    f.rerender({enabled:true,user:owner,token:'owner-token'})
    await waitFor(()=>expect(state.load).toHaveBeenCalledOnce())
    const signal=state.load.mock.calls[0][0].signal as AbortSignal
    f.unmount();expect(signal.aborted).toBe(true)
    await act(async()=>remote.resolve(ready))
  })
  it('shows only a safe error and support ID on denial',async()=>{
    state.load.mockRejectedValue(new ControlHttpError(403,{message:'private provider diagnostic',requestId,error:'OWNER_MISMATCH'}))
    const f=setup();await waitFor(()=>expect(f.result.current.error).toContain(requestId))
    expect(f.result.current.error).not.toContain('private provider')
    expect(f.result.current.data).toBeNull()
  })
  it('polls at the server interval without overlap and stops on a terminal result',async()=>{
    vi.useFakeTimers()
    state.load.mockResolvedValueOnce({...ready,step:'provisioning',nextAction:'wait',retryAfter:3})
    const f=setup()
    await act(async()=>{})
    expect(state.load).toHaveBeenCalledOnce()
    await act(async()=>vi.advanceTimersByTimeAsync(2999));expect(state.load).toHaveBeenCalledOnce()
    await act(async()=>vi.advanceTimersByTimeAsync(1));expect(state.load).toHaveBeenCalledTimes(2)
    expect(f.result.current.data).toEqual(ready)
    await act(async()=>vi.advanceTimersByTimeAsync(60000));expect(state.load).toHaveBeenCalledTimes(2)
  })
})
