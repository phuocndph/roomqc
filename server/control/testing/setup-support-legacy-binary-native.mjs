// Actual source331 API on directory20/21, plus the product retirement CLI.
// Only the exact-owned sandbox may call this diagnostic.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {fork,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join,dirname} from 'node:path';
import pg from 'pg';
import {migrateDirectory,migrationManifest,importInitialRegistry} from '../migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '../test-fixtures.mjs';
import {fixtureReleaseApproval,fixtureReleaseContext,fixtureReleaseTrustRaw} from '../release-test-fixtures.mjs';
import {syntheticRelease,syntheticBundle} from '../probe-test-fixtures.mjs';
import {inspectControlLoginRetirement,retireControlApiLogin} from '../control-login-retirement.mjs';

const execute=promisify(execFile),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runSupportLegacyBinaryNativeChecks({input,db,actor,cluster,snapshot,check,barrier,until}){
 const database='roomqc_legacy_'+input.run,oldRole='legacy_api_'+input.run,newRole='current_api_'+input.run,password=randomBytes(32).toString('hex');
 const children=new Set(),checks=[],mark=label=>{checks.push({label,passed:true});check('legacy-binary-'+label)};
 let admin,directory,oldLogin,newLogin,created=false,temp,result,baselineRoles;
 const queryIdentity=pool=>pool.query(`SELECT current_database() AS "databaseName",oid::text AS "databaseOid",
  (pg_control_system()).system_identifier::text AS "systemIdentifier" FROM pg_database WHERE datname=current_database()`);
 const source=JSON.parse(await readFile('/legacy-repository/source-binding.json','utf8'));
 assert.equal(source.sha256,input.legacySourceSha256);assert.equal(source.files.length,input.legacySourceFiles);
 const child=async(which,role,{expectFailure=false}={})=>{
  const handle={process:fork(new URL('./setup-support-legacy-binary-child.mjs',import.meta.url),[],
   {execArgv:[],stdio:['ignore','ignore','pipe','ipc'],env:{PATH:process.env.PATH}}),messages:[],exit:null};
  children.add(handle);handle.process.stderr.resume();
  handle.process.on('message',m=>handle.messages.push(m));handle.process.on('error',()=>handle.messages.push({type:'failed',code:'LEGACY_BINARY_CHILD_SPAWN'}));
  handle.done=new Promise(resolve=>handle.process.once('close',(code,signal)=>{handle.exit={code,signal};children.delete(handle);resolve(handle.exit)}));
  const url=new URL('postgresql://db/'+database);url.username=role;url.password=password;
  const config=fixtureConfig('unused',[cluster]);
  handle.process.send({run:input.run,source:which,databaseUrl:url.href,emailKey:config.emailKey,cluster,inventory:[...config.inventory.values()],
   trust:fixtureReleaseTrustRaw,releaseCatalog:{version:2,entries:[{inventoryRef:cluster.id,
    approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease)),credential:{...syntheticBundle().credential,publishableKey:input.publishableKey}}]}});
  const message=await until(()=>handle.messages.find(m=>['ready','failed'].includes(m.type)),which+'-binary-start',12000);
  if(expectFailure){assert.equal(message.type,'failed');await handle.done;assert.equal(handle.exit.code,1);return {...handle,failure:message.code}}
  assert.equal(message.type,'ready',message.code);handle.origin='http://127.0.0.1:'+message.port;return handle;
 };
 const request=async(handle,path,{body,key}={})=>{
  try{const response=await fetch(handle.origin+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(12000),headers:{authorization:'Bearer '+actor.token,
   ...(body?{'content-type':'application/json',origin:'http://localhost:8082'}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
   return {status:response.status,data:await response.json()};}catch{return {networkError:true}}
 };
 const cli=async(args,expectedExit=0)=>{
  try{const {stdout}=await execute(process.execPath,['/repository/scripts/control-api-login-retire.mjs',...args],
   {env:{PATH:process.env.PATH},timeout:18000,maxBuffer:65536});assert.equal(expectedExit,0);return JSON.parse(stdout)}
  catch(error){if(error.stdout){assert.equal(error.code,expectedExit);return JSON.parse(error.stdout)}throw error}
 };
 try{
  admin=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:12000});
  baselineRoles=(await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
  await admin.query('CREATE DATABASE '+database);created=true;
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:3,statement_timeout:12000});
  temp=await mkdtemp('/tmp/roomqc-legacy-'+input.run+'-');await mkdir(join(temp,'migrations'),{mode:0o700});
  const manifest=await migrationManifest();assert.equal(manifest.length,21);
  for(const m of manifest.slice(0,20))await writeFile(join(temp,'migrations',m.version),m.sql,{flag:'wx',mode:0o600});
  assert.equal((await migrateDirectory(directory,{location:pathToFileURL(join(temp,'migrations')+'/')})).applied.length,20);
  await importInitialRegistry(directory,[cluster]);await seedOperationalCluster(directory,cluster.id,{cluster});
  for(const role of [oldRole,newRole])await directory.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  oldLogin=new pg.Pool({host:'db',database,user:oldRole,password,max:1,connectionTimeoutMillis:2000});oldLogin.on('error',()=>{});
  newLogin=new pg.Pool({host:'db',database,user:newRole,password,max:1,connectionTimeoutMillis:2000});newLogin.on('error',()=>{});
  const expected=(await queryIdentity(directory)).rows[0],businessBefore=await snapshot();
  const legacy=await child('legacy',oldRole),path='/api/control/admin/clusters/'+cluster.id+'/commands';
  const body=async()=>({operation:'close_admission',expectedVersion:Number((await directory.query('SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),
   reason:'Owned actual legacy binary cutover',payload:{}});
  const oldKey=randomUUID(),oldBody=await body(),positive=await request(legacy,path,{body:oldBody,key:oldKey});assert.equal(positive.status,200);
  assert.equal((await request(legacy,'/api/control/readyz')).status,200);
  mark('unchanged-source331-api-linux-http-auth-command-and-ready-on-published-directory20');
  assert.deepEqual((await migrateDirectory(directory)).applied,['0021-support-command-intents.sql']);
  const ready=await request(legacy,'/api/control/readyz');assert.equal(ready.status,503);
  // Deliberately witness the historical hazard in this disposable fixture:
  // unhealthy alone does NOT stop a previously running old writer.
  const unsafeKey=randomUUID(),unsafe=await request(legacy,path,{body:await body(),key:unsafeKey});assert.equal(unsafe.status,200);
  assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.support_command_intents')).rows[0].n,0);
  mark('historical-hazard-witnessed-old-api-ready503-can-still-write-if-old-login-remains-active');
  const restart=await child('legacy',newRole,{expectFailure:true});assert.equal(restart.failure,'MIGRATION_CHECKSUM_MISMATCH');
  mark('unchanged-old-api-restart-readiness-rejects-directory21-with-schema-checksum-mismatch');
  const baseline=async()=>Object.fromEntries(await Promise.all(['clusters','cluster_policies','control_commands','cluster_events','support_command_acceptances',
   'support_command_intents','support_command_attempts','support_attempt_closures','support_intent_results'].map(async t=>[t,
    (await directory.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+t+' t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row)])));
  const before=await baseline(),plan=await inspectControlLoginRetirement(directory,{expected,login:oldRole});
  await assert.rejects(()=>inspectControlLoginRetirement(directory,{expected:{...expected,databaseOid:'1'},login:oldRole}),{code:'CONTROL_LOGIN_RETIREMENT_DATABASE_MISMATCH'});
  await assert.rejects(()=>inspectControlLoginRetirement(directory,{expected,login:'supabase_admin'}));
  await assert.rejects(()=>retireControlApiLogin(directory,{expected,login:oldRole,expectedPlanSha256:'0'.repeat(64)}),{code:'CONTROL_LOGIN_RETIREMENT_PLAN_CHANGED'});
  assert.deepEqual((await inspectControlLoginRetirement(directory,{expected,login:oldRole})).binding,plan.binding);
  mark('retirement-rejects-wrong-database-administrator-and-stale-plan-without-changing-login');
  const shared='legacy_shared_'+input.run;
  await directory.query('CREATE ROLE '+shared+' NOLOGIN');await directory.query('GRANT '+shared+' TO '+oldRole);
  try{await assert.rejects(()=>inspectControlLoginRetirement(directory,{expected,login:oldRole}),{code:'CONTROL_LOGIN_RETIREMENT_ROLE_SHARED'})}
  finally{await directory.query('REVOKE '+shared+' FROM '+oldRole);await directory.query('DROP ROLE '+shared)}
  await directory.query('GRANT SELECT ON roomqc_control.clusters TO '+oldRole);
  try{await assert.rejects(()=>inspectControlLoginRetirement(directory,{expected,login:oldRole}),{code:'CONTROL_LOGIN_RETIREMENT_DIRECT_DEPENDENCY'})}
  finally{await directory.query('REVOKE SELECT ON roomqc_control.clusters FROM '+oldRole)}
  mark('retirement-rejects-shared-membership-and-direct-acl-without-reassigning-or-dropping-data');
  const sharedPool=new pg.Pool({host:'db',database:'postgres',user:oldRole,password,max:1});
  try{await sharedPool.query('SELECT 1');await assert.rejects(()=>inspectControlLoginRetirement(directory,{expected,login:oldRole}),
   {code:'CONTROL_LOGIN_RETIREMENT_OTHER_DATABASE_SESSION'})}finally{await sharedPool.end()}
  mark('retirement-rejects-a-login-with-an-active-session-in-another-database');
  const uncertainRole='uncertain_api_'+input.run;
  await directory.query(`CREATE ROLE ${uncertainRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  const uncertainPool=new pg.Pool({host:'db',database,user:uncertainRole,password,max:1});uncertainPool.on('error',()=>{});
  try{
   await uncertainPool.query('SELECT 1');const uncertainPlan=await inspectControlLoginRetirement(directory,{expected,login:uncertainRole});
   let dropped=false;
   const wire={connect:async()=>{const client=await directory.connect();return {
    on:client.on.bind(client),removeListener:client.removeListener.bind(client),release:client.release.bind(client),
    query:async(sql,args)=>{const result=await client.query(sql,args);if(sql==='COMMIT'&&!dropped){dropped=true;
     throw Object.assign(new Error('OWNED_COMMIT_RESPONSE_LOSS'),{code:'08006'})}return result}}}};
   await assert.rejects(()=>retireControlApiLogin(wire,{expected,login:uncertainRole,expectedPlanSha256:uncertainPlan.planSha256}),
    error=>error.code==='08006'&&error.retirementMayHaveCommitted===true&&error.retirementCommitted!==true);
   assert(dropped);const actual=await inspectControlLoginRetirement(directory,{expected,login:uncertainRole});
   assert.equal(actual.binding.role.canLogin,false);assert.deepEqual(actual.binding.role.memberOf,[]);
   const recovered=await retireControlApiLogin(directory,{expected,login:uncertainRole,expectedPlanSha256:actual.planSha256});
   assert.equal(recovered.loginDisabled,true);assert.equal(recovered.remainingSessions,0);assert(recovered.terminatedSessions>=1);
   assert.equal((await newLogin.query('SELECT 1 AS ok')).rows[0].ok,1);
  }finally{await uncertainPool.end();await directory.query('DROP ROLE '+uncertainRole)}
  mark('real-commit-response-loss-is-unknown-until-live-inspection-and-fresh-plan-completes-retirement-without-reenable');
  const configFile=join(temp,'retire.json'),dsnFile=join(temp,'dsn.txt'),auditFile=join(temp,'retire-audit.jsonl');
  const url=new URL('postgresql://db/'+database);url.username='supabase_admin';url.password=input.databasePassword;
  await writeFile(dsnFile,url.href,{mode:0o600,flag:'wx'});
  await writeFile(configFile,JSON.stringify({version:1,environment:'local',dsnFile,auditFile,expected,login:oldRole}),{mode:0o600,flag:'wx'});
  const inspected=await cli(['--config-file',configFile]);assert.equal(inspected.mode,'inspect');assert.equal(inspected.planSha256,plan.planSha256);
  assert.equal((await directory.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1',[oldRole])).rows[0].rolcanlogin,true);
  mark('product-cli-private-files-default-inspect-makes-no-change-and-matches-exact-role-database-plan');
  // Keep one legitimate old transaction paused before its final receipt.
  // The retirement CLI must terminate and roll it back, not merely prevent
  // the next connection while allowing this command to commit afterward.
  const gate=738720,holder=await directory.connect();let trigger=false,pending,retired;
  try{
   await directory.query(`CREATE FUNCTION roomqc_control.owned_legacy_cutover_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${gate});RETURN NEW;END $$;
    CREATE TRIGGER owned_legacy_cutover_wait BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_legacy_cutover_wait()`);trigger=true;
   await holder.query('SELECT pg_advisory_lock($1)',[gate]);
   pending=request(legacy,path,{body:await body(),key:randomUUID()});
   const blocked=await until(async()=>(await directory.query(`SELECT a.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
    WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted`,[database,oldRole,gate])).rows[0],
    'actual-old-api-held-before-retirement',3500);assert(blocked.pid);
   barrier('legacy-binary-actual-old-api-uncommitted-write-blocked-before-retirement');
   assert.equal((await newLogin.query('SELECT 1 AS ok')).rows[0].ok,1);
   retired=await cli(['--config-file',configFile,'--apply','--expected-plan-sha256',plan.planSha256]);
   assert(retired.ok&&retired.verified);assert(retired.terminatedSessions>=1);assert.equal(retired.remainingSessions,0);
   const denied=await pending;assert(denied.networkError||denied.status===503);assert.deepEqual(await baseline(),before);
  }finally{
   try{await holder.query('SELECT pg_advisory_unlock($1)',[gate])}finally{holder.release()}
   if(pending)await pending;
   if(trigger)await directory.query('DROP TRIGGER owned_legacy_cutover_wait ON roomqc_control.cluster_events;DROP FUNCTION roomqc_control.owned_legacy_cutover_wait()');
  }
  mark('actual-cli-retires-login-and-membership-terminates-original-inflight-write-and-rolls-back-all-effects');
  await assert.rejects(()=>oldLogin.query('SELECT 1'),e=>['28000','28P01'].includes(e.code));
  const denied=await request(legacy,path,{body:await body(),key:randomUUID()});assert(denied.networkError||denied.status===503);
  assert.deepEqual(await baseline(),before);assert.equal((await newLogin.query('SELECT 1 AS ok')).rows[0].ok,1);
  mark('old-credentials-cannot-reconnect-or-mutate-and-replacement-login-is-unaffected');
  const repeatedPlan=await cli(['--config-file',configFile]);
  const existingAudit=await readFile(auditFile,'utf8'),auditRows=existingAudit.trim().split('\n').map(JSON.parse);
  assert.deepEqual(auditRows.map(r=>r.event),['control_login_retirement_planned','control_login_retirement_verified']);
  assert.equal(auditRows[1].result.loginDisabled,true);
  const duplicate=await cli(['--config-file',configFile,'--apply','--expected-plan-sha256',repeatedPlan.planSha256],1);
  assert.equal(duplicate.code,'SETUP_BACKFILL_OUTPUT_EXISTS');assert.equal(await readFile(auditFile,'utf8'),existingAudit);
  mark('exclusive-fsynced-cli-audit-preserves-original-plan-and-result-and-rejects-overwrite');
  const repeatConfig=join(temp,'repeat.json');await writeFile(repeatConfig,
   JSON.stringify({version:1,environment:'local',dsnFile,auditFile:join(temp,'repeat-audit.jsonl'),expected,login:oldRole}),{mode:0o600,flag:'wx'});
  const repeat=await cli(['--config-file',repeatConfig,'--apply','--expected-plan-sha256',repeatedPlan.planSha256]);
  assert.equal(repeat.terminatedSessions,0);assert.equal(repeat.loginDisabled,true);assert.equal(repeat.credentialsReenabled,false);
  mark('retirement-rerun-remains-disabled-without-credential-reenable-or-unrelated-session-termination');
  const current=await child('current',newRole),replayed=await request(current,path,{body:oldBody,key:oldKey});
  assert.equal(replayed.status,200);assert.equal(replayed.data.commandId,positive.data.commandId);assert.deepEqual(await baseline(),before);
  const currentKey=randomUUID(),currentBody=await body(),committed=await request(current,path,{body:currentBody,key:currentKey});assert.equal(committed.status,200);
  const adopted=(await directory.query(`SELECT i.id,r.generation,r.acceptance_id,c.control_command_id FROM roomqc_control.support_command_intents i
   JOIN roomqc_control.support_intent_results r ON r.intent_id=i.id JOIN roomqc_control.support_command_acceptances c ON c.acceptance_id=r.acceptance_id
   WHERE i.request_key=$1`,[currentKey])).rows;assert.equal(adopted.length,1);assert.equal(adopted[0].generation,0);
  assert.equal(adopted[0].control_command_id,committed.data.commandId);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM private.platform_support_acceptances WHERE request_key=$1',[currentKey])).rows[0].n,1);
  for(let i=0;i<2;i++)assert.equal((await request(current,path,{body:currentBody,key:currentKey})).data.commandId,committed.data.commandId);
  assert.equal((await request(current,'/api/control/readyz')).status,200);assert.deepEqual(await snapshot(),businessBefore);
  mark('current-binary-replays-original-history-and-commits-one-real-auth-journal-result-with-new-login');
  result={verified:true,checks,actualHistoricalSource:source.sha256,historicalFiles:source.files.length,
   actualLinuxOldBinary:true,actualLinuxCurrentBinary:true,actualAuth:true,actualHttp:true,poolMax:1,
   migrations:{before:20,after:21},retirement:retired,legacyStartupDenial:restart.failure,
   historicalHazardConfirmed:true,historyReplayPreserved:true,businessUnchanged:true,
   limits:['Historical source331 interpreted by the same pinned Node22 runtime and identical lockfiles; not a previously shipped container image.',
    'Only dedicated API logins are retired; proxy routing, workers, other services and real VPS cutover remain operator/deployment requirements.',
    'No old binary is authorized to run after directory21 with replacement credentials; rollback requires a journal-compatible binary or a separate reviewed read-only plan.',
    'Fresh owned fixture with real SQL/Auth/HTTP; not actual customer migration, A/B, full-default/rebuild or product acceptance.']};
  return result;
 }finally{
  for(const handle of [...children]){if(!handle.exit){handle.process.kill('SIGKILL');await handle.done}}
  await oldLogin?.end();await newLogin?.end();await directory?.end();
  if(created)await admin.query('DROP DATABASE '+database);
  if(baselineRoles){const after=(await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
   const extra=after.filter(r=>!baselineRoles.includes(r));assert(extra.every(r=>[oldRole,newRole,'legacy_shared_'+input.run,'uncertain_api_'+input.run].includes(r)));
   for(const r of extra)await admin.query('DROP ROLE '+r);
   assert.deepEqual((await admin.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),baselineRoles);
   if(result)result.roleCleanup={verified:true,removed:extra.length,baselineSha256:createHash('sha256').update(JSON.stringify(baselineRoles)).digest('hex')};
  }
  await admin?.end();
  if(temp){assert.equal(dirname(temp),'/tmp');assert(temp.startsWith('/tmp/roomqc-legacy-'+input.run+'-'));await rm(temp,{recursive:true,force:true})}
 }
}
