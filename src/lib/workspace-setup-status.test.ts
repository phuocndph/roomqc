import {beforeEach,describe,expect,it,vi} from 'vitest'
const request=vi.hoisted(()=>vi.fn())
vi.mock('./workspace',()=>({controlRequest:request}))
import {loadWorkspaceSetupStatus,validateWorkspaceSetupStatus} from './workspace-setup-status'

const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222'
const ready={workspaceId:id,routingVersion:1,step:'ready_to_setup',nextAction:'continue_setup',lastErrorCode:null,retryAfter:null,requestId}
beforeEach(()=>request.mockReset())
describe('private setup status boundary',()=>{
  it('retains only the DTO and rejects a result for another mapping or malformed action',()=>{
    expect(validateWorkspaceSetupStatus({...ready,providerSecret:'hidden'},id,1)).toEqual(ready)
    for(const patch of [{workspaceId:requestId},{routingVersion:2},{routingVersion:0},{step:'constructor'},
      {step:'active'},{nextAction:'open_workspace'},{requestId:'untrusted support text'},
      {lastErrorCode:'private provider message'},{retryAfter:3}]){
      expect(()=>validateWorkspaceSetupStatus({...ready,...patch},id,1)).toThrow('chưa được xác nhận')
    }
    expect(()=>validateWorkspaceSetupStatus({...ready,routingVersion:0},id,0)).toThrow()
    for(const raw of [null,undefined,{},[],false])expect(()=>validateWorkspaceSetupStatus(raw,id,1)).toThrow()
  })
  it('accepts bounded wait instructions and rejects missing, fractional or excessive polling',()=>{
    for(const retryAfter of [1,3,60])expect(validateWorkspaceSetupStatus({...ready,step:'provisioning',nextAction:'wait',retryAfter},id,1).retryAfter).toBe(retryAfter)
    for(const retryAfter of [null,0,61,1.5,'3'])expect(()=>validateWorkspaceSetupStatus({...ready,step:'retry',nextAction:'wait',retryAfter},id,1)).toThrow()
  })
  it('uses a bearer GET on the scoped route with caller cancellation',async()=>{
    request.mockResolvedValue(ready)
    const controller=new AbortController()
    expect(await loadWorkspaceSetupStatus({slug:'owned-hotel',workspaceId:id,routingVersion:1,token:'owner-token',signal:controller.signal})).toEqual(ready)
    expect(request).toHaveBeenCalledExactlyOnceWith('/workspaces/owned-hotel/setup-status',{
      method:'GET',headers:{Authorization:'Bearer owner-token'},signal:controller.signal})
  })
  it('does not dispatch invalid routes or a missing token',async()=>{
    for(const slug of ['../other','owned-hotel?owner=other','a--b','a-','ABCD','ab']){
      await expect(loadWorkspaceSetupStatus({slug,workspaceId:id,routingVersion:1,token:'owner-token',signal:new AbortController().signal})).rejects.toThrow()
    }
    await expect(loadWorkspaceSetupStatus({slug:'owned-hotel',workspaceId:id,routingVersion:1,token:'',signal:new AbortController().signal})).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})
