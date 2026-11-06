import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionReconciliationPanel } from './SubscriptionReconciliationPanel';
const state=vi.hoisted(()=>({rpc:vi.fn(),session:true}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'admin'},session:state.session?{user:{id:'admin'}}:null})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:()=>state.rpc(...args)})}}));
const tenant='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const id='10000000-0000-4000-8000-000000000003';
const date='2026-10-17T00:00:00+00:00';
const row={id,tenant_id:tenant,invoice_id:null,amount:1234,currency:'VND',payment_status:'pending',
  created_at:date,invoice_number:null,invoice_status:null,flags:['legacy_unverified']};
const page={rows:[row],has_more:false,next_cursor:null,checked_at:date};
function setup(tenantId=tenant){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view=render(<QueryClientProvider client={client}><SubscriptionReconciliationPanel tenantId={tenantId}/></QueryClientProvider>);
  return {...view,client,changeTenant:(next:string)=>view.rerender(<QueryClientProvider client={client}><SubscriptionReconciliationPanel tenantId={next}/></QueryClientProvider>)};
}
describe('subscription support queue',()=>{
  beforeEach(()=>{state.session=true;state.rpc.mockReset().mockResolvedValue({data:page,error:null});});
  it('offers only read-only, server-scoped inspection and clear non-payment warning',async()=>{
    setup();expect(await screen.findByText('Đơn cũ chưa xác thực giá')).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledWith('admin_subscription_reconciliation',{
      p_tenant_id:tenant,p_filter:'all',p_limit:25,p_before_created_at:null,p_before_id:null,
    });
    expect(screen.getByText(/Chỉ tra cứu/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Xác nhận|Hủy đơn|Thanh toán/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Trang sau'})).toBeDisabled();
  });
  it('uses the server cursor then resets it when filter changes',async()=>{
    state.rpc.mockResolvedValueOnce({data:{...page,has_more:true,next_cursor:{id,created_at:date}},error:null});
    setup();await screen.findByText('Đơn cũ chưa xác thực giá');
    fireEvent.click(screen.getByRole('button',{name:'Trang sau'}));
    await waitFor(()=>expect(state.rpc).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({p_before_id:id,p_before_created_at:date})));
    await screen.findByText('Đơn cũ chưa xác thực giá');
    fireEvent.change(screen.getByLabelText('Lọc đơn'),{target:{value:'stale'}});
    await waitFor(()=>expect(state.rpc).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({p_filter:'stale',p_before_id:null})));
    expect(screen.getByText('Trang 1')).toBeInTheDocument();
  });
  it('remounts the queue and never keeps another tenant row on tenant switch',async()=>{
    const view=setup();await screen.findByText(id);
    state.rpc.mockResolvedValue({data:{...page,rows:[]},error:null});
    view.changeTenant(other);
    expect(screen.queryByText(id)).not.toBeInTheDocument();
    await screen.findByText(/Không có đơn phù hợp/);
    expect(state.rpc).toHaveBeenLastCalledWith(expect.anything(),expect.objectContaining({p_tenant_id:other,p_before_id:null}));
  });
  it('hides stale evidence during refresh and after a permission failure',async()=>{
    setup();await screen.findByText(id);
    let resolve:(value:unknown)=>void=()=>{};
    state.rpc.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    fireEvent.click(screen.getByRole('button',{name:'Tải lại từ đầu'}));
    await screen.findByRole('status');expect(screen.queryByText(id)).not.toBeInTheDocument();
    resolve({data:null,error:{code:'42501'}});
    expect(await screen.findByRole('alert')).toHaveTextContent('quản trị');
    expect(screen.queryByText(id)).not.toBeInTheDocument();
  });
  it('treats malformed or mixed-tenant evidence as an error, not empty success',async()=>{
    state.rpc.mockResolvedValue({data:{...page,rows:[{...row,tenant_id:other}]},error:null});
    setup();expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được');
    expect(screen.queryByText(id)).not.toBeInTheDocument();
    expect(screen.queryByText(/Không có đơn phù hợp/)).not.toBeInTheDocument();
  });
  it('does not fetch or render evidence without an Auth session',()=>{
    state.session=false;setup();expect(screen.getByRole('alert')).toHaveTextContent('đăng nhập');
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('opens the notebook in place, focuses it, and returns to the same queue action',async()=>{
    state.rpc.mockImplementation((name:string)=>Promise.resolve(name==='admin_subscription_reconciliation'
      ? {data:page,error:null} : {data:null,error:{code:'PGRST202'}}));
    setup();
    fireEvent.click(await screen.findByRole('button',{name:'Mở hồ sơ kiểm tra'}));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Hồ sơ kiểm tra giao dịch'})).toHaveFocus();
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa được cài đặt');
    fireEvent.click(screen.getByRole('button',{name:'Ẩn chi tiết hồ sơ'}));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Mở hồ sơ kiểm tra'})).toHaveFocus();
    expect(screen.getByText('Trang 1')).toBeInTheDocument();
  });
});
