// A display guard, not payment authorization. Server settlement remains the
// authority; never offer a QR for a technical draft or a terminal transaction.
export interface SubscriptionPaymentSummary {
  payment_status?: string | null;
  payment_method?: string | null;
  transaction_reference?: string | null;
  amount?: number | null;
  metadata?: unknown;
  invoice?: { status?: string | null; subscription_quote_id?: string | null } | null;
}
export function isNonPayableSubscriptionDraft(payment: SubscriptionPaymentSummary): boolean {
  const metadata = payment.metadata;
  return Boolean(payment.invoice?.subscription_quote_id || payment.invoice?.status === 'draft'
    || (metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      && ((metadata as Record<string, unknown>).type === 'quote_draft'
        || (metadata as Record<string, unknown>).checkout_enabled === false)));
}
export function canDisplaySubscriptionTransferQR(payment: SubscriptionPaymentSummary): boolean {
  const metadata = payment.metadata;
  // No currently deployed checkout issues this capability. Legacy browser-
  // priced orders require reconciliation, not a fresh transfer instruction.
  const enabled = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).checkout_enabled === true;
  return Boolean(enabled) && !isNonPayableSubscriptionDraft(payment) && payment.payment_status === 'pending'
    && payment.payment_method === 'bank_transfer'
    && Number.isFinite(payment.amount) && (payment.amount ?? 0) > 0
    && Boolean(payment.transaction_reference?.trim())
    && !['paid', 'cancelled'].includes(payment.invoice?.status ?? '');
}
