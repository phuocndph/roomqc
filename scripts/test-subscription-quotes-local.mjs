// Phase 2a previews on the running LOOPBACK stack only. No invoice, money,
// gateway, external email or entitlement mutation by the API under test.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { assertDatabaseDenied, boundedFetch, withDeadline } from './lib/customer-journey-checks.mjs';
import { readLocalSupabaseStatus } from './lib/local-supabase-status.mjs';

const local = readLocalSupabaseStatus();
const loopback = value => ['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname);
assert.ok(loopback(local.API_URL) && loopback(local.DB_URL), 'Loopback API and DB only');
const projectId = (await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8'))
  .match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(projectId, 'Local project namespace is required');
const containerEnv = kind => JSON.parse(execFileSync('docker',['inspect',`supabase_${kind}_${projectId}`],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000}))[0].Config.Env;
assert.ok(containerEnv('edge_runtime').includes('ROOMQC_EMAIL_PROVIDER=mailpit'), 'Business email must use Mailpit');
assert.ok(containerEnv('auth').some(value=>/^GOTRUE_SMTP_HOST=.*inbucket/.test(value)), 'Auth must use local SMTP capture');
const mailUrl = new URL(local.INBUCKET_URL || local.MAILPIT_URL || 'http://127.0.0.1:54324').origin;
assert.ok(loopback(mailUrl), 'Only local SMTP capture is allowed');
const fetch = boundedFetch();
const { Pool } = createRequire(new URL('../server/control/package.json', import.meta.url))('pg');
const db = new Pool({ connectionString:local.DB_URL, max:2, connectionTimeoutMillis:5000,
  idleTimeoutMillis:10000, statement_timeout:8000 });
db.on('error', () => { console.error('Local quote DB connection failed'); process.exitCode = 1; });
const options = { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
  global:{ fetch:boundedFetch() } };
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const anon = createClient(local.API_URL, local.ANON_KEY, options);
const userIds = [], tenantIds = [], clients = [], emails = [];
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log(`PASS ${label}`); };
function denied(result, code, message, label) {
  assertDatabaseDenied(result, code, label, message); check(true, label);
}
const quote = (actor, extra = {}) => actor.rpc('create_subscription_quote', {
  p_request_id:randomUUID(), p_kind:'extend', p_rooms:10, p_duration_days:30, ...extra,
});
const success = result => { assert.ifError(result.error); return result.data; };
const tenant = async id => success(await admin.from('tenants').select('*').eq('id',id).single());
async function account() {
  const email = `qc-quote-${randomUUID()}@example.invalid`, password = `QC!${randomUUID()}a9`;
  const user = success(await admin.auth.admin.createUser({ email,password,email_confirm:true })).user;
  userIds.push(user.id);
  emails.push(email);
  const client = createClient(local.API_URL,local.ANON_KEY,options); clients.push(client);
  const session = success(await client.auth.signInWithPassword({ email,password })).session;
  const provision = success(await admin.rpc('provision_workspace_registration', {
    p_workspace_id:randomUUID(), p_owner_id:user.id,
    p_fields:{ fullName:'Quote fixture', phone:'0901234567', tenantName:'Quote fixture',
      hotelName:'Quote fixture', hotelAddress:'123 Test Road', hotelPhone:'0281234567',
      hotelEmail:email, totalRooms:3 },
  }));
  assert.ok(provision.success); tenantIds.push(provision.tenant_id);
  return { client, userId:user.id, tenantId:provision.tenant_id, hotelId:provision.hotel_id,
    claims:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString()),
    accessToken:session.access_token };
}
// Read-only SQL for proof/counts; only these owned fixtures may be selected.
async function countQuotes(id) {
  assert.ok(tenantIds.includes(id));
  return Number((await db.query('SELECT count(*) FROM private.subscription_quotes WHERE tenant_id=$1',[id])).rows[0].count);
}
// Plan edge cases use UNCOMMITTED changes on one connection, always rolled
// back. No real plan configuration changes or migration reapplication.
async function planCase(owner, updateSql, params, expected, label, rooms = 10, days = 90) {
  const connection = await db.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("SET LOCAL lock_timeout='2s'");
    await connection.query(updateSql, params);
    await connection.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(owner.claims)]);
    await connection.query('SET LOCAL ROLE authenticated');
    if (typeof expected === 'string') {
      await assert.rejects(connection.query('SELECT public.create_subscription_quote($1,$2,$3,$4) AS q',
        [randomUUID(),'extend',rooms,days]), error => error.code==='22023' && error.message===expected);
    } else {
      const result = await connection.query('SELECT public.create_subscription_quote($1,$2,$3,$4) AS q',
        [randomUUID(),'extend',rooms,days]);
      assert.equal(result.rows[0].q.total_amount, expected);
    }
    check(true, label);
  } finally { await connection.query('ROLLBACK'); connection.release(); }
}

try {
  await withDeadline(async () => {
    const owner = await account(), outsider = await account();
    const before = await tenant(owner.tenantId);
    const plan = success(await admin.from('subscription_plans').select('*').eq('code','standard').single());
    assert.equal(plan.price_per_room_daily,1000,'Suite expects the existing published local tariff');
    assert.equal(await countQuotes(owner.tenantId),0);
    for (const [days,percent] of [[30,0],[90,5],[180,10],[365,15]]) {
      const q = success(await quote(owner.client,{ p_duration_days:days }));
      check(q.total_amount===10*1000*days-Math.round(10*1000*days*percent/100)
        && q.discount_percent===percent && q.currency==='VND' && q.plan_id===plan.id,
      `Server prices ${days} days and ${percent}% using the paid plan`);
      check(q.checkout_enabled===false && q.pricing_version==='room-daily-v1' && q.basis.registered_rooms===before.registered_rooms,
        `The ${days}-day snapshot preserves basis and is not a payment authorization`);
    }
    const requestId = randomUUID();
    const retries = await Promise.all(Array.from({length:20},() => quote(owner.client,{p_request_id:requestId})));
    const first = success(retries[0]); retries.forEach(result => assert.deepEqual(success(result),first));
    check(await countQuotes(owner.tenantId)===5,'20 concurrent retries persist exactly one identical quote');
    denied(await quote(owner.client,{p_request_id:requestId,p_rooms:11}), '22023','QUOTE_REQUEST_CONFLICT',
      'Reusing a request ID with different inputs is rejected');
    check(await countQuotes(owner.tenantId)===5,'A conflicting retry leaves stored snapshots unchanged');
    assert.deepEqual(await tenant(owner.tenantId),before);
    check(true,'Creating and retrying quotes changes no tenant entitlement or profile field');
    const original = await owner.client.rpc('get_subscription_quote',{p_quote_id:first.quote_id});
    check(JSON.stringify(success(original))===JSON.stringify(first),'Reload retrieves the exact original snapshot');
    denied(await outsider.client.rpc('get_subscription_quote',{p_quote_id:first.quote_id}), 'PT404','QUOTE_NOT_FOUND',
      'Another tenant cannot retrieve a quote by ID');
    denied(await owner.client.rpc('get_subscription_quote',{p_quote_id:randomUUID()}), 'PT404','QUOTE_NOT_FOUND',
      'Unknown and cross-tenant IDs have the same response');
    denied(await quote(anon), '42501',undefined,'Anonymous quote creation is forbidden');
    denied(await anon.rpc('get_subscription_quote',{p_quote_id:first.quote_id}), '42501',undefined,
      'Anonymous quote retrieval is forbidden');
    denied(await quote(admin), '42501',undefined,'A service key alone cannot impersonate an owner checkout');
    for (const inputs of [{p_request_id:null},{p_rooms:0},{p_rooms:-1},{p_rooms:100001},{p_rooms:null},{p_kind:'free'},
      {p_kind:null},{p_duration_days:null},{p_duration_days:0},{p_duration_days:31},{p_duration_days:730},
      {p_kind:'add_rooms',p_duration_days:30}]) {
      denied(await quote(owner.client,inputs),'22023',undefined,`Invalid quote input rejected: ${JSON.stringify(inputs)}`);
    }
    denied(await quote(owner.client,{p_kind:'add_rooms',p_duration_days:null}),'22023','ACTIVE_PAID_SUBSCRIPTION_REQUIRED',
      'A trial cannot buy a prorated paid add-on');
    // This controlled count is not tenant_usage, which may be stale.
    success(await admin.from('rooms').insert([1,2,3].map(i=>({tenant_id:owner.tenantId,hotel_id:owner.hotelId,
      room_number:`Q${i}`,floor:1,room_type:'standard',status:'vacant_clean',base_price:100000}))));
    denied(await quote(owner.client,{p_rooms:2}),'22023','QUOTE_ROOM_LIMIT_INVALID',
      'A quote cannot reduce capacity below actual room rows');
    check(success(await quote(owner.client,{p_rooms:3})).basis.actual_rooms===3,'Server counts actual rooms in its snapshot');
    // Only fixture entitlement changes here, never via the quote API.
    await db.query("UPDATE public.tenants SET subscription_plan_id=$1,subscription_status='active',registered_rooms=10,subscription_end_date=current_date+12,is_read_only=false WHERE id=$2",[plan.id,owner.tenantId]);
    const add = success(await quote(owner.client,{p_kind:'add_rooms',p_rooms:2,p_duration_days:null}));
    check(add.total_amount===24000 && add.target_rooms===12 && add.duration_days===12 && add.discount_percent===0,
      'Paid add-on uses only server-side remaining days and current purchased capacity');
    const future = success(await quote(owner.client));
    check(new Date(future.period_end)-new Date(future.period_start)===30*86400000
      && future.period_start===add.period_end,'Active renewal starts at the existing future expiry');
    await db.query("UPDATE public.tenants SET subscription_end_date=current_date-10,subscription_status='suspended',is_read_only=true,read_only_reason='subscription_expired' WHERE id=$1",[owner.tenantId]);
    const expired = success(await quote(owner.client));
    check(expired.period_start===new Date(expired.quoted_at).toISOString().slice(0,10),
      'An expired subscription renewal starts today, not in the past');
    denied(await quote(owner.client,{p_kind:'add_rooms',p_duration_days:null}),'22023','ACTIVE_PAID_SUBSCRIPTION_REQUIRED',
      'An expired subscription cannot buy an add-on');
    await db.query("UPDATE public.tenants SET read_only_reason='admin_suspended' WHERE id=$1",[owner.tenantId]);
    denied(await quote(owner.client),'42501','TENANT_NOT_ELIGIBLE_FOR_QUOTE','Administrative suspension blocks new quotes');
    check(success(await quote(owner.client,{p_request_id:requestId})).quote_id===first.quote_id,
      'Retry can recover an old preview after suspension, without granting checkout');
    await db.query("UPDATE public.tenants SET subscription_status='trial',read_only_reason=NULL,is_read_only=false WHERE id=$1",[owner.tenantId]);
    await planCase(owner,"UPDATE public.subscription_plans SET price_per_room_daily=1234 WHERE code='standard'",[],1055070,
      'A new quote reads the server plan price, not the frontend constant');
    await planCase(owner,"UPDATE public.subscription_plans SET price_per_room_daily=1001 WHERE code='standard'",[],931681,
      'Fractional discounts are rounded once to integer VND',3,365);
    await planCase(owner,"UPDATE public.subscription_plans SET price_per_room_daily=0 WHERE code='standard'",[],
      'INVALID_SERVER_PRICE_CONFIGURATION','Zero server price fails closed');
    await planCase(owner,"UPDATE public.subscription_plans SET max_rooms=5 WHERE code='standard'",[],
      'QUOTE_ROOM_LIMIT_INVALID','The server plan cap is enforced without silently clamping rooms');
    await planCase(owner,"UPDATE public.subscription_plans SET min_subscription_days=180 WHERE code='standard'",[],
      'DURATION_BELOW_PLAN_MINIMUM','The live server plan minimum duration is enforced');
    check(JSON.stringify(success(await owner.client.rpc('get_subscription_quote',{p_quote_id:first.quote_id})))===JSON.stringify(first),
      'Changing quote inputs, tenant state or price does not mutate an existing snapshot');
    const committedBefore = await countQuotes(owner.tenantId);
    success(await admin.from('users').update({account_locked:true}).eq('id',owner.userId));
    denied(await quote(owner.client),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','Locked owner loses creation access immediately');
    denied(await owner.client.rpc('get_subscription_quote',{p_quote_id:first.quote_id}),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED',
      'Locked owner cannot retrieve old quotes with a still-valid JWT');
    success(await admin.from('users').update({account_locked:false}).eq('id',owner.userId));
    success(await admin.from('user_roles').delete().eq('user_id',owner.userId).eq('role','owner'));
    denied(await quote(owner.client),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','Removing the live owner role blocks creation');
    denied(await owner.client.rpc('get_subscription_quote',{p_quote_id:first.quote_id}),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED',
      'Removing the live owner role blocks retrieval');
    success(await admin.from('user_roles').insert({user_id:owner.userId,role:'owner'}));
    const stale = createClient(local.API_URL,local.ANON_KEY,{...options,
      global:{...options.global,headers:{Authorization:`Bearer ${owner.accessToken}`}}}); clients.push(stale);
    assert.ifError((await owner.client.auth.signOut()).error);
    denied(await quote(stale),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED','A JWT from a logged-out session cannot create a quote');
    denied(await stale.rpc('get_subscription_quote',{p_quote_id:first.quote_id}),'42501','ACTIVE_SUBSCRIPTION_OWNER_REQUIRED',
      'A JWT from a logged-out session cannot retrieve a quote');
    check(await countQuotes(owner.tenantId)===committedBefore,'All authorization failures leave quote count unchanged');
    const noMoney = await db.query(`SELECT
      (SELECT count(*) FROM public.invoices WHERE tenant_id=ANY($1::uuid[])) AS invoices,
      (SELECT count(*) FROM public.payment_transactions WHERE tenant_id=ANY($1::uuid[])) AS payments`,[tenantIds]);
    check(Number(noMoney.rows[0].invoices)===0 && Number(noMoney.rows[0].payments)===0,
      'Quote creation never creates invoices or payment transactions');
    check((await tenant(outsider.tenantId)).subscription_status==='trial','Another tenant entitlement remains unchanged');
    const privileges = await db.query(`SELECT
      has_table_privilege('authenticated','private.subscription_quotes','INSERT,UPDATE,DELETE,SELECT') AS browser,
      has_table_privilege('service_role','private.subscription_quotes','INSERT,UPDATE,DELETE,SELECT') AS service,
      has_function_privilege('anon','public.create_subscription_quote(uuid,text,integer,integer)','EXECUTE') AS anon,
      has_function_privilege('authenticated','private.subscription_quote_actor()','EXECUTE') AS helper`);
    check(Object.values(privileges.rows[0]).every(value=>value===false),'Quote table and internal actor helper expose no direct browser/service grants');
  }, 'subscription quote local suite',180000);
  console.log(`Subscription quote foundation verified: ${checks} checks passed.`);
} finally {
  const failures = [];
  for (const client of clients) {
    try { await withDeadline(async () => { assert.ifError((await client.auth.signOut()).error); },'fixture signout',20000); }
    catch { failures.push('signout'); }
  }
  for (const id of tenantIds) {
    try { await withDeadline(async () => { assert.ifError((await admin.from('tenants').delete().eq('id',id)).error); },'fixture tenant cleanup',20000); }
    catch { failures.push('tenant'); }
  }
  for (const id of userIds) {
    try { await withDeadline(async () => { assert.ifError((await admin.auth.admin.deleteUser(id)).error); },'fixture user cleanup',20000); }
    catch { failures.push('user'); }
  }
  for (const email of emails) {
    try {
      await withDeadline(async () => {
        const response = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        assert.ok(response.ok);
        const messages = (await response.json()).messages || [];
        for (const message of messages.filter(m=>m.To?.some(to=>to.Address?.toLowerCase()===email))) {
          assert.ok((await fetch(`${mailUrl}/api/v1/messages`,{method:'DELETE',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:[message.ID]})})).ok);
        }
        const verify = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
        assert.ok(verify.ok);
        assert.ok(!((await verify.json()).messages || []).some(m=>m.To?.some(to=>to.Address?.toLowerCase()===email)));
      },'fixture captured mail cleanup',20000);
    } catch { failures.push('captured mail'); }
  }
  try {
    const remaining = await db.query(`SELECT
      (SELECT count(*) FROM private.subscription_quotes WHERE tenant_id=ANY($1::uuid[])) AS quotes,
      (SELECT count(*) FROM public.tenants WHERE id=ANY($1::uuid[])) AS tenants,
      (SELECT count(*) FROM auth.users WHERE id=ANY($2::uuid[])) AS users,
      (SELECT count(*) FROM auth.sessions WHERE user_id=ANY($2::uuid[])) AS sessions`,[tenantIds,userIds]);
    assert.ok(Object.values(remaining.rows[0]).every(value=>Number(value)===0));
  } catch { failures.push('verification'); }
  await db.end();
  if (failures.length) { console.error(`Quote fixture cleanup failed: ${failures.join(', ')}`); process.exitCode=1; }
  else console.log('Only owned quote-test tenants, snapshots, accounts and sessions removed and verified.');
}
