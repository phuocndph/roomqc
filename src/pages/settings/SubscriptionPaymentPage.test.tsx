import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionPaymentPage from './SubscriptionPaymentPage';
const state = vi.hoisted(() => ({ payment: {} as Record<string, unknown>, qr: vi.fn(), instructions: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ invoiceId: 'fixture-invoice' }), useNavigate: () => vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.payment, isLoading: false, error: null, refetch: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { channel: () => ({ on: () => ({ subscribe: vi.fn() }) }), removeChannel: vi.fn() } }));
vi.mock('@/hooks/useSubscriptionPaymentInstructions', () => ({ useSubscriptionPaymentInstructions: state.instructions }));
vi.mock('@/components/payment/BankQRCode', () => ({ BankQRCode: (props: unknown) => { state.qr(props); return <div data-testid="transfer-qr" />; } }));
vi.mock('react-confetti', () => ({ default: () => null }));
describe('subscription payment screen guards', () => {
  beforeEach(() => {
    state.qr.mockClear();
    state.instructions.mockReset();
    state.instructions.mockReturnValue({ isLoading: false, data: { payable: true, amount: 100000, transaction_reference: 'RQC-fixture',
      bank_code: 'fixture-bank', bank_name: 'Fixture', account_number: 'fixture-account', account_holder: 'ROOMQC' } });
    state.payment = { id: 'fixture-payment', payment_status: 'pending', payment_method: 'bank_transfer', amount: 100000,
      transaction_reference: 'RQC-fixture', invoice: { status: 'sent', subscription_quote_id: 'fixture-quote' },
      metadata: { type: 'subscription_quote', checkout_enabled: true } };
  });
  it('renders only a transfer explicitly enabled by server checkout', () => {
    render(<SubscriptionPaymentPage />);
    expect(screen.getByTestId('transfer-qr')).toBeInTheDocument();
    expect(state.qr).toHaveBeenCalledWith(expect.objectContaining({ amount: 100000, paymentContent: 'RQC-fixture', accountNumber: 'fixture-account' }));
    expect(state.instructions).toHaveBeenCalledWith('fixture-payment', true);
  });
  it('says payments are not open yet when the platform account is missing', () => {
    state.instructions.mockReturnValue({ isLoading: false, data: { payable: false } });
    render(<SubscriptionPaymentPage />);
    expect(screen.getByText('Chưa mở nhận thanh toán')).toBeInTheDocument();
    expect(state.qr).not.toHaveBeenCalled();
  });
  it('holds legacy orders for reconciliation without transfer instructions', () => {
    state.payment.metadata = { type: 'extend' };
    state.payment.invoice = { status: 'sent' };
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
