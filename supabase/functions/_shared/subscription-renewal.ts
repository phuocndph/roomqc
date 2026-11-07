// Rules for RoomQC subscription renewal orders (payment_transactions with
// metadata.type = 'subscription_quote'). Kept pure so it can be unit tested.
//
// * The money must arrive in a platform account (bank_payment_settings with no
//   tenant and no hotel). A tenant's own collection account must never settle
//   that tenant's RoomQC subscription.
// * The amount must be at least the server-priced order total. The tenant's
//   own reconciliation tolerance (payment_tolerance_vnd) is for guest bookings
//   and is editable by the tenant, so it never applies to RoomQC fees.

export function isRenewalOrder(metadata: unknown): boolean {
  return Boolean(
    metadata && typeof metadata === "object" && !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).type === "subscription_quote",
  );
}

export function renewalPaymentAccepted(input: {
  metadata: unknown;
  expectedAmount: number;
  transferAmount: number;
  toPlatformAccount: boolean;
}): boolean {
  if (!isRenewalOrder(input.metadata)) return false;
  return input.toPlatformAccount &&
    Number.isFinite(input.expectedAmount) && input.expectedAmount > 0 &&
    Number.isFinite(input.transferAmount) &&
    input.transferAmount >= input.expectedAmount;
}
