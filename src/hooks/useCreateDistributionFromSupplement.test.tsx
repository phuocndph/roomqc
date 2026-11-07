import {renderHook,act} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {useCreateDistributionFromSupplement} from './useCreateDistributionFromSupplement';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock('./useUser',()=>({useUser:()=>({user:{id:'owned-manager'}})}));
vi.mock('./useTenant',()=>({useTenant:()=>({tenant:{id:'owned-tenant'}})}));
vi.mock('sonner',()=>({toast:mocks.toast}));
vi.mock('@/lib/workspace',()=>({workspacePath:(path:string)=>path}));
function setup(){
  const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
  const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(()=>useCreateDistributionFromSupplement(),{wrapper});
}
describe('supplement distribution atomic link',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),single:vi.fn().mockResolvedValue({data:{
      hotel_id:'owned-hotel',room_id:'owned-room',request_code:'SUP-OWNED',items:[{item_id:'owned-item',quantity:2}],
    },error:null})};
    mocks.from.mockImplementation((table:string)=>{if(table!=='supplement_requests')throw new Error('Unexpected client-side write');return query});
    mocks.rpc.mockResolvedValue({data:{success:true,order_id:'owned-order',order_code:'DIS-OWNED'},error:null});
  });
  it('uses the single transaction RPC without a second distribution row update',async()=>{
    const {result}=setup();let created;
    await act(async()=>{created=await result.current.mutateAsync({supplementRequestId:'owned-request',assignedTo:'owned-assignee'})});
    expect(created).toMatchObject({success:true,orderId:'owned-order',requestCode:'SUP-OWNED'});
    expect(mocks.from).toHaveBeenCalledTimes(1);expect(mocks.from).toHaveBeenCalledWith('supplement_requests');
    expect(mocks.rpc).toHaveBeenCalledWith('create_distribution_order',expect.objectContaining({
      p_tenant_id:'owned-tenant',p_hotel_id:'owned-hotel',p_created_by:'owned-manager',p_supplement_request_ids:['owned-request'],
    }));
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });
  it.each([null,{success:false},{success:true,order_id:'owned-order'}])('rejects an incomplete RPC result %s',async(data)=>{
    mocks.rpc.mockResolvedValue({data,error:null});const {result}=setup();
    await act(async()=>{await expect(result.current.mutateAsync({supplementRequestId:'owned-request'})).rejects.toThrow('Không thể xác nhận')});
    expect(mocks.toast.success).not.toHaveBeenCalled();expect(mocks.toast.error).toHaveBeenCalledTimes(1);
  });
  it('propagates RPC failure and never follows it with a write',async()=>{
    const error=new Error('Owned permission denial');mocks.rpc.mockResolvedValue({data:null,error});const {result}=setup();
    await act(async()=>{await expect(result.current.mutateAsync({supplementRequestId:'owned-request'})).rejects.toBe(error)});
    expect(mocks.from).toHaveBeenCalledTimes(1);expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});
