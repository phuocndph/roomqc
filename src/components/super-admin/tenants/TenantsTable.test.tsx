import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsTable } from './TenantsTable';

const state = vi.hoisted(() => ({ isError: false, isFetching: false, refetch: vi.fn() }));
const tenant = (id: string) => ({
  id, name: `Hotel ${id}`, subscription_status: 'trial', actual_status: 'trial',
  created_at: '2026-10-17T10:00:00Z', days_until_expiry: null, has_subscription: false,
  approval_status: 'approved', subscription_plan: null,
});
vi.mock('@/hooks/super-admin/useTenants', () => ({
  useSuspendTenant: () => ({ isPending: false }), useReactivateTenant: () => ({ isPending: false }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./TenantDetailsDialog', () => ({ TenantDetailsDialog: () => null }));
vi.mock('./TenantBillingDialog', () => ({ TenantBillingDialog: () => null }));
vi.mock('./ChangePlanDialog', () => ({ ChangePlanDialog: () => null }));
function props() {
  return {
    directory: { data: { items: [tenant('one'), tenant('two')], total: 52, page: 2, page_size: 25 },
      isLoading: false, isError: state.isError, isFetching: state.isFetching, refetch: state.refetch } as never,
    onPageChange: vi.fn(), sort: 'created_at' as const, descending: true, onSortChange: vi.fn(), onSelectionChange: vi.fn(),
  };
}
describe('server tenant page table', () => {
  beforeEach(() => { state.isError = false; state.isFetching = false; state.refetch.mockReset(); });
  it('shows the server count, selects this page and requests global sorting/page navigation', () => {
    const input = props(); render(<TenantsTable {...input} />);
    expect(screen.getByText('52 khách hàng phù hợp · Trang 3/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tenants.table.next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'tenants.table.previous' }));
    expect(input.onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'tenants.table.tenantName' }));
    expect(input.onSortChange).toHaveBeenCalledWith('name', false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chọn tất cả khách hàng trên trang hiện tại' }));
    expect(input.onSelectionChange).toHaveBeenCalledWith(['one', 'two']);
  });
  it('hides cached rows/count on error and disables page actions', () => {
    const input = props(); const { rerender } = render(<TenantsTable {...input} />);
    expect(screen.getByText('Hotel one')).toBeInTheDocument();
    state.isError = true; rerender(<TenantsTable {...props()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Dữ liệu cũ đã được ẩn');
    expect(screen.queryByText('Hotel one')).not.toBeInTheDocument();
    expect(screen.queryByText('tenants.table.noTenants')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có số liệu hợp lệ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tenants.table.previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
