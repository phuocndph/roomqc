// Exact-owned native fixture. Real CLI/daemon, directory, PostgreSQL and REST;
// release approval uses labelled synthetic test authority, never production keys.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readdir,lstat,chown,chmod,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from '../migrate.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrustRaw,seedFixtureReleaseAuthority} from '../release-test-fixtures.mjs';
import {summaryMaintenanceBinding} from '../tenant-summary-maintenance.mjs';
import {createInstallerPgProxy} from './setup-installer-pg-proxy.mjs';
import {runSummaryContentionChecks,runSummaryMountedReadChecks} from './tenant-summary-contention-native.mjs';
import {summaryResourceConfigurationHash} from '../summary-resource-profile.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const directoryRoles=['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime',
 'roomqc_control_probe_installer','roomqc_control_release_installer','roomqc_control_release_writer','roomqc_control_alerts',
 'roomqc_control_setup_runtime','roomqc_control_setup_writer','roomqc_control_backfill_reader','roomqc_control_backfill_runtime',
 'roomqc_control_backfill_writer','roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer'];
async function until(read,label,timeout=60000){
 const end=Date.now()+timeout;
 while(Date.now()<end){const result=await read();if(result)return result;await new Promise(r=>setTimeout(r,25))}
 throw new Error('SUMMARY_CLI_NATIVE_TIMEOUT_'+label);
}

export async function runSummaryCredentialCliChecks({input,db,maintenance,cluster}){
 assert.match(input.run,/^[a-f0-9]{12}$/);assert.match(input.cliSourceSha256,/^[a-f0-9]{64}$/);
 const database='roomqc_summary_cli_'+input.run,password=randomBytes(32).toString('hex'),uid=1000,gid=1000;
 const names={issuer:'sum_cli_issue_'+input.run,installer:'sum_cli_bind_'+input.run,observer:'sum_cli_watch_'+input.run,
  otherIssuer:'sum_cli_peer_'+input.run,otherObserver:'sum_cli_peerwatch_'+input.run};
 const checks=[],children=new Set(),identities=[];let root,directory,wire,created=false,baselineRoles,cliSpawns=0;
 const check=(label,value=true)=>{assert.ok(value,label);checks.push({label,passed:true});
  console.error(JSON.stringify({event:'summary_cli_native_check',label}))};
 const state=async()=>JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(c ORDER BY id) FROM private.tenant_summary_credentials c) AS credentials,
  (SELECT jsonb_agg(c ORDER BY key) FROM private.tenant_summary_commands c) AS commands,
  (SELECT jsonb_agg(c ORDER BY command_key) FROM private.tenant_summary_credential_audit c) AS audit,
  (SELECT to_jsonb(m) FROM private.tenant_summary_management m) AS management,
  (SELECT to_jsonb(a) FROM private.tenant_summary_authority a) AS authority`)).rows);
 const takeOwnership=async path=>{const info=await lstat(path);assert.equal(info.isSymbolicLink(),false);
  await chown(path,uid,gid);if(info.isDirectory())for(const entry of await readdir(path))await takeOwnership(join(path,entry))};
 try{
  baselineRoles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
  root=await mkdtemp('/tmp/roomqc-summary-cli-'+input.run+'-');
  for(const path of ['/summary-input','/run/roomqc/summary']){assert.equal((await lstat(path)).isSymbolicLink(),false);await chown(path,uid,gid);await chmod(path,0o700)}
  for(const name of ['runtime','journal'])await mkdir(join(root,name),{mode:0o700});
  const text=async(name,value)=>{const file=join(root,name);await writeFile(file,value,{flag:'wx',mode:0o600});return file};
  const json=(name,value)=>text(name,JSON.stringify(value)+'\n');
  await maintenance.query('CREATE DATABASE '+database);created=true;
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:20000});
  const migrated=await migrateDirectory(directory),manifest=await migrationManifest();
  assert.equal(migrated.applied.length,manifest.length);assert.equal((await migrateDirectory(directory)).applied.length,0);
  const targetCluster={id:cluster.id,hostId:cluster.id,inventoryRef:cluster.inventoryRef,credentialRef:cluster.ref,
   url:cluster.url,internalUrl:cluster.internalUrl,approvedAddresses:cluster.approvedAddresses};
  await importInitialRegistry(directory,[{...targetCluster,publishableKey:input.publishableKey,vapidPublicKey:'owned-summary-cli',maxWorkspaces:10}]);
  await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[targetCluster.hostId]);
  await directory.query('UPDATE roomqc_control.clusters SET host_id=$1,inventory_ref=$2 WHERE id=$3',
   [targetCluster.hostId,targetCluster.inventoryRef,targetCluster.id]);
  const capabilities={issuer:'roomqc_summary_credential_issuer',installer:'roomqc_summary_credential_installer',observer:'roomqc_control_setup_credential_observer',
   otherIssuer:'roomqc_summary_credential_issuer',otherObserver:'roomqc_control_setup_credential_observer'};
  for(const [kind,name]of Object.entries(names))await maintenance.query('CREATE ROLE '+name+
   " LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD '"+password+"' IN ROLE "+capabilities[kind]);
  const fingerprint=(await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value;
  const expected={clusterId:cluster.id,releaseId:'owned-summary-cli',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
   migrationSetHash:'3'.repeat(64),schemaManifestHash:fingerprint};
  assert.equal((await db.query('SELECT count(*)::int AS n FROM private.roomqc_release_manifest')).rows[0].n,0);
  await db.query(`INSERT INTO private.roomqc_release_manifest(cluster_id,release_id,contract_version,schema_fingerprint_version,
   artifact_digest,frontend_artifact_digest,migration_set_hash,expected_schema_hash) VALUES($1,$2,3,3,$3,$4,$5,$6)`,
   [cluster.id,expected.releaseId,expected.artifactDigest,expected.frontendArtifactDigest,expected.migrationSetHash,fingerprint]);
  const context=fixtureReleaseContext(targetCluster,expected);await seedFixtureReleaseAuthority(directory,context);
  wire=await createInstallerPgProxy({schema:'roomqc_summary_admin'});
  const identity=async(pool,databaseName,role)=>({...((await pool.query(`SELECT s.system_identifier::text AS "systemIdentifier",
   d.oid::text AS "databaseOid" FROM pg_control_system() s JOIN pg_database d ON d.datname=current_database()`)).rows[0]),databaseName,role});
  const businessIdentity=await identity(maintenance,'postgres',names.issuer),directoryIdentity=await identity(directory,database,names.observer);
  const dsn=(role,name)=>'postgresql://'+role+':'+password+'@127.0.0.1:'+wire.port+'/'+name+'?sslmode=disable';
  const issuerFile=await text('issuer.dsn',dsn(names.issuer,'postgres')),installerFile=await text('installer.dsn',dsn(names.installer,'postgres')),
   directoryFile=await text('directory.dsn',dsn(names.observer,database));
  const trustFile=await json('trust.json',fixtureReleaseTrustRaw),keyFile=await text('signer',input.jwtSecret),publishableKeyFile=await text('publishable',input.publishableKey);
  const budget=JSON.parse(await readFile('/repository/deploy/control-resource-budget.example.json','utf8'));budget.environment='local';
  for(const d of budget.databases)for(const id of ['summary-credential-installer','summary-credential-issuer','summary-credential-rotation'])
   d.consumers.push({id,replicas:id==='summary-credential-rotation'?2:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  const budgetText=JSON.stringify(budget)+'\n',resourceBudgetFile=await text('budget.json',budgetText);
  const config={version:1,environment:'local',business:{dsnFile:issuerFile,expected:businessIdentity},directory:{dsnFile:directoryFile,expected:directoryIdentity},
   resourceBudgetFile,resourceBudgetSha256:hash(budgetText),businessDatabaseId:'business-example',consumerId:'summary-credential-issuer',replicas:1,releaseTrustFile:trustFile,
   target:{cluster:targetCluster,expected,approval:fixtureReleaseApproval(context)},
   publisher:{signer:{algorithm:'HS256',fingerprint:hash(input.jwtSecret),keyFile,keyId:null},publishableKeyFile,outputFile:'/run/roomqc/summary/summary.json'}};
  const issuerConfig=await json('issuer.json',config),installerConfig=await json('installer.json',{...config,consumerId:'summary-credential-installer',publisher:null,
   business:{dsnFile:installerFile,expected:{...businessIdentity,role:names.installer}}});
  const rotationRaw={...config,consumerId:'summary-credential-rotation',replicas:2};
  const rotationInstaller=await json('rotation-installer.json',rotationRaw);
  const peerIssuerFile=await text('peer-issuer.dsn',dsn(names.otherIssuer,'postgres')),
   peerObserverFile=await text('peer-observer.dsn',dsn(names.otherObserver,database));
  const peerRaw={...rotationRaw,business:{dsnFile:peerIssuerFile,expected:{...businessIdentity,role:names.otherIssuer}},
   directory:{dsnFile:peerObserverFile,expected:{...directoryIdentity,role:names.otherObserver}}};
  const policy={version:1,instanceId:'owned-summary-rotation',installerConfigFile:rotationInstaller,journalDirectory:join(root,'journal'),
   ttlSeconds:600,overlapSeconds:10,rotateBeforeSeconds:540,intervalMs:1000};
  const policyFile=await json('rotation.json',policy);
  const preload=await text('identity-preload.mjs',`import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {captureBackendSourceBinding} from '/repository/scripts/control-backend-source-binding.mjs';
const status=await readFile('/proc/self/status','utf8');
const capEff=BigInt('0x'+status.match(/^CapEff:\\s+([a-f0-9]+)$/m)[1]).toString();
const source=await captureBackendSourceBinding('/repository');
assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);assert.equal(capEff,'0');assert.ok(!process.getgroups().includes(0));
assert.match(status,/^NoNewPrivs:\\s+1$/m);assert.equal(source.sha256,${JSON.stringify(input.cliSourceSha256)});
assert.ok((await readFile('/proc/self/mountinfo','utf8')).split('\\n').some(l=>{const p=l.split(' - ')[0].split(' ');return p[4]==='/repository'&&p[5].split(',').includes('ro')}));
await writeFile(process.env.ROOMQC_SUMMARY_IDENTITY,JSON.stringify({pid:process.pid,uid:process.getuid(),gid:process.getgid(),capEff,sourceSha256:source.sha256}),{flag:'wx',mode:0o600});`);
  const child=async(file,command,{rotation=false,instrument,continuous=false}={})=>{
   await takeOwnership(root);const witness=join(root,'identity-'+randomUUID()+'.json');
   if(instrument)assert(instrument.startsWith(root+'/')&&instrument.endsWith('-preload.mjs'));
   cliSpawns++;
   const p=spawn(process.execPath,['--import',preload,...(instrument?['--import',instrument]:[]),'/repository/scripts/'+(rotation?'control-summary-credential-rotation.mjs':'control-summary-credential.mjs'),
    '--config-file',file,...(rotation?(continuous?[]:['--once']):['--command-file',command]),'--allow-local'],
    {cwd:'/repository',uid,gid,env:{PATH:process.env.PATH,ROOMQC_SUMMARY_IDENTITY:witness},stdio:['ignore','pipe','pipe']});
   const h={process:p,output:'',exit:null};children.add(h);
   for(const s of [p.stdout,p.stderr])s.on('data',b=>{h.output+=b;if(h.output.length>65536)p.kill('SIGKILL')});
   p.on('error',()=>{h.startFailed=true});
   h.done=new Promise(resolve=>p.once('close',(code,signal)=>{h.exit={code,signal};children.delete(h);resolve(h.exit)}));
   h.finish=async()=>{await h.done;assert.equal(h.startFailed,undefined);
    const id=JSON.parse(await readFile(witness,'utf8'));assert.equal(id.pid,p.pid);assert.equal(id.uid,uid);assert.equal(id.capEff,'0');identities.push(id);
    const values=h.output.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));return {exit:h.exit,values,value:values.at(-1)}};
   return h;
  };
  const run=async(file,command,options)=>{
   const h=await child(file,command,options);await until(()=>h.exit,'cli');const result=await h.finish();
   if(result.exit.code!==0)console.error(JSON.stringify({event:'summary_cli_native_refusal',
    code:/^[A-Z_]{1,100}$/.test(result.value?.code??'')?result.value.code:null}));
   return result;
  };
  const checkFile=await json('check.json',{version:1,operation:'check'}),beforeCheck=await state();
  const previousRelease=await run(issuerConfig,checkFile);assert.equal(previousRelease.exit.code,1);
  assert.equal(previousRelease.value.code,'SUMMARY_INSTALLER_TARGET_CHANGED');
  assert.equal(await state(),beforeCheck);check('CLI rejects managed state from a different release before explicit rebind');
  const binding=summaryMaintenanceBinding(targetCluster,expected),current=(await db.query(`SELECT m.version,a.cluster_id,a.binding_sha256
   FROM private.tenant_summary_management m JOIN private.tenant_summary_authority a USING(singleton)`)).rows[0];
  const base=(operation,version)=>({version:1,operation,key:randomUUID(),requestId:randomUUID(),reason:'Owned summary CLI acceptance',expectedVersion:version,
   clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint});
  const bind={...base('bind',Number(current.version)),expectedClusterId:current.cluster_id,expectedBindingSha256:current.binding_sha256};
  const bound=await run(installerConfig,await json('bind.json',bind));assert.equal(bound.exit.code,0);
  check('dedicated installer CLI binds approved summary authority');
  const checked=await run(issuerConfig,checkFile);assert.equal(checked.exit.code,0,'SUMMARY_CLI_PREFLIGHT_'+(checked.value?.code??'UNKNOWN'));
  assert.equal(checked.value.preflightVerified,true);check('actual nonroot CLI verifies physical database and signed live directory release');
  const issue={...base('issue',bound.value.stateVersion),predecessorId:null,ttlSeconds:120,overlapSeconds:10,signerAlgorithm:'HS256',signerFingerprint:hash(input.jwtSecret)};
  const issueFile=await json('issue.json',issue),lost=wire.arm('issue','drop'),unknown=await run(issuerConfig,issueFile);
  assert.equal(unknown.exit.code,1);assert.equal(unknown.value.code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');assert.equal(lost.observed,true);assert.equal(lost.idle,true);
  const committed=await state(),replayed=await run(issuerConfig,issueFile);assert.equal(replayed.exit.code,0);assert.equal(await state(),committed);
  assert.equal(replayed.value.filePublished,true);assert.equal(replayed.value.nativeRpcVerified,true);
  check('committed response loss replays original CLI key and publishes through actual REST without duplicate issue');
  const publishedBefore=await readFile(config.publisher.outputFile,'utf8');
  const conflict=await run(issuerConfig,await json('issue-conflict.json',{...issue,reason:issue.reason+' changed'}));
  assert.equal(conflict.exit.code,1);assert.equal(conflict.value.code,'SUMMARY_INSTALLER_COMMAND_CONFLICT');assert.equal(await state(),committed);
  assert.equal(await readFile(config.publisher.outputFile,'utf8'),publishedBefore);check('changed command body cannot replace committed credential or output');
  const held=wire.arm('rotate','hold'),daemon=await child(policyFile,null,{rotation:true});
  await until(()=>held.observed,'daemon_commit');assert.equal(held.idle,true);
  const afterDaemonCommit=await state();daemon.process.kill('SIGKILL');await daemon.finish();
  const recovered=await run(policyFile,null,{rotation:true});assert.equal(recovered.exit.code,0);
  assert.equal(recovered.value.action,'rotated');assert.equal(await state(),afterDaemonCommit);
  assert.equal(recovered.value.commandId,(await db.query('SELECT key::text FROM private.tenant_summary_commands ORDER BY created_at DESC LIMIT 1')).rows[0].key);
  assert.notEqual(await readFile(config.publisher.outputFile,'utf8'),publishedBefore);
  check('real rotation daemon resumes durable pending command after SIGKILL following DB commit');
  const idle=await run(policyFile,null,{rotation:true});assert.equal(idle.exit.code,0);assert.equal(idle.value.action,'idle');
  assert.equal(await state(),afterDaemonCommit);check('restarted daemon observes current head without an extra rotation');
  const continuous=await child(policyFile,null,{rotation:true,continuous:true});
  const status=async path=>{
   const response=await fetch('http://127.0.0.1:8097'+path,{signal:AbortSignal.timeout(2000)});
   return {http:response.status,body:await response.json()};
  };
  await until(async()=>{try{return (await status('/readyz')).http===200}catch{return false}},'continuous_ready');
  const resourceBefore=(await status('/livez')).body.resources;
  assert.equal(resourceBefore.schemaVersion,2);assert.equal(resourceBefore.budgetSha256,config.resourceBudgetSha256);
  assert.equal(resourceBefore.configurationSha256,summaryResourceConfigurationHash(policy,rotationRaw));
  assert.deepEqual(resourceBefore.databases.map(d=>d.databaseId),['directory-example','business-example']);
  assert(resourceBefore.databases.every(d=>d.consumers[0].id==='summary-credential-rotation'&&d.consumers[0].pools[0].max===1));
  assert.doesNotMatch(JSON.stringify(resourceBefore),/dsnFile|keyFile|postgresql|signer/);
  check('continuous actual daemon serves cached dual-database profile and ready200 after native SQL authority check');
  const policyOriginal=await readFile(policyFile,'utf8'),beforePolicyDrift=await state();
  await writeFile(policyFile,JSON.stringify({...policy,instanceId:'changed-native-summary-instance'})+'\n');
  await until(async()=>{const s=await status('/readyz');return s.http===503&&s.body.ready===false},'continuous_policy_drift');
  const driftLive=await status('/livez');assert.equal(driftLive.http,200);assert.deepEqual(driftLive.body.resources,resourceBefore);
  assert.equal(await state(),beforePolicyDrift);
  check('changed mounted policy closes actual rotation readiness but cannot change cached resource profile or database state');
  await writeFile(policyFile,policyOriginal);
  await until(async()=>(await status('/readyz')).http===200,'continuous_policy_recovery');
  assert.deepEqual((await status('/livez')).body.resources,resourceBefore);assert.equal(await state(),beforePolicyDrift);
  continuous.process.kill('SIGTERM');await until(()=>continuous.exit,'continuous_shutdown');
  const drained=await continuous.finish();assert.equal(drained.exit.code,0);
  await assert.rejects(()=>status('/livez'));
  check('restored policy recovers readiness without restart and SIGTERM closes endpoint after draining');
  const mounted=await runSummaryMountedReadChecks({input,db,config,root,names,run,json,issuerConfig,installerConfig,base,issue,until,check,cluster});
  await runSummaryContentionChecks({db,maintenance,directory,config,rotationRaw,peerRaw,root,names,wire,child,run,json,text,until,state,check});
  const beforeWithdrawal=await state();
  await directory.query("UPDATE roomqc_control.release_authority SET state='withdrawn' WHERE cluster_id=$1",[cluster.id]);
  const outputBeforeWithdrawal=await readFile(config.publisher.outputFile,'utf8'),withdrawn=await run(issuerConfig,checkFile);
  assert.equal(withdrawn.exit.code,1);assert.equal(withdrawn.value.code,'SUMMARY_INSTALLER_AUTHORITY_CHANGED');
  assert.equal(await state(),beforeWithdrawal);
  assert.equal(await readFile(config.publisher.outputFile,'utf8'),outputBeforeWithdrawal);
  assert.equal(mounted.instanceId,(await fetch('http://127.0.0.1:8096/observation').then(r=>r.json())).instanceId);
  check('live directory release withdrawal blocks new CLI use and preserves business credential state');
  assert(identities.length===cliSpawns&&cliSpawns>=9&&identities.every(i=>i.uid===uid&&i.gid===gid&&i.capEff==='0'&&i.sourceSha256===input.cliSourceSha256));
  check('every actual CLI and daemon runs nonroot without capabilities from exact read-only source');
  return checks;
 }finally{
  for(const h of [...children]){h.process.kill('SIGKILL');await h.done}
  try{await fetch('http://127.0.0.1:8096/stop',{method:'POST',signal:AbortSignal.timeout(2000)})}catch{}
  await wire?.close();await directory?.end();
  // The disposable business fixture had no release row before this helper.
  if(created)await db.query('DELETE FROM private.roomqc_release_manifest WHERE singleton');
  if(created)await maintenance.query('DROP DATABASE '+database);
  if(baselineRoles){
   const roles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),added=roles.filter(n=>!baselineRoles.includes(n));
   assert(added.every(n=>[...directoryRoles,...Object.values(names)].includes(n)),'SUMMARY_CLI_EXACT_ROLE_CLEANUP');
   for(const name of added)await maintenance.query('DROP ROLE '+name);
   assert.deepEqual((await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),baselineRoles);
  }
  if(root){assert.equal(dirname(root),'/tmp');assert(root.startsWith('/tmp/roomqc-summary-cli-'+input.run+'-'));await rm(root,{recursive:true,force:true})}
 }
}
