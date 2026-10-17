import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedTenantsManagement } from './AdvancedTenantsManagement';

const state = vi.hoisted(() => ({ isError: false, export: vi.fn() }));
vi.mock('@/hooks/super-admin/useTenants', () => ({ useTenants: () => ({
  data: [
    { id: 'one', name: 'Hotel One', email: 'one@example.invalid', actual_status: 'trial', days_until_expiry: null, subscription_plan: null },
    { id: 'two', name: 'Hotel Two', email: 'two@example.invalid', actual_status: 'active', days_until_expiry: 30, subscription_plan: { id: 'standard', name: 'Standard', code: 'standard' } },
  ], isError: state.isError, isLoading: false, isFetching: false,
}) }));
vi.mock('@/utils/exportUtils', () => ({ exportToExcel: (...args: unknown[]) => state.export(...args) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./TenantsTable', () => ({ TenantsTable: () => null }));
vi.mock('./TenantAnalytics', () => ({ TenantAnalytics: () => null }));

describe('tenant list export scope', () => {
  beforeEach(() => { state.isError = false; state.export.mockReset(); });
  it('exports only the current search results with the actual displayed state', () => {
    render(<AdvancedTenantsManagement />);
    expect(screen.getByRole('combobox', { name: 'tenants.filterByPlan' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'tenants.searchPlaceholder' }), { target: { value: '  ONE ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất kết quả lọc' }));
    expect(state.export).toHaveBeenCalledWith([
      expect.objectContaining({ 'Tên': 'Hotel One', 'Trạng thái': 'trial' }),
    ], expect.any(String), 'Khách hàng');
    expect(screen.getByText(/chưa phải báo cáo toàn hệ thống/)).toBeInTheDocument();
  });
  it('does not export stale data on a query failure or an empty result', () => {
    const { rerender } = render(<AdvancedTenantsManagement />);
    state.isError = true; rerender(<AdvancedTenantsManagement />);
    expect(screen.getByRole('button', { name: 'Xuất kết quả lọc' })).toBeDisabled();
    state.isError = false; rerender(<AdvancedTenantsManagement />);
    fireEvent.change(screen.getByRole('textbox', { name: 'tenants.searchPlaceholder' }), { target: { value: 'not found' } });
    expect(screen.getByRole('button', { name: 'Xuất kết quả lọc' })).toBeDisabled();
    expect(state.export).not.toHaveBeenCalled();
  });
});
