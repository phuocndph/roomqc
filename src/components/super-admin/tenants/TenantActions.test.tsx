import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActions } from './BulkActions';
import { ChangePlanDialog } from './ChangePlanDialog';
import { DeleteTenantDialog } from './DeleteTenantDialog';

const state = vi.hoisted(() => ({ rpc:vi.fn(), count:vi.fn(), toast:vi.fn(), close:vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase:{
  rpc:(...args:unknown[]) => state.rpc(...args),
  from:() => ({select:() => ({eq:() => state.count()})}),
} }));
vi.mock('@/hooks/use-toast', () => ({useToast:() => ({toast:state.toast})}));
vi.mock('react-i18next', () => ({useTranslation:() => ({t:(key:string) => key})}));
const tenant = {id:'tenant-test',name:'Test hotel',registered_rooms:5,subscription_duration_days:30};
function setup() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  return render(<QueryClientProvider client={client}>
    <ChangePlanDialog tenant={tenant} open onOpenChange={state.close} />
  </QueryClientProvider>);
}
async function enterReason() {
  fireEvent.change(screen.getByLabelText('Lý do điều chỉnh (bắt buộc)'),{target:{value:'Approved test adjustment'}});
  await waitFor(() => expect(screen.getByRole('button',{name:'Cập nhật đăng ký'})).toBeEnabled());
}
describe('Truthful tenant administration', () => {
  beforeEach(() => {
    state.count.mockReset().mockResolvedValue({count:3,error:null});
    state.rpc.mockReset().mockResolvedValue({data:{id:tenant.id},error:null});
    state.toast.mockReset(); state.close.mockReset();
  });
  it('offers no fake bulk mutations and keeps clear selection available', () => {
    const clear = vi.fn();
    render(<BulkActions selectedTenants={['one','two']} onClearSelection={clear} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'tenants.bulk.clear'}));
    expect(clear).toHaveBeenCalledOnce();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.toast).not.toHaveBeenCalled();
  });
  it('does not offer irreversible deletion', () => {
    render(<DeleteTenantDialog tenant={tenant} open onOpenChange={state.close} />);
    expect(screen.getByText('Chưa hỗ trợ xóa khách hàng')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('requires a reason and awaits the actual server response before success', async () => {
    let resolve: (value:unknown) => void = () => {};
    state.rpc.mockImplementation(() => new Promise(done => {resolve=done;}));
    setup();
    expect(screen.getByRole('button',{name:'Cập nhật đăng ký'})).toBeDisabled();
    await enterReason();
    fireEvent.click(screen.getByRole('button',{name:'Cập nhật đăng ký'}));
    expect(state.rpc).toHaveBeenCalledWith('admin_manage_tenant',{
      p_tenant_id:tenant.id,p_action:'change_plan',p_reason:'Approved test adjustment',p_rooms:5,p_duration_days:30,
    });
    expect(state.toast).not.toHaveBeenCalled();
    expect(state.close).not.toHaveBeenCalled();
    resolve({data:{id:tenant.id},error:null});
    await waitFor(() => expect(state.close).toHaveBeenCalledWith(false));
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({title:'Cập nhật thành công'}));
  });
  it('keeps the reason and dialog open when the backend fails', async () => {
    state.rpc.mockResolvedValue({data:null,error:{message:'Backend unavailable'}});
    setup(); await enterReason();
    fireEvent.click(screen.getByRole('button',{name:'Cập nhật đăng ký'}));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({variant:'destructive'})));
    expect(state.close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Lý do điều chỉnh (bắt buộc)')).toHaveValue('Approved test adjustment');
  });
  it('does not declare success on an empty RPC result', async () => {
    state.rpc.mockResolvedValue({data:null,error:null});
    setup(); await enterReason();
    fireEvent.click(screen.getByRole('button',{name:'Cập nhật đăng ký'}));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({variant:'destructive'})));
    expect(state.close).not.toHaveBeenCalled();
  });
  it('blocks plan adjustment when the current room count cannot be read', async () => {
    state.count.mockResolvedValue({count:null,error:{message:'Unavailable'}});
    setup();
    expect(await screen.findByText(/Không tải được số phòng thực tế/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lý do điều chỉnh (bắt buộc)'),{target:{value:'Approved test adjustment'}});
    expect(screen.getByRole('button',{name:'Cập nhật đăng ký'})).toBeDisabled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
