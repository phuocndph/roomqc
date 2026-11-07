import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

const defaultDirectory=new URL('../../supabase/migrations/',import.meta.url);
const migrationLock=727100;
const namePattern=/^\d{14}_([A-Za-z0-9_-]+)\.sql$/;
// These vendor-owned objects require the maintenance role. All other files
// retain the application's postgres ownership, including on a restored DB.
const maintenanceVersions=new Set(['20261019123517','20261028010321','20261028082314',
  '20261028092339','20261028101638','20261029005352','20261029144213']);

export class BusinessMigrationError extends Error{
  constructor(code,details={}){super(code);this.code=code;Object.assign(this,details)}
}

const fail=(code,details)=>{throw new BusinessMigrationError(code,details)};
const canonical=value=>value.replace(/\r\n/g,'\n');

/**
 * The application migration set is immutable input to a release.  The hash
 * includes filenames and canonical LF source, so a renamed or edited file is
 * a different release even when the SQL happens to be equivalent.
 */
export async function businessMigrationManifest(location=defaultDirectory){
  const names=(await readdir(location)).filter(name=>name.endsWith('.sql')).sort();
  if(!names.length)fail('BUSINESS_MIGRATION_SET_EMPTY');
  const migrations=[];let previous='';const hash=createHash('sha256');
  for(const name of names){
    const match=name.match(namePattern),version=name.slice(0,14);
    if(!match||version<=previous)fail('BUSINESS_MIGRATION_NAME_INVALID');
    previous=version;
    const sql=canonical(await readFile(new URL(name,location),'utf8'));
    const migrationName=name.slice(15,-4);
    migrations.push(Object.freeze({version,name:migrationName,file:name,sql,checksum:createHash('sha256').update(sql).digest('hex')}));
    hash.update(name+'\0'+sql+'\0');
  }
  return Object.freeze({migrations:Object.freeze(migrations),count:migrations.length,sha256:hash.digest('hex')});
}

/**
 * Existing Supabase files may contain one outer BEGIN/COMMIT pair.  The
 * runner owns the transaction so history and SQL commit atomically; remove
 * only that exact outer pair and reject any other transaction control.
 */
export function migrationSqlInOwnedTransaction(sql){
  const text=canonical(sql),visible=text.split('');
  const blank=(start,end)=>{for(let n=start;n<end;n++)if(visible[n]!=='\n')visible[n]=' '};
  // Inspect only SQL statements, never PL/pgSQL bodies, quoted identifiers,
  // string literals or nested comments. A regex over raw SQL misreads all of
  // these as transaction controls and rejected two shipped migrations.
  for(let i=0;i<text.length;){
    const start=i;
    if(text.startsWith('--',i)){
      const end=text.indexOf('\n',i+2);i=end<0?text.length:end;blank(start,i);continue;
    }
    if(text.startsWith('/*',i)){
      let depth=1;i+=2;
      while(i<text.length&&depth){if(text.startsWith('/*',i)){depth++;i+=2}
        else if(text.startsWith('*/',i)){depth--;i+=2}else i++;}
      if(depth)fail('BUSINESS_MIGRATION_SQL_INVALID');blank(start,i);continue;
    }
    const dollar=(i===0||!/[A-Za-z0-9_$]/.test(text[i-1]))&&/^(?:\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/.exec(text.slice(i));
    if(dollar){
      const end=text.indexOf(dollar[0],i+dollar[0].length);
      if(end<0)fail('BUSINESS_MIGRATION_SQL_INVALID');i=end+dollar[0].length;blank(start,i);continue;
    }
    if(text[i]==="'"||text[i]==='"'){
      const quote=text[i],escaped=quote==="'"&&/[eE]/.test(text[i-1]??'')&&(i<2||!/[A-Za-z0-9_$]/.test(text[i-2]));
      let closed=false;i++;
      while(i<text.length){
        if(escaped&&text[i]==='\\'){i+=2;continue}
        if(text[i]===quote){if(text[i+1]===quote){i+=2;continue}i++;closed=true;break}i++;
      }
      if(!closed)fail('BUSINESS_MIGRATION_SQL_INVALID');blank(start,i);continue;
    }
    i++;
  }
  const masked=visible.join(''),statements=[];let start=0;
  for(let i=0;i<=masked.length;i++)if(i===masked.length||masked[i]===';'){
    const raw=masked.slice(start,i),leading=raw.search(/\S/);
    if(leading>=0)statements.push({start:start+leading,end:i<masked.length?i+1:i,sql:raw.trim().replace(/\s+/g,' ').toUpperCase()});
    start=i+1;
  }
  let first=0,last=statements.length;
  if(statements[0]?.sql==='BEGIN'&&statements.at(-1)?.sql==='COMMIT'){first++;last--}
  const control=/^(?:BEGIN|START TRANSACTION|COMMIT|END|ABORT|ROLLBACK|SAVEPOINT|RELEASE|PREPARE TRANSACTION|SET (?:LOCAL |SESSION )?TRANSACTION|SET SESSION CHARACTERISTICS AS TRANSACTION)\b/;
  if(statements.slice(first,last).some(s=>control.test(s.sql)))fail('BUSINESS_MIGRATION_TRANSACTION_CONTROL');
  if(first===0)return text;
  return text.slice(statements[0].end,statements.at(-1).start).trimStart().replace(/\s*$/,'\n');
}

export const businessMigrationExecutionRole=migration=>maintenanceVersions.has(migration.version)?'supabase_admin':'postgres';

export function businessMigrationPlan(manifest,history){
  if(!manifest||!Array.isArray(manifest.migrations)||!Number.isSafeInteger(manifest.count))fail('BUSINESS_MIGRATION_MANIFEST_INVALID');
  if(!Array.isArray(history)||history.length>manifest.migrations.length)fail('BUSINESS_MIGRATION_HISTORY_DIVERGED');
  history.forEach((row,index)=>{
    const expected=manifest.migrations[index];
    if(!expected||String(row.version)!==expected.version||String(row.name??'')!==expected.name)
      fail('BUSINESS_MIGRATION_HISTORY_DIVERGED',{index});
  });
  return Object.freeze({migrationSetSha256:manifest.sha256,appliedCount:history.length,totalCount:manifest.count,
    pending:Object.freeze(manifest.migrations.slice(history.length).map(m=>m.file)),complete:history.length===manifest.count});
}

// A release may only be admitted from a deterministic, read-only receipt. The
// receipt contains no DSN, SQL or tenant data; it binds the release migration
// hash to an observed complete history.
export function businessMigrationReceipt(plan,{expectedHash,expectedCount}={}){
  if(!plan||typeof plan!=='object'||!Array.isArray(plan.pending)
    ||typeof plan.migrationSetSha256!=='string'||!/^[a-f0-9]{64}$/.test(plan.migrationSetSha256)
    ||!Number.isSafeInteger(plan.totalCount)||plan.totalCount<1
    ||!Number.isSafeInteger(plan.appliedCount)||plan.appliedCount<0
    ||plan.appliedCount>plan.totalCount||plan.pending.some(v=>typeof v!=='string'))
    fail('BUSINESS_MIGRATION_RECEIPT_INVALID');
  if(expectedHash!==undefined&&expectedHash!==plan.migrationSetSha256)fail('BUSINESS_MIGRATION_SOURCE_MISMATCH');
  if(expectedCount!==undefined&&expectedCount!==plan.totalCount)fail('BUSINESS_MIGRATION_COUNT_MISMATCH');
  const complete=plan.complete===true&&plan.appliedCount===plan.totalCount&&plan.pending.length===0;
  return Object.freeze({version:1,status:complete?'complete':'pending',migrationSetSha256:plan.migrationSetSha256,
    totalCount:plan.totalCount,appliedCount:plan.appliedCount,pending:Object.freeze([...plan.pending]),complete});
}

async function assertBusinessDatabase(client){
  const result=await client.query(`SELECT to_regnamespace('auth') IS NOT NULL AS auth_schema,
    to_regnamespace('supabase_migrations') IS NOT NULL AS migrations_schema,
    to_regclass('public.tenants') IS NOT NULL AS tenants_table,
    (to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL) AS vendor_tables,
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS history_table`);
  const row=result.rows?.[0];
  if(!row?.auth_schema||!row.migrations_schema||!row.tenants_table&&!row.vendor_tables)fail('BUSINESS_DATABASE_REQUIRED');
  if(!row.history_table)fail('BUSINESS_MIGRATION_HISTORY_MISSING');
}

async function readHistory(client){
  const result=await client.query(`SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version`);
  return result.rows.map(row=>({version:String(row.version),name:String(row.name??'')}));
}

// Explicit first installation only. Never repair/adopt an existing application
// database or infer migration history from the tables that happen to exist.
export async function initializeBusinessMigrationHistory(pool,{location=defaultDirectory,expectedHash,expectedCount}={}){
  const manifest=await businessMigrationManifest(location);
  if(expectedHash!==manifest.sha256||expectedCount!==manifest.count)fail('BUSINESS_MIGRATION_SOURCE_MISMATCH');
  const client=await pool.connect();let locked=false,transaction=false;
  try{
    await client.query('SELECT pg_advisory_lock($1)',[migrationLock]);locked=true;
    await client.query('BEGIN');transaction=true;
    const {rows:[target]}=await client.query(`SELECT
      to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL AS vendor_tables,
      to_regnamespace('roomqc_control') IS NOT NULL AS directory_schema,
      to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS history_table,
      pg_has_role(current_user,'postgres','USAGE') AS postgres_role,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f')
        AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')) AS business_objects`);
    if(!target?.vendor_tables||target.directory_schema||target.business_objects!==0||!target.postgres_role
      ||target.history_table&&(await readHistory(client)).length!==0)fail('BUSINESS_MIGRATION_INITIALIZATION_DENIED');
    await client.query('SET LOCAL ROLE postgres');
    await client.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);`);
    await client.query('COMMIT');transaction=false;
    return Object.freeze({...businessMigrationPlan(manifest,[]),initialized:true});
  }catch(error){if(transaction)await client.query('ROLLBACK').catch(()=>{});throw error}
  finally{
    if(locked)await client.query('SELECT pg_advisory_unlock($1)',[migrationLock]).catch(()=>{});
    client.release();
  }
}

export async function inspectBusinessMigrations(pool,{location=defaultDirectory,expectedHash,expectedCount}={}){
  const manifest=await businessMigrationManifest(location),client=await pool.connect();let locked=false;
  try{
    await assertBusinessDatabase(client);
    await client.query('SELECT pg_advisory_lock($1)',[migrationLock]);locked=true;
    const history=await readHistory(client),plan=businessMigrationPlan(manifest,history);
    if(expectedHash!==undefined&&expectedHash!==manifest.sha256)fail('BUSINESS_MIGRATION_SOURCE_MISMATCH');
    if(expectedCount!==undefined&&expectedCount!==manifest.count)fail('BUSINESS_MIGRATION_COUNT_MISMATCH');
    return Object.freeze({...plan});
  }finally{
    if(locked)await client.query('SELECT pg_advisory_unlock($1)',[migrationLock]).catch(()=>{});
    client.release();
  }
}

export async function applyBusinessMigrations(pool,{location=defaultDirectory,expectedHash,expectedCount,onMigration=()=>{}}={}){
  const manifest=await businessMigrationManifest(location),client=await pool.connect();let locked=false;
  try{
    await assertBusinessDatabase(client);
    await client.query('SELECT pg_advisory_lock($1)',[migrationLock]);locked=true;
    const history=await readHistory(client),plan=businessMigrationPlan(manifest,history);
    if(expectedHash!==undefined&&expectedHash!==manifest.sha256)fail('BUSINESS_MIGRATION_SOURCE_MISMATCH');
    if(expectedCount!==undefined&&expectedCount!==manifest.count)fail('BUSINESS_MIGRATION_COUNT_MISMATCH');
    const pending=manifest.migrations.slice(history.length);
    // Validate every file and role before the first write. Runtime API and
    // worker credentials never receive either of these migration capabilities.
    const executable=pending.map(migration=>({migration,sql:migrationSqlInOwnedTransaction(migration.sql),role:businessMigrationExecutionRole(migration)}));
    if(executable.length){
      const {rows:[authority]}=await client.query(`SELECT
        (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
        pg_has_role(current_user,'postgres','USAGE') AS postgres_role,
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname='supabase_admin' AND rolsuper) AS maintenance_role`);
      if(!authority?.postgres_role||executable.some(m=>m.role==='supabase_admin')&&(!authority.superuser||!authority.maintenance_role))
        fail('BUSINESS_MIGRATION_AUTHORITY_REQUIRED');
    }
    for(const {migration,sql,role} of executable){
      await client.query('BEGIN');
      try{
        await client.query('SET LOCAL ROLE '+role);
        await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='45s'");
        await client.query(sql);
        await client.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3)',
          [migration.version,migration.name,[]]);
        await client.query('COMMIT');
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw new BusinessMigrationError('BUSINESS_MIGRATION_APPLY_FAILED',{migration:migration.file,cause:error})}
      await onMigration({file:migration.file,version:migration.version,appliedCount:history.length+1});
      history.push({version:migration.version,name:migration.name});
    }
    // Re-read the authoritative table after the last commit. This catches a
    // lost/reused connection or an unexpected concurrent writer before the
    // command reports a complete release.
    const final=businessMigrationPlan(manifest,await readHistory(client));
    return Object.freeze({...final,applied:true});
  }finally{
    if(locked)await client.query('SELECT pg_advisory_unlock($1)',[migrationLock]).catch(()=>{});
    client.release();
  }
}

export function validateBusinessDatabaseUrl(value,{allowLocal=false}={}){
  let url;try{url=new URL(value)}catch{fail('BUSINESS_DATABASE_URL_INVALID')}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.username||!url.password||!url.pathname||url.pathname==='/'
    ||url.hash||[...url.searchParams.keys()].some(key=>key!=='sslmode')||url.searchParams.getAll('sslmode').length>1)fail('BUSINESS_DATABASE_URL_INVALID');
  const local=['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(url.hostname);
  if(url.searchParams.get('sslmode')!=='verify-full'&&!(allowLocal&&local))fail('BUSINESS_DATABASE_TLS_REQUIRED');
  return url.toString();
}

export function migrationLocation(value){
  if(value===undefined)return defaultDirectory;
  if(!isAbsolute(value))fail('BUSINESS_MIGRATION_DIRECTORY_INVALID');
  return pathToFileURL(value.endsWith('\\')||value.endsWith('/')?value:value+'/');
}
