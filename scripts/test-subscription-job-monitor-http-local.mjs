// Existing manifest-owned local fixtures only. Never invokes the status worker.
// History writes use service_role inside ONE transaction that always rolls back.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.env.ROOMQC_FIXTURE_MANIFEST, 'Existing A0 local manifest required');
const manifest = JSON.parse(await readFile(process.env.ROOMQC_FIXTURE_MANIFEST, 'utf8'));
assert.equal(manifest.project, 'ehjtoajnlnuvuiwkpmbp');
assert.match(manifest.run, /^[a-f0-9]{8}$/);
const raw = execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx --no-install supabase status --output json'],
  { cwd: new URL('../', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
const local = JSON.parse(raw.slice(raw.indexOf('{')));
for (const value of [local.API_URL, local.DB_URL]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(value).hostname));
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = statement => execFileSync('docker', ['exec', '-i', 'supabase_db_ehjtoajnlnuvuiwkpmbp',
  'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
{ input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
} };
const clients = [];
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
const summary = { subscription_status: 'success', staff_status: 'success', to_grace_period: 0,
  to_suspended: 0, notifications_sent: 0, notifications_failed: 0, transition_outcome_unknown: false,
  recovery_required: false, error_codes: [] };
const stateSQL = `SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb)::text FROM private.subscription_status_job_runs r;`;
const initialState = sql(stateSQL);
try {
  const actors = {};
  for (const role of ['admin', 'owner', 'staff']) {
    const fixture = manifest.accounts[role];
    assert.equal(fixture.email, `qc-a0-${manifest.run}-${role}@example.invalid`);
    assert.ok(manifest.users.some(user => user.id === fixture.user_id && user.email === fixture.email));
    const client = createClient(local.API_URL, local.ANON_KEY, options); clients.push(client);
    const { data, error } = await client.auth.signInWithPassword({ email: fixture.email, password: 'RoomQC-A0-Local-Only!2026' });
    assert.ifError(error); assert.equal(data.user.id, fixture.user_id);
    const jwt = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString());
    actors[role] = { client, claims: { sub: jwt.sub, session_id: jwt.session_id, role: jwt.role } };
  }
  const monitor = () => actors.admin.client.rpc('admin_subscription_job_monitor');
  const before = await monitor(); assert.ifError(before.error);
  ok(before.data.job === 'check-subscription-status' && before.data.scheduler_status === 'not_observed', 'Actual Auth HTTP admin monitor succeeds without claiming schedule enabled');
  for (const role of ['owner', 'staff']) {
    ok((await actors[role].client.rpc('admin_subscription_job_monitor')).error?.code === '42501', `${role} cannot read monitor through HTTP`);
  }
  const anon = createClient(local.API_URL, local.ANON_KEY, options);
  ok((await anon.rpc('admin_subscription_job_monitor')).error?.code === '42501', 'Anonymous cannot read monitor');
  for (const [role, client] of [['admin', actors.admin.client], ['owner', actors.owner.client], ['staff', actors.staff.client], ['anon', anon]]) {
    ok((await client.rpc('begin_subscription_status_run', { p_run_id: randomUUID() })).error?.code === '42501', `${role} cannot admit a job via HTTP`);
    ok((await client.rpc('finish_subscription_status_run', { p_run_id: randomUUID(), p_result: summary })).error?.code === '42501', `${role} cannot finish a job via HTTP`);
  }
  assert.equal(before.data.active, null, 'Do not run transactional fixture while a real job is active');
  const first = randomUUID(), second = randomUUID(), blocked = randomUUID();
  const mixed = { ...summary, staff_status: 'failed', recovery_required: true, error_codes: ['STAFF_PRESENCE_FAILED'] };
  const unknown = { ...summary, subscription_status: 'failed', staff_status: 'not_run', transition_outcome_unknown: true,
    recovery_required: true, error_codes: ['JOB_EXECUTION_FAILED'] };
  const output = sql(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'; SET LOCAL ROLE service_role;
    DO $verify$ DECLARE r jsonb; BEGIN
      r:=public.begin_subscription_status_run(${q(first)}); IF NOT (r->>'acquired')::boolean THEN RAISE EXCEPTION 'Expected admission'; END IF;
      r:=public.finish_subscription_status_run(${q(first)},${q(JSON.stringify(mixed))}::jsonb);
      IF r->>'status'<>'failed' OR NOT (r->>'recorded')::boolean THEN RAISE EXCEPTION 'Mixed summary mismatch'; END IF;
      PERFORM public.begin_subscription_status_run(${q(second)});
      r:=public.finish_subscription_status_run(${q(second)},${q(JSON.stringify(unknown))}::jsonb);
      IF r->>'status'<>'interrupted' OR NOT (r->>'recorded')::boolean THEN RAISE EXCEPTION 'Unknown must block'; END IF;
      r:=public.begin_subscription_status_run(${q(blocked)});
      IF r->>'status'<>'busy' OR (r->>'acquired')::boolean THEN RAISE EXCEPTION 'Unexpected takeover'; END IF;
    END $verify$; RESET ROLE;
    SELECT set_config('request.jwt.claims',${q(JSON.stringify(actors.admin.claims))},true) IS NOT NULL; SET LOCAL ROLE authenticated;
    DO $verify$ DECLARE r jsonb; BEGIN r:=public.admin_subscription_job_monitor();
      IF r->'active'->>'id'<>${q(second)} OR r->'active'->>'status'<>'interrupted' OR r->'active'->'summary' IS NULL THEN RAISE EXCEPTION 'Monitor lost blocker'; END IF;
    END $verify$; SELECT 'history_transaction_passed'; ROLLBACK;`);
  ok(output.includes('history_transaction_passed'), 'Full local schema begin/mixed finish/unknown finish/busy/monitor pass inside rollback-only transaction');
  assert.equal(sql(stateSQL), initialState);
  const after = await monitor(); assert.ifError(after.error);
  ok(JSON.stringify(after.data.runs) === JSON.stringify(before.data.runs) && after.data.last_success_at === before.data.last_success_at
    && after.data.active === null, 'Rollback verified in SQL and PostgREST: no fake run history or last success retained');
  console.log(`Local job monitor Auth HTTP + rollback-only acceptance: ${checks} checks passed. No worker/lifecycle/provider invoked.`);
} finally {
  await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
}
