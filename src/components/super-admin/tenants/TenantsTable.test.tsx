import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantsTable } from './TenantsTable';

const state = vi.hoisted(() => ({ isError: false, refetch: vi.fn() }));
const tenant = (id: string, planId: string) => ({
  id, name: `Hotel ${id}`, subscription_status: 'trial', actual_status: 'trial',
  created_at: '2026-10-17T10:00:00Z', days_until_expiry: null, has_subscription: false,
  approval_status: 'approved', subscription_plan: { id: planId, name: `Plan ${planId}` },
});
vi.mock('@/hooks/super-admin/useTenants', () => ({
  useTenants: () => ({ data: [tenant('one', 'standard'), tenant('two', 'enterprise')], isLoading: false, isError: state.isError, isFetching: false, refetch: state.refetch }),
  useSuspendTenant: () => ({ isPending: false }), useReactivateTenant: () => ({ isPending: false }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./TenantDetailsDialog', () => ({ TenantDetailsDialog: () => null }));
vi.mock('./TenantBillingDialog', () => ({ TenantBillingDialog: () => null }));
vi.mock('./ChangePlanDialog', () => ({ ChangePlanDialog: () => null }));

describe('tenant list', () => {
  beforeEach(() => { state.isError = false; state.refetch.mockReset(); });
  it('actually filters the table by selected plan and shows a scoped row count', () => {
    render(<TenantsTable planFilter="enterprise" />);
    expect(screen.getByText('Hotel two')).toBeInTheDocument();
    expect(screen.queryByText('Hotel one')).not.toBeInTheDocument();
    expect(screen.getByText('1 kết quả lọc trong 2 khách hàng đã tải')).toBeInTheDocument();
    expect(screen.getAllByText('tenants.status.trial').length).toBeGreaterThan(0);
  });
  it('hides cached rows and financial numbers on refetch error, and offers retry', () => {
    const { rerender } = render(<TenantsTable />);
    expect(screen.getByText('Hotel one')).toBeInTheDocument();
    state.isError = true; rerender(<TenantsTable />);
    expect(screen.getByRole('alert')).toHaveTextContent('Dữ liệu cũ đã được ẩn');
    expect(screen.queryByText('Hotel one')).not.toBeInTheDocument();
    expect(screen.queryByText('tenants.table.noTenants')).not.toBeInTheDocument();
    expect(screen.getByText('Chưa có số liệu hợp lệ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
