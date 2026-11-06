// Runtime checks only. Never imports the administrative LOGIN provisioner.
import {boundedHealthFile,healthDatabaseUrl} from './workers/health-config.mjs';
import {resourceMode,loadRuntimeResourceContext,assertDeploymentResources,runtimeResourceView} from './resource-runtime.mjs';
import {directoryRuntimePlan} from './directory-runtime-plan.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const integer=(value,fallback)=>{
  if(value===undefined)return fallback;
  if(!/^[1-9][0-9]{0,2}$/.test(value)||Number(value)>128)fail('DEPLOYMENT_REPLICA_INVALID');return Number(value);
};
export async function deploymentRuntimeConfiguration(env=process.env){
  if(!env.ROOMQC_DEPLOY_DATABASE_URL_FILE||env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')
    fail('DEPLOYMENT_DATABASE_FILE_REQUIRED');
  const mode=resourceMode(env),resourceContext=loadRuntimeResourceContext(env,{kind:'directory'});
  const executorInstances=integer(env.ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES,1),ordinal=integer(env.ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL,1);
  if(ordinal>executorInstances)fail('DEPLOYMENT_REPLICA_INVALID');
  const config={production:mode.production,resourceContext,executorInstances,ordinal,poolMax:1};
  assertDeploymentResources(config);
  let databaseUrl;
  try{
    databaseUrl=(await boundedHealthFile(env.ROOMQC_DEPLOY_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    healthDatabaseUrl(databaseUrl,{production:mode.production,allowLocal:env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true'});
  }catch{fail('DEPLOYMENT_DATABASE_FILE_INVALID')}
  let loginPlan=null,login=null;
  if(resourceContext){
    if(!env.ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE)fail('DEPLOYMENT_LOGIN_PLAN_REQUIRED');
    try{
      const raw=JSON.parse(await boundedHealthFile(env.ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE,131072));
      loginPlan=directoryRuntimePlan({version:raw.version,environment:raw.environment,deploymentId:raw.deploymentId,
        expected:raw.expected,budgetSha256:raw.budgetSha256},{budget:resourceContext.budget,sha256:resourceContext.budgetSha256});
      if(JSON.stringify(raw)!==JSON.stringify(loginPlan))fail('DEPLOYMENT_LOGIN_PLAN_INVALID');
      const members=loginPlan.roles.filter(r=>r.consumerId==='deployment-executor');
      login=members.find(r=>r.ordinal===ordinal);
      if(members.length!==executorInstances||!login||login.connectionLimit!==1||new URL(databaseUrl).username!==login.name)
        fail('DEPLOYMENT_LOGIN_PLAN_INVALID');
    }catch{fail('DEPLOYMENT_LOGIN_PLAN_INVALID')}
  }else if(env.ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE)fail('DEPLOYMENT_LOGIN_PLAN_INVALID');
  return {...config,databaseUrl,loginPlan,login,resources:runtimeResourceView(config,'deployment-executor')};
}

const readable=new Set(['clusters','hosts','cluster_policies','schema_migrations','release_authority','release_approvals',
  'release_key_revocations','backup_runs','deployment_runs','deployment_resolutions','deployment_specs','deployment_jobs','deployment_gate_checks']);
const insertAll=new Set(['deployment_runs','deployment_resolutions','deployment_specs']);
const insertColumns={deployment_gate_checks:['id','run_id','phase_index','evidence']};
const updateColumns={deployment_runs:['state','phase_index','error_code','finished_at'],
  deployment_jobs:['run_id','state','lease_token','lease_until','error_code','finished_at']};
export async function deploymentRuntimeReadiness(pool,config={}){
  let identity;
  try{
    identity=(await pool.query(`SELECT current_user AS login,current_database() AS database_name,d.oid::text AS database_oid,
      current_setting('max_connections')::integer AS max_connections,r.rolconnlimit AS connection_limit,
      r.rolcanlogin AND r.rolinherit AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) AS bounded,
      shobj_description(r.oid,'pg_authid') AS marker,
      EXISTS(SELECT 1 FROM pg_stat_ssl WHERE pid=pg_backend_pid() AND ssl) AS tls,
      EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN('roomqc_control','public','auth','storage') AND has_schema_privilege(current_user,n.oid,'CREATE'))
        OR EXISTS(SELECT 1 FROM pg_db_role_setting WHERE setrole=r.oid)
        OR EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype IN('o','a','i','r')) AS unsafe,
      (SELECT jsonb_agg(jsonb_build_object('name',g.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option,
        'safe',NOT(g.rolcanlogin OR g.rolsuper OR g.rolcreatedb OR g.rolcreaterole OR g.rolreplication OR g.rolbypassrls)
          AND NOT EXISTS(SELECT 1 FROM pg_auth_members x WHERE x.member=g.oid)))
        FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid WHERE m.member=r.oid) AS memberships
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0];
    const member=identity?.memberships?.[0];
    if(!identity?.bounded||identity.unsafe||identity.connection_limit!==1||identity.memberships?.length!==1
      ||member.name!=='roomqc_control_deployer'||!member.safe||member.admin||!member.inherit||member.set)fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
    if(config.production&&!identity.tls)fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
    if(config.loginPlan&&(identity.login!==config.login.name||identity.marker!=='roomqc-directory-runtime/v1:'+config.loginPlan.planSha256
      ||identity.database_name!==config.loginPlan.expected.databaseName||identity.database_oid!==config.loginPlan.expected.databaseOid
      ||identity.max_connections!==config.resourceContext.budget.databases.find(d=>d.id===config.resourceContext.databaseId).maxConnections))
      fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
    const rows=(await pool.query(`SELECT n.nspname AS namespace,c.relname AS name,has_table_privilege(current_user,c.oid,'SELECT') AS read,
      has_table_privilege(current_user,c.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'REFERENCES') AS unsafe,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'read',has_column_privilege(current_user,c.oid,a.attnum,'SELECT'),
        'add',has_column_privilege(current_user,c.oid,a.attnum,'INSERT'),'change',has_column_privilege(current_user,c.oid,a.attnum,'UPDATE')))
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('roomqc_control','public','auth','storage')
        AND c.relkind IN('r','p','v','m','f')`)).rows;
    for(const row of rows){
      const owned=row.namespace==='roomqc_control',read=owned&&readable.has(row.name);
      if(row.unsafe||row.read!==read)fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
      for(const column of row.columns??[]){
        const add=owned&&(insertAll.has(row.name)||insertColumns[row.name]?.includes(column.name)||false);
        const change=owned&&(updateColumns[row.name]?.includes(column.name)||false);
        if(column.read!==read||column.add!==add||column.change!==change)fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
      }
    }
    if([...readable].some(name=>!rows.some(row=>row.namespace==='roomqc_control'&&row.name===name)))fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
    const extra=(await pool.query(`SELECT
      EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname IN('roomqc_control','public','auth','storage') AND c.relkind='S'
        AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname IN('roomqc_control','public','auth','storage')
        AND p.oid<>'roomqc_control.deployment_readiness(uuid)'::regprocedure
        AND has_function_privilege(current_user,p.oid,'EXECUTE'))
      OR NOT has_function_privilege(current_user,'roomqc_control.deployment_readiness(uuid)','EXECUTE') AS unsafe`)).rows[0];
    if(extra?.unsafe!==false)fail('DEPLOYMENT_RUNTIME_PRIVILEGES');
  }catch{fail('DEPLOYMENT_RUNTIME_PRIVILEGES')}
  const manifest=await migrationManifest();
  try{if(await verifyHistory(pool,manifest)!==manifest.length)fail('DEPLOYMENT_SCHEMA_PENDING')}catch{fail('DEPLOYMENT_SCHEMA_PENDING')}
  return {schemaVersion:manifest.at(-1).version,poolMax:1,connectionLimit:1,ordinal:config.ordinal??null};
}
