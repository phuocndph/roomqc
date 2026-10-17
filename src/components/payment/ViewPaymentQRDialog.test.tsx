import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewPaymentQRDialog } from './ViewPaymentQRDialog';
import type { PendingPayment } from '@/hooks/usePendingPayments';
const state = vi.hoisted(() => ({ bank: vi.fn(), qr: vi.fn() }));
vi.mock('@/hooks/useBankPaymentSettings', () => ({ useSuperAdminBankPaymentSettings: state.bank }));
vi.mock('./BankQRCode', () => ({ BankQRCode: (props: unknown) => { state.qr(props); return <div data-testid="qr" />; } }));
vi.mock('./QRCountdown', () => ({ QRCountdown: () => null, useQRExpiry: () => ({ isExpired: false }) }));
const payment: PendingPayment = { id: 'p1', tenant_id: 't1', invoice_id: 'i1', amount: 100000,
  payment_method: 'bank_transfer', payment_status: 'pending', transaction_reference: 'SERVER-REFERENCE',
  created_at: '2026-10-17T00:00:00Z', notes: null, payment_date: null,
  metadata: { type: 'extend', checkout_enabled: true },
  invoice: { invoice_number: 'INV-TEST', status: 'sent', total_amount: 100000, notes: null } };
describe('subscription QR dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.bank.mockReturnValue({ data: { bank_code: 'platform-bank', account_number: 'platform-account' }, isLoading: false });
  });
  it('uses platform bank configuration without requiring a hotel ID', () => {
    render(<ViewPaymentQRDialog open onOpenChange={vi.fn()} payment={payment} />);
    expect(screen.getByTestId('qr')).toBeInTheDocument();
    expect(state.bank).toHaveBeenCalledWith();
    expect(state.qr).toHaveBeenCalledWith(expect.objectContaining({ bankCode: 'platform-bank', accountNumber: 'platform-account' }));
  });
  it.each(['completed', 'expired', 'failed', 'refunded'])('removes QR when live status changes to %s', status => {
    const view = render(<ViewPaymentQRDialog open onOpenChange={vi.fn()} payment={payment} />);
    expect(screen.getByTestId('qr')).toBeInTheDocument();
    view.rerender(<ViewPaymentQRDialog open onOpenChange={vi.fn()} payment={{ ...payment, payment_status: status }} />);
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
  });
  it('hides instructions while checking the latest server state', () => {
    render(<ViewPaymentQRDialog open onOpenChange={vi.fn()} payment={payment} isChecking />);
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
  });
  it('does not offer another transfer for legacy orders', () => {
    render(<ViewPaymentQRDialog open onOpenChange={vi.fn()} payment={{ ...payment, metadata: { type: 'extend' } }} />);
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Không chuyển khoản');
  });
});
