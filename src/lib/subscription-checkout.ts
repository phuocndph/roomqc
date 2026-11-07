import { ROOMQC_CONTACT_EMAIL } from './contact';
export interface SubscriptionQuote {
  quote_id: string;
  billed_rooms: number;
  duration_days: number;
  price_per_room_daily: number;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  period_start: string;
  period_end: string;
}
export function readSubscriptionQuote(value: unknown): SubscriptionQuote {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_QUOTE_RESPONSE');
  const q = value as Record<string, unknown>;
  if (typeof q.quote_id !== 'string' || !q.quote_id || q.currency !== 'VND' || q.checkout_enabled !== false
    || !['billed_rooms', 'duration_days', 'price_per_room_daily', 'subtotal', 'total_amount'].every(k =>
      typeof q[k] === 'number' && Number.isFinite(q[k]) && Number(q[k]) > 0)
    || typeof q.discount_amount !== 'number' || !Number.isFinite(q.discount_amount) || q.discount_amount < 0
    || typeof q.period_start !== 'string' || typeof q.period_end !== 'string') throw new Error('INVALID_QUOTE_RESPONSE');
  return q as unknown as SubscriptionQuote;
}
export function checkoutError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const messages: Record<string, string> = {
    PENDING_SUBSCRIPTION_ORDER_EXISTS: 'Bạn còn đơn đang chờ. Vào mục Đang chờ để xem hoặc hủy trước khi tạo mới.',
    QUOTE_EXPIRED: 'Báo giá đã quá hạn. Đóng và mở lại để lấy báo giá mới.',
    QUOTE_PRICE_CHANGED: 'Cấu hình giá đã thay đổi. Đóng và mở lại để lấy báo giá mới.',
    QUOTE_SUBSCRIPTION_CHANGED: 'Gói dịch vụ đã thay đổi. Đóng và mở lại để lấy báo giá mới.',
    ACTIVE_PERIOD_ROOM_CHANGE_REQUIRES_REVIEW: 'Trong kỳ đang hoạt động, hãy gia hạn giữ nguyên số phòng; dùng Mua thêm phòng để tăng số phòng.',
    ACTIVE_SUBSCRIPTION_OWNER_REQUIRED: 'Chỉ chủ khách sạn đang hoạt động mới được thực hiện. Vui lòng kiểm tra tài khoản hoặc đăng nhập lại.',
    TENANT_NOT_ELIGIBLE_FOR_DRAFT: `Tài khoản đang chờ duyệt, đã huỷ hoặc bị RoomQC tạm khoá nên chưa tạo được đơn. Liên hệ ${ROOMQC_CONTACT_EMAIL} để được hỗ trợ.`,
    PAID_INVOICE_REQUIRES_RECONCILIATION: 'Hóa đơn đã có thanh toán. Không thể hủy; vui lòng liên hệ hỗ trợ để đối soát.',
    SUBSCRIPTION_LEGACY_ORDER_REQUIRES_REVIEW: 'Đơn cũ cần được đối soát trước khi thanh toán. Không chuyển khoản thêm.',
    SUBSCRIPTION_DRAFT_NOT_PAYABLE: 'Bản nháp chưa được phép thanh toán. Không chuyển khoản.',
    SUBSCRIPTION_PAYMENT_ACCOUNT_NOT_CONFIGURED: 'RoomQC chưa mở nhận thanh toán trực tuyến. Vui lòng thử lại sau hoặc liên hệ RoomQC.',
  };
  return messages[message] ?? 'Không thể hoàn tất yêu cầu. Vui lòng thử lại hoặc liên hệ hỗ trợ.';
}

/**
 * Why the owner cannot create a renewal order online. Mirrors the server guard
 * in create_subscription_checkout_draft: an unapproved, cancelled or
 * admin-suspended tenant is refused. An expired (read-only) plan is NOT a
 * block — that is exactly the case that must be able to renew and pay.
 * Returns null while the tenant row is unknown so the UI does not block early.
 */
export type RenewalBlock = 'pending_approval' | 'cancelled' | 'admin_suspended';
export interface RenewalTenantState {
  approval_status?: string | null;
  subscription_status?: string | null;
  read_only_reason?: string | null;
}
export function renewalBlock(tenant: RenewalTenantState | null | undefined): RenewalBlock | null {
  if (!tenant) return null;
  if (tenant.approval_status !== 'approved') return 'pending_approval';
  if (tenant.subscription_status === 'cancelled') return 'cancelled';
  if (tenant.read_only_reason === 'admin_suspended') return 'admin_suspended';
  return null;
}
export const RENEWAL_BLOCK_MESSAGES: Record<RenewalBlock, { title: string; body: string }> = {
  admin_suspended: {
    title: 'Tài khoản đang bị RoomQC tạm khoá',
    body: 'Không thể gia hạn trực tuyến khi tài khoản bị tạm khoá. Liên hệ RoomQC để được hỗ trợ mở lại.',
  },
  cancelled: {
    title: 'Gói đã bị huỷ',
    body: 'Liên hệ RoomQC để đăng ký lại gói dịch vụ.',
  },
  pending_approval: {
    title: 'Tài khoản đang chờ RoomQC duyệt',
    body: 'Bạn có thể gia hạn sau khi tài khoản được duyệt. Liên hệ RoomQC nếu cần hỗ trợ sớm hơn.',
  },
};

export interface SubscriptionPaymentInstructions {
  payable: true;
  amount: number;
  transaction_reference: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_template?: string;
}
/** Validates get_subscription_payment_instructions; anything incomplete is "not payable". */
export function readPaymentInstructions(value: unknown): SubscriptionPaymentInstructions | { payable: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { payable: false };
  const v = value as Record<string, unknown>;
  const amount = Number(v.amount);
  const text = (k: string) => typeof v[k] === 'string' && (v[k] as string).trim() !== '';
  if (v.payable !== true || !Number.isFinite(amount) || amount <= 0
    || !['transaction_reference', 'bank_code', 'account_number', 'account_holder'].every(text)) return { payable: false };
  return {
    payable: true, amount,
    transaction_reference: String(v.transaction_reference), bank_code: String(v.bank_code),
    bank_name: typeof v.bank_name === 'string' ? v.bank_name : '', account_number: String(v.account_number),
    account_holder: String(v.account_holder), qr_template: typeof v.qr_template === 'string' ? v.qr_template : undefined,
  };
}
