// No external imports, SDK, server, env-file, or database. Run with denied
// network/env/write/run/ffi permissions. Deno.env.get is fixture-stubbed below.
import { requireCronAuth } from '../_shared/cronAuth.ts';
import {
  createSubscriptionJobHandler, runSubscriptionStatusJob,
  type SubscriptionJobStore,
} from '../_shared/subscription-job.ts';

const checkedAt = '2026-10-17T10:00:00.000Z';
const fixtureCronSecret = 'isolated-fixture-cron-not-a-real-secret';
const fixtureServiceKey = 'isolated-fixture-service-not-a-real-key';
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function fixture(test: (context: ReturnType<typeof makeContext>) => Promise<void>) {
  const originalEnvGet = Deno.env.get;
  // Save the function, NOT values. No real environment variable is ever read.
  Deno.env.get = (name: string) => ({
    CRON_SECRET: fixtureCronSecret,
    SUPABASE_SERVICE_ROLE_KEY: fixtureServiceKey,
  })[name];
  try {
    await test(makeContext());
  } finally {
    Deno.env.get = originalEnvGet;
  }
}

function makeContext() {
  const calls = { transitions: 0, owners: 0, notifications: 0, staff: 0, configured: 0, begin: 0, finish: 0 };
  const logs: unknown[] = [];
  const state = { configured: true, notificationFails: false, historyFails: false, busy: false, finishFails: false };
  const store: SubscriptionJobStore = {
    transition: status => {
      calls.transitions++;
      return Promise.resolve({ data: status === 'grace_period'
        ? [{ id: 'fixture-tenant', grace_period_ends_at: '2026-10-20T10:00:00.000Z' }] : [], error: null });
    },
    owner: () => {
      calls.owners++;
      return Promise.resolve({ data: { id: 'fixture-owner' }, error: null });
    },
    notify: () => {
      calls.notifications++;
      return Promise.resolve({ error: state.notificationFails ? { message: 'fixture-private-payload' } : null });
    },
  };
  const handler = createSubscriptionJobHandler({
    authorize: requireCronAuth,
    configured: () => { calls.configured++; return state.configured; },
    runSubscription: now => runSubscriptionStatusJob(store, now),
    runStaffPresence: () => { calls.staff++; return Promise.resolve({ status: 'success', error_codes: [] }); },
    now: () => checkedAt,
    runId: () => 'isolated-deno-fixture-run',
    log: result => logs.push(result),
    history: {
      begin: runId => {
        calls.begin++;
        return Promise.resolve({ data: { acquired: !state.busy, run_id: runId,
          status: state.busy ? 'busy' : 'running', blocked_by: state.busy ? 'fixture-active-run' : null },
          error: state.historyFails ? { message: 'fixture-private-payload' } : null });
      },
      finish: (_runId, summary) => {
        calls.finish++;
        return Promise.resolve({ data: { recorded: true,
          status: summary.subscription_status === 'success' && summary.staff_status === 'success' ? 'success' : 'failed' },
          error: state.finishFails ? { message: 'fixture-private-payload' } : null });
      },
    },
  });
  return { calls, logs, state, handler };
}

function request(method = 'POST', headers: Record<string, string> = {}) {
  // This constructs an in-memory Request only; no fetch or listener is used.
  return new Request('http://isolated.invalid/internal', { method, headers });
}

Deno.test('actual cron auth rejects absent credentials before store/configuration', () => fixture(async context => {
  const response = await context.handler(request());
  assert(response.status === 403, 'missing auth must be denied');
  assert(context.calls.configured === 0 && context.calls.transitions === 0 && context.calls.staff === 0,
    'denied request must have no work');
}));

Deno.test('actual cron auth rejects anon-like and wrong secrets', () => fixture(async context => {
  const wrongHeaders: Record<string, string>[] = [{ authorization: 'Bearer fixture-anon-not-service-role' },
    { 'x-cron-secret': 'wrong-fixture-secret' }, { authorization: `Bearer ${fixtureServiceKey}extra` }];
  for (const headers of wrongHeaders) {
    assert((await context.handler(request('POST', headers))).status === 403, 'wrong credentials must be denied');
  }
  assert(context.calls.transitions === 0 && context.calls.staff === 0, 'no work on wrong credentials');
}));

Deno.test('GET cannot mutate even when a valid fixture secret is supplied', () => fixture(async context => {
  const response = await context.handler(request('GET', { 'x-cron-secret': fixtureCronSecret }));
  assert(response.status === 405 && response.headers.get('Allow') === 'POST, OPTIONS', 'explicit method guard');
  assert(context.calls.transitions === 0 && context.calls.configured === 0, 'GET must not start work');
}));

Deno.test('OPTIONS is a side-effect-free preflight', () => fixture(async context => {
  const response = await context.handler(request('OPTIONS'));
  assert(response.status === 204, 'preflight status');
  assert(context.calls.transitions === 0 && context.calls.staff === 0, 'preflight must not start work');
}));

Deno.test('authorized missing configuration fails closed before mocked DB', () => fixture(async context => {
  context.state.configured = false;
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  const body = await response.json();
  assert(response.status === 503 && body.error === 'JOB_NOT_CONFIGURED', 'config failure must be explicit');
  assert(context.calls.transitions === 0 && context.calls.staff === 0, 'config failure must not start work');
}));

Deno.test('actual cron-secret auth permits POST with fixture store only', () => fixture(async context => {
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  const body = await response.json();
  assert(response.status === 200 && body.success === true, 'fixture work must succeed');
  assert(body.run_id === 'isolated-deno-fixture-run' && body.to_grace_period === 1, 'fixture summary');
  assert(context.calls.transitions === 2 && context.calls.notifications === 1 && context.calls.staff === 1,
    'expected fixture work only');
}));

Deno.test('actual exact service-role bearer permits fixture POST', () => fixture(async context => {
  const response = await context.handler(request('POST', { authorization: `Bearer ${fixtureServiceKey}` }));
  assert(response.status === 200 && (await response.json()).success === true, 'exact fixture service auth');
  assert(context.calls.transitions === 2, 'must execute mocked transitions');
}));

Deno.test('Deno response reports partial work safely after fixture notification failure', () => fixture(async context => {
  context.state.notificationFails = true;
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  const body = await response.json();
  assert(response.status === 500 && body.success === false, 'must not report false success');
  assert(body.partial_work_committed === true && body.retry_policy === 'manual_review_before_replay', 'recovery semantics');
  assert(body.subscription.notifications_failed === 1 && body.staff_presence.status === 'success', 'separate results');
  const exposed = JSON.stringify({ body, logs: context.logs });
  assert(!exposed.includes('fixture-private-payload') && !exposed.includes(fixtureServiceKey)
    && !exposed.includes(fixtureCronSecret), 'must not expose credentials/raw errors');
}));

Deno.test('durable history start failure prevents all mocked side effects', () => fixture(async context => {
  context.state.historyFails = true;
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  assert(response.status === 503, 'history must be mandatory');
  assert(context.calls.transitions === 0 && context.calls.staff === 0 && context.calls.finish === 0, 'fail closed');
}));

Deno.test('busy durable marker blocks concurrent work without replay', () => fixture(async context => {
  context.state.busy = true;
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  assert(response.status === 409 && (await response.json()).success === false, 'busy is not success');
  assert(context.calls.transitions === 0 && context.calls.finish === 0, 'must not touch active work');
}));

Deno.test('durable finish failure never produces HTTP success or reruns work', () => fixture(async context => {
  context.state.finishFails = true;
  const response = await context.handler(request('POST', { 'x-cron-secret': fixtureCronSecret }));
  const body = await response.json();
  assert(response.status === 503 && body.history_recorded === null, 'unknown finish must be explicit');
  assert(context.calls.begin === 1 && context.calls.finish === 1 && context.calls.transitions === 2, 'no retry');
  assert(!JSON.stringify({ body, logs: context.logs }).includes('fixture-private-payload'), 'no raw errors');
}));
