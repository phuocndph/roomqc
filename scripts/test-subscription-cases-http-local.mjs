// Uses ONLY the manifest-owned A0 local fixtures. Writes are inside one SQL
// transaction that ALWAYS rolls back; no retained audit history is removed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const original = new URL('../', import.meta.url);
const manifestFile = process.env.ROOMQC_FIXTURE_MANIFEST;
assert.ok(manifestFile, 'Set ROOMQC_FIXTURE_MANIFEST to the existing local A0 manifest');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
assert.equal(manifest.project, 'ehjtoajnlnuvuiwkpmbp');
assert.match(manifest.run, /^[a-f0-9]{8}$/);
const raw = execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx --no-install supabase status --output json'],
  { cwd: original, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
const local = JSON.parse(raw.slice(raw.indexOf('{')));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname));
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.DB_URL).hostname));
const container = 'supabase_db_ehjtoajnlnuvuiwkpmbp';
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = statement => execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres',
  '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 }).trim();
const clients = [];
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
const options = { auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } };
try {
  const actors = {};
  for (const role of ['admin', 'owner', 'staff']) {
    const fixture = manifest.accounts[role];
    assert.equal(fixture.email, `qc-a0-${manifest.run}-${role}@example.invalid`);
    assert.ok(manifest.users.some(user => user.id === fixture.user_id && user.email === fixture.email));
    const client = createClient(local.API_URL, local.ANON_KEY, options); clients.push(client);
    const { data, error } = await client.auth.signInWithPassword({ email: fixture.email,
      password: 'RoomQC-A0-Local-Only!2026' });
    assert.ifError(error); assert.equal(data.user.id, fixture.user_id);
    const jwt = JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString());
    assert.equal(jwt.sub, fixture.user_id); assert.ok(jwt.session_id);
    actors[role] = { client, claims: { sub: jwt.sub, session_id: jwt.session_id, role: jwt.role } };
  }
  const admin = actors.admin.client;
  const queue = await admin.rpc('admin_subscription_reconciliation', {
    p_tenant_id: manifest.accounts.other.tenant_id, p_limit: 25,
  });
  assert.ifError(queue.error);
  const payment = queue.data.rows[0].id;
  const read = client => client.rpc('admin_subscription_reconciliation_case', { p_payment_id: payment });
  const initial = await read(admin); assert.ifError(initial.error);
  ok(initial.data.case === null && initial.data.source.can_create, 'Auth HTTP admin reads empty source case through PostgREST');
  for (const role of ['owner', 'staff']) {
    ok((await read(actors[role].client)).error?.code === '42501', `Auth HTTP ${role} cannot read support case`);
    ok((await actors[role].client.rpc('admin_mutate_subscription_reconciliation_case', {
      p_payment_id: payment, p_request_id: randomUUID(), p_action: 'create', p_note: 'Denied fixture',
    })).error?.code === '42501', `Auth HTTP ${role} cannot create case`);
  }
  const anon = createClient(local.API_URL, local.ANON_KEY, options);
  ok((await read(anon)).error?.code === '42501', 'Anonymous HTTP cannot read support case');
  const request = randomUUID();
  const claims = q(JSON.stringify(actors.admin.claims));
  // Real auth session + actual app RLS/triggers/functions, with no committed writes.
  const output = sql(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s';
    SELECT set_config('request.jwt.claims',${claims},true) IS NOT NULL;
    SET LOCAL ROLE authenticated;
    DO $verify$ DECLARE first jsonb; replay jsonb; page jsonb; i integer; BEGIN
      first := public.admin_mutate_subscription_reconciliation_case(${q(payment)},${q(request)},'create','Transactional acceptance',NULL);
      IF NOT (first->>'created')::boolean THEN RAISE EXCEPTION 'Expected new fixture case'; END IF;
      FOR i IN 1..20 LOOP
        replay := public.admin_mutate_subscription_reconciliation_case(${q(payment)},${q(request)},'create','Transactional acceptance',NULL);
        IF replay IS DISTINCT FROM first THEN RAISE EXCEPTION 'Receipt mismatch'; END IF;
      END LOOP;
      PERFORM public.admin_mutate_subscription_reconciliation_case(${q(payment)},${q(randomUUID())},'note','Versioned acceptance',1);
      page := public.admin_subscription_reconciliation_case(${q(payment)},NULL);
      IF jsonb_array_length(page->'events')<>2 OR (page->'case'->>'version')::integer<>2 THEN RAISE EXCEPTION 'Invalid version/history'; END IF;
    END $verify$;
    RESET ROLE;
    SELECT 'transactional_create_replay_note_passed';
    ROLLBACK;`);
  ok(output.includes('transactional_create_replay_note_passed'), 'Live schema transactional create + 20 receipt replays + versioned note pass');
  const after = await read(admin); assert.ifError(after.error);
  ok(after.data.case === null && after.data.events.length === 0, 'Rollback verified through PostgREST: no retained test case or audit event');
  assert.equal(sql(`SELECT count(*) FROM private.subscription_reconciliation_cases WHERE payment_id=${q(payment)};`), '0');
  const lockClaims = q(JSON.stringify(actors.admin.claims));
  sql(`BEGIN; UPDATE public.users SET account_locked=true WHERE id=${q(manifest.accounts.admin.user_id)};
    SELECT set_config('request.jwt.claims',${lockClaims},true) IS NOT NULL; SET LOCAL ROLE authenticated;
    DO $verify$ BEGIN
      BEGIN PERFORM public.admin_subscription_reconciliation_case(${q(payment)},NULL); RAISE EXCEPTION 'Unexpected read';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END $verify$; ROLLBACK;`);
  ok(true, 'Actual live actor helper denies locked admin in rolled-back transaction');
  console.log(`Local Auth HTTP + transactional case acceptance: ${checks} checks passed; no committed case writes.`);
} finally {
  await Promise.all(clients.map(client => client.auth.signOut({ scope: 'local' })));
}
