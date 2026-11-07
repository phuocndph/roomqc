import { describe, expect, it } from 'vitest';
import { checkoutError, readSubscriptionQuote } from './subscription-checkout';
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
