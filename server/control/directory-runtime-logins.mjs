// Deployment-only administrative operation. Never import into an API/worker.
import {randomBytes,createHash,createHmac,pbkdf2Sync,timingSafeEqual} from 'node:crypto';
import {migrationManifest,verifyHistory} from './migrate.mjs';
import {ControlStore} from './store.mjs';
import {HealthStore} from './telemetry.mjs';
import {ProbeCredentialStore} from './probe-credentials.mjs';
import {AlertDeliveryStore} from './alert-delivery.mjs';
import {SetupWorkerStore} from './setup-worker-store.mjs';
import {capabilities,assertPlan} from './directory-runtime-plan.mjs';
import {deploymentRuntimeReadiness} from './deployment-runtime.mjs';
export {directoryRuntimePlan} from './directory-runtime-plan.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sameSecret=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function scram(password,salt){
 const salted=pbkdf2Sync(password,salt,4096,32,'sha256');
 const stored=createHash('sha256').update(createHmac('sha256',salted).update('Client Key').digest()).digest('base64');
 const server=createHmac('sha256',salted).update('Server Key').digest('base64');salted.fill(0);
 return 'SCRAM-SHA-256$4096:'+salt.toString('base64')+'$'+stored+':'+server;
}
export function createDirectoryRuntimeCredentials(plan){
 assertPlan(plan);
 return {version:1,planSha256:plan.planSha256,credentials:plan.roles.map(role=>{
  const password=randomBytes(32).toString('hex'),u=new URL('postgresql://roomqc-directory:5432/roomqc_control?sslmode=verify-full');
  u.username=role.name;u.password=password;
  return {login:role.name,databaseUrl:u.href,verifier:scram(password,randomBytes(16))};
 })};
}
export function validateDirectoryRuntimeCredentials(plan,bundle){
 assertPlan(plan);
 if(!exact(bundle,['version','planSha256','credentials'])||bundle.version!==1||bundle.planSha256!==plan.planSha256
  ||!Array.isArray(bundle.credentials)||bundle.credentials.length!==plan.roles.length)fail('DIRECTORY_LOGIN_CREDENTIALS_INVALID');
 const found=new Map();
 for(const entry of bundle.credentials){
  if(!exact(entry,['login','databaseUrl','verifier'])||!plan.roles.some(r=>r.name===entry.login)||found.has(entry.login)
   ||typeof entry.verifier!=='string')fail('DIRECTORY_LOGIN_CREDENTIALS_INVALID');
  const match=entry.verifier.match(/^SCRAM-SHA-256\$4096:([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=):([A-Za-z0-9+/]{43}=)$/);
  let url;try{url=new URL(entry.databaseUrl)}catch{fail('DIRECTORY_LOGIN_CREDENTIALS_INVALID')}
  if(!match||url.username!==entry.login||!/^[a-f0-9]{64}$/.test(url.password)||url.protocol!=='postgresql:'
   ||url.hostname!=='roomqc-directory'||url.port!=='5432'||url.pathname!=='/roomqc_control'||url.hash
   ||url.search!=='?sslmode=verify-full'||!sameSecret(scram(url.password,Buffer.from(match[1],'base64')),entry.verifier))
   fail('DIRECTORY_LOGIN_CREDENTIALS_INVALID');
  found.set(entry.login,entry);
 }
 return found;
}
async function target(client,plan){
 const row=(await client.query(`SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",
  (pg_control_system()).system_identifier::text AS "systemIdentifier",current_user AS administrator,r.rolsuper AS superuser,
  current_setting('server_version_num')::integer AS version,current_setting('max_connections')::integer AS "maxConnections",
  EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls,
  to_regnamespace('auth') IS NOT NULL OR to_regnamespace('supabase_migrations') IS NOT NULL
   OR to_regclass('public.tenants') IS NOT NULL AS "tenantBackend"
  FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)).rows[0];
 if(!row||row.tenantBackend||!row.superuser||row.version<160000||row.version>=170000
  ||row.maxConnections!==plan.maxConnections||plan.environment!=='local'&&!row.tls
  ||Object.keys(plan.expected).some(k=>row[k]!==plan.expected[k]))fail('DIRECTORY_LOGIN_DATABASE_MISMATCH');
 const manifest=await migrationManifest();
 if(await verifyHistory(client,manifest)!==manifest.length)fail('DIRECTORY_LOGIN_SCHEMA_PENDING');
 return row;
}
async function groupSafe(client,group){
 const r=(await client.query(`SELECT oid::text AS oid,rolcanlogin AS login,
  rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS elevated FROM pg_roles WHERE rolname=$1`,[group])).rows[0];
 if(!r||r.login||r.elevated||(await client.query('SELECT 1 FROM pg_auth_members WHERE member=$1::oid LIMIT 1',[r.oid])).rowCount)
  fail('DIRECTORY_LOGIN_GROUP_UNSAFE');
}
async function inspectRole(client,plan,role,credential){
 const r=(await client.query(`SELECT oid::text AS oid,rolcanlogin AS login,rolinherit AS inherit,rolconnlimit AS limit,
  rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS elevated,rolpassword AS verifier,
  rolvaliduntil::text AS expiration,shobj_description(oid,'pg_authid') AS marker FROM pg_authid WHERE rolname=$1`,[role.name])).rows[0];
 if(!r)return false;
 const marker='roomqc-directory-runtime/v1:'+plan.planSha256;
 if(!r.login||!r.inherit||r.elevated||r.limit!==role.connectionLimit||r.expiration&&r.expiration!=='infinity'
  ||r.marker!==marker||!sameSecret(r.verifier,credential.verifier))fail('DIRECTORY_LOGIN_EXISTING_UNSAFE');
 const members=(await client.query(`SELECT g.rolname AS name,m.admin_option AS admin,m.inherit_option AS inherit,m.set_option AS set
  FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid WHERE m.member=$1::oid`,[r.oid])).rows;
 if(members.length!==1||members[0].name!==role.group||members[0].admin||!members[0].inherit||members[0].set
  ||(await client.query('SELECT 1 FROM pg_auth_members WHERE roleid=$1::oid LIMIT 1',[r.oid])).rowCount
  ||(await client.query('SELECT 1 FROM pg_db_role_setting WHERE setrole=$1::oid LIMIT 1',[r.oid])).rowCount
  ||(await client.query(`SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1::oid
    AND deptype IN('o','a','i','r') LIMIT 1`,[r.oid])).rowCount)fail('DIRECTORY_LOGIN_EXISTING_UNSAFE');
 return true;
}
async function permissionsClosed(client,plan){
 const open=(await client.query(`SELECT EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
  WHERE d.datname=current_database() AND a.grantee=0) OR EXISTS(SELECT 1 FROM pg_namespace n
  CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') AS unsafe`)).rows[0];
 if(open?.unsafe!==false)fail('DIRECTORY_LOGIN_PUBLIC_ACCESS_OPEN');
 for(const role of plan.roles){
  const r=(await client.query('SELECT has_database_privilege($1,current_database(),$2) AS allowed',[role.name,'CONNECT'])).rows[0];
  if(r?.allowed!==true)fail('DIRECTORY_LOGIN_CONNECT_MISSING');
 }
}

async function readiness(client,role){
 // Use the same privilege checks as each runtime before committing. A checksum
 // history does not prove that a NOLOGIN group's grants stayed unchanged.
 await client.query('SET LOCAL ROLE '+role.name);let failed=false;
 try{
  const store={pool:client,config:{clusters:[]}};
  const methods={'control-api':ControlStore,'health-worker':HealthStore,'probe-catalog':ProbeCredentialStore,
   'alert-worker':AlertDeliveryStore,'provisioning-worker':SetupWorkerStore};
  if(role.consumerId==='deployment-executor')await deploymentRuntimeReadiness(client);
  else if(methods[role.consumerId])await methods[role.consumerId].prototype.readiness.call(store);
  else{
   const row=(await client.query(`SELECT has_schema_privilege(current_user,'roomqc_control','CREATE')
    OR has_schema_privilege(current_user,'public','CREATE')
    OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
     AND c.relkind IN('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')))
    OR has_table_privilege(current_user,'roomqc_control.workspaces','SELECT')
    OR has_any_column_privilege(current_user,'roomqc_control.probe_credentials','SELECT,INSERT,UPDATE') AS unsafe`)).rows[0];
   if(row?.unsafe!==false)fail('DIRECTORY_LOGIN_GROUP_UNSAFE');
  }
 }catch{failed=true;fail('DIRECTORY_LOGIN_GROUP_UNSAFE')}
 finally{try{await client.query('RESET ROLE')}catch{if(!failed)fail('DIRECTORY_LOGIN_GROUP_UNSAFE')}}
}

export async function provisionDirectoryRuntimeLogins(pool,plan,bundle,{verifyOnly=false}={}){
 assertPlan(plan);const credentials=validateDirectoryRuntimeCredentials(plan,bundle),client=await pool.connect();
 let committed=false,commitAttempted=false,discard=false;const created=[];
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='5s';SET LOCAL idle_in_transaction_session_timeout='10s'");
  // Share the directory migration lock so provisioning never races a migration.
  await client.query('SELECT pg_advisory_xact_lock(727000)');await target(client,plan);
  for(const group of new Set(plan.roles.map(r=>r.group)))await groupSafe(client,group);
  const missing=[];
  for(const role of plan.roles)if(!await inspectRole(client,plan,role,credentials.get(role.name)))missing.push(role);
  if(verifyOnly&&missing.length)fail('DIRECTORY_LOGIN_MISSING');
  if(!verifyOnly){
   // All existing identities are inspected before any grant/revoke/create.
   await client.query('REVOKE ALL ON DATABASE roomqc_control FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC');
   for(const group of new Set(plan.roles.map(r=>r.group)))await client.query('GRANT CONNECT ON DATABASE roomqc_control TO '+group);
   for(const role of missing){
    const verifier=credentials.get(role.name).verifier;
    // Names are generated, and the verifier alphabet excludes SQL quotes.
    // Only a SCRAM verifier, never a cleartext password, enters the SQL stream.
    await client.query('CREATE ROLE '+role.name+' LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT '+role.connectionLimit+" PASSWORD '"+verifier+"'");
    for(const option of ['INHERIT TRUE','SET FALSE','ADMIN FALSE'])await client.query('GRANT '+role.group+' TO '+role.name+' WITH '+option);
    await client.query('COMMENT ON ROLE '+role.name+" IS 'roomqc-directory-runtime/v1:"+plan.planSha256+"'");created.push(role.name);
   }
  }
  for(const role of plan.roles)if(!await inspectRole(client,plan,role,credentials.get(role.name)))fail('DIRECTORY_LOGIN_MISSING');
  await permissionsClosed(client,plan);
  for(const role of plan.roles)await readiness(client,role);
  commitAttempted=true;await client.query('COMMIT');committed=true;
  return {verified:true,operation:verifyOnly?'verify-directory-runtime-logins':'provision-directory-runtime-logins',planSha256:plan.planSha256,
   roles:plan.roles.map(({consumerId,ordinal,name,group,connectionLimit})=>({consumerId,ordinal,name,group,connectionLimit,created:created.includes(name)})),
   created:created.length,existing:plan.roles.length-created.length,credentialsRotated:false,otherConsumers:plan.otherConsumers,
   deploymentReady:false,signupOpened:false};
 }catch(error){
  if(!committed)await client.query('ROLLBACK').catch(()=>{discard=true});
  const safe=Object.assign(new Error('DIRECTORY_LOGIN_PROVISIONING_FAILED'),{code:/^DIRECTORY_LOGIN_[A-Z_]+$/.test(error.code??'')?error.code:'DIRECTORY_LOGIN_PROVISIONING_FAILED'});
  if(commitAttempted)safe.commitMayHaveSucceeded=true;throw safe;
 }finally{client.release(discard)}
}
