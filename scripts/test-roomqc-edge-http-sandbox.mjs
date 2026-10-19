// Real entrypoint + Edge runtime + supabase-js + PostgREST, on a verified restore.
// Requires backup --keep-sandbox and setup --prepare-only. Cleanup is explicit
// so failed assertions retain evidence; the shared cleanup removes both workers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lockSandbox, readSandbox, saveSandbox, missingDockerObject } from './roomqc-sandbox-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const image = 'public.ecr.aws/supabase/edge-runtime:v1.77.4';
const source = 'supabase_db_ehjtoajnlnuvuiwkpmbp';
const docker = (args, input, timeout = 30000) => execFileSync('docker', args, {
  input, encoding: 'utf8', timeout, maxBuffer: 5_000_000, stdio: ['pipe', 'pipe', 'pipe'],
});
const inspect = name => {
  try { return JSON.parse(docker(['container', 'inspect', name]))[0]; }
  catch (error) { if (missingDockerObject(error)) return null; throw error; }
};
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = (container, text) => docker(['exec', '-i', container, 'psql', '-U',
  container === source ? 'postgres' : 'supabase_admin', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], text).trim();
const fingerprint = (container, tables, where = 'true') => JSON.parse(sql(container, `BEGIN READ ONLY;
  SELECT jsonb_build_object(${tables.flatMap(table => [q(table), `(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text COLLATE "C"),'')) FROM ${table} t WHERE ${where})`]).join(',')}); COMMIT;`));
const financial = ['public.invoices', 'public.payment_transactions'];
const mainTables = ['public.tenants', 'public.users', 'public.staff_status', ...financial,
  'public.in_app_notifications', 'private.subscription_status_job_runs', 'private.subscription_lifecycle_commands',
  'private.subscription_lifecycle_notification_outbox'];
const release = await lockSandbox();
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; console.log('PASS ' + label); };
try {
  const state = await readSandbox();
  assert.ok(state?.tables > 100 && state.phase === 'fixtures' && state.credentials && state.accounts?.owner,
    'Prepare a verified restore with --prepare-only first');
  assert.equal(inspect(state.container)?.Config.Labels['roomqc.restore-verification'], state.run);
  assert.equal(state.network, 'roomqc-acceptance-' + state.run);
  const network = JSON.parse(docker(['network', 'inspect', state.network]))[0];
  assert.ok(network.Internal); assert.equal(network.Labels['roomqc.acceptance'], state.run);
  const mainBefore = fingerprint(source, mainTables);
  const local = text => sql(state.container, text);
  const artifact = name => new URL('../artifacts/' + name, import.meta.url);
  const worker = 'roomqc-edge-' + state.run, bundler = 'roomqc-edge-bundle-' + state.run;
  assert.ok(!inspect(worker) && !inspect(bundler), 'Clean an earlier worker attempt before repeating this harness');
  const bundleFile = artifact(bundler + '.local');
  await writeFile(bundleFile, '', { mode: 0o600 });
  // Copy the existing dependency cache read-only into a disposable container.
  // The bundler has no network, DB credentials, or writable source mount.
  const cache = inspect('supabase_edge_runtime_ehjtoajnlnuvuiwkpmbp')?.Mounts.find(m => m.Destination === '/root/.cache/deno');
  assert.equal(cache?.Type, 'volume');
  state.edge = worker; state.edgeBundler = bundler; await saveSandbox(state);
  docker(['run', '--name', bundler, '--label', 'roomqc.acceptance=' + state.run,
    '--network', 'none', '--pull', 'never', '--mount', `type=volume,source=${cache.Name},target=/cache-source,readonly`,
    '--mount', `type=bind,source=${root}supabase/functions,target=/functions,readonly`,
    '--mount', `type=bind,source=${fileURLToPath(bundleFile)},target=/bundle.eszip`,
    '--entrypoint', 'sh', image, '-c', 'cp -a /cache-source /tmp/deno-cache && DENO_DIR=/tmp/deno-cache edge-runtime bundle --entrypoint /functions/check-subscription-status/index.ts --output /bundle.eszip --timeout 30'], undefined, 45000);
  ok((await readFile(bundleFile)).length > 1000, 'Actual entrypoint bundles offline with copied dependency cache');
  const key = role => {
    const parts = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ role, iss: 'roomqc-sandbox', iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')];
    const body = parts.join('.'); return body + '.' + createHmac('sha256', state.credentials.secret).update(body).digest('base64url');
  };
  const serviceKey = key('service_role'), cron = randomBytes(32).toString('hex');
  const envFile = artifact(worker + '.local');
  await writeFile(envFile, `SUPABASE_URL=http://${state.gateway}\nSUPABASE_SERVICE_ROLE_KEY=${serviceKey}\nCRON_SECRET=${cron}\n`, { mode: 0o600 });
  docker(['run', '-d', '--name', worker, '--label', 'roomqc.acceptance=' + state.run, '--network', state.network,
    '--pull', 'never', '--env-file', fileURLToPath(envFile),
    '--mount', `type=bind,source=${fileURLToPath(bundleFile)},target=/bundle.eszip,readonly`,
    '--entrypoint', 'edge-runtime', image, 'start', '--main-service', '/bundle.eszip',
    '--main-entrypoint', '/functions/check-subscription-status/index.ts', '--port', '9000']);
  const runtime = inspect(worker);
  ok(Object.keys(runtime.NetworkSettings.Networks).length === 1 && runtime.NetworkSettings.Networks[state.network]
    && Object.keys(runtime.NetworkSettings.Ports || {}).length === 0, 'Worker has only internal sandbox network and no published port');
  const endpoint = state.apiUrl + '/functions/v1/check-subscription-status';
  const request = async (body, headers = { 'x-cron-secret': cron }, method = 'POST') => {
    const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(75000) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await request(null, {}, 'GET')).status === 405) { ready = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  ok(ready, 'Real Edge entrypoint reachable through sandbox gateway');
  const beforeRuns = local('SELECT count(*) FROM private.subscription_status_job_runs;');
  const ownerLogin = await fetch(state.apiUrl + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: key('anon'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: state.accounts.owner.email, password: state.accounts.owner.password }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(ownerLogin.status, 200);
  const ownerSession = await ownerLogin.json(); assert.ok(ownerSession.access_token);
  for (const headers of [{}, { 'x-cron-secret': 'incorrect' }, { Authorization: 'Bearer ' + key('anon') },
    { Authorization: 'Bearer ' + ownerSession.access_token }])
    ok((await request({ scope: { kind: 'tenants', tenant_ids: [state.accounts.owner.tenantId] } }, headers)).status === 403,
      'Missing/wrong/anon/owner credentials denied before DB writes');
  for (const body of [{}, { scope: { kind: 'tenants', tenant_ids: [] } }, { scope: { kind: 'cluster' }, extra: true }])
    ok((await request(body)).status === 400, 'Authorized malformed or implicit scope rejected');
  ok(local('SELECT count(*) FROM private.subscription_status_job_runs;') === beforeRuns, 'Denied and invalid requests create no run');

  // Every new tenant is recorded before mutation; failure cannot broaden scope.
  const ids = Array.from({ length: 58 }, () => randomUUID());
  const [active, trial, grace, today, noGrace, outside, ownerless] = ids;
  const bulk = ids.slice(7);
  const owners = new Map(ids.filter(id => id !== ownerless).map(id => [id, randomUUID()]));
  state.edgeFixtureIds = ids; await saveSandbox(state);
  local(`BEGIN;
    INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,grace_period_ends_at)
      VALUES ${ids.map(id => `(${q(id)},'Edge HTTP fixture',${q(id + '@example.invalid')},${q(id === trial ? 'trial' : id === grace ? 'grace_period' : 'active')},
        ${id === today ? 'current_date' : id === grace ? 'current_date-10' : 'current_date-1'},
        ${id === noGrace ? 'NULL' : id === grace ? "now()-interval '1 day'" : "now()+interval '2 days'"})`).join(',')};
    -- Production INSERT trigger derives grace from end date. Set the explicit
    -- legacy/null-grace control afterwards, without altering end date.
    UPDATE public.tenants SET grace_period_ends_at=NULL WHERE id=${q(noGrace)};
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ${[...owners.values()].map(id => `(${q(id)},${q(id + '@example.invalid')},now())`).join(',')};
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code)
      VALUES ${[...owners].map(([tenant, user]) => `(${q(user)},${q(tenant)},'Edge fixture owner',${q(user + '@example.invalid')},'active','owner','tenant_owner')`).join(',')};
    -- Full-schema user triggers already create staff_status rows.
    UPDATE public.staff_status SET status='available',last_seen_at=now()-interval '1 hour'
      WHERE user_id IN (${q(owners.get(active))},${q(owners.get(outside))}); COMMIT;`);
  ok(local(`SELECT subscription_status='grace_period' AND grace_period_ends_at<now()
    FROM public.tenants WHERE id=${q(grace)};`) === 't'
    && local(`SELECT grace_period_ends_at IS NULL FROM public.tenants WHERE id=${q(noGrace)};`) === 't',
    'Fixture expiry states verified after all full-schema triggers');
  const financeBefore = fingerprint(state.container, financial);
  const controlsBefore = fingerprint(state.container, ['public.tenants'], `id NOT IN (${ids.filter(id => id !== outside).map(q).join(',')})`);
  const scoped = [active, trial, grace, today, noGrace, ...bulk];
  const call = tenantIds => request({ scope: { kind: 'tenants', tenant_ids: tenantIds } });
  const first = await call(scoped);
  ok(first.status === 200 && first.body.success && first.body.scope_complete
    && first.body.summary.to_grace_period === 53 && first.body.summary.to_suspended === 1
    && first.body.summary.notifications_sent === 54, 'HTTP worker completes 54 transitions and notifications across full 50-item batches');
  ok(Number(local(`SELECT count(*) FROM private.subscription_lifecycle_batch_receipts
    WHERE run_id=${q(first.body.run_id)} AND (receipt->>'processed')::integer=50;`)) >= 2,
    'Real PostgREST receipts prove full batches for both transition and notification delivery');
  const statuses = JSON.parse(local(`SELECT jsonb_object_agg(id,subscription_status) FROM public.tenants WHERE id IN (${ids.map(q).join(',')});`));
  ok(statuses[active] === 'grace_period' && statuses[trial] === 'grace_period' && statuses[grace] === 'suspended'
    && statuses[today] === 'active' && statuses[noGrace] === 'active' && statuses[outside] === 'active'
    && bulk.every(id => statuses[id] === 'grace_period'),
    'End date today, null grace and excluded tenant preserve the existing expiry policy');
  ok(local(`SELECT status FROM public.staff_status WHERE tenant_id=${q(active)};`) === 'offline'
    && local(`SELECT status FROM public.staff_status WHERE tenant_id=${q(outside)};`) === 'available', 'Staff maintenance respects tenant allowlist');
  const effects = () => fingerprint(state.container, ['private.subscription_lifecycle_commands', 'private.subscription_lifecycle_notification_outbox', 'public.in_app_notifications']);
  const effectsBefore = effects();
  const repeat = await call(scoped);
  ok(repeat.status === 200 && repeat.body.summary.to_grace_period === 0 && repeat.body.summary.to_suspended === 0
    && repeat.body.summary.notifications_sent === 0 && JSON.stringify(effects()) === JSON.stringify(effectsBefore),
    'Repeated HTTP run has no extra commands or notifications');
  const failed = await call([ownerless]);
  ok(failed.status === 500 && failed.body.status === 'failed' && failed.body.summary.notifications_failed === 1,
    'Ownerless delivery is a recorded failed run, never false success');
  const repairedOwner = randomUUID();
  local(`BEGIN; INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(${q(repairedOwner)},${q(repairedOwner + '@example.invalid')},now());
    INSERT INTO public.users(id,tenant_id,full_name,email,status,role,user_level_code)
      VALUES(${q(repairedOwner)},${q(ownerless)},'Repaired fixture owner',${q(repairedOwner + '@example.invalid')},'active','owner','tenant_owner');
    UPDATE private.subscription_lifecycle_notification_outbox o SET available_at=now()-interval '1 second'
      FROM private.subscription_lifecycle_commands c WHERE c.id=o.command_id AND c.tenant_id=${q(ownerless)}; COMMIT;`);
  const repaired = await request({ scope: { kind: 'tenants', tenant_ids: [ownerless] } }, { Authorization: 'Bearer ' + serviceKey });
  ok(repaired.status === 200 && repaired.body.summary.notifications_sent === 1 && repaired.body.summary.to_grace_period === 0,
    'Later service-role HTTP run drains pending outbox after owner repair without a second transition');
  ok(local(`SELECT count(*)=1 AND bool_and(o.status='delivered' AND o.notification_id=c.id AND n.id=c.id)
    FROM private.subscription_lifecycle_commands c
    JOIN private.subscription_lifecycle_notification_outbox o ON o.command_id=c.id
    JOIN public.in_app_notifications n ON n.id=c.id WHERE c.tenant_id=${q(ownerless)};`) === 't',
    'Repaired delivery has exactly one command, acknowledged outbox and deterministic notification');
  ok(JSON.stringify(fingerprint(state.container, financial)) === JSON.stringify(financeBefore), 'All restored invoices and payments unchanged');
  ok(JSON.stringify(fingerprint(state.container, ['public.tenants'], `id NOT IN (${ids.filter(id => id !== outside).map(q).join(',')})`)) === JSON.stringify(controlsBefore),
    'All tenants outside explicit fixture scope unchanged');
  ok(JSON.stringify(fingerprint(source, mainTables)) === JSON.stringify(mainBefore), 'Main DB business rows, job history and notifications unchanged');
  const summary = { run: state.run, verifiedAt: new Date().toISOString(), checks, image, imageId: runtime.Image,
    bundleSha256: createHash('sha256').update(await readFile(bundleFile)).digest('hex'), fixtureTenants: ids.length,
    transport: 'HTTP gateway -> actual Edge entrypoint -> supabase-js -> PostgREST -> restored DB',
    firstRun: first.body, repeatRun: repeat.body, ownerlessRun: failed.body, repairedRun: repaired.body };
  await writeFile(artifact('roomqc-edge-http-result-' + state.run + '.local'), JSON.stringify(summary, null, 2));
  console.log('PASS actual Edge HTTP acceptance: ' + JSON.stringify({ run: state.run, checks, bundleSha256: summary.bundleSha256 }));
} catch (error) {
  console.error('Edge HTTP acceptance failed; sandbox retained for inspection: ' + (error.stderr || error.message));
  process.exitCode = 1;
} finally { await release(); }
