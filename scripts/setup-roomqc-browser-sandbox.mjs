// Resumable acceptance stack. Every write targets the verified disposable DB.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createECDH, createHmac, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { lockSandbox, missingDockerObject, readSandbox, saveSandbox } from './roomqc-sandbox-state.mjs';
import { provisionSandboxAccounts } from './roomqc-sandbox-fixtures.mjs';

const release = await lockSandbox();
try {
  const state = await readSandbox();
  assert.ok(state?.tables > 100 && state.backupDir, 'Complete a verified --keep-sandbox restore first');
  const save = () => saveSandbox(state);
  const artifact = name => new URL('../artifacts/' + name, import.meta.url);
  const docker = (args, input, timeout = 30000) => execFileSync('docker', args, {
    input, encoding: 'utf8', timeout, maxBuffer: 10_000_000, stdio: ['pipe', 'pipe', 'pipe'],
    cwd: fileURLToPath(new URL('../', import.meta.url)),
  });
  const inspect = name => {
    try { return JSON.parse(docker(['container', 'inspect', name]))[0]; }
    catch (error) { if (missingDockerObject(error)) return null; throw error; }
  };
  const database = inspect(state.container);
  assert.equal(database?.Config.Labels['roomqc.restore-verification'], state.run);
  if (!database.State.Running) docker(['start', state.container]);
  const sql = statement => docker(['exec', '-i', state.container, 'psql', '-U', 'supabase_admin',
    '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], statement);
  let databaseReady = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql('SELECT 1;'); databaseReady = true; break; } catch { await new Promise(accept => setTimeout(accept, 250)); }
  }
  assert.ok(databaseReady, 'Sandbox DB must be ready');
  if (!state.credentials) {
    let previous;
    if (state.auth) {
      try { previous = parseEnv(await readFile(artifact(state.auth + '.local'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      assert.ok(previous || !inspect(state.auth), 'Existing Auth requires its saved credentials');
    }
    state.credentials = { secret: previous?.GOTRUE_JWT_SECRET || randomBytes(48).toString('hex'),
      password: previous ? new URL(previous.GOTRUE_DB_DATABASE_URL).password : randomBytes(32).toString('hex') };
    await save();
  }
  const { secret, password } = state.credentials;
  assert.match(secret, /^[a-f0-9]{96}$/); assert.match(password, /^[a-f0-9]{64}$/);
  const token = role => {
    const body = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ role, iss: 'roomqc-sandbox', iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 14400 })).toString('base64url')].join('.');
    return body + '.' + createHmac('sha256', secret).update(body).digest('base64url');
  };
  Object.assign(state, { network: 'roomqc-acceptance-' + state.run, auth: 'roomqc-auth-' + state.run,
    rest: 'roomqc-rest-' + state.run, gateway: 'roomqc-api-' + state.run, frontend: 'roomqc-web-' + state.run,
    apiUrl: 'http://127.0.0.1:18921', webUrl: 'http://127.0.0.1:18082' });
  state.services = [state.frontend, state.gateway, state.rest, state.auth];
  await save();
  let network;
  try { network = JSON.parse(docker(['network', 'inspect', state.network]))[0]; }
  catch (error) { if (!missingDockerObject(error)) throw error; }
  if (!network) {
    docker(['network', 'create', '--internal', '--label', 'roomqc.acceptance=' + state.run, state.network]);
    network = JSON.parse(docker(['network', 'inspect', state.network]))[0];
  }
  assert.equal(network.Labels['roomqc.acceptance'], state.run); assert.ok(network.Internal);
  const attached = inspect(state.container).NetworkSettings.Networks;
  if (attached.none) docker(['network', 'disconnect', 'none', state.container]);
  if (!attached[state.network]) docker(['network', 'connect', '--alias', 'db', state.network, state.container]);
  const subnet = network.IPAM.Config[0].Subnet;
  assert.match(subnet, /^172\.\d+\.\d+\.0\/\d+$/);
  const hbaFile = artifact('roomqc-sandbox-hba-' + state.run + '.local');
  await writeFile(hbaFile, `local all all trust\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ${subnet} scram-sha-256\n`, { mode: 0o600 });
  docker(['cp', fileURLToPath(hbaFile), state.container + ':/tmp/roomqc-restore-data/pg_hba.conf']);
  sql(`SELECT pg_reload_conf(); ALTER ROLE authenticator PASSWORD '${password}';
    ALTER ROLE supabase_auth_admin PASSWORD '${password}'; ALTER ROLE authenticator RESET session_preload_libraries;`);
  const start = async (name, image, env) => {
    const envFile = artifact(name + '.local');
    const existing = inspect(name);
    if (existing) {
      assert.equal(existing.Config.Labels['roomqc.acceptance'], state.run);
      for (const [key, value] of Object.entries(env)) assert.ok(existing.Config.Env.includes(key + '=' + value), 'Sandbox service configuration changed: ' + key);
    }
    await writeFile(envFile, Object.entries(env).map(([k, v]) => k + '=' + v).join('\n'), { mode: 0o600 });
    if (existing) { if (!existing.State.Running) docker(['start', name]); }
    else docker(['run', '-d', '--name', name, '--label', 'roomqc.acceptance=' + state.run,
      '--network', state.network, '--env-file', fileURLToPath(envFile), image]);
  };
  await start(state.auth, 'public.ecr.aws/supabase/gotrue:v2.197.0', {
    GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: state.apiUrl + '/auth/v1', GOTRUE_SITE_URL: state.webUrl,
    GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@db:5432/postgres?sslmode=disable`,
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_EXP: '3600', GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_DISABLE_SIGNUP: 'true',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'true',
  });
  await start(state.rest, 'public.ecr.aws/supabase/postgrest:v16.4', {
    PGRST_DB_URI: `postgres://authenticator:${password}@db:5432/postgres?sslmode=disable`,
    PGRST_DB_SCHEMAS: 'public', PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret, PGRST_SERVER_PORT: '3000',
  });
  const confFile = artifact('roomqc-sandbox-nginx-' + state.run + '.local');
  await writeFile(confFile, `server { listen 80; server_name _;
    add_header Access-Control-Allow-Origin "${state.webUrl}" always;
    add_header Access-Control-Allow-Headers "authorization,apikey,content-type,x-client-info,prefer,x-supabase-api-version,accept-profile,content-profile,range,x-upsert" always;
    add_header Access-Control-Allow-Methods "GET,POST,PATCH,DELETE,OPTIONS" always;
    if ($request_method = OPTIONS) { return 204; }
    location /auth/v1/ { proxy_hide_header Access-Control-Allow-Origin; proxy_pass http://${state.auth}:9999/; }
    location /rest/v1/ { proxy_hide_header Access-Control-Allow-Origin; proxy_pass http://${state.rest}:3000/; }
    location / { default_type application/json; return 503 '{"error":"SANDBOX_EXTERNAL_SERVICE_DISABLED"}'; }
  }`);
  let gateway = inspect(state.gateway);
  if (!gateway) {
    docker(['create', '--name', state.gateway, '--label', 'roomqc.acceptance=' + state.run,
      '--network', 'bridge', '-p', '127.0.0.1:18921:80', 'nginx:alpine']);
    gateway = inspect(state.gateway);
  }
  assert.equal(gateway.Config.Labels['roomqc.acceptance'], state.run);
  if (!gateway.NetworkSettings.Networks[state.network]) docker(['network', 'connect', state.network, state.gateway]);
  // Copy only while stopped, so a retry never changes an active nginx config.
  if (gateway.State.Running) docker(['stop', state.gateway]);
  docker(['cp', fileURLToPath(confFile), state.gateway + ':/etc/nginx/conf.d/default.conf']);
  docker(['start', state.gateway]);
  let healthy = false;
  for (let n = 0; n < 40; n++) {
    try { const r = await fetch(state.apiUrl + '/auth/v1/health', { signal: AbortSignal.timeout(2000) }); if (r.ok) { healthy = true; break; } } catch { /* startup */ }
    await new Promise(accept => setTimeout(accept, 300));
  }
  assert.ok(healthy, 'Sandbox Auth must be healthy before fixture writes');
  const server = createClient(state.apiUrl, token('service_role'), { auth: { persistSession: false, autoRefreshToken: false } });
  await provisionSandboxAccounts({ state, save,
    findUser: async email => JSON.parse(sql(`SELECT coalesce((SELECT jsonb_build_object('id',id) FROM auth.users WHERE email='${email}'),'null'::jsonb);`).trim()),
    createUser: async (email, pass) => {
      const result = await server.auth.admin.createUser({ email, password: pass, email_confirm: true });
      assert.ifError(result.error); return result.data.user;
    },
    provision: async (role, account) => {
      const workspace = await server.rpc('provision_workspace_registration', { p_workspace_id: account.workspaceId, p_owner_id: account.userId,
        p_fields: { fullName: `E2E ${role}`, phone: '0901234567', tenantName: `E2E ${state.run} ${role}`,
          hotelName: `E2E ${state.run}`, hotelAddress: 'Sandbox only', hotelPhone: '0281234567', hotelEmail: account.email, totalRooms: 3 } });
      assert.ifError(workspace.error); return workspace.data;
    },
    ensureAdmin: async id => sql(`BEGIN; INSERT INTO public.user_roles(user_id,role) VALUES('${id}','super_admin') ON CONFLICT DO NOTHING;
      UPDATE public.users SET is_super_admin=true,user_level_code='super_admin' WHERE id='${id}'; COMMIT;`),
  });
  const tenant = state.accounts.owner.tenantId;
  if (!state.fixtures) {
    const legacy = JSON.parse(sql(`SELECT jsonb_build_object(
      'invoice',(SELECT id FROM public.invoices WHERE invoice_number='E2E-${state.run}'),
      'payment',(SELECT p.id FROM public.payment_transactions p JOIN public.invoices i ON i.id=p.invoice_id WHERE i.invoice_number='E2E-${state.run}'),
      'directory',(SELECT jsonb_agg(id ORDER BY name) FROM public.tenants WHERE name LIKE 'E2E Directory %' AND email LIKE 'directory-%@example.invalid'));`).trim());
    if (legacy.invoice || legacy.payment) {
      assert.ok(legacy.invoice && legacy.payment && legacy.directory?.length === 31, 'Incomplete legacy fixtures: clean and recreate this sandbox');
      state.fixtures = legacy;
    } else state.fixtures = { directory: Array.from({ length: 31 }, () => randomUUID()), invoice: randomUUID(), payment: randomUUID() };
    await save();
  }
  const fixture = state.fixtures;
  assert.equal(fixture.directory.length, 31);
  for (const id of [...fixture.directory, fixture.invoice, fixture.payment, tenant]) assert.match(id, /^[a-f0-9-]{36}$/);
  sql(`BEGIN;
    INSERT INTO public.tenants(id,name,email,subscription_status,subscription_end_date,registered_rooms)
    SELECT id::uuid,'E2E Directory '||lpad(n::text,2,'0'),'directory-'||n||'@example.invalid',
      CASE WHEN n%2=0 THEN 'active' ELSE 'trial' END,current_date+30,3
    FROM unnest(ARRAY[${fixture.directory.map(id => "'" + id + "'").join(',')}]) WITH ORDINALITY AS fixture(id,n) ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.invoices(id,tenant_id,invoice_number,due_date,period_start,period_end,total_amount,status)
      VALUES('${fixture.invoice}','${tenant}','E2E-${state.run}',current_date+7,current_date,current_date+30,50000,'draft') ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.payment_transactions(id,tenant_id,invoice_id,amount,payment_status,metadata)
      VALUES('${fixture.payment}','${tenant}','${fixture.invoice}',50000,'pending','{"type":"extend"}'::jsonb) ON CONFLICT(id) DO NOTHING;
    COMMIT;`);
  state.phase = 'fixtures'; await save();
  if (!process.argv.includes('--prepare-only')) {
    // Build validation requires a VAPID public key. Use a disposable key,
    // independent of production; this stack does not enable push delivery.
    if (!state.vapidPublicKey) {
      const vapid = createECDH('prime256v1');
      state.vapidPublicKey = vapid.generateKeys().toString('base64url');
      await save();
    }
    const args = ['build', '-t', 'roomqc-acceptance:' + state.run];
    const buildEnv = { ROOMQC_ENVIRONMENT: 'local', VITE_SUPABASE_URL: state.apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: token('anon'), VITE_SUPABASE_PROJECT_ID: 'ehjtoajnlnuvuiwkpmbp',
      VITE_VAPID_PUBLIC_KEY: state.vapidPublicKey,
      VITE_ENABLE_DEMO_DATA: 'false', VITE_ROOMQC_DIRECTORY_ENABLED: 'false' };
    for (const [key, value] of Object.entries(buildEnv)) args.push('--build-arg', key + '=' + value);
    args.push('.'); docker(args, undefined, 180000);
    const frontend = inspect(state.frontend);
    if (frontend) { assert.equal(frontend.Config.Labels['roomqc.acceptance'], state.run); docker(['rm', '-f', state.frontend]); }
    docker(['run', '-d', '--name', state.frontend, '--label', 'roomqc.acceptance=' + state.run,
      '--network', 'bridge', '-p', '127.0.0.1:18082:80', 'roomqc-acceptance:' + state.run]);
    state.phase = 'ready'; await save();
  }
  console.log('Sandbox prepared: ' + JSON.stringify({ run: state.run, phase: state.phase, webUrl: state.webUrl, apiUrl: state.apiUrl }));
} catch (error) {
  console.error('Sandbox setup failed; saved progress retained: ' + (error.stderr || error.message));
  process.exitCode = 1;
} finally { await release(); }
