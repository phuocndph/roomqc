// Failure accounting for the legacy worker, not a new lifecycle policy engine.
// Transitions remain separate commits. Rerunning is NOT a notification retry.
export interface TransitionedTenant {
  id: string;
  grace_period_ends_at: string | null;
}
export type Transition = 'grace_period' | 'suspended';
export interface SubscriptionJobStore {
  transition(status: Transition, now: string): PromiseLike<{ data: unknown; error: unknown }>;
  owner(tenantId: string): PromiseLike<{ data: unknown; error: unknown }>;
  notify(notification: SubscriptionNotification): PromiseLike<{ error: unknown }>;
}
export interface SubscriptionNotification {
  user_id: string;
  tenant_id: string;
  title: string;
  body: string;
  type: 'subscription';
  action_url: '/settings/subscription';
  icon: 'AlertTriangle';
}
export interface SubscriptionJobResult {
  status: 'success' | 'failed';
  to_grace_period: number;
  to_suspended: number;
  notifications_sent: number;
  notifications_failed: number;
  transition_outcome_unknown: boolean;
  recovery_required: boolean;
  error_codes: string[];
}

function tenantRows(data: unknown): TransitionedTenant[] {
  if (!Array.isArray(data)) throw new Error('INVALID_TRANSITION_RESULT');
  const ids = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id
      || ids.has(row.id) || (row.grace_period_ends_at !== null
        && (typeof row.grace_period_ends_at !== 'string' || !Number.isFinite(Date.parse(row.grace_period_ends_at))))) {
      throw new Error('INVALID_TRANSITION_RESULT');
    }
    ids.add(row.id);
  }
  return data;
}

function notification(tenant: TransitionedTenant, userId: string, status: Transition): SubscriptionNotification {
  return {
    user_id: userId, tenant_id: tenant.id, type: 'subscription',
    action_url: '/settings/subscription', icon: 'AlertTriangle',
    title: status === 'grace_period' ? 'Gói đăng ký đã hết hạn' : 'Tài khoản đã bị tạm ngưng',
    body: status === 'grace_period'
      ? 'Gói đăng ký của bạn đã hết hạn. Vui lòng kiểm tra thời hạn gia hạn trong mục Gói sử dụng để tránh bị tạm ngưng.'
      : 'Thời gian gia hạn đã hết. Tài khoản của bạn đã bị tạm ngưng. Vui lòng gia hạn để tiếp tục sử dụng.',
  };
}

export async function runSubscriptionStatusJob(store: SubscriptionJobStore, now: string): Promise<SubscriptionJobResult> {
  if (!Number.isFinite(Date.parse(now))) throw new Error('INVALID_CHECKED_AT');
  const result: SubscriptionJobResult = {
    status: 'success', to_grace_period: 0, to_suspended: 0,
    notifications_sent: 0, notifications_failed: 0,
    transition_outcome_unknown: false, recovery_required: false, error_codes: [],
  };
  const fail = (code: string) => {
    result.status = 'failed';
    result.recovery_required = true;
    if (!result.error_codes.includes(code)) result.error_codes.push(code);
  };
  for (const status of ['grace_period', 'suspended'] as const) {
    let tenants: TransitionedTenant[];
    try {
      const transition = await store.transition(status, now);
      if (transition.error) throw new Error('TRANSITION_FAILED');
      tenants = tenantRows(transition.data);
      result[status === 'grace_period' ? 'to_grace_period' : 'to_suspended'] = tenants.length;
    } catch {
      // A transport failure could happen after commit: zero is not proof of no change.
      result.transition_outcome_unknown = true;
      fail(status === 'grace_period' ? 'GRACE_TRANSITION_FAILED' : 'SUSPEND_TRANSITION_FAILED');
      break;
    }
    for (const tenant of tenants) {
      let ownerId: string;
      try {
        const owner = await store.owner(tenant.id);
        if (owner.error || !owner.data || typeof owner.data !== 'object'
          || !('id' in owner.data) || typeof owner.data.id !== 'string' || !owner.data.id) {
          throw new Error('OWNER_LOOKUP_FAILED');
        }
        ownerId = owner.data.id;
      } catch {
        result.notifications_failed++;
        fail('OWNER_LOOKUP_FAILED');
        continue;
      }
      try {
        const sent = await store.notify(notification(tenant, ownerId, status));
        if (sent.error) throw new Error('NOTIFICATION_FAILED');
        result.notifications_sent++;
      } catch {
        result.notifications_failed++;
        fail('NOTIFICATION_FAILED');
      }
    }
  }
  return result;
}

// Preserve legacy staff maintenance while reporting it as a separate responsibility.
export async function runStaffPresenceJob(run: () => PromiseLike<{ error: unknown }>) {
  try {
    const result = await run();
    if (result.error) throw new Error('STAFF_PRESENCE_FAILED');
    return { status: 'success' as const, error_codes: [] as string[] };
  } catch {
    return { status: 'failed' as const, error_codes: ['STAFF_PRESENCE_FAILED'] };
  }
}

interface HandlerDependencies {
  authorize(req: Request, headers: Record<string, string>): Response | null;
  configured(): boolean;
  runSubscription(now: string): Promise<SubscriptionJobResult>;
  runStaffPresence(): ReturnType<typeof runStaffPresenceJob>;
  now(): string;
  runId(): string;
  log(result: Record<string, unknown>): void;
}
export function createSubscriptionJobHandler(deps: HandlerDependencies) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  const respond = (body: Record<string, unknown>, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST, OPTIONS' });
    const denied = deps.authorize(req, headers);
    if (denied) return denied;
    const runId = deps.runId();
    if (!deps.configured()) return respond({ success: false, run_id: runId, error: 'JOB_NOT_CONFIGURED' }, 503);
    const checkedAt = deps.now();
    try {
      const subscription = await deps.runSubscription(checkedAt);
      const staffPresence = await deps.runStaffPresence();
      const success = subscription.status === 'success' && staffPresence.status === 'success';
      const result = {
        success, run_id: runId, job: 'check-subscription-status', scope: 'cluster',
        checked_at: checkedAt, finished_at: deps.now(),
        to_grace_period: subscription.to_grace_period, to_suspended: subscription.to_suspended,
        partial_work_committed: !success && subscription.to_grace_period + subscription.to_suspended > 0,
        retry_policy: success ? 'not_required' : 'manual_review_before_replay',
        subscription, staff_presence: staffPresence,
      };
      deps.log(result);
      return respond(result, success ? 200 : 500);
    } catch {
      // Do not expose raw SDK errors (may contain PII, tokens or connection strings).
      const failure = { success: false, run_id: runId, error: 'JOB_EXECUTION_FAILED',
        recovery_required: true, transition_outcome_unknown: true, retry_policy: 'manual_review_before_replay' };
      deps.log(failure);
      return respond(failure, 500);
    }
  };
}
