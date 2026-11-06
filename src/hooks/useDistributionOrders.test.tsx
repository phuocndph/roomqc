import {renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {useDistributionOrders} from './useDistributionOrders';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>state.rpc(...args)}}));
vi.mock('./useTenant',()=>({useTenant:()=>({tenant:{id:'owned-tenant'}})}));
vi.mock('@/contexts/HotelContext',()=>({useHotelContext:()=>({selectedHotel:{id:'owned-hotel'},isAllHotelsMode:false})}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'owned-user'}})}));
vi.mock('./useNotificationTriggers',()=>({triggerDistributionOrderCreated:vi.fn(),triggerDistributionOrderCancelled:vi.fn()}));
vi.mock('./useGuardedMutation',()=>({useShiftGuardedMutation:vi.fn()}));
const rows=[{id:'owned-order',total_count:999}];
function setup(page=1){
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(()=>useDistributionOrders({status:'pending'},page,25),{wrapper});
}
describe('distribution list count contract',()=>{
  beforeEach(()=>state.rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='get_distribution_orders_count'?76:rows,error:null})));
  it('reads the authorized count separately with identical filters and keeps pagination bounded',async()=>{
    const {result}=setup(3);await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({data:rows,totalCount:76});
    const filter={p_tenant_id:'owned-tenant',p_hotel_id:'owned-hotel',p_status:'pending',p_assigned_to:null,
      p_floor:null,p_shift_date:null,p_shift_code:null};
    expect(state.rpc).toHaveBeenCalledWith('get_distribution_orders_filtered',{...filter,p_limit:25,p_offset:50});
    expect(state.rpc).toHaveBeenCalledWith('get_distribution_orders_count',filter);
  });
  it('preserves total count for an empty page instead of inferring zero from the first row',async()=>{
    state.rpc.mockImplementation(async(name:string)=>({data:name==='get_distribution_orders_count'?76:[],error:null}));
    const {result}=setup(5);await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({data:[],totalCount:76});
  });
  it.each(['get_distribution_orders_filtered','get_distribution_orders_count'])('does not hide %s failure behind a zero total',async(failed)=>{
    const error={code:'42501',message:'owned fixture denial'};
    state.rpc.mockImplementation(async(name:string)=>name===failed?{data:null,error}:{data:name==='get_distribution_orders_count'?1:rows,error:null});
    const {result}=setup();await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.error).toBe(error);
  });
  it.each([null,-1,1.5,'76'])('rejects an invalid count %s',async(value)=>{
    state.rpc.mockImplementation(async(name:string)=>({data:name==='get_distribution_orders_count'?value:rows,error:null}));
    const {result}=setup();await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.data).toBeUndefined();
  });
});
