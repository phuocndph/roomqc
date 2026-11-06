// Owned local DBs, real CLI processes and native REST; release signer is a
// labelled fixture. This does not attest production keys, rotation or VPS.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {lstatSync,readdirSync,chownSync,chmodSync,readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from '../migrate.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrustRaw,seedFixtureReleaseAuthority} from '../release-test-fixtures.mjs';
import {recoveryBinding} from '../setup-recovery.mjs';
import {runInstallerPreflightFaults,runInstallerPublicationFences} from './setup-installer-fences-native.mjs';
import {installInstallerRollbackFixture,runInstallerRollbackFaults,runInstallerKeyWithdrawal} from './setup-installer-transaction-native.mjs';
import {createInstallerPgProxy} from './setup-installer-pg-proxy.mjs';
import {runInstallerDeadlineFaults} from './setup-installer-deadline-native.mjs';
import {runInstallerFilesystemKills} from './setup-installer-filesystem-native.mjs';
import {runInstallerNonrootPermissions} from './setup-installer-nonroot-native.mjs';
import {runInstallerVolumeFaults} from './setup-installer-volume-native.mjs';
import {runSetupRotationNativeChecks} from './setup-rotation-native.mjs';
import {runSetupRotationFaultsNativeChecks} from './setup-rotation-faults-native.mjs';
import {runSetupRotationDurabilityNativeChecks} from './setup-rotation-durability-native.mjs';
import {runSetupRotationStorageNativeChecks} from './setup-rotation-storage-native.mjs';
import {runSetupRotationContentionNativeChecks} from './setup-rotation-contention-native.mjs';
import {setupMountRpcRelay,runSetupRuntimeMountNativeChecks} from './setup-runtime-mount-native.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function until(read,label,timeout=60000){
 const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(value)return value;await new Promise(r=>setTimeout(r,20))}
 throw new Error('INSTALLER_NATIVE_TIMEOUT_'+label);
}

export async function runSetupInstallerNativeChecks({input,db,maintenance,recoveryCluster,snapshot,record}){
 assert.match(input.run,/^[a-f0-9]{12}$/);
 const database='roomqc_installer_'+input.run,names={issuer:'ins_issue_'+input.run,issuerOther:'ins_other_'+input.run,
  installer:'ins_bind_'+input.run,observer:'ins_observe_'+input.run,observerOther:'ins_watch_'+input.run,
  api:'ins_api_'+input.run,worker:'ins_worker_'+input.run,service:'ins_service_'+input.run,
  anonymous:'ins_anon_'+input.run,authenticated:'ins_auth_'+input.run};
 const password=randomBytes(32).toString('hex'),checks=[],kills=[],barriers=[],children=new Set();
 let directory,root,wire,created=false,baselineRoles,result,rollbackFixture,identityPreload,mountRelay;
 const cliUid=input.nonrootFilesystem===true?10001:process.getuid(),cliGid=input.nonrootFilesystem===true?10001:process.getgid();
 const cliIdentities=[];let cliSpawns=0;
 const preparePrivateFixture=()=>{
  assert.equal(dirname(root),'/tmp');assert.ok(root.startsWith('/tmp/roomqc-installer-'+input.run+'-'));
  const walk=path=>{const info=lstatSync(path);if(info.isSymbolicLink())return;
   if(info.uid===0)chownSync(path,cliUid,cliGid);
   if(info.isDirectory())for(const name of readdirSync(path))walk(join(path,name));
  };walk(root);
 };
 const check=(label,condition=true)=>{
  assert.ok(condition,'INSTALLER_NATIVE_'+label);checks.push({label,passed:true});record('installer-'+label);
  // Safe harness progress on stderr; stdout remains the final JSON packet.
  console.error(JSON.stringify({event:'installer_native_check',label}));
 };
 const businessState=async()=>(await db.query(`SELECT jsonb_build_object(
  'authority',(SELECT jsonb_agg(to_jsonb(t)) FROM private.setup_recovery_authority t),
  'management',(SELECT jsonb_agg(to_jsonb(t)) FROM private.setup_recovery_management t),
  'credentials',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.setup_recovery_credentials t),
  'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY key) FROM private.setup_recovery_commands t),
  'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_key) FROM private.setup_recovery_credential_audit t)) AS value`)).rows[0].value;
 const child=(config,command,{preload,rotation=false,once=false}={})=>{
  // Private fixture instrumentation only; never forwarded by the product CLI.
  if(preload)assert.ok(root&&preload.startsWith(root+'/')&&preload.endsWith('-preload.mjs'));
  let witness;
  if(input.nonrootFilesystem===true){preparePrivateFixture();witness=join(root,'identity-'+randomUUID()+'.json');cliSpawns++}
  const p=spawn(process.execPath,[...(identityPreload?['--import',identityPreload]:[]),...(preload?['--import',preload]:[]),
   '/repository/scripts/'+(rotation?'control-setup-credential-rotation.mjs':'control-setup-credential.mjs'),'--config-file',config,
   ...(rotation?once?['--once']:[]:['--command-file',command]),'--allow-local'],
   {cwd:'/repository',env:{PATH:process.env.PATH,...(witness?{ROOMQC_PRIVATE_TEST_IDENTITY:witness}:{})},
    ...(witness?{uid:cliUid,gid:cliGid}:{}),stdio:['ignore','pipe','pipe']});
  const h={process:p,output:'',exit:null};children.add(h);
  for(const stream of [p.stdout,p.stderr])stream.on('data',b=>{h.output+=b;if(h.output.length>65536)p.kill('SIGKILL')});
  p.on('error',()=>{h.output+='OWNED_START_FAILED'});
  h.done=new Promise(r=>p.once('close',(code,signal)=>{
   if(witness)try{const value=JSON.parse(readFileSync(witness,'utf8'));assert.equal(value.uid,cliUid);assert.equal(value.gid,cliGid);
    assert.equal(value.pid,p.pid);assert.equal(value.capEff,'0');assert.equal(value.noNewPrivileges,true);assert.equal(value.readOnlySource,true);
    assert.equal(value.sourceSha256,input.cliSourceSha256);assert.ok(!value.groups.includes(0));cliIdentities.push(value);
   }catch{h.identityError='INSTALLER_NATIVE_IDENTITY_NOT_VERIFIED'}
   h.exit={code,signal};children.delete(h);r(h.exit);
  }));return h;
 };
 const run=async(config,command)=>{
  const h=child(config,command);await until(()=>h.exit,'cli');assert.equal(h.identityError,undefined);let value;
  try{value=JSON.parse(h.output.trim())}catch{throw new Error('INSTALLER_NATIVE_CLI_OUTPUT_INVALID')}
  if(h.exit.code!==0)console.error(JSON.stringify({event:'installer_native_cli_failed',code:value?.code??null,output:h.output.slice(-2000),value}));
  return {exit:h.exit,value};
 };
 const beforeBusiness=await snapshot();
 try{
  root=await mkdtemp('/tmp/roomqc-installer-'+input.run+'-');await mkdir(join(root,'runtime'),{mode:0o700});
  if(input.runtimeMountOnly===true){
   assert.equal(input.nonrootFilesystem,true);
   for(const path of ['/worker-input','/run/roomqc/setup']){assert.equal(lstatSync(path).isSymbolicLink(),false);chownSync(path,cliUid,cliGid);chmodSync(path,0o700)}
   mountRelay=await setupMountRpcRelay();
  }
  const text=async(name,value)=>{const file=join(root,name);await writeFile(file,value,{flag:'wx',mode:0o600});return file};
  const json=(name,value)=>text(name,JSON.stringify(value)+'\n');
  if(input.nonrootFilesystem===true){
   identityPreload=await text('identity-preload.mjs',`import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
import {captureBackendSourceBinding} from '/repository/scripts/control-backend-source-binding.mjs';
const status=await readFile('/proc/self/status','utf8'),capEff=BigInt('0x'+status.match(/^CapEff:\\s+([a-f0-9]+)$/m)[1]).toString();
assert.equal(process.getuid(),10001);assert.equal(process.getgid(),10001);assert.equal(capEff,'0');assert.ok(!process.getgroups().includes(0));
const noNewPrivileges=/^NoNewPrivs:\\s+1$/m.test(status);assert.equal(noNewPrivileges,true);
const readOnlySource=(await readFile('/proc/self/mountinfo','utf8')).split('\\n').some(l=>{const p=l.split(' - ')[0].split(' ');return p[4]==='/repository'&&p[5].split(',').includes('ro')});assert.equal(readOnlySource,true);
const source=await captureBackendSourceBinding('/repository');assert.equal(source.sha256,${JSON.stringify(input.cliSourceSha256)});
await writeFile(process.env.ROOMQC_PRIVATE_TEST_IDENTITY,JSON.stringify({pid:process.pid,uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),capEff,noNewPrivileges,readOnlySource,sourceSha256:source.sha256}),{flag:'wx',mode:0o600});`);
  }
  baselineRoles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
  await maintenance.query('CREATE DATABASE '+database);created=true;
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:12000});
  const manifest=await migrationManifest(),prefix=manifest.slice(0,-1),prefixPath=join(root,'prefix');await mkdir(prefixPath,{mode:0o700});
  for(const entry of prefix)await writeFile(join(prefixPath,entry.version),entry.sql,{mode:0o600});
  const upgrade=await migrateDirectory(directory,{location:pathToFileURL(prefixPath+'/')});
  assert.equal(upgrade.applied.length,manifest.length-1);
  const cluster={...recoveryCluster,hostId:recoveryCluster.id,inventoryRef:recoveryCluster.id,credentialRef:recoveryCluster.credentialRef??recoveryCluster.id,
   internalUrl:recoveryCluster.internalUrl??null,approvedAddresses:recoveryCluster.approvedAddresses??[],
   publishableKey:input.publishableKey,vapidPublicKey:'owned-installer',maxWorkspaces:99};
  if(mountRelay)cluster.internalUrl=mountRelay.url;
  await importInitialRegistry(directory,[cluster]);
  await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[cluster.hostId]);
  await directory.query('UPDATE roomqc_control.clusters SET host_id=$1,inventory_ref=$2 WHERE id=$3',[cluster.hostId,cluster.inventoryRef,cluster.id]);
  const population=(await directory.query('SELECT count(*)::int AS n FROM roomqc_control.clusters')).rows[0].n;
  const migrated=await migrateDirectory(directory);assert.equal(migrated.applied.length,1);
  assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.clusters')).rows[0].n,population);
  assert.equal((await migrateDirectory(directory)).applied.length,0);check('populated-directory-prefix-to-final-and-rerun-preserve-cluster');
  const capabilities={issuer:'roomqc_setup_credential_issuer',issuerOther:'roomqc_setup_credential_issuer',installer:'roomqc_setup_credential_installer',
   observer:'roomqc_control_setup_credential_observer',observerOther:'roomqc_control_setup_credential_observer',api:'roomqc_control_api',
   worker:'roomqc_control_setup_runtime',service:'service_role',anonymous:'anon',authenticated:'authenticated'};
  for(const [kind,name]of Object.entries(names))await maintenance.query('CREATE ROLE '+name+' LOGIN INHERIT CONNECTION LIMIT 1 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \''+password+'\' IN ROLE '+capabilities[kind]);
  const permissions=(await directory.query(`SELECT
   has_table_privilege($1,'roomqc_control.workspaces','SELECT') AS workspace_read,
   has_table_privilege($1,'roomqc_control.clusters','INSERT') AS cluster_insert,
   has_table_privilege($1,'roomqc_control.release_authority','UPDATE') AS authority_update,
   has_column_privilege($1,'roomqc_control.clusters','credential_ref','SELECT') AS target_read`,[names.observer])).rows[0];
  check('observer-only-reads-target-authority-with-no-workspace-read-or-writes',permissions.workspace_read===false&&permissions.cluster_insert===false&&permissions.authority_update===false&&permissions.target_read===true);
  rollbackFixture=await installInstallerRollbackFixture(maintenance);
  const fingerprint=(await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value;
  const expected={clusterId:cluster.id,releaseId:'owned-installer-native',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
   migrationSetHash:'3'.repeat(64),schemaManifestHash:fingerprint};
  await db.query(`INSERT INTO private.roomqc_release_manifest(cluster_id,release_id,contract_version,schema_fingerprint_version,
   artifact_digest,frontend_artifact_digest,migration_set_hash,expected_schema_hash) VALUES($1,$2,3,3,$3,$4,$5,$6)`,
   [cluster.id,expected.releaseId,expected.artifactDigest,expected.frontendArtifactDigest,expected.migrationSetHash,fingerprint]);
  const context=fixtureReleaseContext(cluster,expected);await seedFixtureReleaseAuthority(directory,context);
  wire=await createInstallerPgProxy();
  const dbIdentity=async(pool,name,role)=>{const row=(await pool.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid"
   FROM pg_control_system() s JOIN pg_database d ON d.datname=current_database()`)).rows[0];return {...row,databaseName:name,role}};
  const dirIdentity=await dbIdentity(directory,database,names.observer),businessIdentity=await dbIdentity(maintenance,'postgres',names.issuer);
  const dsn=(role,name)=>'postgresql://'+role+':'+password+'@127.0.0.1:'+wire.port+'/'+name+'?sslmode=disable';
  const directoryFile=await text('directory.dsn',dsn(names.observer,database)),issuerFile=await text('issuer.dsn',dsn(names.issuer,'postgres')),
   installerFile=await text('installer.dsn',dsn(names.installer,'postgres'));
  const trustFile=await json('trust.json',fixtureReleaseTrustRaw),keyFile=await text('signer',input.jwtSecret),publishableKeyFile=await text('publishable',input.publishableKey);
  const budget=JSON.parse(await readFile('/repository/deploy/control-resource-budget.example.json','utf8'));budget.environment='local';
  if(input.runtimeMountOnly===true){const consumer=budget.databases.find(d=>d.kind==='directory').consumers.find(c=>c.id==='provisioning-worker');consumer.replicas=1;consumer.pools[0].max=1}
  for(const d of budget.databases)for(const id of ['setup-credential-issuer','setup-credential-installer','setup-credential-rotation'])
   d.consumers.push({id,replicas:id==='setup-credential-installer'?1:2,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  const budgetText=JSON.stringify(budget)+'\n',resourceBudgetFile=await text('budget.json',budgetText);
  const config={version:1,environment:'local',business:{dsnFile:issuerFile,expected:businessIdentity},directory:{dsnFile:directoryFile,expected:dirIdentity},
   resourceBudgetFile,resourceBudgetSha256:hash(budgetText),businessDatabaseId:'business-example',consumerId:'setup-credential-issuer',replicas:2,releaseTrustFile:trustFile,
   target:{cluster:Object.fromEntries(['id','hostId','inventoryRef','credentialRef','url','internalUrl','approvedAddresses'].map(k=>[k,cluster[k]])),expected,approval:fixtureReleaseApproval(context)},
   publisher:{signer:{algorithm:'HS256',fingerprint:hash(input.jwtSecret),keyFile,keyId:null},publishableKeyFile,outputFile:input.runtimeMountOnly===true?'/run/roomqc/setup/credential.json':join(root,'runtime','credential.json')}};
  const installerRaw={...config,consumerId:'setup-credential-installer',replicas:1,publisher:null,
   business:{dsnFile:installerFile,expected:{...businessIdentity,role:names.installer}}};
  const issuerConfig=await json('issuer.json',config),installerConfig=await json('installer.json',installerRaw);
  const otherIssuerFile=await text('issuer-other.dsn',dsn(names.issuerOther,'postgres')),
   otherObserverFile=await text('observer-other.dsn',dsn(names.observerOther,database));
  const otherConfig=await json('issuer-other.json',{...config,business:{dsnFile:otherIssuerFile,expected:{...businessIdentity,role:names.issuerOther}},
   directory:{dsnFile:otherObserverFile,expected:{...dirIdentity,role:names.observerOther}}});
  const fileRpc=async()=>{
   const value=JSON.parse(await readFile(config.publisher.outputFile,'utf8'));
   const response=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
    headers:{apikey:value.publishableKey,authorization:'Bearer '+value.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
    body:JSON.stringify({p_workspace_id:randomUUID()})});await response.text();return response.status;
  };
  // Read with the actual bounded LOGIN before starting its CLI. On failure,
  // print only comparison flags, never the private projection or connection.
  const preflightReader=new pg.Client({host:'db',database:'postgres',user:names.issuer,password,
   options:'-c default_transaction_read_only=on',statement_timeout:20000});
  let nativePreflight;
  try{await preflightReader.connect();nativePreflight=(await preflightReader.query('SELECT roomqc_setup_admin.preflight() AS value')).rows[0].value}
  finally{await preflightReader.end()}
  const comparisons={capability:nativePreflight.capability==='issuer',memberships:nativePreflight.memberships===1,
   fingerprintVersion:nativePreflight.schemaFingerprintVersion===3,liveFingerprint:nativePreflight.schemaManifestHash===fingerprint,
   contract:nativePreflight.manifest?.contractVersion===3,manifestFingerprintVersion:nativePreflight.manifest?.schemaFingerprintVersion===3,
   expectedFingerprint:nativePreflight.manifest?.expectedSchemaManifestHash===fingerprint,
   manifestFields:Object.entries(expected).every(([k,v])=>k==='schemaManifestHash'||nativePreflight.manifest?.[k]===v)};
  if(Object.values(comparisons).some(v=>!v))console.error(JSON.stringify({event:'installer_fixture_preflight_comparisons',comparisons}));
  const checkFile=await json('check.json',{version:1,operation:'check'});
  const stateBefore=await businessState(),preflight=await run(issuerConfig,checkFile);
  assert.equal(preflight.exit.code,0,'INSTALLER_NATIVE_PREFLIGHT_'+(preflight.value.code??'UNKNOWN'));assert.equal(preflight.exit.signal,null);
  assert.equal(preflight.value.preflightVerified,true);
  assert.deepEqual(await businessState(),stateBefore);check('actual-read-only-cli-preflight-matches-physical-identity-capability-and-release');
  const binding=recoveryBinding(cluster,expected),state=(await db.query(`SELECT m.version,a.cluster_id,a.binding_sha256
   FROM private.setup_recovery_management m LEFT JOIN private.setup_recovery_authority a ON a.singleton=m.singleton WHERE m.singleton`)).rows[0];
  const base=(operation,version)=>({version:1,operation,key:randomUUID(),requestId:randomUUID(),reason:'Owned native installer check',expectedVersion:version,
   clusterId:cluster.id,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint});
  const denied=async(label,bad,commandFile)=>{
   const before=await businessState(),file=await json('denied-'+checks.length+'.json',bad),r=await run(file,commandFile);
   assert.equal(r.exit.code,1);assert.equal(r.value.ok,false);assert.deepEqual(await businessState(),before);check(label);
  };
  const bind=base('bind',Number(state.version));bind.expectedClusterId=state.cluster_id;bind.expectedBindingSha256=state.binding_sha256;
  const bindFile=await json('bind.json',bind),bindDrop=wire.arm('bind','drop'),bindUnknown=await run(installerConfig,bindFile);
  check('bind-committed-response-loss-preserves-bind-and-original-key',bindDrop.observed&&bindDrop.idle&&bindUnknown.exit.code===1
   &&bindUnknown.value.code==='SETUP_INSTALLER_OUTCOME_UNKNOWN'&&bindUnknown.value.recovery.operation==='bind'&&bindUnknown.value.recovery.key===bind.key);
  const boundState=await businessState(),bound=await run(installerConfig,bindFile);assert.equal(bound.exit.code,0);
  assert.deepEqual(await businessState(),boundState);assert.equal(bound.value.stateVersion,bind.expectedVersion+1);
  await assert.rejects(()=>lstat(config.publisher.outputFile),{code:'ENOENT'});
  check('actual-installer-cli-binds-with-durable-receipt',bound.value.operation==='bind'&&bound.value.historicalResult===true&&bound.value.currentCredentialReady===false);
  const bindConflict=await run(installerConfig,await json('bind-conflict.json',{...bind,reason:bind.reason+' changed'}));
  assert.deepEqual(await businessState(),boundState);
  check('bind-body-conflict-keeps-original-receipt-and-state',bindConflict.exit.code===1&&bindConflict.value.code==='SETUP_INSTALLER_COMMAND_CONFLICT');
  const issue={...base('issue',bound.value.stateVersion),predecessorId:null,ttlSeconds:input.volumeOnly===true||input.rotationStorageOnly===true||input.rotationContentionOnly===true?1800:120,overlapSeconds:10,signerAlgorithm:'HS256',signerFingerprint:hash(input.jwtSecret)};
  const issueFile=await json('issue.json',issue);
  if(input.runtimeMountOnly===true){
   const seeded=await run(issuerConfig,issueFile);assert.equal(seeded.exit.code,0);
   const runtimeMount=await runSetupRuntimeMountNativeChecks({input,db,directory,config,context,budget,dsn,names,
    seeded:seeded.value,issue,base,json,run,issuerConfig,installerConfig,until,root,check,relay:mountRelay});
   assert.deepEqual(await snapshot(),beforeBusiness);assert.equal(cliIdentities.length,cliSpawns);
   result={verified:true,scope:'runtime-mount-only',checks,runtimeMount,actualCliProcesses:true,actualPostgres:true,actualRest:true,
    cliIdentity:{verified:true,spawns:cliSpawns,witnesses:cliIdentities,fixturePreparationParentUid:process.getuid(),parentIsProductCli:false},
    runtimeMountReloadVerified:true,fullFaultMatrixVerified:false,crossDatabaseActorRevocationVerified:false,productAccepted:false};
   return result;
  }
  if(input.rotationOnly===true){
   assert.equal(input.nonrootFilesystem,true);
   const seeded=await run(issuerConfig,issueFile);assert.equal(seeded.exit.code,0);
   const rotation=await (input.rotationContentionOnly===true?runSetupRotationContentionNativeChecks:input.rotationStorageOnly===true?runSetupRotationStorageNativeChecks:input.rotationDurabilityOnly===true?runSetupRotationDurabilityNativeChecks:input.rotationFaultsOnly===true?runSetupRotationFaultsNativeChecks:runSetupRotationNativeChecks)({input,db,maintenance,directory,config,otherConfig,
    otherRaw:{...config,business:{dsnFile:otherIssuerFile,expected:{...businessIdentity,role:names.issuerOther}},
     directory:{dsnFile:otherObserverFile,expected:{...dirIdentity,role:names.observerOther}}},
    seeded:seeded.value,issue,base,json,text,child,run,until,wire,businessState,check,root,installerConfig,names});
   assert.deepEqual(await snapshot(),beforeBusiness);assert.equal(cliIdentities.length,cliSpawns);
   result={verified:true,scope:'rotation-only',checks,rotation,actualCliProcesses:true,actualPostgres:true,actualRest:true,
    cliIdentity:{verified:true,spawns:cliSpawns,witnesses:cliIdentities,fixturePreparationParentUid:process.getuid(),parentIsProductCli:false},
    rotationDaemonVerified:true,runtimeMountReloadVerified:false,fullFaultMatrixVerified:false,productAccepted:false};
   return result;
  }
  if(input.volumeOnly===true){
   assert.equal(input.nonrootFilesystem,true);assert.equal(input.realFilesystemFaults,true);
   const issued=await run(issuerConfig,issueFile),safeCode=/^(?:SETUP_INSTALLER|SETUP_PUBLICATION)_[A-Z_]{1,64}$/.test(issued.value.code??'')?issued.value.code:'UNKNOWN';
   assert.equal(issued.exit.code,0,'INSTALLER_VOLUME_SEED_'+safeCode);assert.equal(issued.value.nativeRpcVerified,true);
   const volumeFaults=await runInstallerVolumeFaults({input,db,maintenance,directory,config,json,text,child,until,businessState,names,check,root,cliUid,cliGid});
   assert.deepEqual(await snapshot(),beforeBusiness);assert.equal(cliIdentities.length,cliSpawns);
   result={verified:true,scope:'volume-only',checks,volumeFaults,actualCliProcesses:true,actualPostgres:true,actualRest:true,
    cliIdentity:{verified:true,spawns:cliSpawns,witnesses:cliIdentities,fixturePreparationParentUid:process.getuid(),parentIsProductCli:false},
    faultGroupsVerified:['IF15'],fullFaultMatrixVerified:false,nonrootPermissionMatrixVerified:false,
    rotationDaemonVerified:false,runtimeMountReloadVerified:false,productAccepted:false};
   return result;
  }
  await denied('wrong-physical-database-identity-denied-before-effects',{...config,business:{...config.business,expected:{...businessIdentity,databaseOid:'1'}}},issueFile);
  await denied('unsigned-config-expectation-substitution-denied-before-effects',{...config,target:{...config.target,expected:{...expected,releaseId:'substituted'}}},issueFile);
  await denied('wrong-budget-digest-denied-before-effects',{...config,resourceBudgetSha256:'f'.repeat(64)},issueFile);
  const preflightFaults=await runInstallerPreflightFaults({config,installerRaw,issueFile,json,text,run,businessState,maintenance,db,fingerprint,
   budget,hash,check,names,directory,input,context,database,password,denialNames:Object.fromEntries(['api','worker','service','anonymous','authenticated'].map(k=>[k,names[k]]))});
  const keyWithdrawal=await runInstallerKeyWithdrawal({directory,config,context,json,run,issueFile,checkFile,businessState,check,names,password,database});
  const lost=wire.arm('issue','drop'),unknown=await run(issuerConfig,issueFile);
  check('actual-tcp-response-loss-at-idle-readyforquery-after-issue-commit',lost.observed&&lost.idle&&unknown.exit.code===1
   &&unknown.value.code==='SETUP_INSTALLER_OUTCOME_UNKNOWN'&&unknown.value.recovery.operation==='issue'&&unknown.value.recovery.key===issue.key);
  // Inspect the immutable command only via privileged fixture assertions;
  // CLI reads its receipt using the actual caller-scoped SQL function.
  const id=(await db.query('SELECT (result->>\'credentialId\') AS id FROM private.setup_recovery_commands WHERE key=$1',[issue.key])).rows[0].id;
  const issued=await run(issuerConfig,issueFile);assert.equal(issued.exit.code,0);
  check('same-command-replay-publishes-committed-credential-and-native-rpc',issued.value.credentialId===id&&issued.value.filePublished===true&&issued.value.nativeRpcVerified===true);
  const published=await readFile(config.publisher.outputFile,'utf8'),beforeReplay=await businessState();
  const issueConflict=await run(issuerConfig,await json('issue-conflict.json',{...issue,reason:issue.reason+' changed'}));
  assert.deepEqual(await businessState(),beforeReplay);assert.equal(await readFile(config.publisher.outputFile,'utf8'),published);
  check('issue-body-conflict-cannot-change-credential-or-file',issueConflict.exit.code===1&&issueConflict.value.code==='SETUP_INSTALLER_COMMAND_CONFLICT');
  const callerConflict=await run(otherConfig,issueFile);assert.deepEqual(await businessState(),beforeReplay);
  check('different-issuer-cannot-replay-another-callers-command',callerConflict.exit.code===1&&callerConflict.value.code==='SETUP_INSTALLER_COMMAND_CONFLICT'
   &&callerConflict.value.credentialId===undefined);
  const publishFile=await json('publish.json',{version:1,operation:'publish',key:issue.key});assert.equal((await run(issuerConfig,publishFile)).exit.code,0);
  assert.deepEqual(await businessState(),beforeReplay);assert.equal(await readFile(config.publisher.outputFile,'utf8'),published);
  check('publish-replay-reuses-exact-file-and-never-extends-db-expiry');
  const otherPublish=await run(otherConfig,publishFile);assert.deepEqual(await businessState(),beforeReplay);
  assert.equal(await readFile(config.publisher.outputFile,'utf8'),published);
  check('caller-scoped-publish-cannot-read-or-publish-another-issuers-receipt',otherPublish.exit.code===1&&otherPublish.value.credentialId===undefined);
  assert.equal((await lstat(config.publisher.outputFile)).mode&0o777,0o600);check('actual-linux-output-is-private-and-separated-from-inputs');
  const publicationFences=await runInstallerPublicationFences({root,config,issue,published,json,run,child,until,wire,businessState,directory,check,barriers,context});
  const revokeCommand={...base('revoke',bound.value.stateVersion+1),credentialId:id},revokeFile=await json('revoke.json',revokeCommand),
   revokeDrop=wire.arm('revoke','drop'),revokeUnknown=await run(installerConfig,revokeFile);
  check('revoke-committed-response-loss-preserves-revoke-and-original-key',revokeDrop.observed&&revokeDrop.idle&&revokeUnknown.exit.code===1
   &&revokeUnknown.value.code==='SETUP_INSTALLER_OUTCOME_UNKNOWN'&&revokeUnknown.value.recovery.operation==='revoke'&&revokeUnknown.value.recovery.key===revokeCommand.key);
  const revokedState=await businessState(),revoked=await run(installerConfig,revokeFile);assert.deepEqual(await businessState(),revokedState);
  assert.equal(revoked.exit.code,0);const status=await run(issuerConfig,checkFile);
  check('actual-revoke-and-check-do-not-replay-historical-readiness',status.value.credentialReady===false&&status.value.reasonCode==='CREDENTIAL_REVOKED'&&await fileRpc()===403);
  const deadIssue={...issue,...base('issue',revoked.value.stateVersion),predecessorId:id},deadFile=await json('kill-issue.json',deadIssue),held=wire.arm('issue','hold'),handle=child(issuerConfig,deadFile);
  await until(()=>held.observed,'postcommit-barrier');assert.equal(held.idle,true);barriers.push({phase:'issue-postcommit-response-held',observed:true});
  // Freeze this real process so its four-second query timer cannot turn a
  // contention test into an accidental transport-timeout test on a slow host.
  assert.equal(handle.process.kill('SIGSTOP'),true);
  await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+handle.process.pid+'/status','utf8')),'stopped-for-contention');
  const heldState=await businessState(),sameCaller=await run(issuerConfig,deadFile);assert.deepEqual(await businessState(),heldState);
  check('same-login-concurrent-cli-respects-one-connection-limit',sameCaller.exit.code===1&&sameCaller.value.code==='SETUP_INSTALLER_CONNECTION_LIMIT');
  for(const [label,commandFile]of [['same-key',deadFile],['different-key',await json('competing-issue.json',{...deadIssue,key:randomUUID()})]]){
   const competing=await run(otherConfig,commandFile);assert.deepEqual(await businessState(),heldState);
   check('two-budgeted-cli-replicas-'+label+'-contend-before-effects',competing.exit.code===1&&competing.value.code==='SETUP_INSTALLER_BUSY');
  }
  handle.process.kill('SIGKILL');const killed=await handle.done;assert.equal(killed.signal,'SIGKILL');kills.push({phase:'issue-postcommit-response-held',signal:'SIGKILL',observedBarrier:true});held.release?.();
  const recovered=await run(issuerConfig,deadFile);assert.equal(recovered.exit.code,0);
  const effects=(await db.query('SELECT count(*)::int AS n FROM private.setup_recovery_commands WHERE key=$1',[deadIssue.key])).rows[0].n;
  check('actual-installer-sigkill-after-commit-resumes-same-key-with-one-effect',effects===1&&recovered.value.nativeRpcVerified===true);
  // No schema hook or fake PG response: hold the actual management row and
  // observe the real CLI statement waiting before killing its client process.
  const beforeCommitVersion=Number((await db.query('SELECT version FROM private.setup_recovery_management WHERE singleton')).rows[0].version),
   beforeCommitCommand={...issue,...base('issue',beforeCommitVersion),predecessorId:recovered.value.credentialId},
   beforeCommitFile=await json('precommit-issue.json',beforeCommitCommand),rowLock=await maintenance.connect();
  let waiting;
  try{
   await rowLock.query('BEGIN');await rowLock.query('SELECT version FROM private.setup_recovery_management WHERE singleton FOR UPDATE');
   waiting=child(issuerConfig,beforeCommitFile);
   await until(async()=>(await db.query(`SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND application_name='roomqc-setup-credential-issuer-business'
    AND wait_event_type='Lock' AND query LIKE 'SELECT roomqc_setup_admin.issue(%'`,[names.issuer])).rowCount,'actual-cli-row-wait',20000);
   barriers.push({phase:'issue-management-row-lock-before-command-commit',observed:true});
   waiting.process.kill('SIGKILL');const exit=await waiting.done;assert.equal(exit.signal,'SIGKILL');
   kills.push({phase:'issue-management-row-lock-before-command-commit',signal:'SIGKILL',observedBarrier:true});
  }finally{await rowLock.query('ROLLBACK');rowLock.release()}
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.issuer])).rowCount===0,'precommit-backend-terminal');
  const observedEffects=(await db.query('SELECT count(*)::int AS n FROM private.setup_recovery_commands WHERE key=$1',[beforeCommitCommand.key])).rows[0].n;
  assert.ok(observedEffects===0||observedEffects===1);
  const precommitRecovered=await run(issuerConfig,beforeCommitFile);assert.equal(precommitRecovered.exit.code,0);
  const finalEffects=(await db.query(`SELECT (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
   (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits`,[beforeCommitCommand.key])).rows[0];
  check('cli-killed-during-real-row-wait-reconciles-db-outcome-and-replays-once',finalEffects.commands===1&&finalEffects.audits===1&&precommitRecovered.value.nativeRpcVerified===true);
  const probe=await maintenance.connect();try{
   const free=(await probe.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0].locked;assert.equal(free,true);
   await probe.query('SELECT pg_advisory_unlock(727012)');check('all-cli-processes-release-maintenance-mutex-after-kill-and-replay');
  }finally{probe.release()}
  const rollbackFaults=await runInstallerRollbackFaults({db,maintenance,config,issuerConfig,issue,base,json,run,businessState,until,names,check,fingerprint});
  const deadlineFaults=await runInstallerDeadlineFaults({db,maintenance,directory,config,issuerConfig,issue,base,json,child,until,wire,businessState,names,check,root,checkFile});
  const filesystemKills=await runInstallerFilesystemKills({db,maintenance,directory,config,issue,base,json,text,child,run,until,businessState,names,check,root,cliUid,cliGid});
  const nonrootPermissions=input.nonrootFilesystem===true?await runInstallerNonrootPermissions({db,maintenance,directory,config,json,run,until,businessState,names,check,root,cliUid,cliGid}):null;
  const volumeFaults=input.realFilesystemFaults===true?await runInstallerVolumeFaults({input,db,maintenance,directory,config,json,text,child,until,businessState,names,check,root,cliUid,cliGid}):null;
  await directory.query("UPDATE roomqc_control.release_authority SET state='withdrawn' WHERE cluster_id=$1",[cluster.id]);
  const withdrawn=await run(issuerConfig,checkFile);check('live-directory-withdrawal-denies-new-cli-readiness',withdrawn.exit.code===1&&withdrawn.value.code==='SETUP_INSTALLER_AUTHORITY_CHANGED');
  assert.deepEqual(await snapshot(),beforeBusiness);check('installer-leaves-eleven-business-tables-unchanged');
  const output=JSON.stringify({checks,issued:issued.value,unknown:unknown.value,recovered:recovered.value});
  assert.ok(!output.includes(input.jwtSecret)&&!output.includes(password)&&!output.includes(published));check('public-results-contain-no-bearer-dsn-or-signing-material');
  if(input.nonrootFilesystem===true){assert.ok(cliSpawns>0);assert.equal(cliIdentities.length,cliSpawns);check('every-actual-cli-process-is-uid10001-gid10001-capabilities-zero-with-readonly-bound-source')}
  result={verified:true,checks,kills,barriers,actualCliProcesses:true,actualPostgres:true,actualRest:true,liveDirectoryAuthority:true,
   privateFileInputs:true,directoryMigrations:manifest.length,fixtureReleaseOnly:true,precommitObservedEffects:observedEffects,
   preflightFaults,publicationFences,keyWithdrawal,rollbackFaults,deadlineFaults,filesystemKills,nonrootPermissions,volumeFaults,
   cliIdentity:input.nonrootFilesystem===true?{verified:true,spawns:cliSpawns,witnesses:cliIdentities,fixturePreparationParentUid:process.getuid(),parentIsProductCli:false}:null,
   faultGroupsVerified:['IF01','IF02','IF03','IF04','IF05','IF06','IF07','IF08','IF09','IF10','IF11','IF12','IF13',...(nonrootPermissions?.verified?['IF14']:[]),...(volumeFaults?.verified?['IF15']:[]),'IF16','IF17'],fullFaultMatrixVerified:false,rotationDaemonVerified:false,runtimeMountReloadVerified:false,
   readOnlySourceSnapshot:true,productAccepted:false};return result;
 }catch(error){
  console.error(JSON.stringify({event:'installer_native_failed',completed:checks.map(c=>c.label),
   code:typeof error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:null}));
  throw error;
 }finally{
  for(const child of [...children]){child.process.kill('SIGKILL');await child.done}
  await mountRelay?.close();await wire?.close();await directory?.end();
  if(rollbackFixture){await rollbackFixture.cleanup();if(result?.rollbackFaults)result.rollbackFaults.fixtureRemoved=true}
  await db.query('DELETE FROM private.roomqc_release_manifest WHERE singleton');
  if(created)await maintenance.query('DROP DATABASE '+database);
  if(baselineRoles){
   const roles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),added=roles.filter(n=>!baselineRoles.includes(n));
   const allowed=new Set(['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime','roomqc_control_probe_installer',
    'roomqc_control_release_installer','roomqc_control_release_writer','roomqc_control_alerts','roomqc_control_setup_runtime','roomqc_control_setup_writer',
    'roomqc_control_backfill_reader','roomqc_control_backfill_runtime','roomqc_control_backfill_writer','roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer',...Object.values(names)]);
   assert.ok(added.every(n=>allowed.has(n)),'EXACT_OWNED_INSTALLER_ROLE_CLEANUP');
   for(const name of added)await maintenance.query('DROP ROLE '+name);
   assert.deepEqual((await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),baselineRoles);
   if(result)result.directoryRoleCleanup={verified:true,removed:added.length};
  }
  if(root){await rm(root,{recursive:true,force:true});if(result)result.privateFilesRemoved=true}
 }
}
