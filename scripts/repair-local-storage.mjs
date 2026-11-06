// Local-only compatibility check/repair. No cloud URL or credentials accepted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const pg=createRequire(new URL('../server/control/package.json',import.meta.url))('pg');

assert.ok(process.argv.slice(2).every(arg=>arg==='--apply'),'Usage: npm run supabase:storage:repair -- [--apply]');
const apply=process.argv.includes('--apply');
const config=await readFile(new URL('../supabase/config.toml',import.meta.url),'utf8');
const projectId=config.match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
assert.ok(projectId,'A local project namespace is required');
const inspect=name=>JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];
const database=inspect(`supabase_db_${projectId}`),storage=inspect(`supabase_storage_${projectId}`);
assert.equal(storage.Config.Image,'public.ecr.aws/supabase/storage-api:v1.82.1','Re-review this workaround after changing the Storage image');
const binding=database.NetworkSettings.Ports['5432/tcp']?.find(value=>['127.0.0.1','0.0.0.0',''].includes(value.HostIp));
assert.ok(binding,'The identified local Docker database must have a published IPv4 port');
// Reuse the service-owned connection, never change grants or table ownership.
const connection=new URL(storage.Config.Env.find(value=>value.startsWith('DATABASE_URL='))?.slice(13));
assert.equal(connection.hostname,`supabase_db_${projectId}`);
assert.equal(connection.username,'supabase_storage_admin');
assert.equal(connection.pathname,'/postgres');
connection.hostname='127.0.0.1';connection.port=binding.HostPort;
const client=new pg.Client({connectionString:connection.href,connectionTimeoutMillis:5000});
try {
  await client.connect();
  const owner=await client.query("SELECT current_user=pg_get_userbyid(relowner) AS owns FROM pg_class WHERE oid='storage.objects'::regclass");
  assert.equal(owner.rows[0]?.owns,true,'Use only the existing Storage owner');
  const probe=`EXPLAIN INSERT INTO storage.objects(bucket_id,name)
    VALUES ('roomqc-plan-only','roomqc-plan-only')
    ON CONFLICT (bucket_id,name COLLATE "C") WHERE archived_at IS NULL DO NOTHING`;
  let compatible=true;
  try {await client.query(probe)}catch(error){if(error.code!=='42P10')throw error;compatible=false}
  if(compatible)console.log('Storage current-object conflict target is compatible; no changes needed.');
  else if(!apply) {
    console.error('Storage current-object index is incompatible (42P10). Local empty-table repair available with --apply; no changes made.');
    process.exitCode=1;
  } else {
    // This bounded, non-concurrent repair is deliberately unavailable once
    // documents exist. A populated VPS needs its own reviewed DBA procedure.
    assert.equal((await client.query('SELECT EXISTS(SELECT 1 FROM storage.objects) AS populated')).rows[0].populated,false,
      'Repair refuses populated Storage; use a reviewed maintenance procedure');
    await client.query(await readFile(new URL('./sql/local-storage-current-name-compat.sql',import.meta.url),'utf8'));
    await client.query(probe);
    console.log('Added the local compatibility index; conflict target verified. No object metadata, grants or vendor indexes changed.');
  }
} catch(error) {
  // Avoid echoing connection strings, passwords or driver diagnostics.
  console.error(`Local Storage check/repair failed (${error.code || error.name}). No automatic retries.`);
  process.exitCode=1;
} finally {await client.end()}
