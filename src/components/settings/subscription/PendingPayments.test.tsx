import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingPayments } from './PendingPayments';
import type { PendingPayment } from '@/hooks/usePendingPayments';
const state = vi.hoisted(() => ({
  payments: [] as PendingPayment[], error: null as Error | null, checking: false,
  refetch: vi.fn(), invalidation: vi.fn(), handlers: new Map<string, (value: unknown) => void>(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => {
  const client = { invalidateQueries: state.invalidation };
  return { useQueryClient: () => client };
});
vi.mock('@/hooks/usePendingPayments', () => ({ usePendingPayments: () => ({
  data: state.payments, error: state.error, isLoading: false, isRefetching: state.checking, refetch: state.refetch,
}) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { removeChannel: vi.fn(), channel: () => {
    const channel = { on: (_: string, config: { table: string; event: string }, handler: (v: unknown) => void) => {
      state.handlers.set(config.table + ':' + config.event, handler); return channel;
    }, subscribe: () => channel };
    return channel;
  } },
}));
vi.mock('./PaymentSuccessDialog', () => ({ PaymentSuccessDialog: () => null }));
vi.mock('@/components/payment/ViewPaymentQRDialog', () => ({
  ViewPaymentQRDialog: ({ payment, open, isChecking }: { payment: PendingPayment | null; open: boolean; isChecking: boolean }) =>
    open && payment ? <div data-testid="live-payment">{isChecking ? 'checking' : payment.payment_status}</div> : null,
}));
const payment: PendingPayment = { id: 'p1', tenant_id: 't1', invoice_id: 'i1', amount: 90000,
  payment_method: null, payment_status: 'pending', transaction_reference: null, metadata: { type: 'quote_draft' },
  notes: null, created_at: '2026-10-17T00:00:00Z', payment_date: null,
  invoice: { invoice_number: 'DRAFT-ONE', status: 'draft', total_amount: 90000, notes: null } };
describe('pending payments use live selection', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.handlers.clear(); state.payments = [{ ...payment }]; state.error = null; state.checking = false;
  });
  function open() {
    const view = render(<PendingPayments />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem trạng thái đơn p1' }));
    expect(screen.getByTestId('live-payment')).toHaveTextContent('pending');
    return view;
  }
  it('makes non-payable drafts visible and reachable for viewing and cancellation', () => {
    render(<PendingPayments />);
    expect(screen.getByRole('button', { name: 'Xem bản nháp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy đơn hàng p1' })).toBeInTheDocument();
  });
  it.each(['expired', 'completed', 'failed'])('does not retain a stale pending object after a %s refetch', status => {
    const view = open();
    state.payments = [{ ...payment, payment_status: status }];
    view.rerender(<PendingPayments />);
    expect(screen.getByTestId('live-payment')).toHaveTextContent(status);
  });
  it.each(['payment_transactions:UPDATE', 'payment_transactions:DELETE', 'invoices:*'])('immediately closes on %s before refetch resolves', event => {
    open();
    act(() => state.handlers.get(event)?.({ old: { payment_status: 'pending' }, new: { payment_status: 'expired' } }));
    expect(screen.queryByTestId('live-payment')).not.toBeInTheDocument();
    expect(state.refetch).toHaveBeenCalled();
  });
  it('hides financial details after an unsuccessful refetch', () => {
    const view = open(); state.error = new Error('network');
    view.rerender(<PendingPayments />);
    expect(screen.queryByTestId('live-payment')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('hides old instructions while polling and when a row disappears', () => {
    const view = open(); state.checking = true;
    view.rerender(<PendingPayments />);
    expect(screen.getByTestId('live-payment')).toHaveTextContent('checking');
    state.checking = false; state.payments = [];
    view.rerender(<PendingPayments />);
    expect(screen.queryByTestId('live-payment')).not.toBeInTheDocument();
  });
});
