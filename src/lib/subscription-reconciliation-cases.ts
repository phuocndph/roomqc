import { z } from 'zod';

const uuid = z.string().uuid();
const timestamp = z.string().refine(value => Number.isFinite(Date.parse(value)));
const caseSchema = z.object({
  id: uuid, payment_id: uuid, tenant_id: uuid, invoice_id: uuid.nullable(),
  status: z.literal('open'), version: z.number().int().positive(),
  created_by: uuid, created_at: timestamp, updated_at: timestamp,
  source_snapshot: z.object({
    captured_at: timestamp, payment_status: z.enum(['pending', 'completed']),
    amount: z.number().finite(), currency: z.string(),
    invoice_status: z.string().nullable(), invoice_same_tenant: z.boolean(),
  }),
});
const eventSchema = z.object({
  id: uuid, case_id: uuid, version: z.number().int().positive(), actor_id: uuid,
  request_id: uuid, action: z.enum(['create', 'note']), note: z.string().min(1).max(2000),
  before_state: caseSchema.nullable(), after_state: caseSchema, created_at: timestamp,
});
const pageSchema = z.object({
  source: z.object({ id: uuid, tenant_id: uuid, can_create: z.boolean() }),
  case: caseSchema.nullable(), events: z.array(eventSchema).max(50),
  has_more: z.boolean(), next_before_version: z.number().int().positive().nullable(), checked_at: timestamp,
});
export type ReconciliationCasePage = z.infer<typeof pageSchema>;
export type ReconciliationCase = z.infer<typeof caseSchema>;

export function readCasePage(value: unknown, tenantId: string, paymentId: string, before?: number): ReconciliationCasePage {
  const page = pageSchema.parse(value);
  const item = page.case;
  const last = page.events.at(-1);
  if (page.source.tenant_id !== tenantId || page.source.id !== paymentId
    || (item && (item.tenant_id !== tenantId || item.payment_id !== paymentId))
    || (!item && (page.events.length > 0 || page.has_more))
    || (item && before === undefined && page.events[0]?.version !== item.version)
    || new Set(page.events.map(event => event.id)).size !== page.events.length
    || (page.has_more && (page.events.length !== 50 || last?.version !== page.next_before_version))
    || (!page.has_more && page.next_before_version !== null)
    || page.events.some((event, index) => event.case_id !== item?.id || event.version > item.version
      || (before !== undefined && event.version >= before)
      || (index > 0 && event.version >= page.events[index - 1].version)
      || event.after_state.id !== item.id || event.after_state.tenant_id !== tenantId
      || event.after_state.payment_id !== paymentId || event.after_state.version !== event.version
      || (event.action === 'create' && (event.version !== 1 || event.before_state !== null))
      || (event.action === 'note' && (!event.before_state || event.before_state.id !== item.id
        || event.before_state.tenant_id !== tenantId || event.before_state.payment_id !== paymentId
        || event.before_state.version !== event.version - 1)))) {
    throw new Error('INVALID_CASE_RESPONSE');
  }
  return page;
}

export function readCaseMutation(value: unknown, tenantId: string, paymentId: string) {
  const result = z.object({ case: caseSchema, created: z.boolean() }).parse(value);
  if (result.case.tenant_id !== tenantId || result.case.payment_id !== paymentId) throw new Error('INVALID_CASE_RESPONSE');
  return result;
}

export function reconciliationCaseError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === '42501') return 'Phiên quản trị không còn đủ quyền. Vui lòng đăng nhập lại; không tiếp tục ghi hồ sơ.';
  if (code === 'PGRST202' || code === '42883') return 'Chức năng hồ sơ chưa được cài đặt trên máy chủ. Chưa thể tạo hoặc ghi chú.';
  if (code === 'PT409') return 'Hồ sơ hoặc nguồn đã thay đổi. Tải lại và kiểm tra lịch sử trước khi ghi tiếp.';
  if (code === 'PT404') return 'Không tìm thấy hồ sơ hoặc giao dịch nguồn. Tải lại danh sách đối soát.';
  return 'Không xác nhận được kết quả. Tải lại để kiểm tra, hoặc thử lại cùng nội dung; không tự coi là đã lưu.';
}
