import { z } from 'zod';

const commandSchema = z.object({
  requestId: z.string().uuid(), note: z.string().min(1).max(2000).refine(value => value === value.trim()),
  action: z.enum(['create', 'note']), version: z.number().int().positive().nullable(),
}).strict().refine(value => value.action === 'create' ? value.version === null : value.version !== null);
const recordSchema = z.object({
  format: z.literal(1), actorId: z.string().uuid(), tenantId: z.string().uuid(), paymentId: z.string().uuid(),
  command: commandSchema,
}).strict();
export type CaseCommand = z.infer<typeof commandSchema>;
export type CaseCommandScope = { actorId: string; tenantId: string; paymentId: string };
export const CASE_STORAGE_ERROR = 'Không thể bảo toàn lệnh đang chờ trong tab này. Chưa gửi thêm lệnh. Hãy khôi phục bộ nhớ phiên rồi tải lại hồ sơ; không xóa dữ liệu trình duyệt khi chưa đối chiếu kết quả.';

// sessionStorage deliberately limits plaintext notes to this tab's browser session.
// Do not expire/delete unresolved commands: that would silently allow duplicate IDs.
// Closing the tab, clearing browser data, or moving devices requires manual history
// reconciliation; this is reload/remount recovery, not a cross-device command queue.
function key(scope: CaseCommandScope) {
  return `roomqc:case-pending:v1:${scope.actorId}:${scope.tenantId}:${scope.paymentId}`;
}
function storage() { return window.sessionStorage; }
export function loadCaseCommand(scope: CaseCommandScope): CaseCommand | null {
  const raw = storage().getItem(key(scope));
  if (raw === null) return null;
  const record = recordSchema.parse(JSON.parse(raw));
  if (record.actorId !== scope.actorId || record.tenantId !== scope.tenantId || record.paymentId !== scope.paymentId) {
    throw new Error('CASE_COMMAND_SCOPE_MISMATCH');
  }
  return record.command;
}
function same(a: CaseCommand | null, b: CaseCommand) {
  return a?.requestId === b.requestId && a.note === b.note && a.action === b.action && a.version === b.version;
}
export function persistCaseCommand(scope: CaseCommandScope, command: CaseCommand) {
  const record = recordSchema.parse({ format: 1, ...scope, command });
  const existing = loadCaseCommand(scope);
  if (existing && !same(existing, command)) throw new Error('CASE_COMMAND_ALREADY_PENDING');
  storage().setItem(key(scope), JSON.stringify(record));
  // Fail closed even with a storage implementation that silently drops writes.
  if (!same(loadCaseCommand(scope), command)) throw new Error('CASE_COMMAND_NOT_PERSISTED');
}
export function clearCaseCommand(scope: CaseCommandScope, command: CaseCommand) {
  const existing = loadCaseCommand(scope);
  if (existing && !same(existing, command)) throw new Error('CASE_COMMAND_CHANGED');
  storage().removeItem(key(scope));
  if (loadCaseCommand(scope) !== null) throw new Error('CASE_COMMAND_NOT_CLEARED');
}
