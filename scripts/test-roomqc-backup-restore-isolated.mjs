// Full logical restore on a fresh, network-isolated PostgreSQL instance.
// Never restores into or runs jobs against the source instance.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lockSandbox, readSandbox, removeIfPresent, reserveSandbox, sandboxFile, saveSandbox } from './roomqc-sandbox-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'supabase_db_ehjtoajnlnuvuiwkpmbp';
const run = randomUUID().replaceAll('-', '').slice(0, 12);
const target = `roomqc-restore-${run}`;
const backupDir = resolve(process.env.ROOMQC_BACKUP_ROOT || resolve(root, '../backups'), `roomqc-restore-${run}.local`);
const label = 'roomqc.restore-verification=' + run;
const keep = process.argv.includes('--keep-sandbox');
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const docker = (args, input, timeout = 30000) => execFileSync('docker', args, {
  input, encoding: 'utf8', timeout, maxBuffer: 20_000_000, stdio: ['pipe', 'pipe', 'pipe'],
});
const sql = (container, statement) => docker(['exec', '-i', container, 'psql', '-U',
  container === source ? 'postgres' : 'supabase_admin', '-d', 'postgres',
  '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], statement);
// Include complete table rows, policies, constraints and privileged function
// definitions, not just a sample count. No plaintext row data is printed.
const inventorySQL = `
SET LOCAL search_path='';
SELECT jsonb_build_object('kind','table','name',n.nspname||'.'||c.relname,
  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'owner',pg_get_userbyid(c.relowner))::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','auth','private','storage','supabase_migrations','pgmq') ORDER BY n.nspname,c.relname;
SELECT jsonb_build_object('kind','policy','table',schemaname||'.'||tablename,'name',policyname,
  'roles',roles,'cmd',cmd,'qual',qual,'check',with_check)::text FROM pg_policies
WHERE schemaname IN ('public','auth','private','storage') ORDER BY schemaname,tablename,policyname;
SELECT jsonb_build_object('kind','constraint','table',n.nspname||'.'||c.relname,'name',k.conname,
  'definition',pg_get_constraintdef(k.oid),'valid',k.convalidated)::text
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','auth','private','storage','pgmq') ORDER BY n.nspname,c.relname,k.conname;
SELECT jsonb_build_object('kind','function','name',n.nspname||'.'||p.proname,
  'args',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),
  'acl',(SELECT jsonb_agg(a::text ORDER BY a::text COLLATE "C") FROM unnest(p.proacl) a),
  'definition_hash',md5(pg_get_functiondef(p.oid)))::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f'
  AND n.nspname IN ('public','auth','private') ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid);
SELECT format('SELECT jsonb_build_object(''kind'',''data'',''name'',%L,''count'',count(*),''hash'',md5(coalesce(string_agg(row_text,E''\\n'' ORDER BY row_text COLLATE "C"),'''')))::text FROM (SELECT to_jsonb(t)::text AS row_text FROM %I.%I t) r;',
  n.nspname||'.'||c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname IN ('public','auth','private','storage','supabase_migrations','pgmq')
ORDER BY n.nspname,c.relname;
\\gexec
`;
const inventory = raw => raw.trim().split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
let created = false;
let holder;
let holderExit;
let snapshotAt;
let release;
let reserved = false;
try {
  if (keep) {
    release = await lockSandbox();
    await reserveSandbox({ run, container: target, phase: 'backup' });
    reserved = true;
  }
  const inspect = JSON.parse(docker(['inspect', source]))[0];
  assert.equal(inspect.Name, '/' + source);
  const image = inspect.Image; // Exact cached database image, no pull/upgrade.
  await mkdir(backupDir, { recursive: true });
  holder = spawn('docker', ['exec', '-i', source, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let snapshotOutput = '', snapshotError = '';
  let resolveSnapshot, rejectSnapshot;
  const ready = new Promise((accept, reject) => { resolveSnapshot = accept; rejectSnapshot = reject; });
  holderExit = new Promise((accept, reject) => {
    holder.on('error', reject);
    holder.stdout.on('data', chunk => {
      snapshotOutput += chunk;
      if (snapshotOutput.includes('ROOMQC_SNAPSHOT_READY\n')) resolveSnapshot();
    });
    holder.stderr.on('data', chunk => { snapshotError += chunk; });
    holder.on('close', code => code ? reject(new Error(snapshotError)) : accept());
  });
  holderExit.catch(rejectSnapshot);
  holder.stdin.write(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='30s';
    SELECT pg_export_snapshot(); ${inventorySQL}\n\\echo ROOMQC_SNAPSHOT_READY\n`);
  await Promise.race([ready, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('Snapshot timed out')), 30000); timer.unref();
  })]);
  const snapshot = snapshotOutput.split('\n').find(line => /^[A-F0-9]+-[A-F0-9]+-\d+$/.test(line));
  assert.ok(snapshot, 'Exported read-only snapshot required');
  snapshotAt = new Date().toISOString();
  const expected = inventory(snapshotOutput);
  assert.ok(expected.filter(row => row.kind === 'table').length > 100);
  const snapshotSQL = statement => sql(source, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SET TRANSACTION SNAPSHOT ${q(snapshot)}; ${statement}\nCOMMIT;`);
  const queues = JSON.parse(snapshotSQL(`SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY queue_name),'[]'::jsonb) FROM pgmq.meta m;`).trim());
  let queueRestore = '';
  for (const queue of queues) {
    assert.match(queue.queue_name, /^[a-z][a-z0-9_]*$/);
    assert.ok(!queue.is_partitioned && !queue.is_unlogged, 'Only durable nonpartitioned queues supported by this rehearsal');
    queueRestore += `SELECT pgmq.create(${q(queue.queue_name)});\n`;
  }
  queueRestore += 'TRUNCATE pgmq.meta;\n';
  const queueTables = ['meta', ...queues.flatMap(queue => ['q_' + queue.queue_name, 'a_' + queue.queue_name])];
  for (const table of queueTables) {
    const data = snapshotSQL(`COPY pgmq.${table} TO STDOUT;`);
    queueRestore += `ALTER TABLE pgmq.${table} OWNER TO postgres;\nCOPY pgmq.${table} FROM STDIN;\n${data}\\.\n`;
  }
  for (const queue of queues) {
    const sequence = 'q_' + queue.queue_name + '_msg_id_seq';
    const value = JSON.parse(sql(source, `SELECT jsonb_build_object('last',last_value,'called',is_called) FROM pgmq.${sequence};`).trim());
    queueRestore += `SELECT pg_catalog.setval('pgmq.${sequence}',${Number(value.last)},${value.called});\n`;
  }
  queueRestore += 'RESET ROLE;\n';
  await writeFile(resolve(backupDir, 'pgmq-queues.sql'), queueRestore);
  docker(['exec', source, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc',
    '--snapshot=' + snapshot, '--lock-wait-timeout=5000', '-f', '/tmp/roomqc-restore-' + run + '.dump'], undefined, 90000);
  holder.stdin.end('COMMIT;\n\\q\n'); await holderExit; holder = undefined;
  const roles = docker(['exec', source, 'pg_dumpall', '-U', 'postgres', '--roles-only', '--no-role-passwords']);
  assert.ok(!/PASSWORD\s+'/i.test(roles), 'Source role passwords must not be exported');
  await writeFile(resolve(backupDir, 'roles.sql'), roles);
  await writeFile(resolve(backupDir, 'expected.json'), JSON.stringify(expected, null, 2));
  docker(['cp', source + ':/tmp/roomqc-restore-' + run + '.dump', resolve(backupDir, 'database.dump')]);
  const sha256 = createHash('sha256').update(await readFile(resolve(backupDir, 'database.dump'))).digest('hex');
  await writeFile(resolve(backupDir, 'sha256.txt'), sha256 + '\n');
  const checksums = {};
  for (const name of ['database.dump', 'roles.sql', 'pgmq-queues.sql', 'expected.json']) {
    checksums[name] = createHash('sha256').update(await readFile(resolve(backupDir, name))).digest('hex');
  }
  await writeFile(resolve(backupDir, 'checksums.json'), JSON.stringify(checksums, null, 2));
  const savedChecksums = JSON.parse(await readFile(resolve(backupDir, 'checksums.json'), 'utf8'));
  for (const [name, hash] of Object.entries(savedChecksums)) {
    assert.ok(Object.hasOwn(checksums, name));
    assert.equal(createHash('sha256').update(await readFile(resolve(backupDir, name))).digest('hex'), hash,
      'Backup integrity check failed: ' + name);
  }
  assert.equal(Object.keys(savedChecksums).length, 4);
  // Restore the saved artifacts, not the still-live in-memory queue/role data.
  const savedRoles = await readFile(resolve(backupDir, 'roles.sql'), 'utf8');
  const savedQueues = await readFile(resolve(backupDir, 'pgmq-queues.sql'), 'utf8');
  const savedExpected = JSON.parse(await readFile(resolve(backupDir, 'expected.json'), 'utf8'));
  assert.deepEqual(savedExpected, expected);
  console.log('PASS consistent snapshot exported; all four saved backup artifacts verified by SHA256');
  docker(['run', '-d', '--name', target, '--label', label, '--network', 'none', '--user', 'postgres',
    '--entrypoint', 'sh', image, '-c',
    'initdb -D /tmp/roomqc-restore-data --username=supabase_admin --auth-local=trust --auth-host=scram-sha-256 --locale=en_US.UTF-8 >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/roomqc-restore-data -c shared_preload_libraries=pg_cron,pg_net,supabase_vault -c cron.database_name=postgres -c cron.launch_active_jobs=off -c listen_addresses=* -c max_connections=100']);
  created = true;
  let readyDB = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { sql(target, 'SELECT 1;'); readyDB = true; break; } catch { await new Promise(accept => setTimeout(accept, 250)); }
  }
  assert.ok(readyDB, 'Fresh database must start');
  // The source bootstrap superuser must remain the bootstrap superuser in
  // PostgreSQL 17 for GRANTED BY membership restoration to retain its identity.
  assert.equal((savedRoles.match(/^CREATE ROLE supabase_admin;$/gm) || []).length, 1);
  sql(target, savedRoles.replace(/^CREATE ROLE supabase_admin;$/m, '-- bootstrap role already exists'));
  docker(['cp', resolve(backupDir, 'database.dump'), target + ':/tmp/roomqc-restore.dump']);
  const start = performance.now();
  docker(['exec', target, 'pg_restore', '-U', 'supabase_admin', '-d', 'postgres',
    '--exit-on-error', '--single-transaction', '/tmp/roomqc-restore.dump'], undefined, 120000);
  sql(target, savedQueues);
  sql(target, 'ALTER DATABASE postgres OWNER TO postgres;');
  const restored = inventory(sql(target, 'BEGIN READ ONLY; ' + inventorySQL + '\nCOMMIT;'));
  if (JSON.stringify(restored) !== JSON.stringify(expected)) {
    await writeFile(resolve(backupDir, 'restored.json'), JSON.stringify(restored, null, 2));
    const key = row => [row.kind, row.table || '', row.name, row.args || ''].join(':');
    const index = new Map(restored.map(row => [key(row), JSON.stringify(row)]));
    const differences = expected.filter(row => index.get(key(row)) !== JSON.stringify(row)).map(key);
    throw new Error('Restore inventory mismatch: ' + differences.slice(0, 12).join(', '));
  }
  assert.equal(sql(target, "SHOW cron.launch_active_jobs;").trim(), 'off');
  const state = JSON.parse(docker(['inspect', target]))[0];
  assert.equal(state.HostConfig.NetworkMode, 'none');
  assert.deepEqual(state.NetworkSettings.Ports, {});
  const evidence = { run, container: target, source, sourceImage: image, backupDir, sha256,
    snapshotAt, verifiedAt: new Date().toISOString(), checksums,
    restoreSeconds: Math.round((performance.now() - start) / 100) / 10,
    tables: expected.filter(row => row.kind === 'table').length,
    dataTables: expected.filter(row => row.kind === 'data').length,
    policies: expected.filter(row => row.kind === 'policy').length,
    constraints: expected.filter(row => row.kind === 'constraint').length,
    functions: expected.filter(row => row.kind === 'function').length, keep };
  await writeFile(resolve(backupDir, 'result.json'), JSON.stringify(evidence, null, 2));
  if (keep) {
    await saveSandbox({ ...evidence, phase: 'restored' });
  }
  console.log('PASS full logical restore matches source snapshot: ' + JSON.stringify(evidence));
} catch (error) {
  console.error('Restore rehearsal failed: ' + (error.stderr || error.message));
  process.exitCode = 1;
} finally {
  try {
    if (holder) { holder.stdin.end('ROLLBACK;\n\\q\n'); await holderExit.catch(() => {}); }
    if (created && (!keep || process.exitCode)) {
      const state = JSON.parse(docker(['inspect', target]))[0];
      assert.equal(state.Config.Labels['roomqc.restore-verification'], run);
      docker(['rm', '-f', target]);
      console.log('Only this generated restore container removed; host backup retained.');
    }
    if (reserved && process.exitCode && (await readSandbox())?.run === run) await removeIfPresent(sandboxFile);
  } finally { if (release) await release(); }
}
