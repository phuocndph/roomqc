import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BillingHistory } from './BillingHistory';

const state = vi.hoisted(() => ({
  payments: vi.fn(), invoices: vi.fn(), refreshPayments: vi.fn(), refreshInvoices: vi.fn(),
  tenantId: 'tenant-a' as string | null, channel: vi.fn(), on: vi.fn(), subscribe: vi.fn(), removeChannel: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('@/hooks/useSubscription', () => ({ usePaymentTransactions: state.payments, useInvoices: state.invoices }));
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: state.tenantId, user: { user_level_code: 'super_admin' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  channel: state.channel, removeChannel: state.removeChannel, functions: { invoke: state.invoke },
} }));

const invoice = { id: 'invoice-a', tenant_id: 'tenant-a', invoice_number: 'A0-LOCAL',
  invoice_date: '2026-10-17', period_start: '2026-10-17', period_end: '2026-11-17',
  total_amount: 90000, subtotal: 90000, discount_amount: 0, tax_amount: 0, status: 'paid' };
const payment = { id: 'payment-a', invoice_id: invoice.id, tenant_id: 'tenant-a',
  payment_status: 'completed', amount: 90000, created_at: '2026-10-17T00:00:00Z',
  metadata: { description: 'Fixture subscription' } };
const query = { isLoading: false, isError: false, isFetching: false };

beforeEach(() => {
  vi.clearAllMocks(); state.tenantId = 'tenant-a';
  state.payments.mockReturnValue({ ...query, data: [payment], refetch: state.refreshPayments });
  state.invoices.mockReturnValue({ ...query, data: [invoice], refetch: state.refreshInvoices });
  const channel = { on: state.on, subscribe: state.subscribe };
  state.channel.mockReturnValue(channel); state.on.mockReturnValue(channel); state.subscribe.mockReturnValue(channel);
});
afterEach(cleanup);

it('keeps history and invoice inspection without a legacy provider action even for admin', () => {
  render(<BillingHistory />);
  expect(screen.queryByRole('button', { name: /SePay/ })).not.toBeInTheDocument();
  expect(screen.getByText(/không phải hóa đơn của khách lưu trú/)).toBeInTheDocument();
  expect(screen.getByText(/thanh toán thật chưa được mở/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Xem hóa đơn A0-LOCAL' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Hóa đơn A0-LOCAL');
  expect(state.invoke).not.toHaveBeenCalled();
});

it.each(['payments', 'invoices'] as const)('hides stale rows and invoice after a %s error and retries both queries', key => {
  const view = render(<BillingHistory />);
  fireEvent.click(screen.getByRole('button', { name: 'Xem hóa đơn A0-LOCAL' }));
  state[key].mockReturnValue({ ...query, isError: true, data: key === 'payments' ? [payment] : [invoice],
    refetch: key === 'payments' ? state.refreshPayments : state.refreshInvoices });
  view.rerender(<BillingHistory />);
  expect(screen.getByRole('alert')).toHaveTextContent('Không tải được lịch sử thanh toán');
  expect(screen.queryByText('A0-LOCAL')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Chưa có giao dịch nào')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
  expect(state.refreshPayments).toHaveBeenCalledOnce(); expect(state.refreshInvoices).toHaveBeenCalledOnce();
});

it('hides cached evidence while revalidating and never calls a provider on refresh', () => {
  const view = render(<BillingHistory />);
  fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
  expect(state.refreshPayments).toHaveBeenCalledOnce(); expect(state.refreshInvoices).toHaveBeenCalledOnce();
  state.payments.mockReturnValue({ ...query, isFetching: true, data: [payment], refetch: state.refreshPayments });
  view.rerender(<BillingHistory />);
  expect(screen.getByRole('status')).toHaveAccessibleName('Đang tải lịch sử thanh toán');
  expect(screen.queryByText('A0-LOCAL')).not.toBeInTheDocument(); expect(state.invoke).not.toHaveBeenCalled();
});

it('scopes realtime and closes a selected invoice when changing tenant', () => {
  const view = render(<BillingHistory />);
  expect(state.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({
    table: 'payment_transactions', filter: 'tenant_id=eq.tenant-a',
  }), expect.any(Function));
  expect(state.on).toHaveBeenCalledWith('postgres_changes', expect.objectContaining({
    table: 'invoices', filter: 'tenant_id=eq.tenant-a',
  }), expect.any(Function));
  fireEvent.click(screen.getByRole('button', { name: 'Xem hóa đơn A0-LOCAL' }));
  state.tenantId = 'tenant-b';
  state.payments.mockReturnValue({ ...query, data: [], refetch: state.refreshPayments });
  state.invoices.mockReturnValue({ ...query, data: [], refetch: state.refreshInvoices });
  view.rerender(<BillingHistory />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(state.removeChannel).toHaveBeenCalledOnce();
  expect(state.channel).toHaveBeenLastCalledWith('billing-history:tenant-b');
});

it('does not subscribe or claim an empty history without a tenant', () => {
  state.tenantId = null; render(<BillingHistory />);
  expect(screen.getByRole('alert')).toHaveTextContent('Không xác định được khách sạn');
  expect(state.channel).not.toHaveBeenCalled(); expect(screen.queryByText('Chưa có giao dịch nào')).not.toBeInTheDocument();
});

it('shows an empty history only after successful queries', () => {
  state.payments.mockReturnValue({ ...query, data: [], refetch: state.refreshPayments });
  state.invoices.mockReturnValue({ ...query, data: [], refetch: state.refreshInvoices });
  render(<BillingHistory />); expect(screen.getByText('Chưa có giao dịch nào')).toBeInTheDocument();
});

it('distinguishes a cancelled invoice from an unexplained failed payment', () => {
  state.payments.mockReturnValue({ ...query, data: [{ ...payment, payment_status: 'failed' }], refetch: state.refreshPayments });
  state.invoices.mockReturnValue({ ...query, data: [{ ...invoice, status: 'cancelled' }], refetch: state.refreshInvoices });
  const view = render(<BillingHistory />);
  expect(screen.getByText('Đã hủy')).toBeInTheDocument(); expect(screen.queryByText('Thất bại')).not.toBeInTheDocument();
  state.invoices.mockReturnValue({ ...query, data: [invoice], refetch: state.refreshInvoices });
  view.rerender(<BillingHistory />);
  expect(screen.getByText('Thất bại')).toBeInTheDocument(); expect(screen.queryByText('Đã hủy')).not.toBeInTheDocument();
});
