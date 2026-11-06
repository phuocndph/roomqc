// Deployment-side cutover only. Never give this administrative connection to
// the API. Retiring a dedicated LOGIN is irreversible through this interface;
// rollback must use a compatible build and a different, reviewed login.
import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const name=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,62}$/.test(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const group='roomqc_control_api';
const expectedKeys='databaseName,databaseOid,systemIdentifier';
function validate(expected,login){
 if(!expected||Object.keys(expected).sort().join(',')!==expectedKeys||!name(login)||login===group||login.startsWith('pg_')
  ||typeof expected.databaseName!=='string'||!expected.databaseName||expected.databaseName.length>63
  ||!(/^[1-9][0-9]{0,9}$/).test(expected.databaseOid??'')||!(/^[1-9][0-9]{0,19}$/).test(expected.systemIdentifier??''))
  fail('CONTROL_LOGIN_RETIREMENT_INPUT_INVALID');
}
async function inspect(client,{expected,login}){
 validate(expected,login);
 const identity=(await client.query(`SELECT current_database() AS "databaseName",d.oid::text AS "databaseOid",
  (pg_control_system()).system_identifier::text AS "systemIdentifier",current_user AS administrator,
  to_regclass('roomqc_control.schema_migrations') IS NOT NULL AS directory,
  to_regnamespace('auth') IS NOT NULL OR to_regnamespace('supabase_migrations') IS NOT NULL
   OR to_regclass('public.tenants') IS NOT NULL AS "tenantBackend"
  FROM pg_database d WHERE datname=current_database()`)).rows[0];
 if(!identity||!identity.directory||identity.tenantBackend||Object.keys(expected).some(k=>identity[k]!==expected[k]))fail('CONTROL_LOGIN_RETIREMENT_DATABASE_MISMATCH');
 if(identity.administrator===login)fail('CONTROL_LOGIN_RETIREMENT_SELF_DENIED');
 const role=(await client.query(`SELECT oid::text AS oid,rolname AS name,rolcanlogin AS "canLogin",
  rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls AS privileged
  FROM pg_roles WHERE rolname=$1`,[login])).rows[0];
 if(!role||role.privileged)fail('CONTROL_LOGIN_RETIREMENT_ROLE_UNSAFE');
 const memberships=(await client.query(`SELECT p.rolname AS name,m.admin_option AS admin FROM pg_auth_members m
  JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=$1::oid ORDER BY p.rolname`,[role.oid])).rows;
 if(memberships.some(r=>r.name!==group||r.admin)||memberships.length>1
  ||(role.canLogin&&memberships.length!==1))fail('CONTROL_LOGIN_RETIREMENT_ROLE_SHARED');
 if((await client.query('SELECT 1 FROM pg_auth_members WHERE roleid=$1::oid LIMIT 1',[role.oid])).rowCount)
  fail('CONTROL_LOGIN_RETIREMENT_ROLE_SHARED');
 // Dedicated logins must have membership only: direct ACLs, ownership or
 // default ACL dependencies need a reviewed/manual plan, never REASSIGN/DROP.
 if((await client.query(`SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=$1::oid
  AND deptype IN('o','a','i','r') LIMIT 1`,[role.oid])).rowCount)fail('CONTROL_LOGIN_RETIREMENT_DIRECT_DEPENDENCY');
 if((await client.query('SELECT 1 FROM pg_prepared_xacts WHERE owner=$1 LIMIT 1',[login])).rowCount)
  fail('CONTROL_LOGIN_RETIREMENT_PREPARED_TRANSACTION');
 const sessions=(await client.query(`SELECT pid,datid::text AS "databaseOid",backend_start::text AS "backendStart"
  FROM pg_stat_activity WHERE usesysid=$1::oid AND backend_type='client backend' ORDER BY pid`,[role.oid])).rows;
 if(sessions.some(s=>s.databaseOid!==expected.databaseOid))fail('CONTROL_LOGIN_RETIREMENT_OTHER_DATABASE_SESSION');
 const binding={version:1,database:{databaseName:expected.databaseName,databaseOid:expected.databaseOid,systemIdentifier:expected.systemIdentifier},
  role:{oid:role.oid,name:role.name,canLogin:role.canLogin,memberOf:memberships.map(m=>m.name)}};
 return {binding,planSha256:hash(binding),activeSessions:sessions.length};
}
export async function inspectControlLoginRetirement(pool,options){
 const client=await pool.connect();try{return await inspect(client,options)}finally{client.release()}
}
export async function retireControlApiLogin(pool,{expected,login,expectedPlanSha256}){
 validate(expected,login);if(!(/^[a-f0-9]{64}$/).test(expectedPlanSha256??''))fail('CONTROL_LOGIN_RETIREMENT_PLAN_REQUIRED');
 const client=await pool.connect();let committed=false,commitAttempted=false,terminated=0;
 const broken=()=>{};client.on('error',broken);
 try{
  await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='5s'");
  const plan=await inspect(client,{expected,login});
  if(plan.planSha256!==expectedPlanSha256)fail('CONTROL_LOGIN_RETIREMENT_PLAN_CHANGED');
  await client.query('ALTER ROLE '+login+' NOLOGIN');
  if(plan.binding.role.memberOf.includes(group))await client.query('REVOKE '+group+' FROM '+login);
  commitAttempted=true;await client.query('COMMIT');committed=true;
  // NOLOGIN and membership removal are durable before disconnecting sessions.
  // Select sessions of this exact login OID and database in one statement.
  // PostgreSQL termination takes a PID; deployment must keep the login retired
  // and verify the final zero-session state before admitting new traffic.
  const stop=await client.query(`SELECT pg_terminate_backend(a.pid) AS terminated FROM pg_stat_activity a
   WHERE a.usesysid=$1::oid AND a.datid=$2::oid AND a.backend_type='client backend' AND a.pid<>pg_backend_pid()
    AND EXISTS(SELECT 1 FROM pg_stat_activity b WHERE b.pid=a.pid AND b.usesysid=a.usesysid
     AND b.datid=a.datid AND b.backend_start=a.backend_start)`,[plan.binding.role.oid,expected.databaseOid]);
  terminated=stop.rows.filter(r=>r.terminated).length;
  const deadline=Date.now()+5000;let remaining;
  do{
   remaining=Number((await client.query('SELECT count(*)::integer AS n FROM pg_stat_activity WHERE usesysid=$1::oid',[plan.binding.role.oid])).rows[0].n);
   if(remaining===0)break;
   await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<deadline);
  const after=await inspect(client,{expected,login});
  if(remaining||after.binding.role.canLogin||after.binding.role.memberOf.length||
   (await client.query('SELECT pg_has_role($1,$2,$3) AS member',[login,group,'MEMBER'])).rows[0].member)
   fail('CONTROL_LOGIN_RETIREMENT_INCOMPLETE');
  return {verified:true,operation:'retire-dedicated-control-api-login',before:plan.binding,after:after.binding,
   expectedPlanSha256,afterPlanSha256:after.planSha256,terminatedSessions:terminated,remainingSessions:0,
   loginDisabled:true,apiMembershipRemoved:true,credentialsReenabled:false};
 }catch(error){
  if(!committed)await client.query('ROLLBACK').catch(()=>{});
  if(committed)error.retirementCommitted=true;
  else if(commitAttempted)error.retirementMayHaveCommitted=true;
  throw error;
 }finally{client.release();client.removeListener('error',broken)}
}
