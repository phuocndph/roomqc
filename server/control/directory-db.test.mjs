import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { migrateDirectory,importInitialRegistry,migrationManifest } from './migrate.mjs';
import { ControlStore } from './store.mjs';
import { startControl } from './server.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {registerAdminCases} from './admin-cases.mjs';
import {registerTelemetryCases} from './telemetry-cases.mjs';
import {registerTelemetryBindingCases} from './telemetry-binding-cases.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const run=randomBytes(6).toString('hex'),name=`roomqc-control-dbtest-${run}`;
const password=randomBytes(32).toString('hex');
const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
let base,admin,created=false;
const pools=[];
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:1_000_000,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['pipe','pipe','pipe']});
const cluster={id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'test-public',serviceKey:'test-server',vapidPublicKey:'test-vapid',maxWorkspaces:99};
const config=url=>fixtureConfig(url,[cluster]);
async function database(label){
  await admin.query(`CREATE DATABASE ${label}`);
  const url=new URL(base);url.pathname='/'+label;
  const pool=new pg.Pool({connectionString:url.href,max:5,statement_timeout:10000});pools.push(pool);
  return {pool,url:url.href};
}
before(async()=>{
  if(!enabled)return;
  try{
    docker(['run','-d','--name',name,'--label',`roomqc.control-directory-test=${run}`,'--env','POSTGRES_PASSWORD',
      // Each case owns a separate database; reserve space for the expanded suite.
      '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m','-p','127.0.0.1::5432',image]);created=true;
    const info=JSON.parse(docker(['inspect',name]))[0];
    base=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
    admin=new pg.Pool({connectionString:base,max:2});pools.push(admin);
    for(let i=0;i<60;i++){try{await admin.query('SELECT 1');return}catch{await new Promise(resolve=>setTimeout(resolve,200))}}
    throw new Error('Isolated database did not become ready');
  }catch{throw new Error('Unable to prepare owned isolated directory database (credentials redacted)')}
});
after(async()=>{
  await Promise.allSettled(pools.map(pool=>pool.end()));
  if(created){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['roomqc.control-directory-test'],run);docker(['rm','-f',name])}
});
const dbtest=(title,fn)=>test(title,{skip:!enabled},fn);

dbtest('empty directory: concurrent migrators apply once and repeated imports preserve operator limits',async()=>{
  const {pool}=await database('empty_directory');
  const blocker=await pool.connect();await blocker.query('SELECT pg_advisory_lock(727000)');
  const pending=Promise.all([migrateDirectory(pool),migrateDirectory(pool)]);
  let overlapped=false;
  try{
    for(let i=0;i<40;i++){
      const waiting=await pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727000 AND NOT granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
      if(Number(waiting.rows[0].count)>=2){overlapped=true;break}
      await new Promise(resolve=>setTimeout(resolve,20));
    }
  }finally{await blocker.query('SELECT pg_advisory_unlock(727000)');blocker.release()}
  const results=await pending;assert.equal(overlapped,true,'Both migrators must actually wait on the same lock');
  const manifest=await migrationManifest();
  assert.equal(results.reduce((sum,r)=>sum+r.applied.length,0),manifest.length);
  const history=await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version');assert.equal(history.rowCount,manifest.length);
  await importInitialRegistry(pool,[cluster]);
  await pool.query("UPDATE roomqc_control.clusters SET max_workspaces=7 WHERE id='cluster-a'");
  await pool.query("UPDATE roomqc_control.cluster_policies SET tenant_limit=6,row_version=2 WHERE cluster_id='cluster-a'");
  assert.deepEqual((await migrateDirectory(pool)).applied,[]);await importInitialRegistry(pool,[cluster]);
  const values=await pool.query('SELECT max_workspaces,tenant_limit,p.row_version FROM roomqc_control.clusters JOIN roomqc_control.cluster_policies p ON cluster_id=id');
  assert.equal(values.rows[0].max_workspaces,7);assert.equal(values.rows[0].tenant_limit,6);
  assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows,history.rows);
  await assert.rejects(()=>importInitialRegistry(pool,[{...cluster,url:'https://different.invalid'}]),{code:'CLUSTER_ENDPOINT_CHANGE_REQUIRES_MIGRATION'});
});

dbtest('legacy v2 upgrade preserves bindings/audit/limits and records conflicting email history without guessing',async()=>{
  const {pool}=await database('legacy_directory');
  await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  await pool.query(`INSERT INTO roomqc_control.clusters(id,api_url,publishable_key,vapid_public_key,max_workspaces)
    VALUES('cluster-a','http://127.0.0.1:54321','test-public','test-vapid',7),('cluster-b','https://cluster-b.invalid','public-b','test-vapid',8)`);
  const workspace=randomUUID(),tenant=randomUUID(),hotel=randomUUID(),owner=randomUUID(),request=randomUUID();
  await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,tenant_id,hotel_id,owner_id,status)
    VALUES($1,'legacy-hotel','Legacy fixture','same-email','cluster-a',$2,$3,$4,'active'),($5,'old-expired','Old history','same-email','cluster-b',NULL,NULL,NULL,'expired')`,
  [workspace,tenant,hotel,owner,randomUUID()]);
  await pool.query("INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,'active')",[request,workspace]);
  await pool.query(`INSERT INTO roomqc_control.support_actions(id,request_id,workspace_id,actor_id,authority_cluster_id,reason,before_state)
    VALUES($1,$2,$3,$4,'cluster-a','Legacy fixture verification','{}')`,[randomUUID(),request,workspace,owner]);
  const beforeState=await pool.query('SELECT * FROM roomqc_control.workspaces ORDER BY id');
  const beforeAudit=await pool.query('SELECT * FROM roomqc_control.support_actions');
  await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
  const upgraded=(await pool.query('SELECT * FROM roomqc_control.workspaces ORDER BY id')).rows;
  assert.deepEqual(upgraded.map(row=>Object.fromEntries(Object.keys(beforeState.rows[0]).map(key=>[key,row[key]]))),beforeState.rows);
  assert.ok(upgraded.every(row=>row.admission_policy_version===null&&row.admission_health_generation===null));
  assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.support_actions')).rows,beforeAudit.rows);
  assert.equal((await pool.query('SELECT * FROM roomqc_control.signup_affinities')).rowCount,0);
  assert.deepEqual((await pool.query('SELECT cluster_ids FROM roomqc_control.signup_affinity_conflicts')).rows[0].cluster_ids,['cluster-a','cluster-b']);
  assert.equal((await pool.query("SELECT tenant_limit FROM roomqc_control.cluster_policies WHERE cluster_id='cluster-a'")).rows[0].tenant_limit,7);
});

dbtest('unknown legacy schema and tenant backends are rejected before recording migration history',async()=>{
  const legacy=await database('unknown_directory');
  await legacy.pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  await legacy.pool.query('ALTER TABLE roomqc_control.clusters ADD COLUMN unknown_column text');
  await assert.rejects(()=>migrateDirectory(legacy.pool),{code:'DIRECTORY_LEGACY_SCHEMA_UNKNOWN'});
  assert.equal((await legacy.pool.query("SELECT to_regclass('roomqc_control.schema_migrations') AS value")).rows[0].value,null);
  await legacy.pool.query('ALTER TABLE roomqc_control.clusters DROP COLUMN unknown_column; ALTER TABLE roomqc_control.clusters ALTER COLUMN max_workspaces TYPE bigint');
  await assert.rejects(()=>migrateDirectory(legacy.pool),{code:'DIRECTORY_LEGACY_SCHEMA_UNKNOWN'});
  await legacy.pool.query("ALTER TABLE roomqc_control.clusters ALTER COLUMN max_workspaces TYPE integer; ALTER TABLE roomqc_control.workspaces ALTER COLUMN status SET DEFAULT 'suspended'");
  await assert.rejects(()=>migrateDirectory(legacy.pool),{code:'DIRECTORY_LEGACY_SCHEMA_UNKNOWN'});
  const tenant=await database('tenant_backend');await tenant.pool.query('CREATE SCHEMA auth');
  await assert.rejects(()=>migrateDirectory(tenant.pool),{code:'DIRECTORY_DATABASE_IS_TENANT_BACKEND'});
  assert.equal((await tenant.pool.query("SELECT to_regnamespace('roomqc_control') AS value")).rows[0].value,null);
});

dbtest('checksum mismatch stops; a failed new migration rolls back both DDL and history',async()=>{
  const {pool}=await database('failed_directory');await migrateDirectory(pool);
  await pool.query("UPDATE roomqc_control.schema_migrations SET checksum=repeat('0',64) WHERE version LIKE '0001-%'");
  await assert.rejects(()=>migrateDirectory(pool),{code:'MIGRATION_CHECKSUM_MISMATCH'});
  const manifest=await migrationManifest();await pool.query('UPDATE roomqc_control.schema_migrations SET checksum=$1 WHERE version=$2',[manifest[0].checksum,manifest[0].version]);
  const temp=await mkdtemp(join(tmpdir(),'roomqc-directory-migrations-'));
  try{
    for(const item of manifest)await writeFile(join(temp,item.version),item.sql);
    const next=String(manifest.length+1).padStart(4,'0');
    await writeFile(join(temp,next+'-rollback-probe.sql'),'CREATE TABLE roomqc_control.rollback_probe(id int); SELECT * FROM roomqc_control.nonexistent_probe;');
    await assert.rejects(()=>migrateDirectory(pool,{location:pathToFileURL(temp+'/')}),{code:'42P01'});
    assert.equal((await pool.query("SELECT to_regclass('roomqc_control.rollback_probe') AS value")).rows[0].value,null);
    assert.equal((await pool.query('SELECT * FROM roomqc_control.schema_migrations')).rowCount,manifest.length);
  }finally{await rm(temp,{recursive:true})}
});

dbtest('runtime grants allow signup and readiness but reject DDL, audit deletion and migration history changes',async()=>{
  const {pool,url}=await database('runtime_directory');await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
  await seedOperationalCluster(pool);
  await pool.query(`CREATE ROLE control_test_api LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const runtimeUrl=new URL(url);runtimeUrl.username='control_test_api';
  const store=new ControlStore(config(runtimeUrl.href));
  try{
    assert.equal((await store.readiness()).status,'ready');
    const workspace=await store.reserve({slug:'runtime-fixture',email:'fixture@example.invalid',displayName:'Runtime fixture'},randomUUID());assert.ok(workspace.id);
    for(const statement of ['CREATE TABLE roomqc_control.forbidden(id int)','DELETE FROM roomqc_control.attempts',
      'UPDATE roomqc_control.schema_migrations SET checksum=checksum','DELETE FROM roomqc_control.cluster_events',
      'SELECT rolpassword FROM pg_authid',
      'SELECT * FROM roomqc_control.support_actions FOR UPDATE; DELETE FROM roomqc_control.support_actions']){
      await assert.rejects(()=>store.pool.query(statement),{code:'42501'});
    }
    const privileged=new ControlStore(config(url));
    try{await assert.rejects(()=>privileged.readiness(),{code:'CONTROL_RUNTIME_PRIVILEGES'})}finally{await privileged.close()}
    const otherRoles=await pool.connect();
    try{
      for(const role of ['worker','metrics']){
        await otherRoles.query('BEGIN');await otherRoles.query(`SET LOCAL ROLE roomqc_control_${role}`);
        await otherRoles.query('SELECT * FROM roomqc_control.cluster_health_current');
        await assert.rejects(()=>otherRoles.query('CREATE TABLE roomqc_control.forbidden_worker(id int)'),{code:'42501'});
        await otherRoles.query('ROLLBACK');
      }
      await otherRoles.query('BEGIN');await otherRoles.query('SET LOCAL ROLE roomqc_control_metrics');
      await assert.rejects(()=>otherRoles.query('SELECT * FROM roomqc_control.workspaces'),{code:'42501'});
      await otherRoles.query('ROLLBACK');
    }finally{otherRoles.release()}
    await pool.query('DROP TABLE roomqc_control.alerts');
    await assert.rejects(()=>store.readiness(),{code:'CONTROL_SCHEMA_INCOMPLETE'});
  }finally{await store.close()}
});

dbtest('HTTP liveness remains available with an unmigrated database; readiness changes after an explicit migration',async()=>{
  const {pool,url}=await database('http_directory');
  await pool.query(`CREATE ROLE control_test_http LOGIN PASSWORD '${password}'`);
  const runtimeUrl=new URL(url);runtimeUrl.username='control_test_http';
  const store=new ControlStore(config(runtimeUrl.href));const runtime=await startControl(config(runtimeUrl.href),{store,gateway:{}});
  const api=`http://127.0.0.1:${runtime.server.address().port}/api/control`;
  try{
    assert.equal((await fetch(api+'/livez')).status,200);assert.equal((await fetch(api+'/readyz')).status,503);
    await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
    await pool.query('GRANT roomqc_control_api TO control_test_http');
    const ready=await fetch(api+'/readyz');assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store');
    assert.deepEqual(await(await fetch(api+'/healthz')).json(),{status:'ok'});
  }finally{await runtime.shutdown()}
});

registerAdminCases({dbtest,database,password,cluster});
registerTelemetryCases({dbtest,database,password,cluster});
registerTelemetryBindingCases({dbtest,database,password,cluster});
