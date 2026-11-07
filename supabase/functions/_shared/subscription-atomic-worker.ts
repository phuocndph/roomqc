// Every mutable operation goes through the run-fenced, transactional batch RPC.
// The legacy helper is retained solely for old accounting regression tests.
export type ExecutionScope = { kind: 'cluster' } | { kind: 'tenants'; tenant_ids: string[] };
interface RpcResult { data: unknown; error: unknown }
export interface AtomicJobDependencies {
  authorize(req: Request, headers: Record<string, string>): Response | null;
  configured(): boolean;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  uuid(): string;
  monotonicNow(): number;
  log(result: Record<string, unknown>): void;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseExecutionScope(body: unknown): ExecutionScope {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('scope' in body))
    throw new Error('EXPLICIT_JOB_SCOPE_REQUIRED');
  const scope = body.scope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || !('kind' in scope)) throw new Error('INVALID_JOB_SCOPE');
  if (scope.kind === 'cluster' && Object.keys(scope).length === 1) return { kind: 'cluster' };
  if (scope.kind !== 'tenants' || Object.keys(scope).length !== 2 || !('tenant_ids' in scope)
    || !Array.isArray(scope.tenant_ids) || scope.tenant_ids.length < 1 || scope.tenant_ids.length > 100
    || scope.tenant_ids.some(id => typeof id !== 'string' || !uuid.test(id))) throw new Error('INVALID_JOB_SCOPE');
  const ids = scope.tenant_ids.map((id: string) => id.toLowerCase()).sort();
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_JOB_SCOPE');
  return { kind: 'tenants', tenant_ids: ids };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JOB_RECEIPT');
  return value as Record<string, unknown>;
}
function sameScope(value: unknown, scope: ExecutionScope): boolean {
  try { return JSON.stringify(parseExecutionScope({ scope: value })) === JSON.stringify(scope); } catch { return false; }
}
export function createAtomicSubscriptionJobHandler(deps: AtomicJobDependencies) {
  const headers = { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
  const respond = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), { status, headers });
  const log = (body: Record<string, unknown>) => { try { deps.log(body); } catch { /* DB receipts are authoritative. */ } };
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return respond({ success: false, error: 'METHOD_NOT_ALLOWED' }, 405);
    const denied = deps.authorize(req, headers); if (denied) return denied;
    let scope: ExecutionScope;
    try {
      const text = await req.text(); if (text.length > 16384) throw new Error('INVALID_JOB_SCOPE');
      scope = parseExecutionScope(JSON.parse(text));
    } catch { return respond({ success: false, error: 'EXPLICIT_VALID_JOB_SCOPE_REQUIRED', work_started: false }, 400); }
    if (!deps.configured()) return respond({ success: false, error: 'JOB_NOT_CONFIGURED', work_started: false }, 503);
    const runId = deps.uuid();
    const base = { job: 'check-subscription-status', run_id: runId, scope: scope.kind, execution_scope: scope };
    try {
      const result = await deps.rpc('begin_atomic_subscription_status_run', { p_run_id: runId, p_scope: scope });
      if (result.error) throw new Error('JOB_HISTORY_START_FAILED');
      const started = object(result.data);
      if (started.run_id !== runId || typeof started.acquired !== 'boolean' || !sameScope(started.execution_scope, scope)
        || !['running', 'success', 'failed', 'busy', 'interrupted'].includes(String(started.status))
        || !(started.blocked_by === null || (typeof started.blocked_by === 'string' && uuid.test(started.blocked_by)))
        || (started.acquired && (started.status !== 'running' || started.blocked_by !== null))) throw new Error('INVALID_JOB_START');
      if (!started.acquired) return respond({ ...base, success: false, error: 'JOB_RUN_NOT_ACQUIRED',
        status: started.status, blocked_by: started.blocked_by, history_recorded: true }, 409);
    } catch {
      const failed = { ...base, success: false, error: 'JOB_HISTORY_START_FAILED', work_started: false,
        history_recorded: null, recovery_required: true, retry_policy: 'manual_review_before_replay' };
      log(failed); return respond(failed, 503);
    }
    let index = 0, done = false, unknown = false;
    const deadline = deps.monotonicNow() + 50000;
    for (let batch = 0; batch < 80 && deps.monotonicNow() < deadline && !done; batch++) {
      const requestId = deps.uuid(); let receipt: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 2 && !receipt; attempt++) {
        try {
          const result = await deps.rpc('process_subscription_lifecycle_batch', {
            p_run_id: runId, p_request_id: requestId, p_expected_batch_index: index, p_limit: 50,
          });
          if (result.error) throw new Error('BATCH_FAILED');
          const data = object(result.data);
          if (data.run_id !== runId || data.request_id !== requestId || data.batch_index !== index + 1
            || typeof data.done !== 'boolean' || !sameScope(data.execution_scope, scope)
            || !['grace', 'suspend', 'delivery', 'staff', 'done'].includes(String(data.phase))
            || data.done !== (data.phase === 'done') || typeof data.processed !== 'number'
            || !Number.isInteger(data.processed) || data.processed < 0 || data.processed > 50)
            throw new Error('INVALID_BATCH_RECEIPT');
          receipt = data;
        } catch { /* Same request/index: replay the durable commit, never advance blindly. */ }
      }
      if (!receipt) { unknown = true; break; }
      index++; done = receipt.done === true;
    }
    let finished: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 2 && !finished; attempt++) {
      try {
        const result = await deps.rpc('finish_atomic_subscription_status_run', { p_run_id: runId, p_outcome_unknown: unknown });
        if (result.error) throw new Error('JOB_FINISH_FAILED');
        const data = object(result.data), summary = object(data.summary);
        if (data.recorded !== true || !['success', 'failed', 'interrupted'].includes(String(data.status))
          || !sameScope(data.execution_scope, scope)
          || !['success', 'failed'].includes(String(summary.subscription_status))
          || !['success', 'failed', 'not_run'].includes(String(summary.staff_status))
          || typeof summary.transition_outcome_unknown !== 'boolean') throw new Error('INVALID_FINISH_RECEIPT');
        if (data.status === 'success' && (!done || unknown || summary.subscription_status !== 'success'
          || summary.staff_status !== 'success' || summary.transition_outcome_unknown)) throw new Error('INCOMPLETE_JOB_SUCCESS');
        finished = data;
      } catch { /* Same run and outcome: completion is also replay safe. */ }
    }
    if (!finished) {
      const failed = { ...base, success: false, error: 'JOB_HISTORY_FINISH_FAILED', history_recorded: null,
        recovery_required: true, work_may_have_committed: true, retry_policy: 'manual_review_before_replay' };
      log(failed); return respond(failed, 503);
    }
    const result = { ...base, success: finished.status === 'success', status: finished.status,
      history_recorded: true, scope_complete: done && !unknown, summary: finished.summary,
      retry_policy: finished.status === 'success' ? 'not_required' : 'manual_review_before_replay' };
    log(result); return respond(result, result.success ? 200 : unknown ? 503 : 500);
  };
}
