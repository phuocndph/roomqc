// All writes target one fresh template0 UUID database. Source DB is read-only.
// No account/session, provider, Edge, cron or lifecycle calls against main DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const project = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.equal(project, 'ehjtoajnlnuvuiwkpmbp');
const container = `supabase_db_${project}`;
const database = `roomqc_recovery_verify_${randomUUID().replaceAll('-', '')}`;
const q = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const base = ['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const tables = ['auth.users', 'auth.sessions', 'public.users', 'public.user_roles', 'public.tenants',
  'public.invoices', 'public.payment_transactions', 'public.in_app_notifications', 'public.staff_status'];
function sql(db, statement) {
  return execFileSync('docker', [...base, '-d', db], { input: statement, encoding: 'utf8',
    timeout: 20000, maxBuffer: 5_000_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const source = statement => sql('postgres', `BEGIN READ ONLY; ${statement} COMMIT;`);
function isolated(statement) {
  assert.match(database, /^roomqc_recovery_verify_[a-f0-9]{32}$/);
  return sql(database, `SET statement_timeout='10s'; SET lock_timeout='5s'; ${statement}`);
}
const parse = raw => JSON.parse(raw.split('\n').find(line => line.startsWith('{') || line.startsWith('[')));
let checks = 0, created = false;
const ok = (test, label) => { assert.ok(test, label); checks++; console.log(`PASS ${label}`); };
function denied(statement, code, label) {
  let failure;
  try { isolated('\\set VERBOSITY verbose\n' + statement); } catch (error) { failure = error; }
  assert.ok(failure, label);
  assert.match(String(failure.stderr || failure.message), new RegExp(`\\b${code}\\b`), label);
  ok(true, label);
}
const fixtureTenants = new Set();
function tenant() {
  const id = randomUUID(); fixtureTenants.add(id);
  isolated(`INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at)
    VALUES(${q(id)},'Recovery fixture',${q(id+'@example.invalid')},'active',current_date-1,now()+interval '3 days');`);
  return id;
}
function actor(tenantId, role = 'super_admin') {
  assert.ok(fixtureTenants.has(tenantId)); const id = randomUUID(), session = randomUUID();
  isolated(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id)},${q(id+'@example.invalid')},now());
    INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(session)},${q(id)},now()+interval '1 hour');
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code)
      VALUES(${q(id)},${q(tenantId)},'Fixture actor',${q(id+'@example.invalid')},'active',${q(role)},${q(role==='owner'?'tenant_owner':null)});
    ${role==='super_admin'?`INSERT INTO public.user_roles(user_id,role) VALUES(${q(id)},'super_admin');`:''}`);
  return { id, session };
}
function authed(who, statement, role = 'authenticated', extra = {}) {
  return `BEGIN; SELECT set_config('request.jwt.claims',${q(JSON.stringify({ sub: who.id, session_id: who.session, role, ...extra }))},true) IS NOT NULL;
    SET LOCAL ROLE ${role}; ${statement} COMMIT;`;
}
const recoverSQL = (run, request, deadline, reason = 'Checked fenced expired worker') =>
  `SELECT public.admin_recover_subscription_status_run(${q(run)},${q(request)},${q(deadline)},${q(reason)});`;
const summary = { subscription_status: 'success', staff_status: 'success', to_grace_period: 0, to_suspended: 0,
  notifications_sent: 0, notifications_failed: 0, transition_outcome_unknown: false, recovery_required: false, error_codes: [] };
const scope = tenantId => JSON.stringify({ kind: 'tenants', tenant_ids: Array.isArray(tenantId) ? tenantId : [tenantId] });
function begin(tenantId, protocol = 'atomic') {
  const id = randomUUID();
  const result = parse(isolated(protocol==='atomic'
    ? `SELECT public.begin_atomic_subscription_status_run(${q(id)},${q(scope(tenantId))}::jsonb);`
    : `SELECT public.begin_subscription_status_run(${q(id)});`));
  assert.ok(result.acquired); return id;
}
function setExpired(run) {
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '16 minutes',
    deadline_at=statement_timestamp()-interval '1 minute' WHERE id=${q(run)};`);
  return isolated(`SELECT deadline_at FROM private.subscription_status_job_runs WHERE id=${q(run)};`);
}
const count = table => Number(isolated(`SELECT count(*) FROM ${table};`));
try {
  assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`), '0');
  const ddl = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only', '--section=pre-data', '--no-owner', '--no-privileges', '--no-comments', '--no-security-labels',
    '--no-tablespaces', '--no-publications', '--no-subscriptions', '--strict-names', '--lock-wait-timeout=3000',
    ...tables.map(table => `--table=${table}`)], { encoding: 'utf8', timeout: 30000, maxBuffer: 5_000_000 });
  assert.ok(!/CREATE (FUNCTION|TRIGGER|FOREIGN|SERVER)|COPY .* FROM|^INSERT /m.test(ddl));
  const enums = source(`SELECT 'CREATE TYPE '||quote_ident(n.nspname)||'.'||quote_ident(t.typname)||
    ' AS ENUM ('||string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder)||');'
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.oid IN(SELECT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname||'.'||c.relname IN(${tables.map(q).join(',')}) AND a.attnum>0) GROUP BY n.nspname,t.typname;`);
  const keys = source(`SELECT 'ALTER TABLE '||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||' ADD CONSTRAINT '||quote_ident(k.conname)||' '||pg_get_constraintdef(k.oid)||';'
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.conrelid IN(${tables.map(table => q(table)+'::regclass').join(',')}) AND k.contype IN('p','u');`);
  const helpers = source(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE(n.nspname,p.proname) IN(('auth','uid'),('auth','jwt'),('public','is_super_admin'),('public','platform_support_actor'),
      ('public','calculate_grace_period_end'),('public','auto_offline_inactive_staff')) ORDER BY n.nspname,p.proname,p.pronargs;`);
  assert.equal((helpers.match(/CREATE OR REPLACE FUNCTION/g)||[]).length, 7);
  const caseSQL = await readFile(new URL('../supabase/migrations/20261017145741_subscription_reconciliation_cases_foundation.sql', import.meta.url), 'utf8');
  const gate = caseSQL.match(/CREATE FUNCTION private\.require_reconciliation_case_actor\(\)[\s\S]*?\$fn\$;/)?.[0]; assert.ok(gate);
  sql('postgres', `CREATE DATABASE ${qi(database)} WITH TEMPLATE template0;`); created = true;
  isolated(`CREATE SCHEMA auth; CREATE SCHEMA private; ${enums}\n${ddl}\n${keys}\n${helpers}\n${gate}
    REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;
    CREATE TRIGGER fixture_grace BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.calculate_grace_period_end();`);
  for (const name of ['20261017155727_subscription_status_job_history.sql', '20261018010625_subscription_lifecycle_atomic_outbox.sql',
    '20261018012844_subscription_lifecycle_worker_batches.sql', '20261018012924_subscription_job_recovery_monitor.sql',
    '20261018014615_subscription_scope_validator_volatility.sql']) {
    isolated(await readFile(new URL('../supabase/migrations/'+name, import.meta.url), 'utf8'));
  }
  ok(true, 'Actual history, atomic batch and recovery migrations compile in blank isolated DB');
  const control = tenant(), expiredTenant = tenant(), admin = actor(control), otherAdmin = actor(control), owner = actor(control, 'owner'), staff = actor(control, 'staff');
  isolated(`UPDATE public.tenants SET subscription_end_date=current_date+60,grace_period_ends_at=NULL WHERE id=${q(control)};
    INSERT INTO public.staff_status(id,user_id,tenant_id,status,last_seen_at)
      VALUES(${q(randomUUID())},${q(staff.id)},${q(control)},'available',now()-interval '2 hours');
    INSERT INTO public.invoices(id,tenant_id,invoice_number,due_date,period_start,period_end,subtotal,total_amount,status)
      VALUES(${q(randomUUID())},${q(control)},'RECOVERY-CONTROL',current_date+30,current_date,current_date+30,12345,12345,'draft');
    INSERT INTO public.payment_transactions(id,tenant_id,amount,payment_method,payment_status)
      VALUES(${q(randomUUID())},${q(control)},12345,'bank_transfer','pending');`);
  const errorTenant = tenant(), deliveredTenant = tenant(), obsoleteTenant = tenant();
  actor(deliveredTenant, 'owner');
  const run = begin([expiredTenant,errorTenant,deliveredTenant,obsoleteTenant]), request = randomUUID();
  const cmd = randomUUID();
  parse(isolated(`SELECT private.apply_subscription_lifecycle_transition(${q(run)},${q(cmd)},${q(expiredTenant)},'grace_period');`));
  for (const [tenantId, expected] of [[errorTenant,'pending'],[deliveredTenant,'delivered'],[obsoleteTenant,'obsolete']]) {
    const command = randomUUID();
    parse(isolated(`SELECT private.apply_subscription_lifecycle_transition(${q(run)},${q(command)},${q(tenantId)},'grace_period');`));
    if (expected==='obsolete') isolated(`UPDATE public.tenants SET subscription_status='active',subscription_end_date=current_date+60,grace_period_ends_at=NULL WHERE id=${q(tenantId)};`);
    ok(parse(isolated(`SELECT private.deliver_subscription_lifecycle_notification(${q(command)});`)).status===expected, `Outbox fixture uses real delivery for ${expected} status`);
  }
  const deadline = setExpired(run);
  const call = recoverSQL(run, request, deadline);
  for (const role of ['anon', 'service_role']) denied(authed(admin, call, role), '42501', `${role} cannot recover`);
  for (const who of [owner, staff, { ...admin, session: randomUUID() }]) denied(authed(who, call), '42501', 'Nonadmin or nonexistent session cannot recover');
  denied(authed(admin, call, 'authenticated', { session_id: null }), '42501', 'Missing actual session cannot recover');
  isolated(`UPDATE public.users SET account_locked=true WHERE id=${q(admin.id)};`);
  denied(authed(admin, call), '42501', 'Locked platform administrator cannot recover');
  isolated(`UPDATE public.users SET account_locked=false WHERE id=${q(admin.id)}; UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=${q(admin.id)};`);
  denied(authed(admin, call), '42501', 'Banned platform administrator cannot recover');
  isolated(`UPDATE auth.users SET banned_until=NULL WHERE id=${q(admin.id)};`);
  isolated(`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=${q(admin.session)};`);
  denied(authed(admin,call), '42501', 'Expired actual session cannot recover');
  isolated(`UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=${q(admin.session)};
    UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${q(admin.id)};`);
  denied(authed(admin,call), '42501', 'Unconfirmed platform administrator cannot recover');
  isolated(`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${q(admin.id)};`);
  denied(authed(admin, recoverSQL(run,request,deadline,'short')), '22023', 'Short recovery reason rejected');
  denied(authed(admin, recoverSQL(run,request,deadline+'invalid')), '22007', 'Invalid deadline is rejected');
  denied(authed(admin, `SELECT public.admin_recover_subscription_status_run(${q(run)},${q(request)},${q(deadline)}::timestamptz+interval '1 microsecond','Exact reviewed deadline is required');`), 'PT412', 'Microsecond deadline mismatch cannot release a run');
  const protectedState = () => isolated(`SELECT jsonb_build_object('tenants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tenants t),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoices i),'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payment_transactions p),
    'staff',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.staff_status s),'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY command_id) FROM private.subscription_lifecycle_notification_outbox o));`);
  const before = protectedState();
  isolated(`CREATE FUNCTION private.fixture_recovery_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'FIXTURE_AUDIT_INSERT_FAILED'; END;$$;
    CREATE TRIGGER fixture_recovery_audit_failure BEFORE INSERT ON private.subscription_status_job_recoveries
    FOR EACH ROW EXECUTE FUNCTION private.fixture_recovery_audit_failure();`);
  denied(authed(admin,call), 'P0001', 'Injected audit insert failure rejects the whole recovery transaction');
  ok(isolated(`SELECT status FROM private.subscription_status_job_runs WHERE id=${q(run)};`)==='running'
    && count('private.subscription_status_job_recoveries')===0 && protectedState()===before, 'Failed audit rolls back blocker release and leaves all protected rows unchanged');
  isolated('DROP TRIGGER fixture_recovery_audit_failure ON private.subscription_status_job_recoveries;');
  const recovered = parse(isolated(authed(admin, call)));
  ok(recovered.released && !recovered.replayed, 'Expired atomic run can be explicitly released with session-checked admin');
  ok(protectedState()===before, 'Recovery leaves all tenant, invoice, payment, staff and outbox rows unchanged');
  const audit = parse(isolated(`SELECT to_jsonb(r) FROM private.subscription_status_job_recoveries r WHERE request_id=${q(request)};`));
  ok(audit.actor_id===admin.id && audit.before_state.status==='running' && audit.after_state.status==='failed'
    && audit.after_state.summary.transition_outcome_unknown===true && audit.after_state.summary.notifications_failed===2
    && audit.after_state.summary.notifications_sent===0 && audit.after_state.summary.staff_status==='not_run',
  'One audit stores actor and fail-closed summary from durable batch progress, not unrelated direct deliveries');
  ok(parse(isolated(authed(admin,call))).replayed && count('private.subscription_status_job_recoveries')===1, 'Lost recovery response replays receipt without duplicate audit');
  denied(authed(admin,recoverSQL(run,request,deadline,'A different recovery reason')), 'PT409', 'Receipt refuses changed reason');
  denied(authed(otherAdmin,call), 'PT409', 'Receipt refuses another actor');
  denied(authed(admin,recoverSQL(run,randomUUID(),deadline)), 'PT412', 'New ID cannot release already failed run again');
  for (const change of [`UPDATE private.subscription_status_job_recoveries SET reason='Changed audit reason'`,
    'DELETE FROM private.subscription_status_job_recoveries', 'TRUNCATE private.subscription_status_job_recoveries']) denied(change+';', '42501', 'Recovery audit cannot update/delete/truncate even as postgres');
  for (const role of ['anon','authenticated','service_role']) {
    denied(`SET ROLE ${role}; SELECT * FROM private.subscription_status_job_recoveries;`, '42501', `${role} cannot read private recovery reasons`);
  }
  denied(`SET ROLE service_role; SELECT public.process_subscription_lifecycle_batch(${q(run)},${q(randomUUID())},0,10);`, 'PT409', 'Old worker batch cannot mutate after release');
  denied('SET ROLE service_role; SELECT public.auto_offline_inactive_staff();', '42501', 'Legacy staff sweep cannot bypass atomic staff fencing');
  denied('SET ROLE service_role; SELECT public.process_expired_subscriptions();', '42501', 'Legacy subscription sweep is not executable by service worker');
  denied('SELECT public.process_expired_subscriptions();', '0A000', 'Legacy subscription sweep remains disabled even as postgres');
  denied(`SELECT private.apply_subscription_lifecycle_transition(${q(run)},${q(randomUUID())},${q(control)},'grace_period');`, 'PT409', 'Old direct atomic transition cannot mutate after release');
  ok(protectedState()===before, 'Fenced old worker and direct transition leave protected rows unchanged');
  const next = begin(control);
  denied(authed(admin,recoverSQL(next,randomUUID(),isolated(`SELECT deadline_at FROM private.subscription_status_job_runs WHERE id=${q(next)};`))), 'PT412', 'Unexpired atomic run cannot be released');
  // Real staff phase resumes against a released run: it cannot offline stale staff.
  isolated(`UPDATE private.subscription_lifecycle_progress SET phase='staff' WHERE run_id=${q(next)};`);
  const nextDeadline = setExpired(next);
  parse(isolated(authed(admin,recoverSQL(next,randomUUID(),nextDeadline))));
  denied(`SET ROLE service_role; SELECT public.process_subscription_lifecycle_batch(${q(next)},${q(randomUUID())},0,10);`, 'PT409', 'Fenced staff phase cannot offline users after release');
  ok(isolated(`SELECT bool_and(status='available') FROM public.staff_status;`)==='t', 'Stale staff remains available when old staff batch is rejected');
  const legacy = begin(control,'legacy'), legacyDeadline = setExpired(legacy);
  denied(authed(admin,recoverSQL(legacy,randomUUID(),legacyDeadline)), 'PT412', 'Legacy run is never declared safe by atomic recovery');
  // Explicit fixture-only teardown so later independent monitor cases can run.
  isolated(`UPDATE private.subscription_status_job_runs SET status='failed',finished_at=now(),summary=${q(JSON.stringify(summary))}::jsonb WHERE id=${q(legacy)};`);
  const clusterSuccess = randomUUID(), tenantSuccess = randomUUID(), legacySuccess = randomUUID();
  isolated(`INSERT INTO private.subscription_status_job_runs(id,status,started_at,deadline_at,finished_at,summary,execution_protocol,execution_scope) VALUES
    (${q(clusterSuccess)},'success',now()-interval '3 hours',now()-interval '3 hours'+interval '15 minutes',now()-interval '2 hours',${q(JSON.stringify(summary))}::jsonb,'atomic_v1','{"kind":"cluster"}'),
    (${q(tenantSuccess)},'success',now()-interval '1 hour',now()-interval '1 hour'+interval '15 minutes',now()-interval '30 minutes',${q(JSON.stringify(summary))}::jsonb,'atomic_v1',${q(scope(control))}::jsonb),
    (${q(legacySuccess)},'success',now()-interval '20 minutes',now()-interval '5 minutes',now()-interval '1 minute',${q(JSON.stringify(summary))}::jsonb,'legacy',NULL);`);
  const monitor = () => parse(isolated(authed(admin,'SELECT public.admin_subscription_job_monitor();')));
  const monitored = monitor();
  ok(Date.parse(monitored.last_success_at)===Date.parse(isolated(`SELECT finished_at FROM private.subscription_status_job_runs WHERE id=${q(clusterSuccess)};`)), 'Monitor last success excludes newer tenant-only and legacy runs');
  ok(monitored.active===null && monitored.latest_recovery.run_id===next && !('reason' in monitored.latest_recovery), 'Monitor exposes release identity without private reason or stale blocker');
  ok(monitored.outbox.pending===2 && monitored.outbox.due===1 && monitored.outbox.with_error===1
    && monitored.outbox.delivered===1 && monitored.outbox.obsolete===1 && monitored.outbox.oldest_pending_at!==null,
  'Monitor distinguishes pending, due, error, delivered and obsolete counts independently of recovery');
  denied(authed(owner,'SELECT public.admin_subscription_job_monitor();'), '42501', 'Tenant owner cannot inspect cluster monitor');

  // Regression: the current run can deliver old pending outbox with no current
  // transition commands. Its receipt/progress is the only proof of sends.
  const carryDelivered = tenant(), carryPending = tenant(), outsidePending = tenant();
  actor(carryDelivered,'owner');
  const carrySource = begin([carryDelivered,carryPending,outsidePending]);
  const carryCommands = new Map();
  for (const tenantId of [carryDelivered,carryPending,outsidePending]) {
    const command = randomUUID(); carryCommands.set(tenantId,command);
    parse(isolated(`SELECT private.apply_subscription_lifecycle_transition(${q(carrySource)},${q(command)},${q(tenantId)},'grace_period');`));
    if (tenantId!==carryDelivered) isolated(`UPDATE private.subscription_lifecycle_notification_outbox
      SET available_at=now()+interval '1 hour' WHERE command_id=${q(command)};`);
  }
  parse(isolated(authed(admin,recoverSQL(carrySource,randomUUID(),setExpired(carrySource)))));
  const carryCurrent = begin([carryDelivered,carryPending]);
  let carryBatch;
  for (let index=0;index<3;index++) carryBatch=parse(isolated(`SET ROLE service_role;
    SELECT public.process_subscription_lifecycle_batch(${q(carryCurrent)},${q(randomUUID())},${index},50);`));
  ok(carryBatch.phase==='staff' && carryBatch.notifications_sent===1 && carryBatch.to_grace_period===0
    && carryBatch.to_suspended===0 && isolated(`SELECT count(*) FROM private.subscription_lifecycle_commands WHERE run_id=${q(carryCurrent)};`)==='0',
  'Current run delivers old pending outbox without inventing current transition commands');
  ok(isolated(`SELECT notifications_sent FROM private.subscription_lifecycle_progress WHERE run_id=${q(carryCurrent)};`)==='1'
    && isolated(`SELECT status FROM private.subscription_lifecycle_notification_outbox WHERE command_id=${q(carryCommands.get(carryDelivered))};`)==='delivered',
  'Old-run delivery success commits to current durable progress');
  const carryBefore = protectedState(), carryRequest = randomUUID(), carryDeadline = setExpired(carryCurrent);
  parse(isolated(authed(admin,recoverSQL(carryCurrent,carryRequest,carryDeadline))));
  const carrySummary=parse(isolated(`SELECT summary FROM private.subscription_status_job_runs WHERE id=${q(carryCurrent)};`));
  ok(carrySummary.notifications_sent===1 && carrySummary.notifications_failed===1
    && carrySummary.to_grace_period===0 && carrySummary.to_suspended===0,
  'Recovery reports persisted sends and all pending scope outbox across runs, excluding another tenant');
  ok(carrySummary.staff_status==='failed' && carrySummary.error_codes.includes('STAFF_PRESENCE_FAILED')
    && carrySummary.error_codes.includes('JOB_EXECUTION_FAILED') && carrySummary.transition_outcome_unknown===true,
  'Recovery of interrupted staff phase records explicit staff failure without claiming completion');
  ok(protectedState()===carryBefore, 'Cross-run recovery leaves old notifications, pending scope and financial rows unchanged');
  ok(parse(isolated(authed(admin,recoverSQL(carryCurrent,carryRequest,carryDeadline)))).replayed,
    'Cross-run delivery recovery receipt replays its original outcome');

  const completedStaffRun = begin(control);
  for (let index=0;index<4;index++) parse(isolated(`SET ROLE service_role;
    SELECT public.process_subscription_lifecycle_batch(${q(completedStaffRun)},${q(randomUUID())},${index},50);`));
  const completedDeadline = setExpired(completedStaffRun);
  parse(isolated(authed(admin,recoverSQL(completedStaffRun,randomUUID(),completedDeadline))));
  const completedSummary=parse(isolated(`SELECT summary FROM private.subscription_status_job_runs WHERE id=${q(completedStaffRun)};`));
  ok(completedSummary.staff_status==='success' && !completedSummary.error_codes.includes('STAFF_PRESENCE_FAILED')
    && completedSummary.subscription_status==='failed' && completedSummary.transition_outcome_unknown===true,
  'Expired done-phase recovery preserves proven staff completion while retaining unknown execution outcome');
  ok(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`)==='1', 'Generated isolated DB is the only mutation target');
  console.log(`Recovery DB checks: ${checks}/${checks} passed (isolated fixtures; not provider/HTTP E2E)`);
} finally {
  if (created) {
    assert.match(database,/^roomqc_recovery_verify_[a-f0-9]{32}$/);
    sql('postgres',`DROP DATABASE ${qi(database)} WITH(FORCE);`);
    console.log('Dropped isolated recovery fixture database');
  }
}
