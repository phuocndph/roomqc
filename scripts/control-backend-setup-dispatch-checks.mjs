// Live Auth/PostgREST/Postgres T12 dispatch fence controls. Owned internal sandbox only.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {SetupRecoveryGateway,recoveryBinding} from '/control/setup-recovery.mjs';
import {runSetupWorkerNativeChecks} from '/control/testing/setup-worker-native.mjs';
import {runSetupApiNativeChecks} from '/control/testing/setup-api-native.mjs';
import {runSetupCliNativeChecks} from '/control/testing/setup-cli-native.mjs';
import {runSetupCredentialNativeChecks} from '/control/testing/setup-credential-native.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_SETUP_DISPATCH_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.serviceKey&&input.publishableKey&&input.databasePassword);
assert.ok(input.jwtSecret);
const recoveryCluster={id:'cluster-a',url:'http://127.0.0.1:8082',internalUrl:'http://127.0.0.1:8000',
 inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1']};
const recoveryExpected={clusterId:'cluster-a',releaseId:'owned-recovery-fixture',artifactDigest:'a'.repeat(64),
 frontendArtifactDigest:'b'.repeat(64),migrationSetHash:'c'.repeat(64),schemaManifestHash:'d'.repeat(64)};
const recoveryContext=recoveryBinding(recoveryCluster,recoveryExpected),credentialId=randomUUID();
const roleToken=(exp,patch={})=>{const body=[{alg:'HS256',typ:'JWT'},{role:'roomqc_setup_recovery',aud:'authenticated',exp,
 iss:'roomqc-setup-recovery/v1',jti:credentialId,cluster_id:recoveryCluster.id,binding_sha256:recoveryContext.bindingHash,
 iat:Math.floor(Date.now()/1000)-1,...patch}]
  .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return body+'.'+createHmac('sha256',input.jwtSecret).update(body).digest('base64url')};
const recoveryToken=roleToken(Math.floor(Date.now()/1000)+3500);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:6,
  statement_timeout:25000,connectionTimeoutMillis:5000});
const checks=[],barriers=[];let phase='prepare',recoveryFunctionSurface=null;
const record=(label,condition=true)=>{assert.ok(condition,'SETUP_DISPATCH_CONTROL_FAILED: '+label);checks.push({label,passed:true})};
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'setup_dispatch_check_failed',phase,completed:checks.map(c=>c.label)})+'\n'));
async function call(path,token,body,extraHeaders={}){
 const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
  headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',...extraHeaders},body:JSON.stringify(body)});
 let data;try{data=await r.json()}catch{data=null}return {status:r.status,data};
}
const rpc=(name,args,token=input.serviceKey)=>call('/rest/v1/rpc/'+name,token,args);
const recoveryRpc=(name,args,token=recoveryToken)=>call('/rest/v1/rpc/'+name,token,args,{'Content-Profile':'roomqc_setup'});
const recoveryGateway=new SetupRecoveryGateway({allowLocal:true,inventory:new Map([['cluster-a',recoveryCluster]])},recoveryCluster,
 {expected:recoveryExpected,loadCredential:async()=>({publishableKey:input.publishableKey,token:recoveryToken})});
async function account(label){
 const email='dispatch-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
 const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 return {id:created.data.id,email,token:login.data.access_token,session:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};
}
function metadata(a,patch={}){
 const text=JSON.stringify({fullName:'Owned dispatch fixture',phone:'0901234567',tenantName:'Owned dispatch fixture',
  hotelName:'Owned dispatch fixture',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:3,workspaceSlug:'dispatch-owned'});
 return {p_workspace_id:randomUUID(),p_dispatch_id:randomUUID(),p_owner_id:a.id,p_routing_version:1,
  p_payload_sha256:createHash('sha256').update(text).digest('hex'),p_fields_json:text,p_session_id:a.session,...patch};
}
const closeArgs=p=>Object.fromEntries(['p_workspace_id','p_dispatch_id','p_owner_id','p_routing_version','p_payload_sha256'].map(k=>[k,p[k]]));
const provision=p=>rpc('provision_workspace_setup_dispatch',p);
const close=p=>recoveryRpc('close_dispatch',closeArgs(p));
async function snapshot(){
 const out={};
 for(const table of ['public.tenants','public.hotels','public.users','public.user_roles','public.user_hotels','public.room_types',
  'public.item_categories','public.laundry_categories','public.maintenance_categories','public.email_deliveries','private.workspace_provisioning']){
  out[table]=(await db.query('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS value FROM '+table+' t')).rows[0].value;
 }
 return out;
}
async function unchanged(before,label){assert.deepEqual(await snapshot(),before);record(label)}
// Effective privileges include PUBLIC even for NOINHERIT roles. This inventory
// proves what is reachable, not that every reachable function is safe. Definitions
// stay in the database; signatures/hashes/ACL origins can be reviewed without rows
// or owner credentials. Include catalog/extension schemas rather than assuming
// that only public/private are relevant to a SECURITY DEFINER call chain.
async function recoveryFunctionInventory(){
 const role='roomqc_setup_recovery';
 const schemas=(await db.query(`SELECT n.nspname AS schema,
   has_schema_privilege($1,n.oid,'USAGE') AS usage,has_schema_privilege($1,n.oid,'CREATE') AS can_create
   FROM pg_namespace n WHERE n.nspname !~ '^pg_(temp|toast)' ORDER BY n.nspname`,[role])).rows;
 const functions=(await db.query(`SELECT n.nspname AS schema,p.proname AS name,
   pg_get_function_identity_arguments(p.oid) AS arguments,p.prokind AS kind,p.prorettype::regtype::text AS returns,
   pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,l.lanname AS language,
   p.provolatile AS volatility,
   (SELECT option FROM unnest(p.proconfig) option WHERE option LIKE 'search_path=%') AS search_path,
   EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
   EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.privilege_type='EXECUTE') AS direct_execute,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE p.prokind IN ('f','p') AND n.nspname !~ '^pg_(temp|toast)'
     AND has_schema_privilege($1,n.oid,'USAGE') AND has_function_privilege($1,p.oid,'EXECUTE')
   ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`,[role])).rows;
 const memberships=(await db.query(`SELECT r.rolname AS role,m.admin_option
   FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
   WHERE member.rolname=$1 ORDER BY r.rolname`,[role])).rows;
 const attributes=(await db.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls
   FROM pg_roles WHERE rolname=$1`,[role])).rows[0];
 const effectiveRelationGrants=(await db.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
   has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS table_grant,
   has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS column_grant
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f')
     AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(temp|toast)'
     AND has_schema_privilege($1,n.oid,'USAGE') AND (
       has_table_privilege($1,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege($1,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
   ORDER BY n.nspname,c.relname`,[role])).rows;
 const effectiveSequenceGrants=(await db.query(`SELECT n.nspname AS schema,c.relname AS name
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S'
     AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_(temp|toast)'
     AND has_schema_privilege($1,n.oid,'USAGE')
     AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') ELSE false END
   ORDER BY n.nspname,c.relname`,[role])).rows;
 const extensions=(await db.query(`SELECT extname AS name,extversion AS version FROM pg_extension ORDER BY extname`)).rows;
 const defaultPrivileges=(await db.query(`SELECT pg_get_userbyid(d.defaclrole) AS creator,
   COALESCE(n.nspname,'global') AS schema,d.defaclobjtype AS object_type,
   CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
   a.privilege_type,a.is_grantable FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
   CROSS JOIN LATERAL aclexplode(d.defaclacl) a WHERE d.defaclobjtype='f'
   ORDER BY creator,schema,grantee,a.privilege_type`)).rows;
 const bySchema=schemas.map(s=>({...s,callable:functions.filter(f=>f.schema===s.schema).length,
   securityDefiner:functions.filter(f=>f.schema===s.schema&&f.security_definer).length}));
 return {version:1,role,attributes,memberships,schemas:bySchema,defaultPrivileges,effectiveRelationGrants,effectiveSequenceGrants,extensions,
   effectiveCallableCount:functions.length,securityDefinerCount:functions.filter(f=>f.security_definer).length,
   publicExecuteCount:functions.filter(f=>f.public_execute).length,
   applicationCallableCount:functions.filter(f=>!['pg_catalog','information_schema'].includes(f.schema)).length,
   functions,sha256:createHash('sha256').update(JSON.stringify({schemas:bySchema,functions,memberships,attributes,defaultPrivileges,
     effectiveRelationGrants,effectiveSequenceGrants,extensions})).digest('hex'),
   reviewedSafe:false,limitations:['Catalog inventory covers ordinary functions and procedures; aggregates/window functions and dynamic call paths need separate disposition.',
     'Catalog inventory is not a transitive body/dynamic-SQL audit or an HTTP allowlist proof.']};
}
const rowCount=async id=>Number((await db.query('SELECT count(*) FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[id])).rows[0].count);
async function recoveryHeld(p,token,inside){
 const holder=await db.connect();let pending;
 try{
  await holder.query('BEGIN');await holder.query('LOCK TABLE private.workspace_setup_dispatches IN SHARE MODE');
  const pid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  pending=recoveryRpc('close_dispatch',closeArgs(p),token);
  let waiting;const end=Date.now()+10000;
  while(Date.now()<end){waiting=(await db.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%close_dispatch%' AND wait_event_type='Lock'",[pid])).rows[0];
   if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20))}
  assert.ok(waiting,'Scoped close must reach the actual journal lock');
  await inside({pending,waiting:Number(waiting.pid),release:()=>holder.query('COMMIT')});
 }finally{await holder.query('ROLLBACK');holder.release();if(pending)await pending.catch(()=>{})}
}
async function untilBlocked(holderPid){
 const end=Date.now()+10000;
 while(Date.now()<end){
  const rows=(await db.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE '%provision_workspace_setup_dispatch%' AND wait_event_type='Lock'",[holderPid])).rows;
  if(rows.length===1)return Number(rows[0].pid);
  await new Promise(r=>setTimeout(r,20));
 }
 throw new Error('DISPATCH_RPC_DID_NOT_REACH_EXPECTED_LOCK');
}
async function held(label,kind,p,inside){
 const holder=await db.connect();let pending,pid;
 try{
  await holder.query('BEGIN');pid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
  if(kind==='actor')await holder.query('SELECT 1 FROM auth.users WHERE id=$1 FOR UPDATE',[p.p_owner_id]);
  else await holder.query('LOCK TABLE public.hotels IN SHARE MODE');
  pending=provision(p);const waiting=await untilBlocked(pid);barriers.push({label,observed:true,kind});
  const release=async()=>{await holder.query('COMMIT')};
  await inside({pending,waiting,release});
 }finally{await holder.query('ROLLBACK');holder.release();if(pending)await pending.catch(()=>{})}
}
try{
 phase='permissions';
 await db.query('INSERT INTO private.setup_recovery_authority(singleton,cluster_id,binding_sha256) VALUES(true,$1,$2)',
  [recoveryCluster.id,recoveryContext.bindingHash]);
 await db.query("INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at) VALUES($1,$2,$3,clock_timestamp()-interval '1 second',clock_timestamp()+interval '3590 seconds')",
  [credentialId,recoveryCluster.id,recoveryContext.bindingHash]);
 if(input.workerOnly===true){
  phase='native-worker-directory-and-remote';
  const nativeWorker=await runSetupWorkerNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record});
  console.log(JSON.stringify({verified:true,scope:'setup-worker-only',actualAuth:true,actualRest:true,actualPostgres:true,
    nativeWorker,checks,barriers,fullDispatchMatrixVerified:false}));
 }else if(input.supportAuthorityOnly===true){
  phase='native-support-authority-directory-and-remote';
  const nativeSupportAuthority=await runSetupApiNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record});
  console.log(JSON.stringify({verified:true,scope:'support-authority-only',actualAuth:true,actualRest:true,actualPostgres:true,
    nativeSupportAuthority,checks,barriers,fullDispatchMatrixVerified:false}));
 }else{
 const a=await account('owner'),p=metadata(a);
 const beforeCredentialDenials=await snapshot();
 for(const token of [input.publishableKey,a.token,input.serviceKey]){
  const denied=await recoveryRpc('close_dispatch',closeArgs(p),token);
  record('scoped-rpc-denies-non-recovery-role-'+(token===a.token?'owner':token===input.serviceKey?'service':'anonymous'),
   [401,403].includes(denied.status)&&denied.data?.code==='42501');
 }
 for(const [name,patch]of [['unknown',{jti:randomUUID()}],['missing',{jti:null}],['issuer',{iss:'wrong'}],
  ['cluster',{cluster_id:'cluster-b'}],['binding',{binding_sha256:'0'.repeat(64)}],['oversized-lifetime',{exp:Math.floor(Date.now()/1000)+7200}]]){
  const denied=await recoveryRpc('close_dispatch',closeArgs(p),roleToken(Math.floor(Date.now()/1000)+3500,patch));
  record('scoped-credential-denies-'+name,[401,403].includes(denied.status));
 }
 const revokedId=randomUUID(),rotatedId=randomUUID();
 for(const id of [revokedId,rotatedId])await db.query("INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at) VALUES($1,$2,$3,clock_timestamp()-interval '1 second',clock_timestamp()+interval '3590 seconds')",
  [id,recoveryCluster.id,recoveryContext.bindingHash]);
 const revokedToken=roleToken(Math.floor(Date.now()/1000)+3500,{jti:revokedId});
 record('rotating-credential-overlap-can-read',
  (await recoveryRpc('receipt',{p_workspace_id:p.p_workspace_id},revokedToken)).status===200
  &&(await recoveryRpc('receipt',{p_workspace_id:p.p_workspace_id},roleToken(Math.floor(Date.now()/1000)+3500,{jti:rotatedId}))).status===200);
 await db.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[revokedId]);
 record('revoked-but-unexpired-jwt-cannot-close-or-read',
  (await recoveryRpc('close_dispatch',closeArgs(p),revokedToken)).status===403
  &&(await recoveryRpc('receipt',{p_workspace_id:p.p_workspace_id},revokedToken)).status===403);
 record('rotation-does-not-revoke-other-valid-credential',(await recoveryRpc('receipt',{p_workspace_id:p.p_workspace_id})).status===200);
 await unchanged(beforeCredentialDenials,'scoped-denials-and-rotation-preserve-business');
 record('denied-credentials-cannot-create-close-journal',await rowCount(p.p_dispatch_id)===0);
 for(const token of [input.publishableKey,a.token]){
  for(const [name,args] of [['provision_workspace_setup_dispatch',p],['close_workspace_setup_dispatch',closeArgs(p)]]){
   const r=await rpc(name,args,token);record('browser-denied-'+name+'-'+(token===a.token?'authenticated':'anonymous'),[401,403].includes(r.status)&&r.data?.code==='42501');
  }
 }
 const security=(await db.query("SELECT relrowsecurity,has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_grant,has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS browser_grant,has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS service_grant,has_table_privilege('roomqc_setup_recovery',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS recovery_grant FROM pg_class c WHERE c.oid='private.workspace_setup_dispatches'::regclass")).rows[0];
 record('dispatch-journal-private-rls-no-direct-grants',security.relrowsecurity&&!security.anon_grant&&!security.browser_grant&&!security.service_grant&&!security.recovery_grant);
 const surface=(await db.query("SELECT count(*)::int AS relations,count(*) FILTER(WHERE has_table_privilege('roomqc_setup_recovery',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))::int AS table_grants,count(*) FILTER(WHERE has_any_column_privilege('roomqc_setup_recovery',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))::int AS column_grants FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private','auth','storage') AND c.relkind IN ('r','p','v','m')")).rows[0];
 record('recovery-role-no-direct-business-auth-storage-table-or-column-grants',surface.relations>100&&surface.table_grants===0&&surface.column_grants===0);
 const mutators=['public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer)',
  'public.complete_registration_impl(uuid,text,text,text,text,text,text,text,text,integer)',
  'public.provision_workspace_registration_impl(uuid,uuid,jsonb)'];
 const forbidden=(await db.query("SELECT count(*)::int AS granted FROM unnest($1::text[]) f WHERE has_function_privilege('roomqc_setup_recovery',f,'EXECUTE')",[mutators])).rows[0];
 record('recovery-role-cannot-use-internal-registration-implementations',forbidden.granted===0);
 recoveryFunctionSurface=await recoveryFunctionInventory();
 record('effective-recovery-function-privileges-including-public-captured',recoveryFunctionSurface.effectiveCallableCount>=2
   &&recoveryFunctionSurface.functions.some(f=>f.schema==='roomqc_setup'&&f.name==='close_dispatch')
   &&recoveryFunctionSurface.functions.some(f=>f.schema==='roomqc_setup'&&f.name==='receipt'));
 record('recovery-public-schema-is-inaccessible-and-only-two-app-rpcs-callable',
  recoveryFunctionSurface.schemas.some(s=>s.schema==='public'&&!s.usage&&!s.can_create)
  &&recoveryFunctionSurface.applicationCallableCount===2&&recoveryFunctionSurface.securityDefinerCount===2);
 record('recovery-no-effective-table-column-or-sequence-grants-across-all-application-schemas',
   recoveryFunctionSurface.effectiveRelationGrants.length===0&&recoveryFunctionSurface.effectiveSequenceGrants.length===0);
 record('recovery-cannot-use-create-or-call-net',
   recoveryFunctionSurface.schemas.some(s=>s.schema==='net'&&!s.usage&&!s.can_create)
   &&!recoveryFunctionSurface.functions.some(f=>f.schema==='net'));
 const netQueueCount=async()=>Number((await db.query('SELECT count(*) FROM net.http_request_queue')).rows[0].count);
 const queueBefore=await netQueueCount();
 for(const role of ['anon','authenticated','service_role']){
   const connection=await db.connect();
   try{
     await connection.query('BEGIN');
     await connection.query('SET LOCAL ROLE '+role);
     const queued=await connection.query("SELECT net.http_get('http://127.0.0.1:9/owned-uncommitted-runtime') AS id");
     record('existing-role-net-http-get-preserved-'+role,Number(queued.rows[0].id)>0);
   }finally{await connection.query('ROLLBACK');connection.release()}
 }
 record('existing-role-probes-enqueue-no-committed-http-requests',await netQueueCount()===queueBefore);
 const negativeConnection=await db.connect();let netDenial;
 try{
   await negativeConnection.query('BEGIN');await negativeConnection.query('SET LOCAL ROLE roomqc_setup_recovery');
   try{await negativeConnection.query("SELECT net.http_get('http://127.0.0.1:9/owned-denied')")}
   catch(error){netDenial=error.code}
 }finally{await negativeConnection.query('ROLLBACK');negativeConnection.release()}
 record('recovery-native-net-http-get-denied',netDenial==='42501');
 const beforePublicCalls=await snapshot();
 for(const [name,args] of [
   ['apply_promo_code',{p_tenant_id:randomUUID(),p_promo_code:'owned-no-promo',p_original_amount:100}],
   ['get_qc_daily_trend',{_tenant_id:randomUUID(),_hotel_id:null,_days:1}],
   ['get_qc_floor_stats',{_tenant_id:randomUUID(),_hotel_id:null,_days:1}],
   ['get_qc_staff_stats',{_tenant_id:randomUUID(),_hotel_id:null,_days:1}],
   ['generate_unique_code',{prefix:'OWNED',table_name:'tenants',column_name:'name'}],
   ['schedule_renewal_reminders',{}],['user_has_subordinates',{p_user_id:randomUUID()}],
 ]){
   const denied=await rpc(name,args,recoveryToken);
   record('recovery-public-invoker-business-path-denied-'+name,[401,403].includes(denied.status)&&denied.data?.code==='42501');
 }
 await unchanged(beforePublicCalls,'public-invoker-denials-preserve-business-trial-and-email');
 const profile=await call('/rest/v1/rpc/http_get',recoveryToken,{url:'http://127.0.0.1:9/owned-denial'},{'Content-Profile':'net'});
 record('worker-cannot-select-unexposed-net-rpc-schema',profile.status===406&&profile.data?.code==='PGRST106');
 let denied=await rpc('provision_workspace_setup_dispatch',p,recoveryToken);
 record('recovery-role-cannot-provision',denied.status===403&&denied.data?.code==='42501');
 denied=await rpc('provision_workspace_registration',{p_workspace_id:p.p_workspace_id,p_owner_id:a.id,p_fields:JSON.parse(p.p_fields_json)},recoveryToken);
 record('recovery-role-cannot-use-legacy-provision',denied.status===403&&denied.data?.code==='42501');
 denied=await recoveryRpc('close_dispatch',closeArgs(p),roleToken(1));
 record('expired-recovery-token-denied',denied.status===401);
 phase='commit-replay';
 const actor=await rpc('registration_actor',{},a.token);assert.equal(actor.status,200);assert.equal(actor.data.id,a.id);assert.equal(actor.data.session_id,a.session);
 let r=await provision(p);assert.equal(r.status,200);assert.equal(r.data.state,'committed');assert.equal(r.data.success,true);
 const binding=r.data;record('actual-owner-and-business-commit');
 assert.equal(await rowCount(p.p_dispatch_id),1);
 const beforeReplay=await snapshot(),journalBefore=(await db.query('SELECT * FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[p.p_dispatch_id])).rows;
 const replay=await Promise.all(Array.from({length:20},()=>provision(p)));
 record('twenty-replays-one-tenant-hotel',replay.every(r=>r.status===200&&r.data.success&&r.data.idempotent&&r.data.tenant_id===binding.tenant_id&&r.data.hotel_id===binding.hotel_id));
 await unchanged(beforeReplay,'replays-preserve-business-trial-and-email');
 r=await close(p);record('worker-recovers-committed-without-owner-token',r.status===200&&r.data.state==='committed'&&r.data.tenant_id===binding.tenant_id);
 const workerRead=await recoveryRpc('receipt',{p_workspace_id:p.p_workspace_id});
 record('recovery-role-can-read-only-immutable-binding',workerRead.status===200&&workerRead.data.tenant_id===binding.tenant_id);
 const adapterWorkspace={id:p.p_workspace_id,owner_id:a.id,cluster_id:recoveryCluster.id,api_url:recoveryCluster.url,routing_version:1};
 const adapterDispatch={id:p.p_dispatch_id,workspace_id:p.p_workspace_id,owner_id:a.id,cluster_id:recoveryCluster.id,routing_version:1,payload_sha256:p.p_payload_sha256};
 record('dedicated-adapter-uses-native-scoped-read-and-close',
  (await recoveryGateway.receipt(adapterWorkspace)).tenant_id===binding.tenant_id
  &&(await recoveryGateway.close(adapterWorkspace,adapterDispatch)).state==='committed');
 assert.deepEqual((await db.query('SELECT * FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[p.p_dispatch_id])).rows,journalBefore);
 record('committed-close-does-not-rewrite-journal');
 for(const patch of [{p_owner_id:randomUUID()},{p_workspace_id:randomUUID()},{p_routing_version:2},{p_payload_sha256:'a'.repeat(64)}]){
  r=await close({...p,...patch});record('close-rejects-changed-identity-'+Object.keys(patch)[0],r.status===403&&r.data?.code==='42501');
 }
 const changed=JSON.stringify({...JSON.parse(p.p_fields_json),hotelName:'Must not overwrite'});
 r=await provision({...p,p_fields_json:changed,p_payload_sha256:createHash('sha256').update(changed).digest('hex')});
 record('same-dispatch-different-payload-conflicts',r.status===403&&r.data?.code==='42501');
 await unchanged(beforeReplay,'conflicts-preserve-committed-business');
 phase='close-first';
 const b=await account('close-first'),q=metadata(b),beforeClose=await snapshot();
 r=await close(q);record('worker-closes-never-started-attempt',r.status===200&&r.data.state==='closed'&&!r.data.success&&r.data.tenant_id===null&&r.data.hotel_id===null);
 const closedJournal=(await db.query('SELECT * FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[q.p_dispatch_id])).rows;
 for(let i=0;i<3;i++){r=await close(q);assert.equal(r.data.state,'closed');r=await provision(q);assert.equal(r.data.state,'closed')}
 assert.deepEqual((await db.query('SELECT * FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[q.p_dispatch_id])).rows,closedJournal);
 record('closed-attempt-is-durable-and-idempotent');
 r=await rpc('provision_workspace_registration',{p_workspace_id:q.p_workspace_id,p_owner_id:b.id,p_fields:{...JSON.parse(q.p_fields_json),registrationSessionId:b.session}});
 record('late-legacy-call-cannot-bypass-close',r.status===403&&r.data?.code==='42501');
 await unchanged(beforeClose,'close-and-late-calls-no-business-effects');
 const next={...q,p_dispatch_id:randomUUID()};r=await provision(next);
 record('fresh-owner-attempt-after-proven-close-can-finish',r.status===200&&r.data.state==='committed'&&r.data.success);
 const completed=await snapshot();r=await provision(q);assert.equal(r.data.state,'closed');
 await unchanged(completed,'old-closed-attempt-cannot-reset-completed-trial');
 phase='validation';
 const c=await account('bad-fields'),bad=metadata(c),badText=JSON.stringify({...JSON.parse(bad.p_fields_json),totalRooms:-1});
 const badPayload={...bad,p_fields_json:badText,p_payload_sha256:createHash('sha256').update(badText).digest('hex')},beforeBad=await snapshot();
 r=await provision(badPayload);record('business-rejection-persists-closed-attempt',r.status===200&&r.data.state==='closed'&&r.data.last_error_code==='DISPATCH_REJECTED');
 await unchanged(beforeBad,'business-rejection-rolls-back-all-eleven-tables');
 r=await provision({...bad,p_dispatch_id:randomUUID(),p_payload_sha256:'b'.repeat(64)});
 record('hash-mismatch-rejected',r.status===400&&r.data?.code==='22023');
 const forbiddenText=JSON.stringify({...JSON.parse(bad.p_fields_json),tenant_id:randomUUID()});
 r=await provision({...bad,p_dispatch_id:randomUUID(),p_fields_json:forbiddenText,p_payload_sha256:createHash('sha256').update(forbiddenText).digest('hex')});
 record('privileged-fields-rejected',r.status===400&&r.data?.code==='22023');
 await unchanged(beforeBad,'malformed-envelope-no-business-effects');
 phase='revocation';
 await db.query('DELETE FROM auth.sessions WHERE id=$1',[c.session]);
 r=await provision({...bad,p_dispatch_id:randomUUID()});record('live-revoked-session-cannot-provision',r.status===403&&r.data?.code==='42501');
 r=await close({...bad,p_dispatch_id:randomUUID()});record('worker-can-close-after-session-revoked',r.status===200&&r.data.state==='closed');
 await unchanged(beforeBad,'revocation-and-worker-close-no-business-effects');
 phase='routing';
 const d=await account('routing'),old=metadata(d),future={...old,p_dispatch_id:randomUUID(),p_routing_version:2},beforeRouting=await snapshot();
 assert.equal((await close(future)).data.state,'closed');
 r=await provision(old);record('older-routing-version-cannot-run-after-new-fence',r.status===403&&r.data?.code==='42501');
 await unchanged(beforeRouting,'stale-routing-no-business-effects');
 phase='close-wins-before-workspace-lock';
 const e=await account('close-race'),early=metadata(e),beforeEarly=await snapshot();
 await held('actual-provision-waits-before-workspace-lock','actor',early,async({pending,release})=>{
  const closed=await close(early);assert.equal(closed.status,200);assert.equal(closed.data.state,'closed');
  await release();const late=await pending;assert.equal(late.status,200);assert.equal(late.data.state,'closed');
 });
 await unchanged(beforeEarly,'close-wins-over-already-running-late-rpc');
 phase='commit-wins';
 const f=await account('commit-race'),running=metadata(f);
 let committed;
 await held('actual-provision-holds-workspace-before-business-commit','business',running,async({pending,release})=>{
  const busy=await close(running);assert.equal(busy.status,200);assert.equal(busy.data.state,'busy');
  assert.equal(await rowCount(running.p_dispatch_id),0);record('busy-is-not-a-close-proof');
  await release();committed=await pending;assert.equal(committed.status,200);assert.equal(committed.data.state,'committed');
 });
 const beforeRecover=await snapshot();r=await close(running);
 record('lost-http-result-recovered-from-actual-receipt',r.status===200&&r.data.state==='committed'&&r.data.tenant_id===committed.data.tenant_id);
 await unchanged(beforeRecover,'commit-recovery-preserves-business-trial-and-outbox');
 phase='killed-rpc';
 const g=await account('killed-race'),killed=metadata(g),beforeKill=await snapshot();
 await held('terminated-live-rpc-releases-workspace-lock','business',killed,async({pending,waiting,release})=>{
  assert.equal((await close(killed)).data.state,'busy');
  assert.equal((await db.query('SELECT pg_terminate_backend($1) AS stopped',[waiting])).rows[0].stopped,true);
  const failed=await pending;assert.notEqual(failed.status,200);
  const closed=await close(killed);assert.equal(closed.status,200);assert.equal(closed.data.state,'closed');
  await release();
 });
 await unchanged(beforeKill,'terminated-transaction-fully-rolls-back');
 r=await provision(killed);record('terminated-attempt-stays-closed-on-late-retry',r.status===200&&r.data.state==='closed');
 phase='wall-clock-session-expiry';
 const expired=await account('expiry-race'),expiring=metadata(expired);
 await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '5 seconds' WHERE id=$1",[expired.session]);
 const beforeExpiry=await snapshot();
 await held('session-expires-during-actual-business-write','business',expiring,async({pending,release})=>{
  let elapsed=false;const end=Date.now()+10000;
  while(Date.now()<end){
   elapsed=(await db.query('SELECT not_after<=clock_timestamp() AS expired FROM auth.sessions WHERE id=$1',[expired.session])).rows[0].expired;
   if(elapsed)break;await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.equal(elapsed,true);record('session-expiry-clock-barrier-observed');
  await release();const rejected=await pending;
  assert.equal(rejected.status,200);assert.equal(rejected.data.state,'closed');assert.equal(rejected.data.last_error_code,'DISPATCH_REJECTED');
 });
 await unchanged(beforeExpiry,'wall-clock-expiry-rolls-back-business-trial-and-outbox');
 r=await close(expiring);record('expired-inflight-session-recovery-is-closed',r.status===200&&r.data.state==='closed');
 phase='scoped-revocation-barrier';
 const revokeTarget=metadata(a),revoker=await db.connect();let revoking;
 try{
  await recoveryHeld(revokeTarget,roleToken(Math.floor(Date.now()/1000)+3500,{jti:rotatedId}),async({pending,waiting,release})=>{
   await revoker.query('BEGIN');const revokerPid=Number((await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   revoking=revoker.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[rotatedId]);
   let blocked=false;const end=Date.now()+5000;
   while(Date.now()<end){blocked=(await db.query('SELECT $1=ANY(pg_blocking_pids($2)) AS blocked',[waiting,revokerPid])).rows[0].blocked;
    if(blocked)break;await new Promise(resolve=>setTimeout(resolve,20))}
   record('revocation-waits-for-authorized-inflight-close',blocked);
   await release();assert.equal((await pending).data.state,'closed');await revoking;await revoker.query('COMMIT');
  });
 }finally{if(revoking)await revoking.catch(()=>{});await revoker.query('ROLLBACK');revoker.release()}
 record('committed-revocation-denies-next-close',
  (await recoveryRpc('close_dispatch',closeArgs(revokeTarget),roleToken(Math.floor(Date.now()/1000)+3500,{jti:rotatedId}))).status===403);
 phase='scoped-credential-wall-clock-expiry';
 const expiringId=randomUUID(),credentialExpiry=Math.floor(Date.now()/1000)+5,expiringClose=metadata(a);
 await db.query("INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at) VALUES($1,$2,$3,clock_timestamp()-interval '1 second',to_timestamp($4))",
  [expiringId,recoveryCluster.id,recoveryContext.bindingHash,credentialExpiry]);
 await recoveryHeld(expiringClose,roleToken(credentialExpiry,{jti:expiringId}),async({pending,release})=>{
  let expired=false;const end=Date.now()+10000;
  while(Date.now()<end){expired=(await db.query('SELECT expires_at<=clock_timestamp() AS expired FROM private.setup_recovery_credentials WHERE id=$1',[expiringId])).rows[0].expired;
   if(expired)break;await new Promise(resolve=>setTimeout(resolve,20))}
  record('credential-expiry-during-native-journal-write-observed',expired);
  await release();const denied=await pending;
  record('credential-expiry-final-guard-rejects-close',denied.status===403&&denied.data?.code==='42501');
 });
 record('credential-expiry-rolls-back-close-tombstone',await rowCount(expiringClose.p_dispatch_id)===0);
 phase='receipt-fault';
 const h=await account('receipt-fault'),fault=metadata(h),beforeFault=await snapshot();
 await db.query("CREATE FUNCTION private.roomqc_dispatch_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'OWNED_DISPATCH_FAULT'; END $$");
 await db.query('CREATE TRIGGER roomqc_dispatch_fault BEFORE INSERT ON private.workspace_provisioning FOR EACH ROW EXECUTE FUNCTION private.roomqc_dispatch_fault()');
 try{
  r=await provision(fault);record('post-business-receipt-fault-closes-attempt',r.status===200&&r.data.state==='closed'&&r.data.last_error_code==='DISPATCH_REJECTED');
  await unchanged(beforeFault,'receipt-fault-rolls-back-entire-business-transaction');
 }finally{
  await db.query('DROP TRIGGER roomqc_dispatch_fault ON private.workspace_provisioning');
  await db.query('DROP FUNCTION private.roomqc_dispatch_fault()');
 }
 r=await provision({...fault,p_dispatch_id:randomUUID()});record('new-owner-dispatch-recovers-after-rolled-back-fault',r.status===200&&r.data.state==='committed');
 const footprint=(await db.query("SELECT count(*)::int AS count,bool_and(state IN ('closed','committed')) AS terminal_only FROM private.workspace_setup_dispatches")).rows[0];
 record('journal-has-only-terminal-visible-attempts',footprint.count>0&&footprint.terminal_only);
 const secretColumns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='private' AND table_name='workspace_setup_dispatches' AND column_name ~ '(jwt|password|token|fields|email)'")).rows;
 record('journal-does-not-store-owner-token-password-or-business-fields',secretColumns.length===0);
 phase='native-api-directory-and-remote';
 const nativeApi=await runSetupApiNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record});
 phase='native-cli-directory-and-remote';
 const nativeCli=await runSetupCliNativeChecks({input,db,recoveryCluster,recoveryExpected,account,metadata,provision,snapshot,record});
 phase='native-worker-directory-and-remote';
 const nativeWorker=await runSetupWorkerNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record});
 phase='native-credential-maintenance';
 const nativeCredentials=await runSetupCredentialNativeChecks({input,db,recoveryCluster,recoveryExpected,snapshot,record,recoveryHeld,account,metadata});
 console.log(JSON.stringify({verified:true,actualAuth:true,actualRest:true,actualPostgres:true,businessSnapshotTables:11,
   recoveryPrivilegeSurface:surface,recoveryFunctionSurface,nativeApi,nativeCli,nativeWorker,nativeCredentials,checks,barriers}));
 }
}catch(error){
 // A failing privilege assertion must retain the catalog that explains it.
 // The parent keeps stdout/stderr privately and still reports a failed run.
 await new Promise(resolve=>process.stdout.write(JSON.stringify({verified:false,phase,checks,barriers,recoveryFunctionSurface})+'\n',resolve));
 throw error;
}finally{await db.end()}
