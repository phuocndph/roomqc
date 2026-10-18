// Only schema/function definitions are read from the main DB. Fixtures and RPCs
// run in a generated template0 database; no account, payment, mail or cron calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const project = (await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')).match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.equal(project, 'ehjtoajnlnuvuiwkpmbp');
const container = `supabase_db_${project}`;
const database = `roomqc_directory_verify_${randomUUID().replaceAll('-', '')}`;
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const tables = ['auth.users','auth.sessions','public.users','public.user_roles',
  'public.tenants','public.subscription_plans','public.tenant_usage','public.invoices','public.activity_logs'];
const base = ['exec','-i',container,'psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
function sql(db, statement) {
  return execFileSync('docker',[...base,'-d',db],{input:statement,encoding:'utf8',timeout:20000,maxBuffer:8_000_000,stdio:['pipe','pipe','pipe']}).trim();
}
const source = statement => sql('postgres',`BEGIN READ ONLY; ${statement} COMMIT;`);
const isolated = statement => { assert.match(database,/^roomqc_directory_verify_[a-f0-9]{32}$/); return sql(database,`SET statement_timeout='10s'; SET lock_timeout='3s'; ${statement}`); };
let created=false, checks=0;
const ok = (value,label) => { assert.ok(value,label); checks++; console.log(`PASS ${label}`); };
const admin=randomUUID(), session=randomUUID(), plan=randomUUID();
function call(args='', claim={sub:admin,session_id:session,role:'authenticated'},role='authenticated',zone='UTC') {
  const result=isolated(`BEGIN; SET LOCAL timezone=${q(zone)};
    SELECT set_config('request.jwt.claims',${q(JSON.stringify(claim))},true) IS NOT NULL;
    SET LOCAL ROLE ${role}; SELECT public.admin_tenant_directory_page(${args}); COMMIT;`);
  return JSON.parse(result.split('\n').find(line=>line.startsWith('{')));
}
function denied(fn,pattern,label) {
  assert.throws(fn,error=>new RegExp(pattern).test(String(error.stderr || error.message)),label); ok(true,label);
}
try {
  const ddl=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres',
    '--schema-only','--section=pre-data','--no-owner','--no-privileges','--no-comments','--no-security-labels',
    '--no-tablespaces','--no-publications','--no-subscriptions','--strict-names','--lock-wait-timeout=3000',
    ...tables.map(table=>`--table=${table}`)],{encoding:'utf8',timeout:30000,maxBuffer:8_000_000});
  assert.ok(!/CREATE (FUNCTION|TRIGGER|FOREIGN|SERVER)|COPY .* FROM|^INSERT /m.test(ddl));
  const enums=source(`SELECT 'CREATE TYPE '||quote_ident(n.nspname)||'.'||quote_ident(t.typname)||' AS ENUM ('||
    string_agg(quote_literal(e.enumlabel),',' ORDER BY e.enumsortorder)||');'
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
    WHERE t.oid IN (SELECT a.atttypid FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname||'.'||c.relname IN (${tables.map(q).join(',')}) AND a.attnum>0) GROUP BY n.nspname,t.typname;`);
  const keys=source(`SELECT 'ALTER TABLE '||quote_ident(n.nspname)||'.'||quote_ident(c.relname)||' ADD CONSTRAINT '||quote_ident(k.conname)||' '||pg_get_constraintdef(k.oid)||';'
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.conrelid IN (${tables.map(table=>q(table)+'::regclass').join(',')}) AND k.contype IN ('p','u');`);
  const helpers=source(`SELECT pg_get_functiondef(p.oid)||';' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('auth','uid'),('auth','jwt'),('public','is_super_admin'),('public','platform_support_actor')) ORDER BY n.nspname,p.proname,p.pronargs;`);
  const actor=(await readFile(new URL('../supabase/migrations/20261017145741_subscription_reconciliation_cases_foundation.sql',import.meta.url),'utf8'))
    .match(/CREATE FUNCTION private\.require_reconciliation_case_actor\(\)[\s\S]*?\$fn\$;/)?.[0];
  assert.ok(actor);
  sql('postgres',`CREATE DATABASE "${database}" WITH TEMPLATE template0;`); created=true;
  isolated(`CREATE SCHEMA auth; CREATE SCHEMA private; ${enums}\n${ddl}\n${keys}\n${helpers}\n${actor}
    REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated,service_role;`);
  isolated(await readFile(new URL('../supabase/migrations/20261018012852_admin_tenant_directory_page.sql',import.meta.url),'utf8'));
  ok(true,'Migration compiles with actual selected schema-only dependencies');
  isolated(`INSERT INTO public.subscription_plans(id,code,name) VALUES(${q(plan)},'directory-fixture','Fixture plan');
    INSERT INTO public.tenants(id,name,email,subscription_status,created_at,approval_status)
      SELECT md5('directory-'||n)::uuid,'Hotel '||lpad(n::text,4,'0'),'hotel'||n||'@example.invalid','active','2026-01-01Z','approved' FROM generate_series(1,1005) n;
    INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,registered_rooms,subscription_plan_id,approval_status)
      VALUES(md5('trial')::uuid,'100%_Trial','literal@example.invalid','trial',current_date-2,0,${q(plan)},'pending'),
      (md5('expired')::uuid,'Expired','expired@example.invalid','active',current_date-1,5,NULL,'approved'),
      (md5('soon')::uuid,'Soon','soon@example.invalid','active',current_date+3,5,NULL,'approved'),
      (md5('suspended')::uuid,'Suspended','suspended@example.invalid','suspended',current_date-1,5,NULL,'rejected');
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(admin)},'directory-admin@example.invalid',now());
    INSERT INTO auth.sessions(id,user_id,not_after) VALUES(${q(session)},${q(admin)},now()+interval '1 hour');
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role) VALUES(${q(admin)},md5('trial')::uuid,'Fixture admin','directory-admin@example.invalid','active','super_admin');
    INSERT INTO public.user_roles(user_id,role) VALUES(${q(admin)},'super_admin');
    INSERT INTO public.invoices(tenant_id,invoice_number,total_amount,status,due_date,period_start,period_end)
      SELECT md5('trial')::uuid,'directory-paid-'||n,100,'paid',current_date,current_date,current_date FROM generate_series(1,1101) n;
    INSERT INTO public.invoices(tenant_id,invoice_number,total_amount,status,due_date,period_start,period_end) VALUES(md5('trial')::uuid,'directory-unpaid',999999,'draft',current_date,current_date,current_date);
    INSERT INTO public.activity_logs(tenant_id,user_name,description,action,entity_type,created_at)
      SELECT md5('directory-1')::uuid,'fixture','fixture','view','fixture',now()+interval '1 day'+n*interval '1 minute' FROM generate_series(1,1101) n;
    INSERT INTO public.activity_logs(tenant_id,user_name,description,action,entity_type,created_at) VALUES(md5('trial')::uuid,'fixture','fixture','view','fixture','2026-01-10Z');`);
  const first=call(), second=call('p_page=>1'), last=call('p_page=>999999');
  ok(first.total===1009 && first.items.length===25,'Exact count crosses the REST 1,000 row boundary');
  ok(second.page===1 && !second.items.some(item=>first.items.some(other=>other.id===item.id)),'Stable timestamp ties do not duplicate between pages');
  ok(last.page===40 && last.items.length===9,'Out-of-range page clamps after matching count');
  const literal=call("p_search=>'  100%_  '");
  ok(literal.total===1 && literal.items[0].name==='100%_Trial','Search trims input and treats SQL wildcard characters literally');
  const trial=literal.items[0];
  ok(trial.actual_status==='trial' && !trial.has_subscription,'Zero paid rooms never relabel an explicit trial');
  ok(trial.lifetime_revenue===110100,'Paid sum includes all 1,101 invoices and excludes draft invoices');
  ok(Date.parse(trial.last_activity)===Date.parse('2026-01-10Z'),'Latest tenant activity survives 1,101 newer other-tenant events');
  ok(call("p_search=>'HOTEL1005@EXAMPLE.INVALID'").total===1,'Search includes email case-insensitively');
  ok(call("p_status=>'expired'").total===1,'Only elapsed active subscriptions become expired for display');
  ok(call("p_status=>'expiring_soon'").total===1,'Expiring filter uses active status and next seven days');
  ok(call(`p_plan=>${q(plan)},p_approval=>'pending',p_status=>'trial'`).total===1,'Plan, approval and trial filters combine before count/page');
  ok(call("p_approval=>'rejected'").total===1 && call("p_status=>'suspended'").total===1,'Approval/status match persisted values');
  const empty=call("p_search=>'No such fixture'");
  ok(empty.total===0 && empty.page===0 && empty.items.length===0 && empty.plans.length===1,'Empty result retains complete plan choices independently of search');
  const names=call("p_sort=>'name',p_desc=>false");
  ok(names.items[0].name==='100%_Trial' && names.items[1].name==='Expired','Name sorting applies across all matches before pagination');
  ok(call("p_status=>'expired'",undefined,'authenticated','Asia/Bangkok').total===call("p_status=>'expired'").total,'UTC expiry is independent of connection timezone');
  isolated(`INSERT INTO public.tenants(name,email,subscription_status,subscription_end_date) VALUES('Today boundary fixture','today@example.invalid','active',current_date);`);
  const today=call("p_search=>'Today boundary fixture'").items[0];
  ok(today.actual_status==='active' && !today.is_expired && today.days_until_expiry===0,'End date today remains valid through the UTC calendar day');
  ok(call("p_search=>'Today boundary fixture',p_status=>'expiring_soon'").total===1
    && call("p_search=>'Today boundary fixture',p_status=>'expired'").total===0,'Today belongs to expiring soon and does not contradict active status');
  for (const args of ["p_page=>-1","p_page_size=>101","p_page_size=>NULL","p_search=>repeat('x',201)","p_status=>'oops'","p_sort=>'lifetime_revenue'","p_desc=>NULL"])
    denied(()=>call(args),'INVALID_TENANT_DIRECTORY_PARAMETERS',`Reject invalid argument ${args}`);
  denied(()=>call('',{},'anon'),'permission denied','Anonymous role cannot invoke directory');
  denied(()=>call('',{role:'service_role'},'service_role'),'permission denied','Service role has no directory execute grant');
  denied(()=>call('',{sub:randomUUID(),session_id:session,role:'authenticated'}),'42501|SUPPORT|ADMIN|SESSION','Different actor cannot reuse an admin session');
  isolated(`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=${q(session)};`);
  denied(()=>call(),'42501|SUPPORT|ADMIN|SESSION','Expired admin session rejected by live helper');
  isolated(`UPDATE auth.sessions SET not_after=now()+interval '1 hour' WHERE id=${q(session)};
    UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=${q(admin)};`);
  denied(()=>call(),'42501|SUPPORT|ADMIN|SESSION','Banned admin rejected even with a still-valid JWT');
  isolated(`UPDATE auth.users SET banned_until=NULL WHERE id=${q(admin)}; DELETE FROM public.user_roles WHERE user_id=${q(admin)};`);
  denied(()=>call(),'42501|SUPPORT|ADMIN|SESSION','Revoked live admin role cannot read tenant financial data');
  ok(isolated(`SELECT count(*) FROM public.invoices;`)==='1102','Read-only directory calls preserve invoice fixtures');
  console.log(`Tenant directory isolated DB: ${checks}/${checks} checks passed`);
} finally {
  if(created) {
    assert.match(database,/^roomqc_directory_verify_[a-f0-9]{32}$/);
    sql('postgres',`DROP DATABASE "${database}";`);
    assert.equal(source(`SELECT count(*) FROM pg_database WHERE datname=${q(database)};`),'0');
    console.log('Isolated directory fixture database removed');
  }
}
