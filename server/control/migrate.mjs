import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const directory = new URL('./migrations/', import.meta.url);
const migrationLock = 727000;
export class MigrationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export async function migrationManifest(location = directory) {
  const names = (await readdir(location)).filter(name => name.endsWith('.sql')).sort();
  if (!names.length || names.some((name, i) => !name.startsWith(String(i + 1).padStart(4, '0') + '-'))) {
    throw new MigrationError('MIGRATION_ORDER_INVALID');
  }
  return Promise.all(names.map(async name => {
    // Git may check out CRLF on Windows. Hash canonical UTF-8/LF on every host.
    const sql = (await readFile(new URL(name, location), 'utf8')).replace(/\r\n/g, '\n');
    return { version: name, checksum: createHash('sha256').update(sql).digest('hex'), sql };
  }));
}

export async function verifyHistory(client, manifest) {
  manifest ??= await migrationManifest();
  const { rows } = await client.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version');
  if (rows.some((row, i) => row.version !== manifest[i]?.version || row.checksum !== manifest[i]?.checksum)) {
    throw new MigrationError('MIGRATION_CHECKSUM_MISMATCH');
  }
  return rows.length;
}

// Recognize the exact directory v2 shape before adopting an unversioned DB.
// Unknown tables/columns must never be silently blessed as a known baseline.
const legacyColumns = {
  clusters: 'id,api_url,publishable_key,vapid_public_key,status,max_workspaces,schema_version,created_at',
  workspaces: 'id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status,routing_version,last_error_code,created_at,updated_at,expires_at',
  attempts: 'id,request_id,workspace_id,outcome,created_at',
  support_actions: 'id,request_id,workspace_id,actor_id,authority_cluster_id,reason,outcome,before_state,after_state,error_code,created_at,finished_at',
};
const legacyTypes = {
  clusters: 'text,text,text,text,text,int4,int4,timestamptz',
  workspaces: 'uuid,text,text,text,text,uuid,uuid,uuid,text,int4,text,timestamptz,timestamptz,timestamptz',
  attempts: 'int8,uuid,uuid,text,timestamptz',
  support_actions: 'uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,text,timestamptz,timestamptz',
};
const nullableLegacy = new Set(['workspaces.tenant_id','workspaces.hotel_id','workspaces.owner_id','workspaces.last_error_code',
  'workspaces.expires_at','attempts.workspace_id','support_actions.after_state','support_actions.error_code','support_actions.finished_at']);
const legacyDefaults={
  'clusters.status':"'active'::text",'clusters.schema_version':'1','clusters.created_at':'now()',
  'workspaces.status':"'reserved'::text",'workspaces.routing_version':'1','workspaces.created_at':'now()',
  'workspaces.updated_at':'now()','attempts.created_at':'now()',
  'support_actions.outcome':"'started'::text",'support_actions.created_at':'now()',
};
async function validateLegacy(client) {
  const { rows } = await client.query(`SELECT table_name,string_agg(column_name,',' ORDER BY ordinal_position) AS columns,
    string_agg(udt_name,',' ORDER BY ordinal_position) AS types
    FROM information_schema.columns WHERE table_schema='roomqc_control' GROUP BY table_name ORDER BY table_name`);
  if (!rows.length) return;
  if (rows.length !== Object.keys(legacyColumns).length || rows.some(row => legacyColumns[row.table_name] !== row.columns || legacyTypes[row.table_name] !== row.types)) {
    throw new MigrationError('DIRECTORY_LEGACY_SCHEMA_UNKNOWN');
  }
  const columns=await client.query(`SELECT table_name,column_name,is_nullable,column_default,is_identity,identity_generation
    FROM information_schema.columns WHERE table_schema='roomqc_control'`);
  if(columns.rows.some(row=>{
    const key=row.table_name+'.'+row.column_name;
    return (row.is_nullable==='YES')!==nullableLegacy.has(key) || (row.column_default??null)!==(legacyDefaults[key]??null)
      || (row.is_identity==='YES')!==(key==='attempts.id') || (key==='attempts.id' && row.identity_generation!=='ALWAYS');
  }))throw new MigrationError('DIRECTORY_LEGACY_SCHEMA_UNKNOWN');
  const constraints = await client.query(`SELECT t.relname,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='roomqc_control'`);
  const has = (table, type, fragment) => constraints.rows.some(r => r.relname === table && r.contype === type && r.definition.includes(fragment));
  const expectedCounts={clusters:5,workspaces:8,attempts:2,support_actions:4};
  const statusValues=(table)=>constraints.rows.find(row=>row.relname===table&&row.conname===table+'_status_check')?.definition
    .match(/'([^']+)'::text/g)?.sort().join(',');
  if(statusValues('clusters')!==["'active'::text","'draining'::text","'offline'::text"].sort().join(',')
    || statusValues('workspaces')!==['reserved','provisioning','active','suspended','migrating','expired'].map(s=>`'${s}'::text`).sort().join(',')) {
    throw new MigrationError('DIRECTORY_LEGACY_SCHEMA_UNKNOWN');
  }
  if (Object.keys(legacyColumns).some(table => !has(table, 'p', 'PRIMARY KEY (id)'))
    || Object.entries(expectedCounts).some(([table,count])=>constraints.rows.filter(row=>row.relname===table).length!==count)
    || !has('workspaces', 'f', 'FOREIGN KEY (cluster_id) REFERENCES roomqc_control.clusters(id)')
    || !has('workspaces', 'u', 'UNIQUE (cluster_id, tenant_id)')
    || !has('workspaces', 'u', 'UNIQUE (cluster_id, owner_id)')
    || !has('attempts','f','FOREIGN KEY (workspace_id) REFERENCES roomqc_control.workspaces(id)')
    || !has('support_actions','f','FOREIGN KEY (workspace_id) REFERENCES roomqc_control.workspaces(id)')
    || !has('support_actions','f','FOREIGN KEY (authority_cluster_id) REFERENCES roomqc_control.clusters(id)')
    || !has('workspaces', 'c', "'expired'::text") || !has('workspaces', 'c', "tenant_id IS NOT NULL")) {
    throw new MigrationError('DIRECTORY_LEGACY_SCHEMA_UNKNOWN');
  }
  const indexes = await client.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='roomqc_control'
    AND indexname IN ('workspaces_live_slug_idx','workspaces_live_email_idx')`);
  if (indexes.rows.length !== 2 || indexes.rows.some(row => !row.indexdef.includes('UNIQUE INDEX') || !row.indexdef.includes("WHERE (status <> 'expired'::text)"))) {
    throw new MigrationError('DIRECTORY_LEGACY_SCHEMA_UNKNOWN');
  }
}

export async function migrateDirectory(pool, { location = directory } = {}) {
  const manifest = await migrationManifest(location);
  const client = await pool.connect();
  let locked = false;
  try {
    // Directory and tenant DBs have different lifecycles and credentials.
    const unsafe = await client.query(`SELECT to_regnamespace('auth') IS NOT NULL
      OR to_regnamespace('supabase_migrations') IS NOT NULL OR to_regclass('public.tenants') IS NOT NULL AS tenant_db`);
    if (unsafe.rows[0].tenant_db) throw new MigrationError('DIRECTORY_DATABASE_IS_TENANT_BACKEND');
    await client.query('SELECT pg_advisory_lock($1)', [migrationLock]); locked = true;
    await client.query('BEGIN');
    try {
      const history = await client.query("SELECT to_regclass('roomqc_control.schema_migrations') IS NOT NULL AS present");
      if (!history.rows[0].present) await validateLegacy(client);
      await client.query(`CREATE SCHEMA IF NOT EXISTS roomqc_control;
        REVOKE ALL ON SCHEMA roomqc_control FROM PUBLIC;
        CREATE TABLE IF NOT EXISTS roomqc_control.schema_migrations (
          version text PRIMARY KEY, checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
          applied_at timestamptz NOT NULL DEFAULT now(),execution_ms integer NOT NULL CHECK (execution_ms>=0)
        ); REVOKE ALL ON roomqc_control.schema_migrations FROM PUBLIC;`);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    const applied = await verifyHistory(client, manifest);
    const result = [];
    for (const migration of manifest.slice(applied)) {
      const started = performance.now();
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO roomqc_control.schema_migrations(version,checksum,execution_ms) VALUES($1,$2,$3)',
          [migration.version, migration.checksum, Math.round(performance.now() - started)]);
        await client.query('COMMIT'); result.push(migration.version);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    return { applied: result, version: manifest.at(-1).version };
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [migrationLock]).catch(() => {});
    client.release();
  }
}

export async function importInitialRegistry(pool, clusters) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(727001)');
    for (const cluster of clusters) {
      const existing = await client.query('SELECT api_url FROM roomqc_control.clusters WHERE id=$1', [cluster.id]);
      if (existing.rows[0] && existing.rows[0].api_url !== cluster.url) throw new MigrationError('CLUSTER_ENDPOINT_CHANGE_REQUIRES_MIGRATION');
      // Bootstrap only. Rerunning migrations never overwrites an operator's limit or policy.
      await client.query(`INSERT INTO roomqc_control.clusters(id,api_url,publishable_key,vapid_public_key,max_workspaces,credential_ref)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING`,
      [cluster.id, cluster.url, cluster.publishableKey, cluster.vapidPublicKey, cluster.maxWorkspaces, cluster.credentialRef || cluster.id]);
      await client.query(`INSERT INTO roomqc_control.cluster_policies(cluster_id,tenant_limit)
        SELECT id,max_workspaces FROM roomqc_control.clusters WHERE id=$1 ON CONFLICT(cluster_id) DO NOTHING`, [cluster.id]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
