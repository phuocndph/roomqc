// Keep the worker transport thin: financial changes belong in one DB RPC.
interface ExpiryClient {
  rpc(name: 'expire_pending_subscription_payments', args: { p_limit: number }): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}
export interface SubscriptionExpiryResult {
  expired_count: number;
  cancelled_invoices: number;
  skipped_count: number;
  busy: boolean;
}
export async function runSubscriptionExpiry(client: ExpiryClient): Promise<SubscriptionExpiryResult> {
  const { data, error } = await client.rpc('expire_pending_subscription_payments', { p_limit: 500 });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid expiry result');
  const result = data as Record<string, unknown>;
  for (const field of ['expired_count', 'cancelled_invoices', 'skipped_count']) {
    if (!Number.isSafeInteger(result[field]) || Number(result[field]) < 0) throw new Error('Invalid expiry result');
  }
  if (typeof result.busy !== 'boolean' || Number(result.cancelled_invoices) > Number(result.expired_count)
    || (result.busy && ['expired_count', 'cancelled_invoices', 'skipped_count'].some(field => result[field] !== 0))) {
    throw new Error('Invalid expiry result');
  }
  return {
    expired_count: Number(result.expired_count),
    cancelled_invoices: Number(result.cancelled_invoices),
    skipped_count: Number(result.skipped_count),
    busy: result.busy,
  };
}
