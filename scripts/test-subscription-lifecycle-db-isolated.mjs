// Schema-only clone into a generated blank DB. All mutations, including failure
// injection and simulated renewal, are confined to its explicit fixture IDs.
// No main-DB lifecycle RPC, Edge POST, cron, provider, Auth account or email.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const withWorker = process.argv.includes('--worker');

const project = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'))
  .match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.equal(project, 'ehjtoajnlnuvuiwkpmbp');
const container = `supabase_db_${project}`;
const database = `roomqc_lifecycle_verify_${randomUUID().replaceAll('-', '')}`;
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const q = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const base = ['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const tables = ['auth.users', 'auth.sessions', 'public.users', 'public.user_roles',
  'public.tenants', 'public.invoices', 'public.payment_transactions', 'public.in_app_notifications',
  ...(withWorker ? ['public.staff_status'] : [])];
function sql(db, statement) {
  return execFileSync('docker', [...base, '-d', db], { input: statement, encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000, maxBuffer: 5_000_000 }).trim();
}
const source = statement => sql('postgres', `BEGIN READ ONLY; ${statement} COMMIT;`);
function isolated(statement) {
  assert.match(database, /^roomqc_lifecycle_verify_[a-f0-9]{32}$/);
  return sql(database, `SET statement_timeout='10s'; SET lock_timeout='8s'; ${statement}`);
}
const parse = raw => JSON.parse(raw.split('\n').find(line => line.startsWith('{') || line.startsWith('[')));
let checks = 0, created = false;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
function connection(statement, hold = false) {
  const child = spawn('docker', [...base, '-d', database], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '', readyResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated SQL timed out')); }, 15000);
    child.stdout.on('data', chunk => { out += chunk; if (out.includes('ROOMQC_LOCK_READY')) readyResolve(); });
    child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); code ? reject(new Error(err)) : resolve(out.trim()); });
  });
  // A lock-holder readiness promise can settle before its process. Keep any
  // later rejection observed until the caller joins/releases the connection.
  done.catch(() => {});
  if (hold) child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; ${statement};\n\\echo ROOMQC_LOCK_READY\n`);
  else child.stdin.end(`SET statement_timeout='10s'; SET lock_timeout='8s'; ${statement}`);
  return { ready: hold ? Promise.race([ready, done.then(() => { throw new Error('Lock holder ended early'); })]) : ready,
    done, release: () => child.stdin.end('COMMIT;\n\\q\n') };
}
async function concurrent(queries) {
  const results = await Promise.allSettled(queries.map(query => connection(query).done));
  const error = results.find(result => result.status === 'rejected');
  if (error) throw error.reason;
  return results.map(result => result.value);
}
async function race(holderSQL, waiterSQL, name, { beforeRelease, expectError } = {}) {
  const holder = connection(holderSQL, true);
  let waiter, waiterResult;
  try {
    await holder.ready;
    waiter = connection(`SET application_name=${q(name)}; ${waiterSQL}`);
    let blocked = false;
    for (let n = 0; n < 30; n++) {
      if (source(`SELECT COALESCE(bool_or(wait_event_type='Lock'),false) FROM pg_stat_activity
        WHERE datname=${q(database)} AND application_name=${q(name)};`) === 't') { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(blocked, 'Race must prove the second transaction actually waited for a row lock');
    if (beforeRelease) await beforeRelease();
  } finally {
    holder.release();
    const results = await Promise.allSettled([holder.done, ...(waiter ? [waiter.done] : [])]);
    if (results[0].status==='rejected') throw results[0].reason;
    waiterResult=results[1];
  }
  if (expectError) {
    assert.equal(waiterResult?.status,'rejected');
    assert.match(String(waiterResult.reason),new RegExp(expectError));
  } else if (waiterResult?.status==='rejected') throw waiterResult.reason;
}
function denied(statement, code, label) {
  let error;
  try { isolated('\\set VERBOSITY verbose\n' + statement); } catch (failure) { error = failure; }
  assert.ok(error, label); assert.match(String(error.stderr || error.message), new RegExp(`\\b${code}\\b`), label);
  ok(true, label);
}
const fixtures = new Set();
function tenant(status = 'active', end = "current_date-1", grace = "now()+interval '2 days'") {
  const id = randomUUID(); fixtures.add(id);
  isolated(`INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at)
    VALUES(${q(id)},'Lifecycle fixture',${q(id+'@example.invalid')},${q(status)},${end},${grace});`);
  return id;
}
function owner(tenantId, extra = '') {
  assert.ok(fixtures.has(tenantId)); const id = randomUUID();
  isolated(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(id)},${q(id+'@example.invalid')},now());
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code)
    VALUES(${q(id)},${q(tenantId)},'Fixture owner',${q(id+'@example.invalid')},'active','owner','tenant_owner'); ${extra}`);
  return id;
}
const transitionSQL = (run, command, tenantId, target = 'grace_period') =>
  `SELECT private.apply_subscription_lifecycle_transition(${q(run)}::uuid,${q(command)}::uuid,${q(tenantId)}::uuid,${q(target)}::text);`;
function transition(run, command, tenantId, target = 'grace_period') {
  assert.ok(fixtures.has(tenantId), 'Explicit fixture allowlist; never fall back to all tenants');
  return parse(isolated(transitionSQL(run, command, tenantId, target)));
}
const deliverySQL = command => `SELECT private.deliver_subscription_lifecycle_notification(${q(command)}::uuid);`;
const deliver = command => parse(isolated(deliverySQL(command)));
const state = tenantId => isolated(`SELECT subscription_status FROM public.tenants WHERE id=${q(tenantId)};`);
const count = (table, where = 'true') => Number(isolated(`SELECT count(*) FROM ${table} WHERE ${where};`));
const summary = { subscription_status:'success',staff_status:'success',to_grace_period:0,to_suspended:0,
  notifications_sent:0,notifications_failed:0,transition_outcome_unknown:false,recovery_required:false,error_codes:[] };
const finishSQL = run => `SELECT public.finish_subscription_status_run(${q(run)},${q(JSON.stringify(summary))}::jsonb);`;

try {
  assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`), '0');
  const ddl = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only','--section=pre-data','--no-owner','--no-privileges','--no-comments','--no-security-labels',
    '--no-tablespaces','--no-publications','--no-subscriptions','--strict-names','--lock-wait-timeout=3000',
    ...tables.map(table => `--table=${table}`)], { encoding:'utf8',timeout:30000,maxBuffer:5_000_000 });
  assert.ok(!/CREATE (FUNCTION|TRIGGER|FOREIGN|SERVER)|COPY .* FROM|^INSERT /m.test(ddl));
  const enums = source(`SELECT 'CREATE TYPE '||quote_ident(n.nspname)||'.'||quote_ident(t.typname)||
    ' AS ENUM ('||string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder)||');'
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.oid IN (SELECT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname||'.'||c.relname IN (${tables.map(q).join(',')}) AND a.attnum>0) GROUP BY n.nspname,t.typname;`);
  const keys = source(`SELECT 'ALTER TABLE '||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||' ADD CONSTRAINT '||quote_ident(k.conname)||' '||pg_get_constraintdef(k.oid)||';'
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.conrelid IN (${tables.map(table => q(table)+'::regclass').join(',')}) AND k.contype IN ('p','u');`);
  const helpers = source(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('auth','uid'),('auth','jwt'),('public','is_super_admin'),('public','platform_support_actor'),
      ('public','calculate_grace_period_end')) ORDER BY n.nspname,p.proname,p.pronargs;`);
  assert.equal((helpers.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,6);
  const caseSQL = await readFile(new URL('../supabase/migrations/20261017145741_subscription_reconciliation_cases_foundation.sql', import.meta.url),'utf8');
  const actor = caseSQL.match(/CREATE FUNCTION private\.require_reconciliation_case_actor\(\)[\s\S]*?\$fn\$;/)?.[0]; assert.ok(actor);
  sql('postgres',`CREATE DATABASE ${qi(database)} WITH TEMPLATE template0;`); created = true;
  isolated(`CREATE SCHEMA auth; CREATE SCHEMA private; ${enums}\n${ddl}\n${keys}\n${helpers}\n${actor}
    REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;
    CREATE TRIGGER fixture_grace BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.calculate_grace_period_end();
    ALTER TABLE public.in_app_notifications ADD FOREIGN KEY(tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
    ALTER TABLE public.in_app_notifications ADD FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE CASCADE;`);
  for (const name of ['20261017155727_subscription_status_job_history.sql','20261018010625_subscription_lifecycle_atomic_outbox.sql'])
    isolated(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  ok(true,'Migrations compile against schema-only dependencies and actual grace trigger');

  const run = randomUUID(); parse(isolated(`SELECT public.begin_subscription_status_run(${q(run)});`));
  const control = tenant('active','current_date+60');
  owner(control);
  const admin=randomUUID(), session=randomUUID();
  isolated(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(admin)},'lifecycle-admin@example.invalid',now());
    INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(session)},${q(admin)},now()+interval '1 hour');
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role) VALUES(${q(admin)},${q(control)},'Fixture admin','lifecycle-admin@example.invalid','active','super_admin');
    INSERT INTO public.user_roles(user_id,role) VALUES(${q(admin)},'super_admin');`);
  const monitor = (timezone='UTC') => parse(isolated(`BEGIN; SET LOCAL timezone=${q(timezone)};
    SELECT set_config('request.jwt.claims',${q(JSON.stringify({sub:admin,session_id:session,role:'authenticated'}))},true) IS NOT NULL;
    SET LOCAL ROLE authenticated; SELECT public.admin_subscription_job_monitor(); COMMIT;`));
  const monitorBefore=monitor().backlog;
  const today=tenant('active','current_date',"now()+interval '7 days'");
  tenant('active','current_date','NULL');
  const monitorAfter=monitor().backlog;
  ok(monitorAfter.eligible_grace===monitorBefore.eligible_grace
    && monitorAfter.unhandled_expired_active===monitorBefore.unhandled_expired_active,'Monitor does not treat today as expired, with or without grace');
  ok(monitor('Pacific/Honolulu').backlog.eligible_grace===monitorAfter.eligible_grace,'Caller timezone cannot change monitor date boundary');
  ok(transition(run,randomUUID(),today).outcome==='not_eligible','Monitor date boundary agrees with transition predicate');
  const financialInvoice = randomUUID();
  isolated(`INSERT INTO public.invoices(id,tenant_id,invoice_number,due_date,period_start,period_end,subtotal,total_amount,status)
    VALUES(${q(financialInvoice)},${q(control)},'LIFECYCLE-CONTROL',current_date+30,current_date,current_date+30,12345,12345,'draft');
    INSERT INTO public.payment_transactions(id,tenant_id,invoice_id,amount,payment_method,payment_status,metadata)
    VALUES(${q(randomUUID())},${q(control)},${q(financialInvoice)},12345,'bank_transfer','pending','{"type":"extend","duration_days":30}');`);
  const financial = () => isolated(`SELECT jsonb_build_object('payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payment_transactions p),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoices i),'control',(SELECT to_jsonb(t) FROM public.tenants t WHERE id=${q(control)}));`);
  const initialFinancial = financial();
  const t = tenant(); owner(t); const command = randomUUID();
  const result = transition(run,command,t);
  ok(result.outcome==='applied' && state(t)==='grace_period','Expired fixture transitions under lock');
  ok(count('private.subscription_lifecycle_commands',`id=${q(command)}`)===1
    && count('private.subscription_lifecycle_notification_outbox',`command_id=${q(command)}`)===1,'Transition commits command audit and pending outbox together');
  const replays = (await concurrent(Array.from({length:20},()=>transitionSQL(run,command,t)))).map(parse);
  ok(replays.every(r=>r.replayed && r.outcome==='applied') && count('private.subscription_lifecycle_commands',`id=${q(command)}`)===1,
    '20 committed-response replays produce one transition and one outbox');
  denied(transitionSQL(run,command,control),'PT409','Same request cannot point at another tenant');
  denied(transitionSQL(run,command,t,'suspended'),'PT409','Same request cannot change its target');
  denied(transitionSQL(randomUUID(),command,t),'PT409','Same request cannot change its run');
  denied(transitionSQL(run,randomUUID(),t),'PT409','New request ID cannot repeat same run/tenant/target');
  for (const args of [[null,randomUUID(),t,'grace_period'],[run,null,t,'grace_period'],[run,randomUUID(),null,'grace_period'],[run,randomUUID(),t,null],[run,randomUUID(),t,'active']])
    denied(transitionSQL(...args),'22023','Invalid/null command or scope rejected');
  denied(transitionSQL(randomUUID(),randomUUID(),t),'PT404','Unadmitted job run rejected');
  denied(transitionSQL(run,randomUUID(),randomUUID()),'PT404','Missing tenant does not become a global scope');
  for (const [label,status,end,grace,target] of [
    ['today remains valid','active','current_date',"now()+interval '7 days'",'grace_period'],
    ['future plan','active','current_date+1',"now()+interval '8 days'",'grace_period'],
    ['null end date','trial','NULL',"now()+interval '7 days'",'grace_period'],
    ['uncovered old active preserved','active','current_date-9',"now()-interval '1 day'",'grace_period'],
    ['already suspended','suspended','current_date-9',"now()-interval '1 day'",'suspended'],
    ['grace not over','grace_period','current_date-1',"now()+interval '1 day'",'suspended']]) {
    const id=tenant(status,end,grace), cmd=randomUUID();
    ok(transition(run,cmd,id,target).outcome==='not_eligible' && state(id)===status
      && count('private.subscription_lifecycle_notification_outbox',`command_id=${q(cmd)}`)===0,`Predicate: ${label}`);
  }
  const suspended=tenant('grace_period','current_date-10',"now()-interval '1 day'"), suspendedCmd=randomUUID(); owner(suspended);
  ok(transition(run,suspendedCmd,suspended,'suspended').outcome==='applied' && state(suspended)==='suspended','Expired grace transitions to suspended');

  const rollbackTenant=tenant(), rollbackCmd=randomUUID();
  isolated(`CREATE FUNCTION private.fixture_outbox_error() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'RAW_FIXTURE_SECRET'; END;$$;
    CREATE TRIGGER fixture_outbox_error BEFORE INSERT ON private.subscription_lifecycle_notification_outbox
    FOR EACH ROW EXECUTE FUNCTION private.fixture_outbox_error();`);
  denied(transitionSQL(run,rollbackCmd,rollbackTenant),'P0001','Injected outbox failure rejects whole transition');
  ok(state(rollbackTenant)==='active' && count('private.subscription_lifecycle_commands',`id=${q(rollbackCmd)}`)===0,
    'Outbox error rolls back tenant state and audit receipt');
  isolated('DROP TRIGGER fixture_outbox_error ON private.subscription_lifecycle_notification_outbox;');
  ok(transition(run,rollbackCmd,rollbackTenant).outcome==='applied','Rolled-back command can safely retry with its original ID');

  const renewalFirst=tenant(), renewalFirstCmd=randomUUID();
  await race(`UPDATE public.tenants SET subscription_status='active',subscription_end_date=current_date+90,grace_period_ends_at=NULL WHERE id=${q(renewalFirst)}`,
    transitionSQL(run,renewalFirstCmd,renewalFirst),'roomqc-renewal-first');
  ok(state(renewalFirst)==='active' && isolated(`SELECT outcome FROM private.subscription_lifecycle_commands WHERE id=${q(renewalFirstCmd)}`)==='not_eligible',
    'Renewal commits first: waiting expiry rechecks updated dates and never overwrites renewal');
  const expiryFirst=tenant(), expiryFirstCmd=randomUUID(); owner(expiryFirst);
  await race(transitionSQL(run,expiryFirstCmd,expiryFirst),
    `UPDATE public.tenants SET subscription_status='active',subscription_end_date=current_date+90,grace_period_ends_at=NULL WHERE id=${q(expiryFirst)};`,
    'roomqc-expiry-first');
  ok(state(expiryFirst)==='active' && deliver(expiryFirstCmd).status==='obsolete','Expiry commits first: renewal wins later and stale notification is suppressed');

  const deliveries=(await concurrent(Array.from({length:20},()=>deliverySQL(command)))).map(parse);
  ok(deliveries.filter(r=>r.status==='delivered' && !r.replayed).length===1
    && count('public.in_app_notifications',`id=${q(command)}`)===1,'20 delivery calls create exactly one in-app notification');
  ok(isolated(`SELECT attempts FROM private.subscription_lifecycle_notification_outbox WHERE command_id=${q(command)}`)==='1',
    'Lost-response delivery retries do not add attempts or duplicate messages');
  const noOwner=tenant(), noOwnerCmd=randomUUID(); transition(run,noOwnerCmd,noOwner);
  const missing=deliver(noOwnerCmd);
  ok(missing.status==='pending' && missing.error_code==='OWNER_UNAVAILABLE','Missing owner retains pending event with safe error code');
  ok(deliver(noOwnerCmd).status==='deferred' && count('public.in_app_notifications',`id=${q(noOwnerCmd)}`)===0,'Backoff prevents immediate repeated attempts');
  owner(noOwner); isolated(`UPDATE private.subscription_lifecycle_notification_outbox SET available_at=now()-interval '1 second' WHERE command_id=${q(noOwnerCmd)}`);
  ok(deliver(noOwnerCmd).status==='delivered','Owner repair permits later delivery without rerunning transition');
  const ambiguous=tenant(), ambiguousCmd=randomUUID(); owner(ambiguous); owner(ambiguous); transition(run,ambiguousCmd,ambiguous);
  ok(deliver(ambiguousCmd).error_code==='OWNER_UNAVAILABLE','Ambiguous owner is not chosen arbitrarily');
  const locked=tenant(), lockedCmd=randomUUID(), lockedOwner=owner(locked); transition(run,lockedCmd,locked);
  isolated(`UPDATE public.users SET account_locked=true WHERE id=${q(lockedOwner)}`);
  ok(deliver(lockedCmd).error_code==='OWNER_UNAVAILABLE','Locked owner does not receive a new message');

  const failing=tenant(), failingCmd=randomUUID(); owner(failing); transition(run,failingCmd,failing);
  isolated(`CREATE FUNCTION private.fixture_notification_error() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'RAW_FIXTURE_SECRET'; END;$$;
    CREATE TRIGGER fixture_notification_error BEFORE INSERT ON public.in_app_notifications FOR EACH ROW EXECUTE FUNCTION private.fixture_notification_error();`);
  const failedDelivery=deliver(failingCmd);
  ok(failedDelivery.error_code==='DELIVERY_FAILED' && !JSON.stringify(failedDelivery).includes('RAW_FIXTURE_SECRET')
    && count('public.in_app_notifications',`id=${q(failingCmd)}`)===0,'INSERT failure preserves pending event and sanitizes SQL error');
  isolated('DROP TRIGGER fixture_notification_error ON public.in_app_notifications;');
  const ack=tenant(), ackCmd=randomUUID(); owner(ack); transition(run,ackCmd,ack);
  isolated(`CREATE TRIGGER fixture_ack_error BEFORE UPDATE ON private.subscription_lifecycle_notification_outbox
    FOR EACH ROW WHEN (NEW.status='delivered') EXECUTE FUNCTION private.fixture_notification_error();`);
  ok(deliver(ackCmd).status==='pending' && count('public.in_app_notifications',`id=${q(ackCmd)}`)===0,
    'Acknowledgement error rolls back notification INSERT in the same subtransaction');
  isolated(`DROP TRIGGER fixture_ack_error ON private.subscription_lifecycle_notification_outbox;
    UPDATE private.subscription_lifecycle_notification_outbox SET available_at=now()-interval '1 second' WHERE command_id=${q(ackCmd)}`);
  ok(deliver(ackCmd).status==='delivered' && count('public.in_app_notifications',`id=${q(ackCmd)}`)===1,'Acknowledgement retry recovers exactly one notification');
  const collision=tenant(), collisionCmd=randomUUID(), collisionOwner=owner(collision); transition(run,collisionCmd,collision);
  isolated(`INSERT INTO public.in_app_notifications(id,tenant_id,user_id,title,body) VALUES(${q(collisionCmd)},${q(collision)},${q(collisionOwner)},'Unrelated','Unrelated')`);
  ok(deliver(collisionCmd).error_code==='DELIVERY_FAILED' && isolated(`SELECT title FROM public.in_app_notifications WHERE id=${q(collisionCmd)}`)==='Unrelated',
    'Notification ID conflict is not acknowledged or overwritten');
  const removed=tenant(), removedCmd=randomUUID(); transition(run,removedCmd,removed);
  isolated(`DELETE FROM public.tenants WHERE id=${q(removed)}`);
  ok(deliver(removedCmd).status==='obsolete' && count('private.subscription_lifecycle_commands',`id=${q(removedCmd)}`)===1,
    'Tenant deletion preserves audit and suppresses pending message');
  const deliveryRace=tenant(), deliveryRaceCmd=randomUUID(); owner(deliveryRace); transition(run,deliveryRaceCmd,deliveryRace);
  await race(`UPDATE public.tenants SET subscription_status='active',subscription_end_date=current_date+90 WHERE id=${q(deliveryRace)}`,
    deliverySQL(deliveryRaceCmd),'roomqc-delivery-renewal');
  ok(count('public.in_app_notifications',`id=${q(deliveryRaceCmd)}`)===0
    && deliver(deliveryRaceCmd).status==='obsolete','Delivery waiting behind renewal rechecks state under tenant lock');

  for (const role of ['anon','authenticated','service_role']) {
    for (const table of ['subscription_lifecycle_commands','subscription_lifecycle_notification_outbox']) {
      ok(isolated(`SELECT NOT has_table_privilege(${q(role)},${q('private.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`)==='t',`${role} has no direct ${table} privileges`);
    }
    for (const fn of ["private.apply_subscription_lifecycle_transition(uuid,uuid,uuid,text)","private.deliver_subscription_lifecycle_notification(uuid)"])
      ok(isolated(`SELECT NOT has_function_privilege(${q(role)},${q(fn)},'EXECUTE')`)==='t',`${role} cannot execute private lifecycle function`);
    ok(isolated(`SELECT NOT has_sequence_privilege(${q(role)},'private.subscription_lifecycle_commands_ordinal_seq','USAGE,SELECT,UPDATE')`)==='t',`${role} cannot alter audit ordering sequence`);
    denied(`SET ROLE ${role}; ${transitionSQL(run,randomUUID(),t)}`,'42501',`${role} direct lifecycle call denied`);
  }
  ok(isolated(`SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN
    ('private.subscription_lifecycle_commands'::regclass,'private.subscription_lifecycle_notification_outbox'::regclass)`)==='t','Both private tables have RLS enabled');
  ok(financial()===initialFinancial,'All invoice/payment columns and unrelated tenant remain unchanged');
  isolated(finishSQL(run));
  ok(transition(run,command,t).replayed,'Committed receipt can be read after run finishes without side effects');
  denied(transitionSQL(run,randomUUID(),control),'PT409','Terminal run cannot perform new lifecycle work');
  const nextRun=randomUUID(), newerCmd=randomUUID();
  isolated(`SELECT public.begin_subscription_status_run(${q(nextRun)});
    UPDATE public.tenants SET subscription_status='active' WHERE id=${q(failing)}`);
  ok(transition(nextRun,newerCmd,failing).outcome==='applied' && deliver(failingCmd).status==='obsolete',
    'A later lifecycle event suppresses older pending messages even with identical dates/status');
  const busyRun=randomUUID(); isolated(`SELECT public.begin_subscription_status_run(${q(busyRun)})`);
  denied(transitionSQL(busyRun,randomUUID(),control),'PT409','Busy run cannot execute transitions');
  isolated(finishSQL(nextRun));
  const lateRun=randomUUID(); isolated(`SELECT public.begin_subscription_status_run(${q(lateRun)});
    UPDATE private.subscription_status_job_runs SET started_at=now()-interval '16 minutes',deadline_at=now()-interval '1 minute' WHERE id=${q(lateRun)}`);
  denied(transitionSQL(lateRun,randomUUID(),control),'PT409','Deadline checked after lock acquisition');
  isolated(`UPDATE private.subscription_status_job_runs SET status='interrupted' WHERE id=${q(lateRun)}`);
  denied(transitionSQL(lateRun,randomUUID(),control),'PT409','Interrupted run cannot perform new lifecycle work');
  // Use one timestamp for the exact 15-minute CHECK constraint. Deliberately
  // age the disposable run; never shorten a live production deadline.
  isolated(`UPDATE private.subscription_status_job_runs SET status='running',
    started_at=statement_timestamp()-interval '14 minutes 55 seconds',
    deadline_at=statement_timestamp()+interval '5 seconds' WHERE id=${q(lateRun)}`);
  await race(`SELECT id FROM public.tenants WHERE id=${q(control)} FOR UPDATE`,
    transitionSQL(lateRun,randomUUID(),control),'roomqc-deadline-wait',{
      expectError:'JOB_RUN_NOT_ACTIVE',
      beforeRelease:async()=>{
        for (let n=0;n<40;n++) {
          if (isolated(`SELECT deadline_at<clock_timestamp() FROM private.subscription_status_job_runs WHERE id=${q(lateRun)}`)==='t') return;
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        throw new Error('Fixture deadline did not expire');
      },
    });
  ok(true,'A run whose deadline expires while waiting for tenant lock cannot mutate the tenant');
  if (withWorker) {
    const { runAtomicWorkerChecks } = await import('./subscription-atomic-worker-isolated-cases.mjs');
    // The preceding legacy deadline fixture is deliberately interrupted. Close
    // only that disposable fixture so atomic tests can obtain a fresh run.
    isolated(`UPDATE private.subscription_status_job_runs SET status='failed',finished_at=clock_timestamp(),
      summary=${q(JSON.stringify(summary))}::jsonb WHERE id=${q(lateRun)};
      UPDATE private.subscription_lifecycle_notification_outbox SET status='obsolete',last_error_code=NULL,
        obsolete_at=clock_timestamp() WHERE status='pending';`);
    isolated(source(`SELECT pg_get_functiondef('public.auto_offline_inactive_staff()'::regprocedure)||';';`));
    isolated(await readFile(new URL('../supabase/migrations/20261018012844_subscription_lifecycle_worker_batches.sql',import.meta.url),'utf8'));
    isolated(await readFile(new URL('../supabase/migrations/20261018014615_subscription_scope_validator_volatility.sql',import.meta.url),'utf8'));
    await runAtomicWorkerChecks({isolated,q,ok,parse,randomUUID,tenant,owner,state,count,denied,concurrent,race,financial,initialFinancial});
  }
  console.log(`Isolated lifecycle foundation: ${checks} checks passed; no main runtime or lifecycle changes.`);
} finally {
  if (created) {
    assert.match(database,/^roomqc_lifecycle_verify_[a-f0-9]{32}$/);
    sql('postgres',`DROP DATABASE ${qi(database)};`);
    assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`),'0');
    console.log('Only generated lifecycle test database removed; absence verified.');
  }
}
