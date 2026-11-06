// Focused dependency-schema PostgreSQL integration. Never connects SQL mutations
// to postgres except CREATE/DROP of the exact generated isolated database.
// No Auth HTTP, provider, live fixtures, role changes, env copies or runtime jobs.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const project = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'))
  .match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.equal(project, 'ehjtoajnlnuvuiwkpmbp', 'Only the identified local RoomQC stack is allowed');
const container = `supabase_db_${project}`;
const run = randomUUID().replaceAll('-', '');
const database = `roomqc_a2_verify_${run}`;
assert.match(database, /^roomqc_a2_verify_[a-f0-9]{32}$/);
const qi = name => '"' + name.replaceAll('"', '""') + '"';
const q = value => value === null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const tables = ['auth.users', 'auth.sessions', 'public.users', 'public.user_roles',
  'public.tenants', 'public.invoices', 'public.payment_transactions'];
const inTables = tables.map(q).join(',');
const base = ['exec', '-i', container, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
function sync(db, statement) {
  return execFileSync('docker', [...base, '-d', db], { input: statement, encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 5_000_000 }).trim();
}
const source = statement => sync('postgres', `BEGIN READ ONLY;\n${statement}\nCOMMIT;`);
function isolated(statement) {
  assert.match(database, /^roomqc_a2_verify_[a-f0-9]{32}$/);
  return sync(database, statement);
}
function asyncSQL(statement) {
  return new Promise((resolve, reject) => {
    const process = spawn('docker', [...base, '-d', database], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', error = '';
    const timer = setTimeout(() => { process.kill(); reject(new Error('Isolated query timed out')); }, 20000);
    process.stdout.on('data', chunk => { out += chunk; });
    process.stderr.on('data', chunk => { error += chunk; });
    process.on('error', reject);
    process.on('close', code => {
      clearTimeout(timer);
      if (code) reject(new Error(error.trim())); else resolve(out.trim());
    });
    process.stdin.end(statement);
  });
}
async function settleAll(queries) {
  // Drain every child before cleanup even if one fails; do not drop a database
  // while another fixture query is still using it or force-terminate sessions.
  const results = await Promise.allSettled(queries);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}
const parse = raw => JSON.parse(raw.split('\n').find(line => line.startsWith('{') || line.startsWith('[')));
let checks = 0, created = false;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
const actors = Object.fromEntries(['admin', 'admin2', 'owner', 'staff'].map(name =>
  [name, { id: randomUUID(), session: randomUUID() }]));
const tenant = randomUUID(), other = randomUUID(), invoice = randomUUID(), foreignInvoice = randomUUID();
const payment = randomUUID(), racePayment = randomUUID(), crossed = randomUUID(), gone = randomUUID(), failed = randomUUID();
const claims = actor => JSON.stringify(actor ? { sub: actor.id, session_id: actor.session, role: 'authenticated' } : { role: 'anon' });
function asActor(actor, statement, role = actor ? 'authenticated' : 'anon') {
  assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
  return `BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='8s';
    SELECT set_config('request.jwt.claims',${q(claims(actor))},true) IS NOT NULL;
    SET LOCAL ROLE ${role}; ${statement}; COMMIT;`;
}
const read = (actor, id = payment, before = null, role) => parse(isolated(asActor(actor,
  `SELECT public.admin_subscription_reconciliation_case(${q(id)}::uuid,${q(before)}::integer)`, role)));
const commandSQL = (id, request, action, note, version) => `SELECT public.admin_mutate_subscription_reconciliation_case(
  ${q(id)}::uuid,${q(request)}::uuid,${q(action)},${q(note)},${q(version)}::integer)`;
const write = (actor, id, request, action = 'create', note = 'Inspect source', version = null) =>
  parse(isolated(asActor(actor, commandSQL(id, request, action, note, version))));
function denied(action, state, label) {
  let error;
  try { action(); } catch (failure) { error = failure; }
  assert.ok(error, label);
  assert.match(String(error.stderr || error.message), new RegExp(`\\b${state}\\b`), label);
  ok(true, label);
}
const sqlError = statement => `\\set VERBOSITY verbose\n${statement}`;
const deniedRead = (actor, label, role) => denied(() => isolated(sqlError(asActor(actor,
  `SELECT public.admin_subscription_reconciliation_case(${q(payment)}::uuid)`, role))), '42501', label);
const deniedWrite = (actor, request, label, role) => denied(() => isolated(sqlError(asActor(actor,
  commandSQL(payment, request, 'create', 'Inspect source', null), role))), '42501', label);
const financialSnapshot = () => parse(isolated(`SELECT jsonb_build_object(
  'tenants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tenants t),
  'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.invoices i),
  'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.payment_transactions p));`));

try {
  assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`), '0');
  // Read DDL only. No pg_dump data sections, security-definer app triggers, cron,
  // foreign server, vault or secrets are cloned into the test database.
  const ddl = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema-only', '--section=pre-data', '--no-owner', '--no-privileges', '--no-comments',
    '--no-security-labels', '--no-tablespaces', '--no-publications', '--no-subscriptions',
    '--strict-names', '--lock-wait-timeout=3000', ...tables.map(table => `--table=${table}`)],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 5_000_000 });
  assert.ok(!/CREATE (FUNCTION|TRIGGER|FOREIGN|SERVER)|COPY .* FROM|^INSERT /m.test(ddl));
  const enumDDL = source(`SELECT 'CREATE TYPE '||quote_ident(n.nspname)||'.'||quote_ident(t.typname)||
    ' AS ENUM ('||string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder)||');'
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.oid IN (SELECT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname||'.'||c.relname IN (${inTables}) AND a.attnum>0)
    GROUP BY n.nspname,t.typname ORDER BY n.nspname,t.typname;`);
  assert.equal(enumDDL.split('\n').length, 2, 'Review any new enum/type dependencies');
  const constraints = source(`SELECT 'ALTER TABLE '||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||
    ' ADD CONSTRAINT '||quote_ident(k.conname)||' '||pg_get_constraintdef(k.oid)||';'
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.conrelid IN
    (${tables.map(table => q(table) + '::regclass').join(',')}) AND k.contype IN ('p','u') ORDER BY k.conrelid,k.conname;`);
  const functionDDL = source(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('auth','uid'),('auth','jwt'),('public','is_super_admin'),('public','platform_support_actor'))
    ORDER BY n.nspname,p.proname,p.pronargs;`);
  assert.equal((functionDDL.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 5);
  sync('postgres', `CREATE DATABASE ${qi(database)} WITH TEMPLATE template0;`); created = true;
  isolated(`CREATE SCHEMA auth; CREATE SCHEMA private; ${enumDDL}\n${ddl}\n${constraints}\n${functionDDL}
    REVOKE ALL ON FUNCTION public.platform_support_actor() FROM PUBLIC,anon,service_role;
    GRANT EXECUTE ON FUNCTION public.platform_support_actor() TO authenticated;
    REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;`);
  isolated('SET check_function_bodies=true;\n' + await readFile(new URL('../supabase/migrations/20261017145741_subscription_reconciliation_cases_foundation.sql', import.meta.url), 'utf8'));
  ok(true, 'Migration compiles on isolated exact dependency-table schema');
  isolated(`INSERT INTO public.tenants(id,name,email,registered_rooms,subscription_status)
    VALUES(${q(tenant)},'Isolated A2','a2@example.invalid',3,'trial'),(${q(other)},'Other','other@example.invalid',7,'active');
    INSERT INTO public.invoices(id,tenant_id,invoice_number,due_date,period_start,period_end,total_amount)
    VALUES(${q(invoice)},${q(tenant)},'ISOLATED-A2',CURRENT_DATE,CURRENT_DATE,CURRENT_DATE+30,90000),
      (${q(foreignInvoice)},${q(other)},'PRIVATE-FOREIGN',CURRENT_DATE,CURRENT_DATE,CURRENT_DATE+30,70000);
    INSERT INTO public.payment_transactions(id,tenant_id,invoice_id,amount,payment_status,metadata) VALUES
      ${[payment,racePayment,gone].map(id => `(${q(id)},${q(tenant)},${q(invoice)},90000,'pending','{"private_payload":"not copied"}')`).join(',')},
      (${q(crossed)},${q(tenant)},${q(foreignInvoice)},90000,'completed','{}'),
      (${q(failed)},${q(tenant)},${q(invoice)},90000,'failed','{}');
    ${Object.entries(actors).map(([name, actor]) => `INSERT INTO auth.users(id,email,email_confirmed_at)
      VALUES(${q(actor.id)},${q(name+'@example.invalid')},now());
      INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(actor.session)},${q(actor.id)},now()+interval '1 hour');
      INSERT INTO public.users(id,tenant_id,full_name,email,status,role) VALUES(${q(actor.id)},${q(tenant)},${q(name)},${q(name+'@example.invalid')},'active',${q(name.startsWith('admin')?'super_admin':name)});
      INSERT INTO public.user_roles(user_id,role) VALUES(${q(actor.id)},${q(name.startsWith('admin')?'super_admin':name)});`).join('\n')}`);
  const original = financialSnapshot();
  const request = randomUUID();
  deniedRead(null,'Anonymous cannot read'); deniedWrite(null,request,'Anonymous cannot write');
  deniedRead(null,'Service role without live actor cannot read','service_role');
  deniedWrite(null,request,'Service role cannot mutate without actor','service_role');
  for (const name of ['owner','staff']) { deniedRead(actors[name],name+' cannot read'); deniedWrite(actors[name],request,name+' cannot write'); }
  const empty = read(actors.admin);
  ok(empty.case===null && empty.events.length===0 && empty.source.tenant_id===tenant && empty.source.can_create,
    'Live platform admin reads exact server-scoped source capability');
  const replies = await settleAll(Array.from({length:20}, () => asyncSQL(asActor(actors.admin,
    commandSQL(payment,request,'create','Inspect source',null)))));
  const first = parse(replies[0]); replies.forEach(reply => assert.deepEqual(parse(reply),first));
  ok(first.created && first.case.version===1,'20 concurrent same-request creates return identical committed receipt');
  ok(isolated(`SELECT count(*) FROM private.subscription_reconciliation_cases WHERE payment_id=${q(payment)};`)==='1'
    && read(actors.admin).events.length===1,'Exactly one case and one create event exist');
  denied(() => isolated(sqlError(asActor(actors.admin,commandSQL(payment,request,'create','Different note',null)))),
    'PT409','Request ID cannot be reused with different content');
  const both = await settleAll([actors.admin,actors.admin2].map(actor => asyncSQL(asActor(actor,
    commandSQL(racePayment,randomUUID(),'create','Racing admin',null)))));
  const createdResults = both.map(parse);
  ok(createdResults.filter(result=>result.created).length===1
    && createdResults[0].case.id===createdResults[1].case.id,'Two admins create one source case, loser opens existing case');
  ok(read(actors.admin,racePayment).events.length===1,'Competing create does not silently save a second note');
  const noteRequest=randomUUID();
  const note = write(actors.admin,payment,noteRequest,'note','Note committed before lost response',1);
  assert.deepEqual(write(actors.admin,payment,noteRequest,'note','Note committed before lost response',1),note);
  ok(read(actors.admin).events.length===2,'Lost-response replay returns original receipt without duplicate note');
  const noteRace = await Promise.allSettled([actors.admin,actors.admin2].map(actor => asyncSQL(sqlError(asActor(actor,
    commandSQL(payment,randomUUID(),'note','Concurrent versioned note',2))))));
  ok(noteRace.filter(result=>result.status==='fulfilled').length===1
    && noteRace.filter(result=>result.status==='rejected').every(result=>/PT409/.test(result.reason.message)),
    'Two writers at one version yield one note and one version conflict');
  ok(read(actors.admin).case.version===3 && read(actors.admin).events.length===3,'Version race preserves complete history');
  const cross = write(actors.admin,crossed,randomUUID());
  ok(cross.case.invoice_id===null && cross.case.tenant_id===tenant
    && cross.case.source_snapshot.invoice_status===null && !cross.case.source_snapshot.invoice_same_tenant,
    'Foreign invoice ID/content never copied into case snapshot');
  ok(!JSON.stringify(cross).includes('private_payload') && !JSON.stringify(cross).includes('PRIVATE-FOREIGN'),
    'Raw metadata and foreign invoice content omitted');
  ok(!read(actors.admin,failed).source.can_create,'Ineligible source returns explicit false capability');
  denied(() => isolated(sqlError(asActor(actors.admin,commandSQL(failed,randomUUID(),'create','No',null)))),
    'PT409','Ineligible source cannot create a case');
  for (let version=3;version<58;version++) write(actors.admin,payment,randomUUID(),'note',`History ${version+1}`,version);
  const page1=read(actors.admin),page2=read(actors.admin,payment,page1.next_before_version);
  const versions=[...page1.events,...page2.events].map(event=>event.version);
  assert.deepEqual(versions,Array.from({length:58},(_,index)=>58-index));
  ok(page1.events.length===50 && page1.has_more && page1.next_before_version===9
    && page2.events.length===8 && !page2.has_more,'58 events paginate without duplicate or missing versions');
  for (const actor of [actors.admin,actors.owner]) for(const table of ['subscription_reconciliation_cases','subscription_reconciliation_case_events','subscription_reconciliation_case_receipts'])
    for(const operation of [`SELECT * FROM private.${table}`,`UPDATE private.${table} SET created_at=now()`,
      `DELETE FROM private.${table}`,`TRUNCATE private.${table}`])
      denied(()=>isolated(sqlError(asActor(actor,operation))),'42501',`${actor===actors.admin?'Admin':'Owner'} direct ${operation.split(' ')[0]} blocked on ${table}`);
  for(const table of ['subscription_reconciliation_case_events','subscription_reconciliation_case_receipts'])
    for(const operation of [`UPDATE private.${table} SET created_at=now()`,`DELETE FROM private.${table}`,`TRUNCATE private.${table}`])
      denied(()=>isolated(sqlError(operation)),'42501',`Privileged ${operation.split(' ')[0]} history mutation rejected`);
  for(const scenario of [
    [`UPDATE public.users SET account_locked=true WHERE id=${q(actors.admin.id)}`,`UPDATE public.users SET account_locked=false WHERE id=${q(actors.admin.id)}`,'Locked admin'],
    [`UPDATE public.users SET status='inactive' WHERE id=${q(actors.admin.id)}`,`UPDATE public.users SET status='active' WHERE id=${q(actors.admin.id)}`,'Inactive admin'],
    [`DELETE FROM public.user_roles WHERE user_id=${q(actors.admin.id)} AND role='super_admin'`,`INSERT INTO public.user_roles(user_id,role) VALUES(${q(actors.admin.id)},'super_admin')`,'Removed role'],
    [`UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=${q(actors.admin.id)}`,`UPDATE auth.users SET banned_until=NULL WHERE id=${q(actors.admin.id)}`,'Banned admin'],
    [`UPDATE auth.users SET email_confirmed_at=NULL WHERE id=${q(actors.admin.id)}`,`UPDATE auth.users SET email_confirmed_at=now() WHERE id=${q(actors.admin.id)}`,'Unconfirmed admin'],
    [`UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=${q(actors.admin.session)}`,`UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=${q(actors.admin.session)}`,'Expired session'],
    [`DELETE FROM auth.sessions WHERE id=${q(actors.admin.session)}`,`INSERT INTO auth.sessions(id,user_id) VALUES(${q(actors.admin.session)},${q(actors.admin.id)})`,'Revoked session'],
  ]) {
    isolated(scenario[0]); deniedRead(actors.admin,scenario[2]+' cannot read');
    deniedWrite(actors.admin,request,scenario[2]+' cannot replay committed receipt'); isolated(scenario[1]);
  }
  assert.deepEqual(financialSnapshot(),original); ok(true,'All case commands leave every financial and tenant column unchanged');
  write(actors.admin,gone,randomUUID()); isolated(`DELETE FROM public.payment_transactions WHERE id=${q(gone)};`);
  ok(read(actors.admin,gone).case.payment_id===gone && !read(actors.admin,gone).source.can_create,'Deleted legacy source preserves case and history');
  isolated(`UPDATE public.payment_transactions SET tenant_id=${q(other)} WHERE id=${q(payment)};`);
  denied(()=>isolated(sqlError(asActor(actors.admin,`SELECT public.admin_subscription_reconciliation_case(${q(payment)}::uuid)`))),
    'PT409','Source changed tenant blocks case read');
  denied(()=>isolated(sqlError(asActor(actors.admin,commandSQL(payment,randomUUID(),'note','Blocked',58)))),
    'PT409','Source changed tenant blocks new note');
  ok(isolated(`SELECT bool_and(relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'subscription_reconciliation_case%';`)==='t','All private case tables have RLS enabled');
  ok(isolated(`SELECT bool_and(NOT has_table_privilege(r.role,c.oid,'INSERT'))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN (VALUES('anon'),('authenticated'),('service_role')) r(role)
    WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'subscription_reconciliation_case%';`)==='t',
    'Anonymous/authenticated/service roles have no direct INSERT grants on any case table');
  console.log(`Isolated A2 database integration: ${checks} checks passed. Auth HTTP/browser/advisors not run.`);
} finally {
  if(created) {
    // Exact generated DB name only. No FORCE and no terminating other sessions.
    assert.match(database,/^roomqc_a2_verify_[a-f0-9]{32}$/);
    sync('postgres',`DROP DATABASE ${qi(database)};`);
    assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`),'0');
    console.log('Only generated isolated database removed; absence verified. Main schema/data untouched.');
  }
}
