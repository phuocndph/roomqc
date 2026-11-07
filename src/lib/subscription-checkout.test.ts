import { describe, expect, it } from 'vitest';
import { checkoutError, readPaymentInstructions, readSubscriptionQuote, renewalBlock } from './subscription-checkout';
import { ROOMQC_CONTACT_EMAIL } from './contact';
const quote = { quote_id: 'server-quote', billed_rooms: 3, duration_days: 30,
  price_per_room_daily: 1000, subtotal: 90000, discount_amount: 0, total_amount: 90000,
  period_start: '2026-10-17', period_end: '2026-11-16', currency: 'VND', checkout_enabled: false };
describe('subscription quote response', () => {
  it('uses the exact server result without repricing', () => expect(readSubscriptionQuote(quote)).toEqual(quote));
  it.each([null, [], {}, { ...quote, currency: 'USD' }, { ...quote, total_amount: NaN },
    { ...quote, total_amount: -1 }, { ...quote, checkout_enabled: true }, { ...quote, discount_amount: -1 },
    { ...quote, duration_days: 0 }, { ...quote, quote_id: '' }])('fails closed for malformed quote %j', value => {
    expect(() => readSubscriptionQuote(value)).toThrow('INVALID_QUOTE_RESPONSE');
  });
  it('gives actionable parent-payment conflicts without exposing raw errors', () => {
    expect(checkoutError({ message: 'PAID_INVOICE_REQUIRES_RECONCILIATION' })).toContain('đối soát');
    expect(checkoutError({ message: 'secret internal details' })).not.toContain('secret');
  });
});

describe('renewal eligibility mirrors the server order guard', () => {
  const ok = { approval_status: 'approved', subscription_status: 'active', read_only_reason: null };
  it('lets an expired, read-only tenant renew online', () => {
    expect(renewalBlock(ok)).toBeNull();
    expect(renewalBlock({ ...ok, subscription_status: 'trial', read_only_reason: 'Hết 7 ngày ân hạn — chuyển sang chỉ đọc.' })).toBeNull();
  });
  it('does not block while the tenant row is unknown', () => {
    expect(renewalBlock(undefined)).toBeNull();
    expect(renewalBlock(null)).toBeNull();
  });
  it.each([
    [{ ...ok, approval_status: 'pending' }, 'pending_approval'],
    [{ ...ok, subscription_status: 'cancelled' }, 'cancelled'],
    [{ ...ok, read_only_reason: 'admin_suspended' }, 'admin_suspended'],
  ])('blocks %j as %s', (tenant, expected) => expect(renewalBlock(tenant)).toBe(expected));
  it('explains the remaining refusals and the missing payment account', () => {
    expect(checkoutError({ message: 'TENANT_NOT_ELIGIBLE_FOR_DRAFT' })).toContain(ROOMQC_CONTACT_EMAIL);
    expect(checkoutError({ message: 'SUBSCRIPTION_PAYMENT_ACCOUNT_NOT_CONFIGURED' })).toContain('chưa mở nhận thanh toán');
  });
});

describe('payment instructions from the server', () => {
  const ok = { payable: true, amount: 150000, transaction_reference: 'RQC0123456789AB', bank_code: 'VCB',
    bank_name: 'Vietcombank', account_number: '0011223344', account_holder: 'ROOMQC', qr_template: 'compact' };
  it('accepts a complete instruction', () => expect(readPaymentInstructions(ok)).toMatchObject({ payable: true, amount: 150000 }));
  it.each([null, [], {}, { ...ok, payable: false }, { ...ok, amount: 0 }, { ...ok, amount: 'x' },
    { ...ok, transaction_reference: ' ' }, { ...ok, account_number: '' }, { ...ok, bank_code: undefined }])(
    'treats an incomplete instruction as not payable: %j', value => {
      expect(readPaymentInstructions(value)).toEqual({ payable: false });
    });
});
