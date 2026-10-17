import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionPaymentPage from './SubscriptionPaymentPage';
const state = vi.hoisted(() => ({ payment: {} as Record<string, unknown>, qr: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ invoiceId: 'fixture-invoice' }), useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.payment, isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn() } }));
vi.mock('@/hooks/useBankPaymentSettings', () => ({ useSuperAdminBankPaymentSettings: () => ({
  data: { bank_code: 'fixture', account_number: 'fixture' }, isLoading: false,
}) }));
vi.mock('@/components/payment/BankQRCode', () => ({ BankQRCode: (props: unknown) => { state.qr(props); return <div data-testid="transfer-qr" />; } }));
vi.mock('react-confetti', () => ({ default: () => null }));
describe('subscription payment screen guards', () => {
  beforeEach(() => {
    state.qr.mockClear();
    state.payment = { id: 'fixture-payment', payment_status: 'pending', payment_method: 'bank_transfer', amount: 100000,
      transaction_reference: 'HD-fixture', invoice: { status: 'sent' }, metadata: { type: 'extend', checkout_enabled: true } };
  });
  it('renders only a transfer explicitly enabled by server checkout', () => {
    render(<SubscriptionPaymentPage />);
    expect(screen.getByTestId('transfer-qr')).toBeInTheDocument();
    expect(state.qr).toHaveBeenCalledWith(expect.objectContaining({ amount: 100000, paymentContent: 'HD-fixture' }));
  });
  it('holds legacy orders for reconciliation without transfer instructions', () => {
    state.payment.metadata = { type: 'extend' };
    render(<SubscriptionPaymentPage />);
    expect(screen.getByText(/Đơn cũ cần đối soát/)).toBeInTheDocument();
    expect(state.qr).not.toHaveBeenCalled();
  });
  it('explains a draft without displaying bank instructions even if it has a transfer method', () => {
    state.payment.metadata = { type: 'quote_draft', checkout_enabled: false };
    render(<SubscriptionPaymentPage />);
    expect(screen.getByText('Bản nháp — chưa được thanh toán')).toBeInTheDocument();
    expect(state.qr).not.toHaveBeenCalled();
  });
  it.each(['expired', 'refunded'])('never displays QR for a %s transaction', status => {
    state.payment.payment_status = status;
    render(<SubscriptionPaymentPage />);
    expect(screen.getByText('Đơn hàng không còn khả dụng để thanh toán')).toBeInTheDocument();
    expect(state.qr).not.toHaveBeenCalled();
  });
  it('does not offer an incomplete payment reference', () => {
    state.payment.transaction_reference = null;
    render(<SubscriptionPaymentPage />);
    expect(screen.getByText('Đơn hàng không còn khả dụng để thanh toán')).toBeInTheDocument();
    expect(state.qr).not.toHaveBeenCalled();
  });
});
