// A display guard, not payment authorization. Server settlement remains the
// authority; offer a QR only for a server-issued renewal order that is still
// pending, never for a technical draft, a legacy order or a terminal row.
export interface SubscriptionPaymentSummary {
  payment_status?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  amount?: number | null;
  metadata?: unknown;
  invoice?: { status?: string | null; subscription_quote_id?: string | null } | null;
}
function metadataOf(payment: SubscriptionPaymentSummary): Record<string, unknown> | null {
  const metadata = payment.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
}
/** Renewal order created by create_subscription_checkout_draft and settled from its server quote. */
export function isServerRenewalOrder(payment: SubscriptionPaymentSummary): boolean {
  const metadata = metadataOf(payment);
  return metadata?.type === 'subscription_quote' && metadata.checkout_enabled === true;
}
export function isNonPayableSubscriptionDraft(payment: SubscriptionPaymentSummary): boolean {
  const metadata = metadataOf(payment);
  return Boolean(payment.invoice?.status === 'draft'
    || metadata?.type === 'quote_draft' || metadata?.checkout_enabled === false
    || (payment.invoice?.subscription_quote_id && !isServerRenewalOrder(payment)));
}
export function canDisplaySubscriptionTransferQR(payment: SubscriptionPaymentSummary): boolean {
  // Legacy browser-priced orders require reconciliation, not a fresh transfer.
  return isServerRenewalOrder(payment) && !isNonPayableSubscriptionDraft(payment)
    && payment.payment_status === 'pending'
    && payment.payment_method === 'bank_transfer'
    && Number.isFinite(payment.amount) && (payment.amount ?? 0) > 0
    && Boolean(payment.transaction_reference?.trim())
    && !['paid', 'cancelled'].includes(payment.invoice?.status ?? '');
}
