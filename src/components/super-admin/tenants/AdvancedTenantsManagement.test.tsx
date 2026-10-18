import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedTenantsManagement } from './AdvancedTenantsManagement';

const state = vi.hoisted(() => ({ isError: false, isFetching: false, export: vi.fn(), request: vi.fn(), table: vi.fn() }));
vi.mock('@/hooks/super-admin/useTenants', () => ({ useTenants: (request: { searchQuery: string; page: number }) => {
  state.request(request);
  return { data: { items: request.searchQuery === 'not found' ? [] : [
    { id: 'one', name: `Hotel page ${request.page + 1}`, email: 'one@example.invalid', actual_status: 'trial', days_until_expiry: null, subscription_plan: null },
  ], page: request.page, total: 1002, page_size: 25, plans: [{ id: 'standard', name: 'Standard' }] },
  isError: state.isError, isLoading: false, isFetching: state.isFetching };
} }));
vi.mock('@/utils/exportUtils', () => ({ exportToExcel: (...args: unknown[]) => state.export(...args) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./TenantsTable', () => ({ TenantsTable: (props: unknown) => { state.table(props); return null; } }));
vi.mock('./TenantAnalytics', () => ({ TenantAnalytics: () => null }));

describe('server tenant filters and page export', () => {
  beforeEach(() => { state.isError = false; state.isFetching = false; state.export.mockReset(); state.request.mockReset(); state.table.mockReset(); });
  it('exports only current server page, and resets page on a search change', () => {
    render(<AdvancedTenantsManagement />);
    expect(screen.getByRole('combobox', { name: 'tenants.filterByPlan' })).toBeInTheDocument();
    // The table receives the same query result as export; it does not fetch/filter again.
    fireEvent.click(screen.getByRole('button', { name: 'Xuất trang hiện tại' }));
    expect(state.export).toHaveBeenLastCalledWith([
      expect.objectContaining({ 'Tên': 'Hotel page 1', 'Trạng thái': 'trial' }),
    ], expect.stringContaining('tenants-page-1-'), 'Khách hàng');
    expect(screen.getByText(/File xuất chỉ gồm trang hiện tại/)).toBeInTheDocument();
    const tableProps = state.table.mock.lastCall?.[0] as { onPageChange: (page: number) => void };
    act(() => tableProps.onPageChange(2));
    expect(state.request).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Xuất trang hiện tại' }));
    expect(state.export).toHaveBeenLastCalledWith([
      expect.objectContaining({ 'Tên': 'Hotel page 3' }),
    ], expect.stringContaining('tenants-page-3-'), 'Khách hàng');
    fireEvent.change(screen.getByRole('textbox', { name: 'tenants.searchPlaceholder' }), { target: { value: 'query' } });
    expect(state.request).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0, searchQuery: 'query' }));
  });
  it('does not export cached data during failure/refetch or an empty result', () => {
    const { rerender } = render(<AdvancedTenantsManagement />);
    state.isError = true; rerender(<AdvancedTenantsManagement />);
    expect(screen.getByRole('button', { name: 'Xuất trang hiện tại' })).toBeDisabled();
    state.isError = false; state.isFetching = true; rerender(<AdvancedTenantsManagement />);
    expect(screen.getByRole('button', { name: 'Xuất trang hiện tại' })).toBeDisabled();
    state.isFetching = false; rerender(<AdvancedTenantsManagement />);
    fireEvent.change(screen.getByRole('textbox', { name: 'tenants.searchPlaceholder' }), { target: { value: 'not found' } });
    expect(screen.getByRole('button', { name: 'Xuất trang hiện tại' })).toBeDisabled();
    expect(state.export).not.toHaveBeenCalled();
  });
});
