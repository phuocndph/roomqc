import { describe, expect, it, vi } from 'vitest';
import { createAtomicSubscriptionJobHandler, parseExecutionScope } from '../../supabase/functions/_shared/subscription-atomic-worker';

const run='00000000-0000-4000-8000-000000000001', request='00000000-0000-4000-8000-000000000002';
const scope={kind:'cluster' as const};
const summary={subscription_status:'success',staff_status:'success',to_grace_period:0,to_suspended:0,
  notifications_sent:0,notifications_failed:0,transition_outcome_unknown:false,recovery_required:false,error_codes:[]};
function setup(overrides: Record<string, unknown> = {}) {
  let sequence=0;
  const rpc=vi.fn(async(name: string,args: Record<string,unknown>):Promise<{data:Record<string,unknown>|null;error:unknown}>=>({error:null,data:name==='begin_atomic_subscription_status_run'
    ?{run_id:run,acquired:true,status:'running',blocked_by:null,execution_scope:scope}
    :name==='process_subscription_lifecycle_batch'?{run_id:run,request_id:args.p_request_id,batch_index:Number(args.p_expected_batch_index)+1,
      phase:'done',done:true,processed:0,execution_scope:scope}
      :{recorded:true,status:'success',summary,execution_scope:scope}}));
  const deps={authorize:()=>null,configured:()=>true,rpc,uuid:()=>sequence++===0?run:request,monotonicNow:()=>0,log:vi.fn(),...overrides};
  const handler=createAtomicSubscriptionJobHandler(deps);
  return {rpc,deps,handler,post:(body: unknown={scope})=>handler(new Request('http://fixture.invalid',{method:'POST',body:JSON.stringify(body)}))};
}
describe('explicit lifecycle execution scope',()=>{
  it.each([null,{},[],{scope:null},{scope:{}},{scope:{kind:'tenants',tenant_ids:[]}},
    {scope:{kind:'cluster',tenant_ids:[]}},{scope:{kind:'cluster'},extra:true},
    {scope:{kind:'tenants',tenant_ids:[null]}},{scope:{kind:'tenants',tenant_ids:['bad']}}])('rejects unsafe input %j',value=>{
    expect(()=>parseExecutionScope(value)).toThrow();
  });
  it('canonicalizes UUIDs and rejects case-insensitive duplicates',()=>{
    const upper='ABCDEFAB-0000-4000-8000-ABCDEFABCDEF';
    expect(parseExecutionScope({scope:{kind:'tenants',tenant_ids:[upper]}})).toEqual({kind:'tenants',tenant_ids:[upper.toLowerCase()]});
    expect(()=>parseExecutionScope({scope:{kind:'tenants',tenant_ids:[upper,upper.toLowerCase()]}})).toThrow();
  });
});
describe('atomic lifecycle handler',()=>{
  it('authorizes before parsing scope or performing database work',async()=>{
    const t=setup({authorize:()=>new Response(null,{status:401})});expect((await t.post(null)).status).toBe(401);expect(t.rpc).not.toHaveBeenCalled();
  });
  it('rejects missing scope before admission',async()=>{
    const t=setup();expect((await t.post({})).status).toBe(400);expect(t.rpc).not.toHaveBeenCalled();
  });
  it('fails closed without configuration',async()=>{
    const t=setup({configured:()=>false});expect((await t.post()).status).toBe(503);expect(t.rpc).not.toHaveBeenCalled();
  });
  it('returns success only after durable server completion',async()=>{
    const t=setup(),response=await t.post();expect(response.status).toBe(200);expect((await response.json()).scope_complete).toBe(true);
    expect(t.rpc.mock.calls.map(c=>c[0])).toEqual(['begin_atomic_subscription_status_run','process_subscription_lifecycle_batch','finish_atomic_subscription_status_run']);
  });
  it('stops before work when admission transport is ambiguous',async()=>{
    const t=setup();t.rpc.mockResolvedValueOnce({data:null,error:new Error('lost')});expect((await t.post()).status).toBe(503);expect(t.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not execute batches when another run owns admission',async()=>{
    const t=setup();t.rpc.mockResolvedValueOnce({data:{run_id:run,acquired:false,status:'busy',blocked_by:request,execution_scope:scope},error:null});
    expect((await t.post()).status).toBe(409);expect(t.rpc).toHaveBeenCalledTimes(1);
  });
  it('retries a lost batch response with exactly the same request and cursor',async()=>{
    const t=setup(),base=t.rpc.getMockImplementation()!;
    t.rpc.mockImplementationOnce(base).mockResolvedValueOnce({data:null,error:new Error('committed response lost')});
    expect((await t.post()).status).toBe(200);expect(t.rpc.mock.calls[1]).toEqual(t.rpc.mock.calls[2]);
  });
  it('records uncertain repeated batch failures and never claims success',async()=>{
    const t=setup(),base=t.rpc.getMockImplementation()!;
    t.rpc.mockImplementationOnce(base).mockResolvedValueOnce({data:null,error:new Error('lost')}).mockResolvedValueOnce({data:null,error:new Error('lost')})
      .mockResolvedValueOnce({data:{recorded:true,status:'interrupted',summary:{...summary,subscription_status:'failed',transition_outcome_unknown:true},execution_scope:scope},error:null});
    const response=await t.post();expect(response.status).toBe(503);expect((await response.json()).success).toBe(false);
    expect(t.rpc.mock.calls[3]).toEqual(['finish_atomic_subscription_status_run',{p_run_id:run,p_outcome_unknown:true}]);
  });
  it('does not trust a success receipt when runtime bound stopped before completion',async()=>{
    let now=0;const t=setup({monotonicNow:()=>{now+=60000;return now;}});const response=await t.post();
    expect(response.status).toBe(503);expect((await response.json()).error).toBe('JOB_HISTORY_FINISH_FAILED');
    expect(t.rpc.mock.calls.some(c=>c[0]==='process_subscription_lifecycle_batch')).toBe(false);
  });
  it('caps invocation at 80 batches and records incomplete outcome',async()=>{
    const t=setup(),base=t.rpc.getMockImplementation()!;
    t.rpc.mockImplementation(async(name,args)=>{
      const result=await base(name,args);
      if(name==='process_subscription_lifecycle_batch')return{data:{...result.data,phase:'grace',done:false,processed:50},error:null};
      if(name==='finish_atomic_subscription_status_run')return{data:{recorded:true,status:'failed',execution_scope:scope,
        summary:{...summary,subscription_status:'failed',staff_status:'not_run'}},error:null};return result;
    });
    expect((await t.post()).status).toBe(500);expect(t.rpc.mock.calls.filter(c=>c[0]==='process_subscription_lifecycle_batch')).toHaveLength(80);
  });
  it('log failures do not invalidate a confirmed commit',async()=>{
    const t=setup({log:()=>{throw new Error('logger down');}});expect((await t.post()).status).toBe(200);
  });
});
