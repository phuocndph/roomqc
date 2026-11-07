import { describe, expect, it } from 'vitest';
import { canDisplaySubscriptionTransferQR, isNonPayableSubscriptionDraft } from './subscription-payment-safety';

const pending = { payment_status: 'pending', payment_method: 'bank_transfer', amount: 100000,
  transaction_reference: 'RQC-fixture', invoice: { status: 'sent', subscription_quote_id: 'quote-fixture' },
  metadata: { type: 'subscription_quote', checkout_enabled: true } };
describe('subscription QR safety', () => {
  it('requires an explicitly enabled server checkout to show any transfer', () => {
    expect(canDisplaySubscriptionTransferQR(pending)).toBe(true);
  });
  it('does not offer another transfer for a legacy browser-priced order', () => {
    expect(canDisplaySubscriptionTransferQR({ ...pending, metadata: { type: 'extend' } })).toBe(false);
    expect(canDisplaySubscriptionTransferQR({ ...pending, invoice: { status: 'sent' }, metadata: { type: 'extend', checkout_enabled: true } })).toBe(false);
  });
  it.each(['expired', 'refunded', 'failed', 'completed', 'unknown', null])('never offers QR for %s payments', status => {
    expect(canDisplaySubscriptionTransferQR({ ...pending, payment_status: status })).toBe(false);
  });
  it.each([
    { metadata: { type: 'quote_draft' } }, { metadata: { checkout_enabled: false } },
    { invoice: { status: 'draft' } },
    { invoice: { status: 'sent', subscription_quote_id: 'fixture-id' }, metadata: { type: 'extend', checkout_enabled: true } },
  ])('recognizes a non-payable draft independently of its method/reference: %j', patch => {
    expect(isNonPayableSubscriptionDraft({ ...pending, ...patch })).toBe(true);
    expect(canDisplaySubscriptionTransferQR({ ...pending, ...patch })).toBe(false);
  });
  it.each([
    { payment_method: null }, { payment_method: 'cash' }, { transaction_reference: '' },
    { transaction_reference: ' ' }, { amount: 0 }, { amount: -1 }, { amount: NaN },
    { invoice: { status: 'cancelled' } }, { invoice: { status: 'paid' } },
  ])('does not construct an unsafe transfer instruction: %j', patch => {
    expect(canDisplaySubscriptionTransferQR({ ...pending, ...patch })).toBe(false);
  });
});
