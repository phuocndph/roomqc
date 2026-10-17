import { describe, expect, it } from 'vitest';
import { readSubscriptionJobMonitor, subscriptionJobMonitorError } from './subscription-job-monitor';

const stamp = '2026-10-17T12:00:00Z';
const result = () => ({ subscription_status: 'success', staff_status: 'success', to_grace_period: 1, to_suspended: 2, notifications_sent: 3, notifications_failed: 0, transition_outcome_unknown: false, recovery_required: false, error_codes: [] });
const run = () => ({ id: '00000000-0000-4000-8000-000000000001', job: 'check-subscription-status', scope: 'cluster', status: 'success', started_at: stamp, finished_at: stamp, deadline_at: '2026-10-17T12:05:00Z', blocked_by: null, summary: result() });
const page = () => ({ job: 'check-subscription-status', scope: 'cluster', checked_at: stamp, scheduler_status: 'not_observed', last_success_at: null, active: null, latest_failure: null, runs: [], backlog: { eligible_grace: 0, eligible_suspend: 0, unhandled_expired_active: 0, checked_at: stamp, definition: 'legacy_predicates_only' } });

describe('subscription job monitor contract', () => {
  it('accepts no history without inventing last success or scheduler state', () => {
    expect(readSubscriptionJobMonitor(page())).toMatchObject({ last_success_at: null, runs: [], scheduler_status: 'not_observed' });
  });
  it('accepts interrupted work with no summary and failed work with staff not run', () => {
    const interrupted = { ...run(), status: 'interrupted', summary: null };
    expect(readSubscriptionJobMonitor({ ...page(), latest_failure: interrupted, runs: [interrupted] }).latest_failure?.status).toBe('interrupted');
    const failed = { ...run(), status: 'failed', summary: { ...result(), subscription_status: 'failed', staff_status: 'not_run', transition_outcome_unknown: true } };
    expect(readSubscriptionJobMonitor({ ...page(), runs: [failed] }).runs[0].summary?.staff_status).toBe('not_run');
  });
  it.each([
    { ...page(), backlog: { ...page().backlog, eligible_grace: -1 } },
    { ...page(), backlog: { ...page().backlog, eligible_suspend: '0' } },
    { ...page(), scheduler_status: 'healthy' },
    { ...page(), checked_at: 'today' },
    { ...page(), runs: Array(26).fill(run()) },
    { ...page(), runs: [run(), run()] },
    { ...page(), active: run() },
    { ...page(), latest_failure: { ...run(), status: 'busy' } },
    { ...page(), runs: [{ ...run(), deadline_at: '2020-01-01T00:00:00Z' }] },
    { ...page(), runs: [{ ...run(), summary: { ...result(), recovery_required: true } }] },
    { ...page(), runs: [{ ...run(), summary: { ...result(), staff_status: 'not_run' } }] },
  ])('rejects malformed or misleading monitor response %#', value => {
    expect(() => readSubscriptionJobMonitor(value)).toThrow();
  });
  it('distinguishes access, missing schema and network errors without leaking raw details', () => {
    expect(subscriptionJobMonitorError({ code: '42501', message: 'secret log' })).toMatch(/Phiên quản trị/);
    expect(subscriptionJobMonitorError({ code: 'PGRST202' })).toMatch(/cập nhật schema/);
    expect(subscriptionJobMonitorError(new TypeError('secret endpoint'))).toMatch(/kết nối hoặc máy chủ/);
    expect(subscriptionJobMonitorError(new TypeError('secret endpoint'))).not.toContain('secret');
  });
});
