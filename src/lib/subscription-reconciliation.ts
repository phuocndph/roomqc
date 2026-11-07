import { z } from 'zod';

export const reconciliationFlags = {
  legacy_unverified: 'Đơn cũ chưa xác thực giá',
  non_payable_draft: 'Bản nháp — không thanh toán',
  stale_pending: 'Chờ quá 24 giờ',
  missing_invoice: 'Thiếu hóa đơn liên kết',
  invoice_tenant_mismatch: 'Hóa đơn khác khách hàng',
  paid_parent_pending: 'Hóa đơn đã có thanh toán nhưng đơn còn chờ',
  closed_parent_pending: 'Hóa đơn đã hủy nhưng đơn còn chờ',
  completed_invoice_unpaid: 'Giao dịch hoàn tất, hóa đơn chưa ghi nhận đã trả',
  draft_completed: 'Nháp bị ghi nhận hoàn tất',
  amount_mismatch: 'Số tiền giao dịch khác tổng hóa đơn',
  invalid_payment_value: 'Cần kiểm tra số tiền hoặc loại tiền',
  missing_created_at: 'Thiếu thời điểm tạo',
  shared_pending_invoice: 'Nhiều đơn đang chờ chung hóa đơn',
} as const;

export type ReconciliationFilter = 'all' | 'attention' | 'legacy' | 'stale';
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
const cursor = z.object({ created_at: timestamp, id: z.string().uuid() });
const pageSchema = z.object({
  rows: z.array(z.object({
    id: z.string().uuid(), tenant_id: z.string().uuid(), invoice_id: z.string().uuid().nullable(),
    amount: z.number().finite(), currency: z.string(), payment_status: z.enum(['pending', 'completed']),
    created_at: timestamp, invoice_number: z.string().nullable(), invoice_status: z.string().nullable(),
    flags: z.array(z.string()),
  })).max(100),
  has_more: z.boolean(), checked_at: timestamp, next_cursor: cursor.nullable(),
});
export type ReconciliationCursor = z.infer<typeof cursor>;
export type ReconciliationPage = z.infer<typeof pageSchema>;

export function readReconciliationPage(value: unknown, tenantId: string): ReconciliationPage {
  const page = pageSchema.parse(value);
  const last = page.rows.at(-1);
  if (page.rows.some(row => row.tenant_id !== tenantId)
    || new Set(page.rows.map(row => row.id)).size !== page.rows.length
    || (page.has_more && (!last || page.next_cursor?.id !== last.id
      || page.next_cursor?.created_at !== last.created_at))
    || (!page.has_more && page.next_cursor !== null)) throw new Error('INVALID_RECONCILIATION_RESPONSE');
  return page;
}

export function reconciliationError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === '42501') return 'Bạn cần phiên đăng nhập quản trị nền tảng còn hiệu lực. Vui lòng đăng nhập lại hoặc kiểm tra quyền.';
  if (code === 'PT404') return 'Không tìm thấy khách hàng. Đóng cửa sổ và tải lại danh sách.';
  return 'Không tải được dữ liệu đối soát. Vui lòng thử lại; chưa có dữ liệu nào bị thay đổi.';
}
