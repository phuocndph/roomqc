// Main database is read-only except exact CREATE/DROP of a generated blank DB.
// Schema-only dependencies, no copied data/env/cron/runtime/provider operations.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const project = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'))
  .match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.equal(project, 'ehjtoajnlnuvuiwkpmbp');
const container = `supabase_db_${project}`;
const database = `roomqc_a1_verify_${randomUUID().replaceAll('-', '')}`;
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const q = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const base = ['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const tables = ['auth.users', 'auth.sessions', 'public.users', 'public.user_roles',
  'public.tenants', 'public.invoices', 'public.payment_transactions'];
function sql(db, statement) {
  return execFileSync('docker', [...base, '-d', db], { input: statement, encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 5_000_000 }).trim();
}
const source = statement => sql('postgres', `BEGIN READ ONLY; ${statement} COMMIT;`);
function isolated(statement) {
  assert.match(database, /^roomqc_a1_verify_[a-f0-9]{32}$/);
  return sql(database, statement);
}
function asyncSQL(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...base, '-d', database], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Isolated query timed out')); }, 20000);
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    child.on('error', reject); child.on('close', code => { clearTimeout(timer); code ? reject(new Error(err)) : resolve(out.trim()); });
    child.stdin.end(statement);
  });
}
async function all(queries) {
  const results = await Promise.allSettled(queries);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}
const parse = raw => JSON.parse(raw.split('\n').find(line => line.startsWith('{') || line.startsWith('[')));
let checks = 0, created = false;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
const actors = Object.fromEntries(['admin','owner','staff'].map(name => [name, { id: randomUUID(), session: randomUUID() }]));
function as(role, statement, actor = null) {
  assert.ok(['anon','authenticated','service_role'].includes(role));
  const claims = JSON.stringify(actor ? { sub: actor.id, session_id: actor.session, role } : { role });
  return `BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s';
    SELECT set_config('request.jwt.claims',${q(claims)},true) IS NOT NULL;
    SET LOCAL ROLE ${role}; ${statement}; COMMIT;`;
}
const summary = (override = {}) => ({ subscription_status: 'success', staff_status: 'success',
  to_grace_period: 0, to_suspended: 0, notifications_sent: 0, notifications_failed: 0,
  transition_outcome_unknown: false, recovery_required: false, error_codes: [], ...override });
const beginSQL = id => `SELECT public.begin_subscription_status_run(${q(id)}::uuid)`;
const finishSQL = (id, result) => `SELECT public.finish_subscription_status_run(${q(id)}::uuid,${q(JSON.stringify(result))}::jsonb)`;
const begin = id => parse(isolated(as('service_role', beginSQL(id))));
const finish = (id, result = summary()) => parse(isolated(as('service_role', finishSQL(id, result))));
const monitor = () => parse(isolated(as('authenticated', 'SELECT public.admin_subscription_job_monitor()', actors.admin)));
function denied(statement, state, label) {
  let error;
  try { isolated('\\set VERBOSITY verbose\n' + statement); } catch (failure) { error = failure; }
  assert.ok(error, label); assert.match(String(error.stderr || error.message), new RegExp(`\\b${state}\\b`), label);
  ok(true, label);
}
const snapshot = () => isolated(`SELECT jsonb_build_object('tenants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tenants t),
  'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payment_transactions p),
  'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoices i));`);

try {
  assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`), '0');
  const ddl = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only','--section=pre-data','--no-owner','--no-privileges','--no-comments','--no-security-labels',
    '--no-tablespaces','--no-publications','--no-subscriptions','--strict-names','--lock-wait-timeout=3000',
    ...tables.map(table => `--table=${table}`)], { encoding: 'utf8', timeout: 30000, maxBuffer: 5_000_000 });
  assert.ok(!/CREATE (FUNCTION|TRIGGER|FOREIGN|SERVER)|COPY .* FROM|^INSERT /m.test(ddl));
  const enumDDL = source(`SELECT 'CREATE TYPE '||quote_ident(n.nspname)||'.'||quote_ident(t.typname)||
    ' AS ENUM ('||string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder)||');'
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.oid IN (SELECT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname||'.'||c.relname IN (${tables.map(q).join(',')}) AND a.attnum>0) GROUP BY n.nspname,t.typname;`);
  const constraints = source(`SELECT 'ALTER TABLE '||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||' ADD CONSTRAINT '||quote_ident(k.conname)||' '||pg_get_constraintdef(k.oid)||';'
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.conrelid IN (${tables.map(table => q(table)+'::regclass').join(',')}) AND k.contype IN ('p','u');`);
  const functions = source(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('auth','uid'),('auth','jwt'),('public','is_super_admin'),('public','platform_support_actor'))
    ORDER BY n.nspname,p.proname,p.pronargs;`);
  assert.equal((functions.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,5);
  const caseMigration = await readFile(new URL('../supabase/migrations/20261017145741_subscription_reconciliation_cases_foundation.sql', import.meta.url),'utf8');
  const actorHelper = caseMigration.match(/CREATE FUNCTION private\.require_reconciliation_case_actor\(\)[\s\S]*?\$fn\$;/)?.[0];
  assert.ok(actorHelper);
  sql('postgres',`CREATE DATABASE ${qi(database)} WITH TEMPLATE template0;`); created = true;
  isolated(`CREATE SCHEMA auth; CREATE SCHEMA private; ${enumDDL}\n${ddl}\n${constraints}\n${functions}\n${actorHelper}
    REVOKE ALL ON FUNCTION private.require_reconciliation_case_actor() FROM PUBLIC,anon,authenticated,service_role;
    REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;`);
  isolated('SET check_function_bodies=true;\n' + await readFile(new URL('../supabase/migrations/20261017155727_subscription_status_job_history.sql',import.meta.url),'utf8'));
  ok(true,'Migration compiles on isolated schema-only dependencies');
  const tenant = randomUUID();
  isolated(`INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at) VALUES
    (${q(tenant)},'Fixture','fixture@example.invalid','active',now()-interval '1 day',now()+interval '1 day'),
    (${q(randomUUID())},'Fixture2','fixture2@example.invalid','grace_period',now()-interval '3 days',now()-interval '1 day'),
    (${q(randomUUID())},'Fixture3','fixture3@example.invalid','trial',now()-interval '3 days',NULL),
    (${q(randomUUID())},'Fixture4','fixture4@example.invalid','active',now()-interval '3 days',now()-interval '1 day');
    ${Object.entries(actors).map(([name,actor]) => `INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(actor.id)},${q(name+'@example.invalid')},now());
    INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(actor.session)},${q(actor.id)},now()+interval '1 hour');
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role) VALUES(${q(actor.id)},${q(tenant)},${q(name)},${q(name+'@example.invalid')},'active',${q(name==='admin'?'super_admin':name)});
    INSERT INTO public.user_roles(user_id,role) VALUES(${q(actor.id)},${q(name==='admin'?'super_admin':name)});`).join('\n')}`);
  const financial = snapshot();
  const empty = monitor();
  ok(empty.last_success_at===null && empty.active===null && empty.runs.length===0 && empty.scheduler_status==='not_observed', 'Empty monitor never invents scheduler or success');
  ok(empty.backlog.eligible_grace===1 && empty.backlog.eligible_suspend===1 && empty.backlog.unhandled_expired_active===2
    && empty.backlog.definition==='legacy_predicates_only','Backlog follows legacy predicates and labels uncovered expired active rows');
  const ids = Array.from({length:20},()=>randomUUID());
  const starts = (await all(ids.map(id=>asyncSQL(as('service_role',beginSQL(id)))))).map(parse);
  ok(starts.filter(row=>row.acquired).length===1 && starts.filter(row=>row.status==='busy').length===19,'20 concurrent starts admit exactly one and persist 19 busy');
  const first = starts.find(row=>row.acquired).run_id;
  ok(begin(first).acquired===false && begin(first).status==='running','Same running run ID never reacquires');
  const busy = starts.find(row=>!row.acquired);
  ok(begin(busy.run_id).status==='busy' && begin(busy.run_id).acquired===false,'Same busy run ID never reacquires');
  ok(monitor().last_success_at===null && monitor().runs.length===20,'Busy attempts never update last success');
  const failedSummary = summary({subscription_status:'failed',notifications_failed:1,recovery_required:true,error_codes:['NOTIFICATION_FAILED']});
  ok(finish(first,failedSummary).status==='failed','Known notification failure is durably failed');
  assert.deepEqual(finish(first,failedSummary),{recorded:true,status:'failed'}); ok(true,'Identical finish replay returns receipt');
  denied(as('service_role',finishSQL(first,summary())),'PT409','Different terminal finish summary rejected');
  ok(begin(first).acquired===false && begin(first).status==='failed','Terminal run ID cannot reacquire');
  const staffRun=randomUUID(); ok(begin(staffRun).acquired,'New run admitted after known terminal failure');
  const staffSummary=summary({staff_status:'failed',recovery_required:true,error_codes:['STAFF_PRESENCE_FAILED']});
  ok(finish(staffRun,staffSummary).status==='failed','Actual mixed sub-success/staff-failure summary accepted');
  const goodRun=randomUUID(); begin(goodRun); finish(goodRun);
  let lastSuccess=monitor().last_success_at;
  ok(lastSuccess!==null,'Only terminal full success updates last_success_at');
  const invalidRun=randomUUID(); begin(invalidRun);
  for(const bad of [null,{},summary({extra:'private-email@example.invalid'}),summary({to_grace_period:null}),
    summary({to_grace_period:-1}),summary({to_suspended:1.5}),summary({notifications_sent:2147483648}),
    summary({recovery_required:null}),summary({error_codes:['RAW_DB_SECRET']}),summary({error_codes:['NOTIFICATION_FAILED','NOTIFICATION_FAILED']}),
    summary({staff_status:'not_run'}),summary({subscription_status:'failed',recovery_required:false,error_codes:['NOTIFICATION_FAILED']})]) {
    denied(as('service_role',finishSQL(invalidRun,bad)),'22023','Malformed/unsafe/inconsistent summary rejected');
  }
  ok(monitor().active.id===invalidRun,'Invalid finish leaves admission blocker in place');
  finish(invalidRun);
  lastSuccess=monitor().last_success_at;
  for(const role of ['anon','authenticated','service_role']) {
    for(const operation of ['SELECT * FROM private.subscription_status_job_runs',
      'DELETE FROM private.subscription_status_job_runs','TRUNCATE private.subscription_status_job_runs',
      "UPDATE private.subscription_status_job_runs SET status='failed'",
      `INSERT INTO private.subscription_status_job_runs(id,status,started_at,deadline_at) VALUES(${q(randomUUID())},'running',now(),now()+interval '15 minutes')`])
      denied(as(role,operation),'42501',`${role} direct ${operation.split(' ')[0]} denied`);
  }
  for(const role of ['anon','authenticated']) {
    denied(as(role,beginSQL(randomUUID())),'42501',`${role} cannot begin job`);
    denied(as(role,finishSQL(goodRun,summary())),'42501',`${role} cannot finish job`);
  }
  denied(as('anon','SELECT public.admin_subscription_job_monitor()'),'42501','Anon cannot monitor');
  denied(as('service_role','SELECT public.admin_subscription_job_monitor()'),'42501','Service without live actor cannot monitor');
  for(const name of ['owner','staff']) denied(as('authenticated','SELECT public.admin_subscription_job_monitor()',actors[name]),'42501',`${name} cannot monitor`);
  for(const [alter,restore,label] of [
    [`UPDATE public.users SET account_locked=true WHERE id=${q(actors.admin.id)}`,`UPDATE public.users SET account_locked=false WHERE id=${q(actors.admin.id)}`,'Locked'],
    [`DELETE FROM auth.sessions WHERE id=${q(actors.admin.session)}`,`INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(actors.admin.session)},${q(actors.admin.id)},now()+interval '1 hour')`,'Revoked'],
    [`DELETE FROM public.user_roles WHERE user_id=${q(actors.admin.id)}`,`INSERT INTO public.user_roles(user_id,role) VALUES(${q(actors.admin.id)},'super_admin')`,'Role removed'],
    [`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${q(actors.admin.id)}`,`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${q(actors.admin.id)}`,'Unconfirmed'],
    [`UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=${q(actors.admin.id)}`,`UPDATE auth.users SET banned_until=NULL WHERE id=${q(actors.admin.id)}`,'Banned'],
    [`UPDATE public.users SET status='inactive' WHERE id=${q(actors.admin.id)}`,`UPDATE public.users SET status='active' WHERE id=${q(actors.admin.id)}`,'Inactive'],
    [`UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=${q(actors.admin.session)}`,`UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=${q(actors.admin.session)}`,'Expired'],
  ]) { isolated(alter); denied(as('authenticated','SELECT public.admin_subscription_job_monitor()',actors.admin),'42501',`${label} admin denied`); isolated(restore); }
  const unknownRun=randomUUID(); begin(unknownRun);
  const unknown=summary({subscription_status:'failed',staff_status:'not_run',transition_outcome_unknown:true,recovery_required:true,error_codes:['JOB_EXECUTION_FAILED']});
  assert.deepEqual(finish(unknownRun,unknown),{recorded:true,status:'interrupted'});
  assert.deepEqual(finish(unknownRun,unknown),{recorded:true,status:'interrupted'});
  ok(begin(randomUUID()).status==='busy' && monitor().active.id===unknownRun,'Unknown transition finish remains interrupted and blocks new runs');
  denied(as('service_role',finishSQL(unknownRun,failedSummary)),'PT409','Unknown outcome replay mismatch rejected');
  // Privileged mutation is confined to disposable DB to simulate reviewed recovery.
  isolated(`UPDATE private.subscription_status_job_runs SET status='failed',summary=${q(JSON.stringify(failedSummary))}::jsonb WHERE id=${q(unknownRun)};`);
  const lateRun=randomUUID(); begin(lateRun);
  isolated(`UPDATE private.subscription_status_job_runs SET started_at=now()-interval '16 minutes',deadline_at=now()-interval '1 minute' WHERE id=${q(lateRun)};`);
  const beforeRead=isolated(`SELECT status FROM private.subscription_status_job_runs WHERE id=${q(lateRun)};`);
  const overdue=monitor();
  ok(overdue.active.status==='interrupted' && beforeRead==='running'
    && isolated(`SELECT status FROM private.subscription_status_job_runs WHERE id=${q(lateRun)};`)==='running','Monitor projects overdue as interrupted without writes');
  assert.deepEqual(finish(lateRun),{recorded:false,status:'interrupted'});
  ok(begin(randomUUID()).status==='busy' && begin(lateRun).acquired===false,'Late finish and subsequent begin cannot take over interrupted work');
  ok(monitor().last_success_at===lastSuccess,'Interrupted/busy never update prior last success');
  const rendered=JSON.stringify(monitor());
  ok(!rendered.includes('@example.invalid') && !rendered.includes('private-email') && !rendered.includes('RAW_DB_SECRET'),'Monitor contains only whitelisted summary, no actor/tenant/provider PII');
  ok(monitor().runs.length===25,'History returns a bounded latest 25 records');
  assert.equal(snapshot(),financial); ok(true,'All history commands leave financial and tenant columns unchanged');
  ok(isolated(`SELECT relrowsecurity FROM pg_class WHERE oid='private.subscription_status_job_runs'::regclass;`)==='t','Private run table RLS enabled');
  ok(isolated(`SELECT bool_and(NOT has_table_privilege(r,'private.subscription_status_job_runs','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) FROM unnest(ARRAY['anon','authenticated','service_role']) r;`)==='t','All client roles lack direct table privileges');
  console.log(`Isolated A1 job history: ${checks} checks passed. Main DB data/runtime/jobs untouched; hosted advisors not run.`);
} finally {
  if(created) {
    assert.match(database,/^roomqc_a1_verify_[a-f0-9]{32}$/);
    sql('postgres',`DROP DATABASE ${qi(database)};`);
    assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`),'0');
    console.log('Only generated isolated database removed; absence verified.');
  }
}
