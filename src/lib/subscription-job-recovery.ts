import { z } from 'zod';

const command = z.object({
  runId: z.string().uuid(), requestId: z.string().uuid(),
  deadlineAt: z.string().datetime({ offset: true }), reason: z.string().trim().min(10).max(1000),
}).strict();
const record = z.object({ format: z.literal(1), actorId: z.string().min(1).max(128), command }).strict();
export type JobRecoveryCommand = z.infer<typeof command>;
export const JOB_RECOVERY_STORAGE_ERROR = 'Không thể bảo toàn lệnh phục hồi trong tab này. Chưa gửi thêm lệnh; hãy khôi phục bộ nhớ phiên rồi tải lại.';
const key = (actorId: string) => `roomqc:job-recovery:v1:${encodeURIComponent(actorId)}`;
export function loadJobRecovery(actorId: string): JobRecoveryCommand | null {
  const raw = window.sessionStorage.getItem(key(actorId));
  if (raw === null) return null;
  const value = record.parse(JSON.parse(raw));
  if (value.actorId !== actorId) throw new Error('JOB_RECOVERY_ACTOR_MISMATCH');
  return value.command;
}
export function persistJobRecovery(actorId: string, value: JobRecoveryCommand) {
  const normalized = record.parse({ format: 1, actorId, command: value });
  const previous = loadJobRecovery(actorId);
  if (previous && JSON.stringify(previous) !== JSON.stringify(normalized.command)) throw new Error('JOB_RECOVERY_ALREADY_PENDING');
  window.sessionStorage.setItem(key(actorId), JSON.stringify(normalized));
  if (JSON.stringify(loadJobRecovery(actorId)) !== JSON.stringify(normalized.command)) throw new Error('JOB_RECOVERY_NOT_PERSISTED');
}
export function clearJobRecovery(actorId: string, value: JobRecoveryCommand) {
  const previous = loadJobRecovery(actorId);
  if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error('JOB_RECOVERY_CHANGED');
  window.sessionStorage.removeItem(key(actorId));
  if (loadJobRecovery(actorId)) throw new Error('JOB_RECOVERY_NOT_CLEARED');
}
export function readJobRecoveryReceipt(value: unknown, expected: JobRecoveryCommand) {
  const result = z.object({ run_id: z.literal(expected.runId), request_id: z.literal(expected.requestId),
    released: z.literal(true), replayed: z.boolean() }).parse(value);
  return result;
}
