import assert from 'node:assert/strict';
import pg from 'pg';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {migrateDirectory,migrationManifest} from './migrate.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials,provisionDirectoryRuntimeLogins} from './directory-runtime-logins.mjs';
import {deploymentRuntimeReadiness} from './deployment-runtime.mjs';
import {openDeploymentJournal} from './deployment-journal.mjs';
import {SetupWorkerStore} from './setup-worker-store.mjs';

export function registerDeploymentRuntimeCases({dbtest,database}){
 dbtest('deployment runtime upgrade: removes default function access and restores setup readiness without data changes',async t=>{
  const {pool}=await database('deploy_acl_upgrade'),root=await mkdtemp(join(tmpdir(),'roomqc-deployment-acl-upgrade-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const manifest=await migrationManifest(),index=manifest.findIndex(item=>item.version==='0026-deployment-function-privileges.sql');assert.equal(index,25);
  for(const migration of manifest.slice(0,index))await writeFile(join(root,migration.version),migration.sql);
  await migrateDirectory(pool,{location:pathToFileURL(root+sep)});
  await pool.query('CREATE TABLE public.deployment_upgrade_sentinel(id integer PRIMARY KEY,value text); INSERT INTO public.deployment_upgrade_sentinel VALUES(1,\'retained\')');
  assert.equal((await pool.query("SELECT has_function_privilege('roomqc_control_setup_runtime','roomqc_control.guard_deployment_job()','EXECUTE') AS open")).rows[0].open,true);
  assert.deepEqual((await migrateDirectory(pool)).applied,manifest.slice(index).map(item=>item.version));
  assert.equal((await pool.query("SELECT has_function_privilege('roomqc_control_setup_runtime','roomqc_control.guard_deployment_job()','EXECUTE') AS open")).rows[0].open,false);
  assert.deepEqual((await pool.query('SELECT * FROM public.deployment_upgrade_sentinel')).rows,[{id:1,value:'retained'}]);
  const client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL ROLE roomqc_control_setup_runtime');
  try{await SetupWorkerStore.prototype.readiness.call({pool:client})}finally{await client.query('ROLLBACK');client.release()}
  assert.equal((await migrateDirectory(pool)).applied.length,0);
 });
 dbtest('deployment runtime DB: issued bounded LOGINs, real connection cap and startup drift fences',async t=>{
  const {pool,url}=await database('roomqc_control');await migrateDirectory(pool);
  const root=await mkdtemp(join(tmpdir(),'roomqc-executor-login-db-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,data)=>{const file=join(root,name);await writeFile(file,typeof data==='string'?data:JSON.stringify(data),{mode:0o600});return file};
  const raw=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));raw.environment='local';
  raw.databases[0].consumers.find(c=>c.id==='deployment-executor').replicas=2;
  raw.databases[0].consumers.find(c=>c.id==='provisioning-worker').replicas=1;
  const budgetFile=await put('budget.json',raw),snapshot=loadResourceBudgetSnapshot(budgetFile);
  const identity=(await pool.query(`SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",
   (pg_control_system()).system_identifier::text AS "systemIdentifier" FROM pg_database d WHERE datname=current_database()`)).rows[0];
  const plan=directoryRuntimePlan({version:1,environment:'local',deploymentId:'executor-db',expected:identity,budgetSha256:snapshot.sha256},snapshot);
  const bundle=createDirectoryRuntimeCredentials(plan),roles=plan.roles.filter(r=>r.consumerId==='deployment-executor');
  const issued=login=>{const u=new URL(url),c=new URL(bundle.credentials.find(c=>c.login===login).databaseUrl);u.username=c.username;u.password=c.password;return u.href};
  const env={NODE_ENV:'test',ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true',ROOMQC_RESOURCE_BUDGET_FILE:budgetFile,
   ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES:'2',ROOMQC_DEPLOY_DATABASE_URL_FILE:await put('executor.dsn',issued(roles[0].name)),
   ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE:await put('plan.json',plan)};
  await t.test('prepare/apply/verify/rerun preserves credentials and checks real executor grants',async()=>{
   const applied=await provisionDirectoryRuntimeLogins(pool,plan,bundle);assert.equal(applied.created,plan.roles.length);
   assert.equal((await provisionDirectoryRuntimeLogins(pool,plan,bundle,{verifyOnly:true})).existing,plan.roles.length);
   assert.equal((await provisionDirectoryRuntimeLogins(pool,plan,bundle)).created,0);
  });
  await t.test('actual issued login opens journal; second simultaneous connection refused by server',async()=>{
   const runtime=await openDeploymentJournal(env),overflow=new pg.Client({connectionString:issued(roles[0].name),connectionTimeoutMillis:3000});
   try{
    assert.equal(runtime.readiness.connectionLimit,1);assert.equal(runtime.resources.consumers[0].replicas,2);
    await assert.rejects(()=>overflow.connect(),{code:'53300'});
   }finally{await overflow.end().catch(()=>{});await runtime.close()}
   await put('executor.dsn',issued(roles[1].name));
   const replica=await openDeploymentJournal({...env,ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL:'2'});
   assert.equal(replica.readiness.ordinal,2);await replica.close();await put('executor.dsn',issued(roles[0].name));
  });
  await t.test('administrator and other runtime capabilities cannot run the executor even in local mode',async()=>{
   for(const dsn of [url,issued(plan.roles.find(r=>r.consumerId==='control-api').name)]){
    await put('executor.dsn',dsn);
    await assert.rejects(()=>openDeploymentJournal({NODE_ENV:'test',ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true',
     ROOMQC_DEPLOY_DATABASE_URL_FILE:env.ROOMQC_DEPLOY_DATABASE_URL_FILE}),{code:'DEPLOYMENT_RUNTIME_PRIVILEGES'});
   }
   await put('executor.dsn',issued(roles[0].name));
  });
  await t.test('connection limit, SET privilege and role settings drift stop startup before any job claim',async()=>{
   const role=roles[0].name;
   for(const [change,restore]of [
    ['ALTER ROLE '+role+' CONNECTION LIMIT 2','ALTER ROLE '+role+' CONNECTION LIMIT 1'],
    ['GRANT roomqc_control_deployer TO '+role+' WITH SET TRUE','GRANT roomqc_control_deployer TO '+role+' WITH SET FALSE'],
    ['ALTER ROLE '+role+" SET search_path='public'",'ALTER ROLE '+role+' RESET ALL']]){
    await pool.query(change);try{await assert.rejects(()=>openDeploymentJournal(env),{code:'DEPLOYMENT_RUNTIME_PRIVILEGES'})}finally{await pool.query(restore)}
   }
  });
  await t.test('direct role ACL and inherited privilege expansion are refused',async()=>{
   for(const [change,restore]of [
    ['GRANT SELECT ON roomqc_control.workspaces TO '+roles[0].name,'REVOKE SELECT ON roomqc_control.workspaces FROM '+roles[0].name],
    ['GRANT UPDATE ON roomqc_control.deployment_specs TO roomqc_control_deployer','REVOKE UPDATE ON roomqc_control.deployment_specs FROM roomqc_control_deployer'],
    ['GRANT EXECUTE ON FUNCTION roomqc_control.claim_setup_recovery(integer,jsonb) TO roomqc_control_deployer','REVOKE EXECUTE ON FUNCTION roomqc_control.claim_setup_recovery(integer,jsonb) FROM roomqc_control_deployer'],
    ['GRANT pg_read_all_data TO roomqc_control_deployer','REVOKE pg_read_all_data FROM roomqc_control_deployer']]){
    await pool.query(change);try{await assert.rejects(()=>openDeploymentJournal(env),{code:'DEPLOYMENT_RUNTIME_PRIVILEGES'})}finally{await pool.query(restore)}
   }
  });
  await t.test('wrong provisioning marker and missing history reject startup without touching queue',async()=>{
   await pool.query('COMMENT ON ROLE '+roles[0].name+" IS 'wrong-plan'");
   try{await assert.rejects(()=>openDeploymentJournal(env),{code:'DEPLOYMENT_RUNTIME_PRIVILEGES'})}
   finally{await pool.query('COMMENT ON ROLE '+roles[0].name+" IS 'roomqc-directory-runtime/v1:"+plan.planSha256+"'")}
   const client=await pool.connect();await client.query('BEGIN');await client.query('SET LOCAL ROLE '+roles[0].name);
   try{
    await client.query('RESET ROLE');const row=(await client.query('DELETE FROM roomqc_control.schema_migrations WHERE version=(SELECT max(version) FROM roomqc_control.schema_migrations) RETURNING version')).rows[0];
    assert.ok(row);await client.query('SET LOCAL ROLE '+roles[0].name);
    await assert.rejects(()=>deploymentRuntimeReadiness(client),{code:'DEPLOYMENT_SCHEMA_PENDING'});
   }finally{await client.query('ROLLBACK');client.release()}
   assert.equal(Number((await pool.query('SELECT count(*) FROM roomqc_control.deployment_jobs')).rows[0].count),0);
   const runtime=await openDeploymentJournal(env);await runtime.close();
  });
 });
}
