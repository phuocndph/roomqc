// Deployment-only: never mounted in the API. The administrator credential is
// supplied to this short-lived process, not to any long-lived service.
import {pathToFileURL} from 'node:url';
import {isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import pg from 'pg';
import {migrationManifest,migrateDirectory,verifyHistory,importInitialRegistry} from './migrate.mjs';
import {directoryRuntimePlan} from './directory-runtime-plan.mjs';
import {directoryRuntimeLoginsMain,writeDirectoryPrivateFile} from './directory-runtime-logins-cli.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {readSetupBackfillFile,assertSetupBackfillAccess} from './setup-backfill-files.mjs';
import {healthDatabaseUrl} from './workers/health-config.mjs';
import {assertManagementRegistry} from './management-registry.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
async function durable(file,content){
 let present;try{await lstat(file);present=true}catch(e){if(e.code!=='ENOENT')throw e;present=false}
 if(present){if(await readSetupBackfillFile(file,256*1024)!==content)fail('MANAGEMENT_BOOTSTRAP_FILE_CHANGED')}
 else await writeDirectoryPrivateFile(file,content);
}
export async function managementBootstrapMain(args=process.argv.slice(2),{output=process.stdout,poolFactory=options=>new pg.Pool(options)}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC management directory bootstrap. --config-file ABSOLUTE_PRIVATE_JSON --initialize|--resume|--verify. Initialize requires an empty dedicated PostgreSQL16 directory with pinned database identity; resume requires the same owner and migration manifest. Never adopts a tenant DB or performs an upgrade. Keeps runtime credentials unchanged and never opens signup.\n');return 0;
 }
 let pool,client,locked=false;
 try{
  if(args.length!==3||args[0]!=='--config-file'||!isAbsolute(args[1])||!['--initialize','--resume','--verify'].includes(args[2]))fail('MANAGEMENT_BOOTSTRAP_ARGUMENTS_INVALID');
  const mode=args[2].slice(2),config=JSON.parse(await readSetupBackfillFile(args[1],16384));
  if(!exact(config,['version','deploymentId','environment','expected','budgetFile','budgetSha256','adminDsnFile','credentialsDirectory','registryFile'])
   ||![config.budgetFile,config.adminDsnFile,config.credentialsDirectory,config.registryFile].every(p=>typeof p==='string'&&isAbsolute(p)))fail('MANAGEMENT_BOOTSTRAP_CONFIG_INVALID');
  const snapshot=loadResourceBudgetSnapshot(config.budgetFile),plan=directoryRuntimePlan({version:config.version,deploymentId:config.deploymentId,
   environment:config.environment,expected:config.expected,budgetSha256:config.budgetSha256},snapshot);
  await assertSetupBackfillAccess(config.credentialsDirectory,{directory:true});
  const registry=JSON.parse(await readSetupBackfillFile(config.registryFile,128*1024));
  assertManagementRegistry(registry);
  const dsn=(await readSetupBackfillFile(config.adminDsnFile,8192)).trim();
  healthDatabaseUrl(dsn,{production:config.environment!=='local',allowLocal:config.environment==='local'});
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')fail('MANAGEMENT_BOOTSTRAP_TLS_UNSAFE');
  const manifest=await migrationManifest(),manifestSha256=createHash('sha256').update(JSON.stringify(manifest.map(({version,checksum})=>({version,checksum})))).digest('hex');
  const registrySha256=createHash('sha256').update(JSON.stringify(registry)).digest('hex');
  const marker='roomqc-management/v1:'+config.deploymentId+':'+manifestSha256+':'+registrySha256;
  pool=poolFactory({connectionString:dsn,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
   statement_timeout:10000,lock_timeout:5000,idle_in_transaction_session_timeout:15000,application_name:'roomqc-management-bootstrap'});
  client=await pool.connect();
  // Serialize with other bootstrappers without borrowing a second connection.
  if(!(await client.query('SELECT pg_try_advisory_lock(727031) AS acquired')).rows[0]?.acquired)fail('MANAGEMENT_BOOTSTRAP_BUSY');
  locked=true;
  const target=(await client.query(`SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",
   (pg_control_system()).system_identifier::text AS "systemIdentifier",r.rolsuper AS superuser,
   current_setting('server_version_num')::integer AS version,current_setting('max_connections')::integer AS "maxConnections",
   EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls,shobj_description(d.oid,'pg_database') AS marker,
   EXISTS(SELECT 1 FROM pg_namespace WHERE nspname NOT IN('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg_%')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
    OR EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS populated
   FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)).rows[0];
  if(!target||!target.superuser||target.version<160000||target.version>=170000||target.maxConnections!==plan.maxConnections
   ||config.environment!=='local'&&!target.tls||Object.entries(config.expected).some(([k,v])=>target[k]!==v))fail('MANAGEMENT_BOOTSTRAP_TARGET_MISMATCH');
  if(target.marker!==marker){
   if(mode!=='initialize'||target.marker!==null||target.populated)fail('MANAGEMENT_BOOTSTRAP_OWNER_MISMATCH');
   // Identifier and marker are restricted metadata validated above, not input SQL.
   await client.query("COMMENT ON DATABASE roomqc_control IS '"+marker+"'");
  }
  const borrowed={query:client.query.bind(client),connect:async()=>({query:client.query.bind(client),release(){}}),end:async()=>{}};
  const login={version:1,deploymentId:config.deploymentId,environment:config.environment,expected:config.expected,
   budgetFile:config.budgetFile,budgetSha256:config.budgetSha256,dsnFile:config.adminDsnFile,credentialsDirectory:config.credentialsDirectory};
  const loginConfig=join(config.credentialsDirectory,'login-config.json');
  const invoke=async action=>{
   let result='';const status=await directoryRuntimeLoginsMain(['--config-file',loginConfig,'--'+action],
    {output:{write:value=>{result+=value}},poolFactory:()=>borrowed});
   const report=JSON.parse(result);if(status!==0)throw Object.assign(new Error('MANAGEMENT_BOOTSTRAP_LOGIN_FAILED'),{
    code:report.code??'MANAGEMENT_BOOTSTRAP_LOGIN_FAILED',commitMayHaveSucceeded:report.commitMayHaveSucceeded===true});return report;
  };
  let applied=[];
  if(mode==='verify'){
   if(await verifyHistory(client,manifest)!==manifest.length)fail('MANAGEMENT_BOOTSTRAP_SCHEMA_PENDING');
   if(await readSetupBackfillFile(loginConfig,16384)!==JSON.stringify(login)+'\n')fail('MANAGEMENT_BOOTSTRAP_FILE_CHANGED');
  }else{
   await durable(loginConfig,JSON.stringify(login)+'\n');
   await invoke('prepare');
   applied=(await migrateDirectory(borrowed)).applied;
   await importInitialRegistry(borrowed,registry);
   await invoke('apply');
  }
  const registered=(await client.query('SELECT id,api_url,publishable_key,vapid_public_key,credential_ref FROM roomqc_control.clusters WHERE id=ANY($1::text[])',[registry.map(c=>c.id)])).rows;
  if(registry.some(c=>!registered.some(r=>r.id===c.id&&r.api_url===c.url&&r.publishable_key===c.publishableKey&&r.vapid_public_key===c.vapidPublicKey&&r.credential_ref===c.credentialRef)))fail('MANAGEMENT_BOOTSTRAP_REGISTRY_MISMATCH');
  await invoke('verify');
  output.write(JSON.stringify({ok:true,mode,deploymentId:config.deploymentId,migrationManifestSha256:manifestSha256,
   migrationsApplied:applied.length,schemaVersion:manifest.at(-1).version,runtimeLogins:plan.roles.length,credentialsRotated:false,
   administratorInRuntime:false,signupOpened:false,deploymentReady:false})+'\n');return 0;
 }catch(error){
  const code=typeof error?.code==='string'&&/^(MANAGEMENT_BOOTSTRAP_|DIRECTORY_LOGIN_|MIGRATION_)[A-Z0-9_]+$/.test(error.code)?error.code:'MANAGEMENT_BOOTSTRAP_FAILED';
  output.write(JSON.stringify({ok:false,code,signupOpened:false,deploymentReady:false,
   ...(error.commitMayHaveSucceeded?{commitMayHaveSucceeded:true,nextAction:'verify_same_configuration'}:{})})+'\n');return 1;
 }finally{
  if(locked)await client.query('SELECT pg_advisory_unlock(727031)').catch(()=>{});
  client?.release();await pool?.end();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await managementBootstrapMain();
