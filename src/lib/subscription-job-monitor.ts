import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative().safe();
const summary = z.object({
  subscription_status: z.enum(['success', 'failed']),
  staff_status: z.enum(['success', 'failed', 'not_run']),
  to_grace_period: count, to_suspended: count,
  notifications_sent: count, notifications_failed: count,
  transition_outcome_unknown: z.boolean(), recovery_required: z.boolean(),
  error_codes: z.array(z.string().max(100)).max(100),
});
const run = z.object({
  id: z.string().uuid(), job: z.literal('check-subscription-status'), scope: z.literal('cluster'),
  status: z.enum(['running', 'success', 'failed', 'busy', 'interrupted']),
  started_at: timestamp, finished_at: timestamp.nullable(), deadline_at: timestamp,
  blocked_by: z.string().uuid().nullable(), summary: summary.nullable(),
});
const monitor = z.object({
  job: z.literal('check-subscription-status'), scope: z.literal('cluster'), checked_at: timestamp,
  scheduler_status: z.literal('not_observed'), last_success_at: timestamp.nullable(),
  active: run.nullable(), latest_failure: run.nullable(), runs: z.array(run).max(25),
  backlog: z.object({
    eligible_grace: count, eligible_suspend: count, unhandled_expired_active: count,
    checked_at: timestamp, definition: z.literal('legacy_predicates_only'),
  }),
});
export type SubscriptionJobRun = z.infer<typeof run>;
export type SubscriptionJobMonitorData = z.infer<typeof monitor>;

export function readSubscriptionJobMonitor(value: unknown): SubscriptionJobMonitorData {
  const parsed = monitor.parse(value);
  const allRuns = [...parsed.runs, ...(parsed.active ? [parsed.active] : []), ...(parsed.latest_failure ? [parsed.latest_failure] : [])];
  if (new Set(parsed.runs.map(item => item.id)).size !== parsed.runs.length
    || (parsed.active && !['running', 'interrupted'].includes(parsed.active.status))
    || (parsed.latest_failure && !['failed', 'interrupted'].includes(parsed.latest_failure.status))
    || allRuns.some(item => Date.parse(item.deadline_at) < Date.parse(item.started_at)
      || (item.finished_at !== null && Date.parse(item.finished_at) < Date.parse(item.started_at))
      || (item.status === 'running' && (item.finished_at !== null || item.summary !== null || item.blocked_by !== null))
      || (item.status === 'interrupted' && (item.blocked_by !== null
        || (item.summary === null ? item.finished_at !== null
          : item.finished_at === null || !item.summary.transition_outcome_unknown
            || !item.summary.recovery_required || item.summary.subscription_status !== 'failed')))
      || (item.status === 'busy' && (item.finished_at === null || item.blocked_by === null || item.summary !== null))
      || (item.status === 'failed' && (item.finished_at === null || !item.summary
        || item.blocked_by !== null || !item.summary.recovery_required
        || (item.summary.subscription_status === 'success' && item.summary.staff_status === 'success')))
      || (item.status === 'success' && (item.finished_at === null || !item.summary
        || item.summary.subscription_status !== 'success' || item.summary.staff_status !== 'success'
        || item.summary.notifications_failed > 0 || item.summary.transition_outcome_unknown
        || item.summary.recovery_required)))) throw new Error('INVALID_JOB_MONITOR_RESPONSE');
  return parsed;
}

export function subscriptionJobMonitorError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303', '401', '403'].includes(String(code))) {
    return 'Phiên quản trị không còn hợp lệ hoặc không có quyền. Vui lòng đăng nhập lại và kiểm tra quyền.';
  }
  if (code === 'PGRST202' || code === '42883') {
    return 'Máy chủ chưa có chức năng giám sát tương thích. Cần cập nhật schema; không thể suy ra tác vụ đã chạy.';
  }
  if (error instanceof z.ZodError || (error instanceof Error && error.message === 'INVALID_JOB_MONITOR_RESPONSE')) {
    return 'Dữ liệu giám sát không đúng định dạng. Chưa thể xác nhận kết quả tác vụ.';
  }
  return 'Không tải được giám sát (kết nối hoặc máy chủ). Hãy tải lại; không coi đây là số liệu 0 hay tác vụ thành công.';
}

export const subscriptionJobStatusLabels: Record<SubscriptionJobRun['status'], string> = {
  running: 'Đang chạy', success: 'Thành công', failed: 'Thất bại', busy: 'Bỏ qua vì đang bận', interrupted: 'Bị gián đoạn — cần kiểm tra',
};
