// Isolated Docker probe only. The caller supplies disposable credentials on stdin.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'file:///app/node_modules/pg/lib/index.js';
import {directoryRuntimeLoginsMain} from 'file:///app/directory-runtime-logins-cli.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials,provisionDirectoryRuntimeLogins} from 'file:///app/directory-runtime-logins.mjs';
import {loadResourceBudgetSnapshot} from 'file:///app/resource-budget.mjs';
import {ControlStore} from 'file:///app/store.mjs';
import {HealthStore} from 'file:///app/telemetry.mjs';
import {ProbeCredentialStore} from 'file:///app/probe-credentials.mjs';
import {AlertDeliveryStore} from 'file:///app/alert-delivery.mjs';
import {SetupWorkerStore} from 'file:///app/setup-worker-store.mjs';
import {directoryRuntimeWiringMain} from 'file:///app/directory-runtime-wiring-cli.mjs';
import {loadRuntimeConfig} from 'file:///app/config.mjs';
import {startControl} from 'file:///app/server.mjs';
import {importInitialRegistry} from 'file:///app/migrate.mjs';
import {deploymentRuntimeReadiness} from 'file:///app/deployment-runtime.mjs';
import {openDeploymentJournal} from 'file:///app/deployment-journal.mjs';

let text='';for await(const chunk of process.stdin)text+=chunk;const input=JSON.parse(text),checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
const hash=v=>createHash('sha256').update(v).digest('hex');
for(const s of input.sources)check('provisioning source matches '+s.path,hash(await readFile('/app/'+s.path))===s.sha256);
const adminUrl=new URL('postgresql://roomqc-directory:5432/roomqc_control?sslmode=verify-full');
adminUrl.username='postgres';adminUrl.password=input.adminPassword;
const admin=new pg.Pool({connectionString:adminUrl.href,max:1,connectionTimeoutMillis:3000});
const base='/run/roomqc-operator',directory=base+'/runtime';await mkdir(directory,{mode:0o700});
await writeFile(base+'/admin.dsn',adminUrl.href,{mode:0o600});
const snapshot=loadResourceBudgetSnapshot('/etc/roomqc/runtime-budget.json');
const identity=(await admin.query(`SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",
 (pg_control_system()).system_identifier::text AS "systemIdentifier" FROM pg_database d WHERE datname=current_database()`)).rows[0];
const config={version:1,environment:'production',deploymentId:'fixture-main',expected:identity,budgetSha256:snapshot.sha256,
 budgetFile:'/etc/roomqc/runtime-budget.json',dsnFile:base+'/admin.dsn',credentialsDirectory:directory};
const configFile=base+'/config.json';await writeFile(configFile,JSON.stringify(config),{mode:0o600});
const plan=directoryRuntimePlan({version:config.version,environment:config.environment,deploymentId:config.deploymentId,
 expected:identity,budgetSha256:snapshot.sha256},snapshot);
const cli=async(mode)=>{
 let result='';const code=await directoryRuntimeLoginsMain(['--config-file',configFile,'--'+mode],{output:{write:s=>result+=s}});
 assert(!result.includes(input.adminPassword),'administrator secret not in output');return {code,result:JSON.parse(result)};
};
const credentialsHash=async()=>{
 const names=(await readdir(directory)).sort();return hash(Buffer.concat(await Promise.all(names.map(name=>readFile(directory+'/'+name)))));
};
try{
 const prepared=await cli('prepare');check('operator prepare succeeds without database mutation',prepared.code===0&&prepared.result.databaseChanged===false);
 check('all seven capabilities prepared',prepared.result.credentialsPrepared===7);
 const initialHash=await credentialsHash(),bundle=JSON.parse(await readFile(directory+'/runtime-credentials.json','utf8'));
 for(const c of bundle.credentials)check('runtime password not in operator output '+c.login,!JSON.stringify(prepared).includes(new URL(c.databaseUrl).password));
 check('verify before apply reports missing logins',(await cli('verify')).result.code==='DIRECTORY_LOGIN_MISSING');
 const collision=plan.roles.at(-1).name;
 await admin.query('CREATE ROLE '+collision+' NOLOGIN');
 const blocked=await cli('apply');check('unowned existing role is refused before creation',blocked.result.code==='DIRECTORY_LOGIN_EXISTING_UNSAFE');
 check('conflict rolls back all earlier logins',Number((await admin.query('SELECT count(*) AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[plan.roles.slice(0,-1).map(r=>r.name)])).rows[0].n)===0);
 await admin.query('DROP ROLE '+collision);
 await admin.query('GRANT pg_read_all_data TO roomqc_control_metrics');
 check('elevated group chain is refused',(await cli('apply')).result.code==='DIRECTORY_LOGIN_GROUP_UNSAFE');
 await admin.query('REVOKE pg_read_all_data FROM roomqc_control_metrics');
 await admin.query('GRANT CREATE ON SCHEMA roomqc_control TO roomqc_control_metrics');
 check('excessive group ACL rolls back new roles',(await cli('apply')).result.code==='DIRECTORY_LOGIN_GROUP_UNSAFE');
 check('unsafe group ACL creates no persistent role',Number((await admin.query('SELECT count(*) AS n FROM pg_roles WHERE rolname=ANY($1::text[])',[plan.roles.map(r=>r.name)])).rows[0].n)===0);
 await admin.query('REVOKE CREATE ON SCHEMA roomqc_control FROM roomqc_control_metrics');
 const wrongPlan=directoryRuntimePlan({version:config.version,environment:config.environment,deploymentId:config.deploymentId,
  budgetSha256:config.budgetSha256,expected:{...identity,databaseOid:String(Number(identity.databaseOid)+1)}},snapshot);
 await assert.rejects(()=>provisionDirectoryRuntimeLogins(admin,wrongPlan,createDirectoryRuntimeCredentials(wrongPlan)),{code:'DIRECTORY_LOGIN_DATABASE_MISMATCH'});
 check('database identity mismatch refused',true);
 await admin.query('CREATE SCHEMA auth');
 check('hotel backend marker prevents provisioning',(await cli('apply')).result.code==='DIRECTORY_LOGIN_DATABASE_MISMATCH');
 await admin.query('DROP SCHEMA auth');
 const applied=await cli('apply');
 if(applied.code!==0){
  // Diagnose only the capability name, never SQL values or credential data.
  let lastRole='unknown';
  const observed={connect:async()=>{
   const client=await admin.connect();return {release:()=>client.release(),query:async(sql,values)=>{
    if(typeof sql==='string'&&sql.startsWith('SET LOCAL ROLE '))lastRole=sql.slice(15);
    return client.query(sql,values);
   }};
  }};
  try{await provisionDirectoryRuntimeLogins(observed,plan,bundle)}catch{
   const capability=plan.roles.find(r=>r.name===lastRole)?.consumerId??'unknown';
   assert.fail('LOGIN_APPLY '+applied.result.code+' CAPABILITY '+capability);
  }
 }
 check('all seven runtime logins created',applied.result.created===7);
 check('repeat prepare preserves credentials',(await cli('prepare')).code===0&&await credentialsHash()===initialHash);
 const repeated=await cli('apply');check('repeat apply creates zero roles and rotates no passwords',repeated.code===0&&repeated.result.created===0&&!repeated.result.credentialsRotated);
 check('verify succeeds without grant changes',(await cli('verify')).code===0);
 check('credential bytes remain unchanged',await credentialsHash()===initialHash);
 const pools=new Map();
 for(const role of plan.roles){
  const entry=bundle.credentials.find(c=>c.login===role.name),pool=new pg.Pool({connectionString:entry.databaseUrl,max:role.connectionLimit,connectionTimeoutMillis:3000});
  pools.set(role.consumerId,pool);
  const r=(await pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolconnlimit,
   EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS ssl FROM pg_roles r WHERE rolname=current_user`)).rows[0];
  check(role.consumerId+' authenticates with TLS and finite privileges',r.ssl===true&&r.rolconnlimit===role.connectionLimit
   &&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication&&!r.rolbypassrls);
  for(const sql of ['SELECT rolpassword FROM pg_authid','CREATE TABLE roomqc_control.forbidden_login_test(id int)','ALTER ROLE postgres CREATEDB']){
   await assert.rejects(()=>pool.query(sql),{code:'42501'});
  }
  check(role.consumerId+' cannot administer or read password hashes',true);
 }
 try{
  const api=Object.create(ControlStore.prototype);api.pool=pools.get('control-api');api.config={clusters:[]};
  check('API store readiness accepts issued login',(await api.readiness()).status==='ready');
  await new HealthStore(pools.get('health-worker')).readiness();check('health store readiness accepts issued login',true);
  await new ProbeCredentialStore(pools.get('probe-catalog')).readiness();check('probe store readiness accepts issued login',true);
  await new AlertDeliveryStore(pools.get('alert-worker')).readiness();check('alert store readiness accepts issued login',true);
  const setup=new SetupWorkerStore(pools.get('provisioning-worker'),{bindings:[{clusterId:'cluster-a',approvalId:'11111111-1111-4111-8111-111111111111',epoch:1,envelopeDigest:'a'.repeat(64),credentialRef:'fixture-credential'}]});
  await setup.readiness();check('setup store readiness accepts exactly one issued capability',true);
  await deploymentRuntimeReadiness(pools.get('deployment-executor'));
  check('executor readiness accepts issued LOGIN over verified TLS',true);
  const observer=pools.get('summary-credential-rotation');
  await observer.query('SELECT (pg_control_system()).system_identifier; SELECT id,api_url,host_id,inventory_ref,credential_ref FROM roomqc_control.clusters');
  await assert.rejects(()=>observer.query('SELECT * FROM roomqc_control.workspaces'),{code:'42501'});
  check('summary observer reads only release/target metadata',true);
  await assert.rejects(()=>new HealthStore(pools.get('control-api')).readiness(),{code:'METRICS_RUNTIME_PRIVILEGES'});
  await assert.rejects(()=>new AlertDeliveryStore(pools.get('health-worker')).readiness(),{code:'ALERT_RUNTIME_PRIVILEGES'});
  check('cross-role substitution is rejected by real readiness',true);
  const apiRole=plan.roles.find(r=>r.consumerId==='control-api'),apiEntry=bundle.credentials.find(c=>c.login===apiRole.name);
  const held=[],overflow=new pg.Client({connectionString:apiEntry.databaseUrl,connectionTimeoutMillis:3000});
  try{
   for(let i=0;i<apiRole.connectionLimit;i++)held.push(await pools.get('control-api').connect());
   await assert.rejects(()=>overflow.connect(),{code:'53300'});check('server enforces per-login connection cap',true);
  }finally{await overflow.end().catch(()=>{});for(const c of held)c.release()}
 }finally{for(const p of pools.values())await p.end()}
 const executorRole=plan.roles.find(r=>r.consumerId==='deployment-executor'),planFile=base+'/executor-plan.json';
 await writeFile(planFile,JSON.stringify(plan),{mode:0o600});
 const executorEnv={NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'production',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/runtime-budget.json',
  ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE:planFile,ROOMQC_DEPLOY_DATABASE_URL_FILE:directory+'/'+executorRole.name+'.dsn'};
 const executor=await openDeploymentJournal(executorEnv);
 try{
  check('executor startup verifies TLS, database identity, exact budget and provisioned role',executor.readiness.connectionLimit===1&&executor.resources.consumers[0].replicas===1);
  const extra=new pg.Client({connectionString:bundle.credentials.find(c=>c.login===executorRole.name).databaseUrl,connectionTimeoutMillis:3000});
  try{await assert.rejects(()=>extra.connect(),{code:'53300'});check('PostgreSQL refuses executor second connection over TLS',true)}finally{await extra.end().catch(()=>{})}
 }finally{await executor.close()}
 const driftRole=plan.roles[0];
 await admin.query('ALTER ROLE '+driftRole.name+' CONNECTION LIMIT '+(driftRole.connectionLimit+1));
 check('role limit drift is refused without password reset',(await cli('apply')).result.code==='DIRECTORY_LOGIN_EXISTING_UNSAFE');
 await admin.query('ALTER ROLE '+driftRole.name+' CONNECTION LIMIT '+driftRole.connectionLimit);
 check('verify recovers after exact operator repair',(await cli('verify')).code===0);
 await admin.query('GRANT SELECT ON roomqc_control.workspaces TO '+driftRole.name);
 check('direct runtime ACL drift refused',(await cli('verify')).result.code==='DIRECTORY_LOGIN_EXISTING_UNSAFE');
 await admin.query('REVOKE SELECT ON roomqc_control.workspaces FROM '+driftRole.name);
 const dsnFile=directory+'/'+plan.roles[0].name+'.dsn',dsnBefore=await readFile(dsnFile,'utf8');
 await writeFile(dsnFile,dsnBefore+'corrupted',{mode:0o600});
 check('partial/tampered runtime DSN refused before DB changes',(await cli('apply')).result.code==='DIRECTORY_LOGIN_SECRET_FILE_MISMATCH');
 await writeFile(dsnFile,dsnBefore,{mode:0o600});
 check('private credential bytes restored to original',await credentialsHash()===initialHash);
 const installer=structuredClone(input.summaryTemplate);installer.environment='production';
 installer.directory.expected={...identity,role:'previous-observer'};
 installer.business.expected={systemIdentifier:'999',databaseOid:'16385',databaseName:'postgres',role:'business-issuer'};
 installer.resourceBudgetSha256=plan.budgetSha256;installer.businessDatabaseId='business-example';
 installer.target.cluster={id:'cluster-a',hostId:'host-a',inventoryRef:'cluster-a',credentialRef:'cluster-a',url:'https://fixture.invalid',internalUrl:null,approvedAddresses:[]};
 installer.target.expected={clusterId:'cluster-a',releaseId:'fixture-release',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
 installer.target.approval={testOnly:'not-approved-by-renderer'};installer.publisher.signer.fingerprint='5'.repeat(64);
 const summaryFile=base+'/summary-input.json',wiringDir=base+'/wiring',wiringConfig=base+'/wiring-config.json';
 await mkdir(wiringDir,{mode:0o700});await writeFile(summaryFile,JSON.stringify(installer),{mode:0o600});
 const wiringInput={version:1,loginConfigFile:configFile,outputDirectory:wiringDir,summaryInputs:[{ordinal:1,installerFile:summaryFile}]};
 await writeFile(wiringConfig,JSON.stringify(wiringInput),{mode:0o600});
 const render=async()=>{let text='';const code=await directoryRuntimeWiringMain(['--config-file',wiringConfig],{output:{write:s=>text+=s}});return {code,result:JSON.parse(text)}};
 const rendered=await render();check('actual private wiring CLI renders six services from seven logins',rendered.code===0&&rendered.result.services.length===6);
 check('wiring renderer reruns without changing credentials',(await render()).code===0&&await credentialsHash()===initialHash);
 for(const name of await readdir(wiringDir)){
  const bytes=await readFile(wiringDir+'/'+name,'utf8');
  check('wiring output has no credential values '+name,!bundle.credentials.some(c=>bytes.includes(new URL(c.databaseUrl).password))&&!bytes.includes(input.adminPassword));
 }
 const apiOverlay=JSON.parse(await readFile(wiringDir+'/control-api-1.compose.json','utf8'));
 const executorOverlay=JSON.parse(await readFile(wiringDir+'/deployment-executor-1.compose.json','utf8'));
 check('executor wiring selects its exact private DSN',executorOverlay.secrets['deployment-dsn'].file===directory+'/'+executorRole.name+'.dsn');
 check('API overlay clears direct credential environment',apiOverlay.services['roomqc-control'].environment.ROOMQC_CONTROL_DATABASE_URL==='');
 const apiSource=apiOverlay.secrets['control-dsn'].file;
 const cluster={id:'cluster-a',url:'https://fixture.invalid',publishableKey:'fixture-public',serviceKey:'fixture-server-key',vapidPublicKey:'fixture-vapid',maxWorkspaces:1};
 await importInitialRegistry(admin,[cluster]);
 const env={NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'production',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/runtime-budget.json',
  ROOMQC_CONTROL_POOL_BUDGET:'21',
  ROOMQC_PUBLIC_URL:'https://roomqc.invalid',ROOMQC_CONTROL_EMAIL_HASH_KEY:'fixture-email-'.repeat(4),ROOMQC_CONTROL_CLUSTERS:JSON.stringify([cluster]),
  ROOMQC_CONTROL_DATABASE_URL_FILE:apiSource,ROOMQC_CONTROL_SIGNUP_ENABLED:'false'};
 const apiConfig=await loadRuntimeConfig(env),runtime=await startControl(apiConfig);
 try{
  for(const suffix of ['livez','readyz']){
   const response=await fetch('http://127.0.0.1:8091/api/control/'+suffix),body=await response.text();
   check('real API '+suffix+' succeeds with generated file credential',response.status===200);
   check('real API '+suffix+' hides DSNs and passwords',!body.includes('postgresql://')&&!bundle.credentials.some(c=>body.includes(new URL(c.databaseUrl).password)));
  }
  check('public signup remains closed in real API',apiConfig.signupEnabled===false);
 }finally{await runtime.shutdown()}
 check('wiring output cannot replace prepared credentials',await credentialsHash()===initialHash);
 await writeFile(wiringConfig,JSON.stringify({...wiringInput,outputDirectory:directory}),{mode:0o600});
 check('renderer refuses output overlap with secret bundle',(await render()).result.code==='DIRECTORY_WIRING_OUTPUT_OVERLAP');
 await writeFile(wiringConfig,JSON.stringify(wiringInput),{mode:0o600});
 const overlayFile=wiringDir+'/control-api-1.compose.json',oldOverlay=await readFile(overlayFile,'utf8');
 await writeFile(overlayFile,oldOverlay+'changed',{mode:0o600});
 check('renderer refuses conflicting output instead of overwriting',(await render()).result.code==='DIRECTORY_WIRING_OUTPUT_CONFLICT');
 await writeFile(overlayFile,oldOverlay,{mode:0o600});
 console.log(JSON.stringify({verified:true,checks,roles:plan.roles.map(({consumerId,connectionLimit})=>({consumerId,connectionLimit})),
  prepareApplyVerify:true,storeReadiness:true,wiringRendered:true,apiHttpFileCredentialVerified:true,
  executorTlsStartupVerified:true,executorConnectionCapVerified:true,fullWorkerRuntimesStarted:false,summaryReleaseApproved:false,credentialsPersistedAfterContainerRemoval:false}));
}finally{await admin.end()}
