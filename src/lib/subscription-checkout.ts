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
    TENANT_NOT_ELIGIBLE_FOR_DRAFT: 'Tài khoản đang bị hạn chế. Vui lòng liên hệ hỗ trợ để được khôi phục trước khi tạo đơn.',
    PAID_INVOICE_REQUIRES_RECONCILIATION: 'Hóa đơn đã có thanh toán. Không thể hủy; vui lòng liên hệ hỗ trợ để đối soát.',
    SUBSCRIPTION_LEGACY_ORDER_REQUIRES_REVIEW: 'Đơn cũ cần được đối soát trước khi thanh toán. Không chuyển khoản thêm.',
    SUBSCRIPTION_DRAFT_NOT_PAYABLE: 'Bản nháp chưa được phép thanh toán. Không chuyển khoản.',
  };
  return messages[message] ?? 'Không thể hoàn tất yêu cầu. Vui lòng thử lại hoặc liên hệ hỗ trợ.';
}
