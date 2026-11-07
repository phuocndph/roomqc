// Owned directory schema and real least-privilege worker pools. No serving
// Supabase, provider, real recipient, tenant business data or migration changes.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {fixtureTarget,fixtureCluster} from './test-fixtures.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrust,fixtureReleaseTrustRaw,
  fixtureReleaseMaximumValidityMs,seedFixtureReleaseAuthority} from './release-test-fixtures.mjs';
import {ProbeKeyring} from './probe-secrets.mjs';
import {ProbeCredentialStore} from './probe-credentials.mjs';
import {HealthStore} from './telemetry.mjs';
import {healthConfiguration} from './workers/health-config.mjs';
import {managedHealthConfiguration} from './workers/health-probes.mjs';
import {startHealthRuntime} from './workers/health-runtime.mjs';
import {alertConfiguration} from './workers/alert-config.mjs';
import {startAlertRuntime} from './workers/alert-runtime.mjs';
import {loadRuntimeResourceContext} from './resource-runtime.mjs';
import {validateResourcePoolSample} from './resource-pool-observation.mjs';
import {nativePoolResourceProbe} from './resource-pool-inventory.mjs';
import {resourceDatabaseObservationDigests} from './resource-database.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from '../../scripts/control-backend-source-binding.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const run=process.env.ROOMQC_CONTROL_DB_TEST_RUN??randomBytes(6).toString('hex');
assert.match(run,/^[a-f0-9]{12}$/);
const name='roomqc-worker-pools-'+run,label='roomqc.worker-pools-test',password=randomBytes(32).toString('hex');
const dbImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const roles=Object.fromEntries(['metrics','probe','alerts'].map(k=>[k,'worker_'+k+'_'+run]));
const sha=v=>createHash('sha256').update(v).digest('hex');
const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2000000,
  env:{...process.env,POSTGRES_PASSWORD:password},stdio:['pipe','pipe','pipe'],...options});
const runtimes=new Set(),containers=[],volumes=[];
let root,base,admin,directory,created=false,context,rawHealth,rawAlert,managedRaw,keyring,source;
const cluster={...fixtureCluster,hostId:'cluster-a',inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1'],internalUrl:null};
const urlFor=(role,container=false)=>{const url=new URL(base);url.pathname='/worker_directory';url.username=role;
  if(container)url.hostname='host.docker.internal';return url.href};
const poolFor=(role)=>{const p=new pg.Pool({connectionString:urlFor(role),max:1,connectionTimeoutMillis:2000,statement_timeout:5000});p.on('error',()=>{});return p};
async function waitUntil(runCheck){for(let i=0;i<80;i++){if(await runCheck())return;await new Promise(r=>setTimeout(r,100))}assert.fail('Owned worker condition did not become true')}
const healthConfig=()=>({...healthConfiguration(rawHealth,{databaseUrl:urlFor(roles.metrics),production:false,allowLocal:true}),resourceContext:context});
const alertConfig=()=>({...alertConfiguration(rawAlert,{databaseUrl:urlFor(roles.alerts),endpoint:'https://receiver.invalid/alerts',token:'unusable-owned-token',production:false,allowLocal:true}),resourceContext:context});
function managed(config){return {...managedHealthConfiguration(managedRaw,{health:config,databaseUrl:urlFor(roles.probe),trust:fixtureReleaseTrust}),keyring}}
async function healthRuntime(){const config=healthConfig(),runtime=await startHealthRuntime(config,{managed:managed(config),port:0,autoStart:false,poolObservations:true,poolStatusPort:0});runtimes.add(runtime);return runtime}
async function alertRuntime(){const runtime=await startAlertRuntime(alertConfig(),{port:0,autoStart:false,poolObservations:true,poolStatusPort:0});runtimes.add(runtime);return runtime}
async function stop(runtime){try{assert.deepEqual(await runtime.shutdown(),{timedOut:false})}finally{runtimes.delete(runtime)}}
const sample=async runtime=>{const r=await fetch('http://127.0.0.1:'+runtime.poolStatus.server.address().port+'/resource-targets',{signal:AbortSignal.timeout(6000)});
  return {status:r.status,body:await r.json()}};
const status=async(runtime,path)=>fetch('http://127.0.0.1:'+runtime.server.address().port+path,{signal:AbortSignal.timeout(5000)});
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));return port}

before(async()=>{
 if(!enabled)return;
 root=await mkdtemp(join(tmpdir(),name+'-'));source=await captureBackendSourceBinding(process.cwd());
 const dataVolume=name+'-data';docker(['volume','create','--label',label+'='+run,dataVolume]);volumes.push(dataVolume);
 const port=await freePort();
 docker(['run','-d','--name',name,'--label',label+'='+run,'--env','POSTGRES_PASSWORD','--mount','type=volume,src='+dataVolume+',dst=/var/lib/postgresql/data',
  '-p','127.0.0.1:'+port+':5432',dbImage]);created=true;
 const info=JSON.parse(docker(['inspect',name]))[0];
 base=`postgresql://postgres:${password}@127.0.0.1:${info.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`;
 admin=new pg.Pool({connectionString:base,max:1,connectionTimeoutMillis:1000});admin.on('error',()=>{});
 await waitUntil(async()=>{try{await admin.query('SELECT 1');return true}catch{return false}});
 await admin.query('CREATE DATABASE worker_directory');directory=poolFor('postgres');
 await migrateDirectory(directory);await importInitialRegistry(directory,[cluster]);
 await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES('cluster-a','cluster-a','local')");
 await directory.query(`UPDATE roomqc_control.clusters SET host_id=id,inventory_ref=id,release_id=$1,schema_manifest_hash=$2,
  telemetry_target_fingerprint=$3,telemetry_target_definition=$4::jsonb WHERE id='cluster-a'`,
  [syntheticRelease.releaseId,syntheticRelease.schemaManifestHash,telemetryTargetFingerprint(fixtureTarget('cluster-a')),JSON.stringify(fixtureTarget('cluster-a'))]);
 await seedFixtureReleaseAuthority(directory,fixtureReleaseContext(cluster,syntheticRelease));
 const groups={metrics:'roomqc_control_metrics',probe:'roomqc_control_probe_runtime',alerts:'roomqc_control_alerts'};
 await directory.query('REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM PUBLIC');
 for(const [key,role]of Object.entries(roles)){
  await directory.query(`CREATE ROLE ${role} LOGIN CONNECTION LIMIT 4 NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}' IN ROLE ${groups[key]}`);
  await directory.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${role}`);
 }
 const budget=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));budget.environment='local';
 const budgetFile=join(root,'budget.json');await writeFile(budgetFile,JSON.stringify(budget),{mode:0o600});
 context=loadRuntimeResourceContext({ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:budgetFile},{kind:'directory'});
 rawHealth={schemaVersion:2,instanceId:'owned-health',targets:[{target:fixtureTarget('cluster-a'),prometheus:{url:'http://127.0.0.1:1',approvedAddresses:['127.0.0.1']}}],
  connectionBudget:{maxConnections:100,reservedConnections:5,apiInstances:1,apiPoolMax:5,reconcileInstances:0,reconcilePoolMax:2,
   healthInstances:1,healthPoolMax:2,exporterConnections:1,migrationConnections:1,probeInstances:1,probePoolMax:1}};
 const db=context.budget.databases[0],alert=db.consumers.find(c=>c.id==='alert-worker');
 rawAlert={schemaVersion:1,instanceId:'owned-alerts',poolMax:1,concurrency:1,intervalMs:100,requestTimeoutMs:100,leaseMs:10000,shutdownTimeoutMs:2000,
  approvedAddresses:[],connectionBudget:{maxConnections:100,reservedConnections:5,instances:1,otherAllocatedConnections:db.allocatedConnections-alert.connections}};
 const metadataCluster=Object.fromEntries(['id','hostId','url','internalUrl','inventoryRef','credentialRef','approvedAddresses','publishableKey'].map(k=>[k,cluster[k]]));
 managedRaw={version:2,targets:[{cluster:metadataCluster,expected:syntheticRelease,approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease)),storage:{sha256:'a'.repeat(64)}}]};
 keyring=new ProbeKeyring({activeKeyId:'owned-key',keys:new Map([['owned-key',randomBytes(32)]])});
 console.log(JSON.stringify({event:'worker_directory_ready',run,migrations:(await migrationManifest()).length,sourceSha256:source.sha256}));
});
after(async()=>{
 for(const runtime of runtimes)await runtime.shutdown();
 for(const container of containers.reverse()){const info=JSON.parse(docker(['inspect',container]))[0];assert.equal(info.Config.Labels[label],run);docker(['rm','-f',container])}
 await directory?.end();await admin?.end();
 if(created){assert.equal(JSON.parse(docker(['inspect',name]))[0].Config.Labels[label],run);docker(['rm','-f',name])}
 for(const volume of volumes){assert.equal(JSON.parse(docker(['volume','inspect',volume]))[0].Labels[label],run);docker(['volume','rm',volume])}
 if(enabled){for(const kind of ['container','volume'])assert.equal(docker([kind,'ls',...(kind==='container'?['-a']:[]),'--filter','label='+label+'='+run,'--format',kind==='container'?'{{.ID}}':'{{.Name}}']).trim(),'');
  assertBackendSourceBinding(source,await captureBackendSourceBinding(process.cwd()));
  assert.equal(resolve(dirname(root)),resolve(tmpdir()));assert(basename(root).startsWith(name+'-'));await rm(root,{recursive:true,force:true});
  console.log(JSON.stringify({event:'worker_pool_cleanup',run,ownedContainers:0,ownedVolumes:0,privateFilesRemoved:true,sourceSha256:source.sha256}));}
});
const dbtest=(title,fn)=>test(title,{skip:!enabled},fn);

dbtest('managed health samples both real pools with distinct restricted LOGINs and never treats pool success as service readiness',async()=>{
 const runtime=await healthRuntime();
 try{
  assert.equal((await new HealthStore(runtime.pool).readiness()).schemaVersion,(await migrationManifest()).at(-1).version);
  assert.equal((await new ProbeCredentialStore(runtime.probePool,keyring).readiness()).schemaVersion,(await migrationManifest()).at(-1).version);
  const first=await sample(runtime);assert.equal(first.status,200);validateResourcePoolSample(first.body);
  assert.equal(first.body.bindings.length,2);
  const metrics=first.body.bindings.find(b=>b.consumerId==='health-worker'),probe=first.body.bindings.find(b=>b.consumerId==='probe-catalog');
  assert.equal(metrics.roleSha256,sha(roles.metrics));assert.equal(probe.roleSha256,sha(roles.probe));
  assert.equal(metrics.databaseIdentitySha256,probe.databaseIdentitySha256);assert.equal(metrics.poolMax,2);assert.equal(probe.poolMax,1);
  assert.equal((await status(runtime,'/resource-targets')).status,404);
  const cycle=await runtime.worker.tick();assert.equal(cycle.sweepSucceeded,true);assert.equal(cycle.targetsSucceeded,0);
  assert.equal(cycle.lastErrorCode,'PROBE_CREDENTIAL_MISSING');assert.equal((await status(runtime,'/livez')).status,200);assert.equal((await status(runtime,'/readyz')).status,503);
  assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.cluster_health_current')).rows[0].n,0);
  assert.doesNotMatch(JSON.stringify(first.body),new RegExp(password+'|'+Object.values(roles).join('|')+'|worker_directory|postgresql'));
 }finally{await stop(runtime)}
 assert.equal(runtime.pool.ended,true);assert.equal(runtime.probePool.ended,true);assert.equal(runtime.poolStatus.server.listening,false);
});

dbtest('managed probe catalog privilege loss fails pool sampling and restores without restart or alternate credentials',async()=>{
 const runtime=await healthRuntime();let original;
 try{
  original=(await sample(runtime)).body;await directory.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${roles.probe}`);
  const denied=await sample(runtime);assert.equal(denied.status,503);assert.deepEqual(denied.body,{code:'RESOURCE_POOL_UNAVAILABLE'});
  assert.equal(runtime.probePool.totalCount,0);
  await directory.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${roles.probe}`);
  const recovered=await sample(runtime);assert.equal(recovered.status,200);assert.equal(recovered.body.processNonce,original.processNonce);
  assert.deepEqual(recovered.body.bindings,original.bindings);
 }finally{await directory.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${roles.probe}`);await stop(runtime)}
});

dbtest('real worker readiness rejects cross-role access while catalog samples alone remain insufficient',async()=>{
 const health=await healthRuntime(),alert=await alertRuntime();
 try{
  await alert.worker.tick();assert.equal((await status(alert,'/readyz')).status,200);
  await directory.query(`GRANT roomqc_control_metrics TO ${roles.probe}`);
  await assert.rejects(()=>new ProbeCredentialStore(health.probePool,keyring).readiness(),{code:'PROBE_RUNTIME_PRIVILEGES'});
  assert.equal((await sample(health)).status,200);
  const cycle=await health.worker.tick();assert.equal(cycle.lastErrorCode,'PROBE_RUNTIME_PRIVILEGES');assert.equal(cycle.ready,false);
  await directory.query(`REVOKE roomqc_control_metrics FROM ${roles.probe}`);
  await new ProbeCredentialStore(health.probePool,keyring).readiness();
  await directory.query(`GRANT SELECT ON roomqc_control.workspaces TO ${roles.alerts}`);
  await alert.worker.tick();assert.equal((await status(alert,'/readyz')).status,503);assert.equal((await status(alert,'/livez')).status,200);
  assert.equal((await sample(alert)).status,200);
  await directory.query(`REVOKE SELECT ON roomqc_control.workspaces FROM ${roles.alerts}`);
  await alert.worker.tick();assert.equal((await status(alert,'/readyz')).status,200);
 }finally{await directory.query(`REVOKE roomqc_control_metrics FROM ${roles.probe}; REVOKE SELECT ON roomqc_control.workspaces FROM ${roles.alerts}`);await stop(health);await stop(alert)}
});

dbtest('alert worker uses its actual bounded pool, loses readiness on real database outage and recovers in the same process',async()=>{
 const runtime=await alertRuntime();
 try{
  await runtime.worker.tick();const original=await sample(runtime);assert.equal(original.status,200);assert.equal(original.body.bindings[0].roleSha256,sha(roles.alerts));
  assert.equal(original.body.bindings[0].poolMax,1);assert.equal((await status(runtime,'/readyz')).status,200);
  docker(['stop','--time','5',name]);
  await runtime.worker.tick();assert.equal((await status(runtime,'/livez')).status,200);assert.equal((await status(runtime,'/readyz')).status,503);
  assert.equal((await sample(runtime)).status,503);
  docker(['start',name]);assert.equal(JSON.parse(docker(['inspect',name]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort,new URL(base).port);
  await waitUntil(async()=>{try{await directory.query('SELECT 1');return true}catch{return false}});
  await runtime.worker.tick();const recovered=await sample(runtime);assert.equal(recovered.status,200);assert.equal(recovered.body.processNonce,original.body.processNonce);
  assert.equal(recovered.body.bindings[0].databaseIdentitySha256,original.body.bindings[0].databaseIdentitySha256);
  assert.notEqual(recovered.body.bindings[0].serverSettingsSha256,original.body.bindings[0].serverSettingsSha256);
  assert.equal((await status(runtime,'/readyz')).status,200);
  assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.alert_delivery_attempts')).rows[0].n,0);
 }finally{docker(['start',name]);await stop(runtime)}
});

test('actual worker image runs all three pools on the migrated directory with Linux UID/modes and verifies copied source bytes',
 {skip:!enabled||process.env.ROOMQC_CONTROL_POOL_CONTAINER_TEST!=='true'},async()=>{
 const build=join(root,'build');await mkdir(join(build,'server/control'),{recursive:true});
 await cp('server/control',join(build,'server/control'),{recursive:true,filter:p=>!p.split(/[\\/]/).includes('node_modules')});
 await mkdir(join(build,'supabase'),{recursive:true});await cp('supabase/migrations',join(build,'supabase/migrations'),{recursive:true});
 const iid=join(root,'worker-image.id');docker(['build','--file',join(build,'server/control/Dockerfile'),'--iidfile',iid,build],{timeout:180000});
 const image=(await readFile(iid,'utf8')).trim();assert.match(image,/^sha256:[a-f0-9]{64}$/);
 const deployed=source.files.filter(f=>/^server\/control\/(?:[^/]+\.mjs|schema\.sql|package(?:-lock)?\.json|migrations\/[^/]+\.sql|workers\/.+\.mjs)$/.test(f.path));
 const verifyImage=String.raw`const fs=require('node:fs'),crypto=require('node:crypto');const files=JSON.parse(fs.readFileSync(0,'utf8'));for(const f of files){const text=fs.readFileSync('/app/'+f.path.slice('server/control/'.length),'utf8').replace(/\r\n/g,'\n');if(crypto.createHash('sha256').update(text).digest('hex')!==f.sha256)throw Error('IMAGE_SOURCE_MISMATCH')}process.stdout.write(JSON.stringify({verifiedFiles:files.length}));`;
 const verified=JSON.parse(docker(['run','--rm','--interactive','--label',label+'='+run,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',image,'node','-e',verifyImage],{input:JSON.stringify(deployed)}));
 assert.equal(verified.verifiedFiles,deployed.length);
 const volume=name+'-config';docker(['volume','create','--label',label+'='+run,volume]);volumes.push(volume);
 const payload={'budget.json':await readFile(join(root,'budget.json'),'utf8'), 'health.json':JSON.stringify(rawHealth),'alert.json':JSON.stringify(rawAlert),
  'managed.json':JSON.stringify(managedRaw),'trust.json':JSON.stringify(fixtureReleaseTrustRaw),
  'keyring.json':JSON.stringify({version:1,activeKeyId:'owned-key',keys:{'owned-key':randomBytes(32).toString('hex')}}),
  'metrics-dsn':urlFor(roles.metrics,true),'probe-dsn':urlFor(roles.probe,true),'alert-dsn':urlFor(roles.alerts,true),
  'endpoint':'https://receiver.invalid/alerts','token':'unusable-owned-token'};
 const seed=`const fs=require('node:fs');for(const [name,text]of Object.entries(JSON.parse(fs.readFileSync(0,'utf8')))){const file='/config/'+name;fs.writeFileSync(file,text,{mode:0o400});fs.chownSync(file,1000,1000)}`;
 docker(['run','--rm','--interactive','--label',label+'='+run,'--user','0:0','--network','none','--mount','type=volume,src='+volume+',dst=/config',image,'node','-e',seed],{input:JSON.stringify(payload)});
 const env={NODE_ENV:'development',ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/budget.json',ROOMQC_RESOURCE_POOL_OBSERVATIONS:'true',
  ROOMQC_HEALTH_ALLOW_LOCAL:'true',ROOMQC_HEALTH_CONFIG_FILE:'/etc/roomqc/health.json',ROOMQC_HEALTH_DATABASE_URL_FILE:'/etc/roomqc/metrics-dsn',
  ROOMQC_HEALTH_PROBE_CONFIG_FILE:'/etc/roomqc/managed.json',ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:'/etc/roomqc/probe-dsn',ROOMQC_HEALTH_PROBE_KEYRING_FILE:'/etc/roomqc/keyring.json',
  ROOMQC_HEALTH_RELEASE_TRUST_FILE:'/etc/roomqc/trust.json',ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(fixtureReleaseMaximumValidityMs),
  ROOMQC_ALERT_ALLOW_LOCAL:'true',ROOMQC_ALERT_CONFIG_FILE:'/etc/roomqc/alert.json',ROOMQC_ALERT_DATABASE_URL_FILE:'/etc/roomqc/alert-dsn',
  ROOMQC_ALERT_ENDPOINT_FILE:'/etc/roomqc/endpoint',ROOMQC_ALERT_TOKEN_FILE:'/etc/roomqc/token'};
 const found=[];
 for(const kind of ['health','alert']){
  const container=name+'-'+kind;containers.push(container);
  docker(['run','-d','--name',container,'--label',label+'='+run,'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
   '--memory','192m','--pids-limit','64','--mount','type=volume,src='+volume+',dst=/etc/roomqc,readonly',
   ...Object.entries(env).flatMap(([key,value])=>['--env',key+'='+value]),image,'node','workers/'+kind+'-runtime.mjs']);
  let observed;
  await waitUntil(async()=>{try{observed=validateResourcePoolSample(JSON.parse(docker(['exec',container,'node','--input-type=module','-e',nativePoolResourceProbe,'8098'])));return true}catch{return false}});
  const expected=kind==='health'?[['health-worker','metrics'],['probe-catalog','probe']]:[['alert-worker','alerts']];
  for(const [consumer,key]of expected){const b=observed.bindings.find(b=>b.consumerId===consumer);assert.equal(b.roleSha256,sha(roles[key]));found.push(b)}
  const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.Image,image);assert.equal(actual.Config.User,'1000:1000');assert.equal(actual.HostConfig.ReadonlyRootfs,true);
  assert.equal(Object.keys(actual.NetworkSettings.Ports??{}).filter(k=>actual.NetworkSettings.Ports[k]!==null).length,0);
  const port=kind==='health'?8093:8094;
  const readiness=JSON.parse(docker(['exec',container,'node','-e',`fetch('http://127.0.0.1:${port}/readyz').then(async r=>process.stdout.write(JSON.stringify({status:r.status,body:await r.json()})))`]));
  assert.equal(readiness.status,kind==='health'?503:200);
  if(kind==='health')assert.equal(readiness.body.lastErrorCode,'PROBE_CREDENTIAL_MISSING');
 }
 const identity=(await directory.query(`SELECT c.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",d.datname AS "databaseName"
  FROM pg_catalog.pg_control_system() c JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
 const digest=resourceDatabaseObservationDigests({...identity,role:roles.metrics});
 assert(found.every(b=>b.databaseIdentitySha256===digest.databaseIdentitySha256));
 for(const container of containers){docker(['stop','--time','10',container]);const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.State.ExitCode,0)}
 console.log(JSON.stringify({event:'worker_pool_container_evidence',run,imageId:image,sourceSha256:source.sha256,dockerfileSha256:source.files.find(f=>f.path==='server/control/Dockerfile').sha256,
  verifiedImageFiles:verified.verifiedFiles,bindings:found,uid:1000,readOnlyRoot:true,publishedPorts:0,gracefulExit:0,
  namedVolumeFixture:true,liveComposeDeploymentVerified:false,serviceProbeSuccess:false,providerDeliveryVerified:false}));
});
