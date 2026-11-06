import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantBillingDialog } from './TenantBillingDialog';
const state=vi.hoisted(()=>({payments:vi.fn(),invoices:vi.fn(),stats:vi.fn()}));
vi.mock('@/hooks/super-admin/useTenantBilling',()=>({
  useTenantPayments:(...args:unknown[])=>{state.payments(...args);return {data:[],isLoading:false};},
  useTenantInvoices:(...args:unknown[])=>{state.invoices(...args);return {data:[],isLoading:false};},
  useTenantPaymentStats:(...args:unknown[])=>{state.stats(...args);return {data:null,isLoading:false};},
}));
vi.mock('./SubscriptionReconciliationPanel',()=>({SubscriptionReconciliationPanel:({tenantId}:{tenantId:string})=><p>queue {tenantId}</p>}));
const tenant={id:'tenant-one',name:'Test hotel',subscription_status:'trial'};
describe('admin billing entry point',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('opens the support queue without eagerly loading legacy billing lists',()=>{
    render(<TenantBillingDialog tenant={tenant} open onOpenChange={()=>{}}/>);
    expect(screen.getByRole('tab',{name:'Đối soát'})).toHaveAttribute('data-state','active');
    expect(screen.getByText('queue tenant-one')).toBeInTheDocument();
    expect(state.payments).toHaveBeenLastCalledWith(tenant.id,false);
    expect(state.invoices).toHaveBeenLastCalledWith(tenant.id,false);
    expect(state.stats).toHaveBeenLastCalledWith(tenant.id,false);
  });
  it('does not mount the queue or run legacy queries while closed',()=>{
    render(<TenantBillingDialog tenant={tenant} open={false} onOpenChange={()=>{}}/>);
    expect(screen.queryByText('queue tenant-one')).not.toBeInTheDocument();
    expect(state.payments).toHaveBeenLastCalledWith(tenant.id,false);
    expect(state.invoices).toHaveBeenLastCalledWith(tenant.id,false);
    expect(state.stats).toHaveBeenLastCalledWith(tenant.id,false);
  });
  it('loads legacy payments only when that tab is selected',()=>{
    render(<TenantBillingDialog tenant={tenant} open onOpenChange={()=>{}}/>);
    fireEvent.mouseDown(screen.getByRole('tab',{name:'Payments'}),{button:0,ctrlKey:false});
    expect(state.payments).toHaveBeenLastCalledWith(tenant.id,true);
    expect(state.invoices).toHaveBeenLastCalledWith(tenant.id,false);
    expect(state.stats).toHaveBeenLastCalledWith(tenant.id,false);
    expect(screen.queryByText('queue tenant-one')).not.toBeInTheDocument();
  });
});
