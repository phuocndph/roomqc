import { describe, expect, it, vi } from 'vitest';
import {
  createSubscriptionJobHandler, runStaffPresenceJob, runSubscriptionStatusJob,
  type SubscriptionJobResult, type SubscriptionJobStore,
} from '../../supabase/functions/_shared/subscription-job';

const now = '2026-10-17T10:00:00.000Z';
const tenant = (id = 'fixture-tenant') => ({ id, grace_period_ends_at: '2026-10-20T10:00:00.000Z' });
const dbError = { message: 'SECRET_DB_URL tenant@example.invalid', details: 'secret token' };
function store() {
  return {
    transition: vi.fn().mockResolvedValue({ data: [], error: null }),
    owner: vi.fn().mockResolvedValue({ data: { id: 'fixture-owner' }, error: null }),
    notify: vi.fn().mockResolvedValue({ error: null }),
  } satisfies SubscriptionJobStore;
}
const successful: SubscriptionJobResult = {
  status: 'success', to_grace_period: 0, to_suspended: 0, notifications_sent: 0,
  notifications_failed: 0, transition_outcome_unknown: false, recovery_required: false, error_codes: [],
};

describe('subscription status failure accounting', () => {
  it('checks both phases with one frozen timestamp and counts returned rows only', async () => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: [tenant()], error: null })
      .mockResolvedValueOnce({ data: [tenant('second')], error: null });
    const result = await runSubscriptionStatusJob(db, now);
    expect(db.transition.mock.calls).toEqual([['grace_period', now], ['suspended', now]]);
    expect(result).toEqual({ ...successful, to_grace_period: 1, to_suspended: 1, notifications_sent: 2 });
    expect(db.notify).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'fixture-tenant', user_id: 'fixture-owner' }));
    expect(db.notify.mock.calls[0][0].body).not.toContain('7 ngày');
  });
  it('reports empty successful sweep without fabricating notification work', async () => {
    const db = store();
    expect(await runSubscriptionStatusJob(db, now)).toEqual(successful);
    expect(db.owner).not.toHaveBeenCalled();
    expect(db.notify).not.toHaveBeenCalled();
  });
  it('stops after failed first transition, marks unknown outcome and redacts errors', async () => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: null, error: dbError });
    const result = await runSubscriptionStatusJob(db, now);
    expect(result).toMatchObject({ status: 'failed', transition_outcome_unknown: true, recovery_required: true,
      error_codes: ['GRACE_TRANSITION_FAILED'] });
    expect(db.transition).toHaveBeenCalledTimes(1);
    expect(db.notify).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
  it('preserves known grace work when later suspension fails', async () => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: [tenant()], error: null }).mockRejectedValueOnce(dbError);
    expect(await runSubscriptionStatusJob(db, now)).toMatchObject({ status: 'failed',
      to_grace_period: 1, notifications_sent: 1, transition_outcome_unknown: true,
      error_codes: ['SUSPEND_TRANSITION_FAILED'] });
  });
  it.each([null, {}, [null], [{}], [{ id: '', grace_period_ends_at: null }],
    [{ id: 'x', grace_period_ends_at: 'invalid' }], [tenant(), tenant()]])('rejects malformed transition result %j', async data => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data, error: null });
    expect(await runSubscriptionStatusJob(db, now)).toMatchObject({ status: 'failed',
      transition_outcome_unknown: true, error_codes: ['GRACE_TRANSITION_FAILED'] });
  });
  it.each([
    { data: null, error: null }, { data: {}, error: null }, { data: { id: '' }, error: null },
    { data: { id: 'owner' }, error: dbError },
  ])('accounts for missing/ambiguous/failed owner lookup %j', async owner => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: [tenant()], error: null });
    db.owner.mockResolvedValueOnce(owner);
    expect(await runSubscriptionStatusJob(db, now)).toMatchObject({ status: 'failed',
      notifications_sent: 0, notifications_failed: 1, recovery_required: true,
      error_codes: ['OWNER_LOOKUP_FAILED'] });
    expect(db.notify).not.toHaveBeenCalled();
  });
  it('continues unrelated notifications when an owner query throws', async () => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: [tenant(), tenant('second')], error: null });
    db.owner.mockRejectedValueOnce(dbError);
    expect(await runSubscriptionStatusJob(db, now)).toMatchObject({ status: 'failed',
      notifications_failed: 1, notifications_sent: 1 });
  });
  it.each(['resolved', 'thrown'])('does not swallow %s notification failure or blindly retry', async mode => {
    const db = store();
    db.transition.mockResolvedValueOnce({ data: [tenant(), tenant('second')], error: null });
    if (mode === 'resolved') db.notify.mockResolvedValueOnce({ error: dbError });
    else db.notify.mockRejectedValueOnce(dbError);
    const result = await runSubscriptionStatusJob(db, now);
    expect(result).toMatchObject({ status: 'failed', notifications_failed: 1, notifications_sent: 1,
      transition_outcome_unknown: false, recovery_required: true, error_codes: ['NOTIFICATION_FAILED'] });
    expect(db.notify).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects invalid clock before any mutation', async () => {
    const db = store();
    await expect(runSubscriptionStatusJob(db, 'not a date')).rejects.toThrow('INVALID_CHECKED_AT');
    expect(db.transition).not.toHaveBeenCalled();
  });
});

describe('isolated staff maintenance', () => {
  it('reports staff success separately', async () => {
    expect(await runStaffPresenceJob(vi.fn().mockResolvedValue({ error: null })))
      .toEqual({ status: 'success', error_codes: [] });
  });
  it.each(['resolved', 'thrown'])('reports %s staff failure without raw data', async mode => {
    const run = mode === 'resolved' ? vi.fn().mockResolvedValue({ error: dbError }) : vi.fn().mockRejectedValue(dbError);
    expect(await runStaffPresenceJob(run)).toEqual({ status: 'failed', error_codes: ['STAFF_PRESENCE_FAILED'] });
  });
});

describe('internal subscription job HTTP contract', () => {
  function dependencies() {
    return {
      authorize: vi.fn().mockReturnValue(null), configured: vi.fn().mockReturnValue(true),
      runSubscription: vi.fn().mockResolvedValue(successful),
      runStaffPresence: vi.fn().mockResolvedValue({ status: 'success', error_codes: [] }),
      now: () => now, runId: () => 'fixture-run-id', log: vi.fn(),
      history: {
        begin: vi.fn().mockResolvedValue({ data: { acquired: true, run_id: 'fixture-run-id', status: 'running', blocked_by: null }, error: null }),
        finish: vi.fn().mockImplementation((_id, result) => Promise.resolve({ data: { recorded: true,
          status: result.subscription_status === 'success' && result.staff_status === 'success' ? 'success' : 'failed' }, error: null })),
      },
    };
  }
  const request = (method = 'POST') => new Request('http://localhost/internal', { method });
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('rejects %s without authorization or side effects', async method => {
    const deps = dependencies();
    const response = await createSubscriptionJobHandler(deps)(request(method));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
    expect(deps.authorize).not.toHaveBeenCalled();
    expect(deps.runSubscription).not.toHaveBeenCalled();
  });
  it('handles preflight without starting work', async () => {
    const deps = dependencies();
    const response = await createSubscriptionJobHandler(deps)(request('OPTIONS'));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('x-cron-secret');
    expect(deps.runSubscription).not.toHaveBeenCalled();
  });
  it('denies unauthenticated requests before configuration or mutation', async () => {
    const deps = dependencies();
    deps.authorize.mockReturnValue(new Response('Forbidden', { status: 403 }));
    expect((await createSubscriptionJobHandler(deps)(request())).status).toBe(403);
    expect(deps.configured).not.toHaveBeenCalled();
    expect(deps.runSubscription).not.toHaveBeenCalled();
    expect(deps.runStaffPresence).not.toHaveBeenCalled();
  });
  it('fails closed when service configuration is absent', async () => {
    const deps = dependencies();
    deps.configured.mockReturnValue(false);
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: 'JOB_NOT_CONFIGURED' });
    expect(deps.runSubscription).not.toHaveBeenCalled();
  });
  it('retains old count fields but adds named responsibility results and local run ID', async () => {
    const deps = dependencies();
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, scope: 'cluster', run_id: 'fixture-run-id',
      checked_at: now, to_grace_period: 0, to_suspended: 0, subscription: successful,
      staff_presence: { status: 'success' } });
    expect(deps.log).toHaveBeenCalledTimes(1);
  });
  it('staff failure neither skips subscription nor becomes a false overall success', async () => {
    const deps = dependencies();
    deps.runStaffPresence.mockResolvedValue({ status: 'failed', error_codes: ['STAFF_PRESENCE_FAILED'] });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(deps.runSubscription).toHaveBeenCalledExactlyOnceWith(now);
    expect(await response.json()).toMatchObject({ success: false, subscription: { status: 'success' },
      staff_presence: { status: 'failed' } });
  });
  it('still runs staff maintenance after a subscription failure result', async () => {
    const deps = dependencies();
    deps.runSubscription.mockResolvedValue({ ...successful, status: 'failed', recovery_required: true });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(deps.runStaffPresence).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ success: false, subscription: { status: 'failed' } });
  });
  it('makes partial commit and manual-only recovery explicit after a notification failure', async () => {
    const deps = dependencies();
    deps.runSubscription.mockResolvedValue({ ...successful, status: 'failed', to_grace_period: 2,
      notifications_sent: 1, notifications_failed: 1, recovery_required: true, error_codes: ['NOTIFICATION_FAILED'] });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, partial_work_committed: true,
      retry_policy: 'manual_review_before_replay', subscription: { to_grace_period: 2,
        notifications_sent: 1, notifications_failed: 1, recovery_required: true } });
  });
  it('unexpected errors produce safe 500 instead of disclosing DB details', async () => {
    const deps = dependencies();
    deps.runSubscription.mockRejectedValue(dbError);
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, run_id: 'fixture-run-id',
      error: 'JOB_EXECUTION_FAILED', recovery_required: true, transition_outcome_unknown: true,
      retry_policy: 'manual_review_before_replay', history_recorded: true });
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('SECRET');
    expect(deps.history.finish).toHaveBeenCalledWith('fixture-run-id', expect.objectContaining({
      staff_status: 'not_run', error_codes: ['JOB_EXECUTION_FAILED'], transition_outcome_unknown: true,
    }));
  });
  it('requires durable start before subscription or staff work', async () => {
    const deps = dependencies();
    deps.history.begin.mockImplementation(async () => {
      expect(deps.runSubscription).not.toHaveBeenCalled();
      expect(deps.runStaffPresence).not.toHaveBeenCalled();
      return { data: { acquired: true, run_id: 'fixture-run-id', status: 'running', blocked_by: null }, error: null };
    });
    expect((await createSubscriptionJobHandler(deps)(request())).status).toBe(200);
    expect(deps.history.finish).toHaveBeenCalledExactlyOnceWith('fixture-run-id', expect.objectContaining({
      subscription_status: 'success', staff_status: 'success', error_codes: [],
    }));
  });
  it.each(['error', 'throw', 'missing', 'malformed', 'wrong_run'])('fails closed on %s durable start', async mode => {
    const deps = dependencies();
    if (mode === 'throw') deps.history.begin.mockRejectedValue(dbError);
    else deps.history.begin.mockResolvedValue({ data: mode === 'missing' ? null
      : { acquired: true, run_id: mode === 'wrong_run' ? 'other-run' : 'fixture-run-id',
        status: mode === 'malformed' ? 'success' : 'running', blocked_by: null }, error: mode === 'error' ? dbError : null });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: 'JOB_HISTORY_START_FAILED',
      work_started: false, history_recorded: null });
    expect(deps.runSubscription).not.toHaveBeenCalled();
    expect(deps.runStaffPresence).not.toHaveBeenCalled();
    expect(deps.history.finish).not.toHaveBeenCalled();
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('SECRET');
  });
  it.each(['busy', 'interrupted', 'running', 'success', 'failed'])('does not execute or replay an unacquired %s run', async status => {
    const deps = dependencies();
    deps.history.begin.mockResolvedValue({ data: { acquired: false, run_id: 'fixture-run-id', status, blocked_by: 'active-run' }, error: null });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, status, history_recorded: true });
    expect(deps.runSubscription).not.toHaveBeenCalled();
    expect(deps.runStaffPresence).not.toHaveBeenCalled();
    expect(deps.history.finish).not.toHaveBeenCalled();
  });
  it.each(['error', 'throw', 'missing', 'false', 'wrong_status'])('never returns success on %s durable finish', async mode => {
    const deps = dependencies();
    if (mode === 'throw') deps.history.finish.mockRejectedValue(dbError);
    else deps.history.finish.mockResolvedValue({ data: mode === 'missing' ? null
      : { recorded: mode !== 'false', status: mode === 'wrong_status' ? 'failed' : 'success' },
      error: mode === 'error' ? dbError : null });
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: 'JOB_HISTORY_FINISH_FAILED',
      execution_success: true, history_recorded: null, work_may_have_committed: true,
      retry_policy: 'manual_review_before_replay' });
    expect(deps.runSubscription).toHaveBeenCalledTimes(1);
    expect(deps.history.begin).toHaveBeenCalledTimes(1);
    expect(deps.history.finish).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(deps.log.mock.calls)).not.toContain('SECRET');
  });
  it('logging failure cannot turn a durably completed run into replay', async () => {
    const deps = dependencies();
    deps.log.mockImplementation(() => { throw dbError; });
    expect((await createSubscriptionJobHandler(deps)(request())).status).toBe(200);
    expect(deps.history.finish).toHaveBeenCalledTimes(1);
  });
  it('unexpected staff rejection retains the confirmed subscription result', async () => {
    const deps = dependencies();
    deps.runSubscription.mockResolvedValue({ ...successful, to_grace_period: 3, notifications_sent: 3 });
    deps.runStaffPresence.mockRejectedValue(dbError);
    const response = await createSubscriptionJobHandler(deps)(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ subscription: { status: 'success', to_grace_period: 3 },
      staff_presence: { status: 'failed' }, history_recorded: true });
    expect(deps.history.finish).toHaveBeenCalledWith('fixture-run-id', expect.objectContaining({
      subscription_status: 'success', staff_status: 'failed', to_grace_period: 3,
      error_codes: ['STAFF_PRESENCE_FAILED'],
    }));
  });
  it('a clock failure after durable start is recorded as failed without work or a new begin', async () => {
    const deps = dependencies();
    deps.now = () => { throw new Error('clock'); };
    expect((await createSubscriptionJobHandler(deps)(request())).status).toBe(500);
    expect(deps.runSubscription).not.toHaveBeenCalled();
    expect(deps.runStaffPresence).not.toHaveBeenCalled();
    expect(deps.history.begin).toHaveBeenCalledTimes(1);
    expect(deps.history.finish).toHaveBeenCalledWith('fixture-run-id', expect.objectContaining({
      subscription_status: 'failed', staff_status: 'not_run', error_codes: ['JOB_EXECUTION_FAILED'],
    }));
  });
});
