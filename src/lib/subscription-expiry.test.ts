import { describe, expect, it, vi } from 'vitest';
import { runSubscriptionExpiry } from '../../supabase/functions/_shared/subscription-expiry';

describe('atomic subscription expiry worker', () => {
  const valid = { expired_count: 2, cancelled_invoices: 1, skipped_count: 0, busy: false };
  it('calls one bounded atomic RPC rather than a fetch/update sequence', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: valid, error: null });
    expect(await runSubscriptionExpiry({ rpc })).toEqual(valid);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('expire_pending_subscription_payments', { p_limit: 500 });
  });
  it('reports another active sweep without inventing work', async () => {
    const busy = { expired_count: 0, cancelled_invoices: 0, skipped_count: 0, busy: true };
    expect(await runSubscriptionExpiry({ rpc: vi.fn().mockResolvedValue({ data: busy, error: null }) })).toEqual(busy);
  });
  it('propagates DB errors instead of reporting a partial success', async () => {
    const error = new Error('fixture database failure');
    await expect(runSubscriptionExpiry({ rpc: vi.fn().mockResolvedValue({ data: null, error }) })).rejects.toBe(error);
  });
  it.each([null, [], {}, { ...valid, expired_count: -1 }, { ...valid, expired_count: '2' },
    { ...valid, expired_count: 1.5 }, { ...valid, cancelled_invoices: 3 }, { ...valid, skipped_count: null },
    { ...valid, busy: 'false' }, { ...valid, busy: true }])('rejects malformed results: %j', async value => {
    await expect(runSubscriptionExpiry({ rpc: vi.fn().mockResolvedValue({ data: value, error: null }) })).rejects.toThrow('Invalid expiry result');
  });
});
