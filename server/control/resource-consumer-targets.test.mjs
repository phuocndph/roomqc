import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {attestResourceConsumerTargets,resourceConsumerTargetManifest} from './resource-consumer-targets.mjs';
import {resourceTargetFixture} from './testing/resource-target-fixtures.mjs';
import {resourceConsumerTargetMain} from '../../scripts/control-backend-resource-consumer-target-check.mjs';
import {fixtureTarget} from './test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {fixtureReleaseTrustRaw,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';

async function fixture(t){const root=await mkdtemp(join(tmpdir(),'roomqc-consumer-targets-'));t.after(()=>rm(root,{recursive:true,force:true}));return resourceTargetFixture(root)}
const run=(f,changes={})=>attestResourceConsumerTargets(f.manifest,{resolveProject:f.resolveProject,readTarget:f.readTarget,...changes});

test('actual configured native/vendor DSNs and a secret-file worker are checked under their own expected LOGINs, separately from attestors',async t=>{
 const f=await fixture(t),log=[];let active=0,peak=0;
 const r=await run(f,{readTarget:async c=>{active++;peak=Math.max(peak,active);log.push(c.user);try{return await f.readTarget(c)}finally{active--}}});
 assert.equal(r.allConfiguredTargetsVerified,true);assert.equal(r.bindings.length,4);assert.equal(r.servers.length,1);assert.equal(peak,1);
 for(const role of Object.values(f.roles))assert.equal(log.filter(v=>v===role).length,2);
 assert.equal(log.filter(v=>v===f.attestor).length,4);assert.equal(r.maxSimultaneousCheckerConnections,1);
 for(const k of ['runtimeVerified','databaseIdentityVerified','capacityProven','deploymentReady'])assert.equal(r[k],false);
 assert.equal(r.acceptance.productAccepted,false);assert.equal(r.configuredPlanFullyCovered,false);
 assert.equal(r.applicationConnectionNamespaceVerified,false);
 assert.doesNotMatch(JSON.stringify(r),/owned-private-password|postgresql|fixture_0|fixture_1|api_role|auth_role|alert\.dsn|budgetFile/);
});

test('closed manifest rejects arbitrary DSN overrides, duplicate selectors, role injection and mismatched budget/environment',async t=>{
 const f=await fixture(t);assert.deepEqual(resourceConsumerTargetManifest(f.manifest),f.manifest);
 for(const change of [m=>m.dsnFile='/convenient/other.dsn',m=>m.bindings.push(m.bindings[0]),m=>m.bindings[0].dsn='SECRET',
  m=>m.bindings[0].role='bad\nrole',m=>m.bindings[0].role='x'.repeat(64),m=>m.schemaVersion=2,
  m=>m.databaseManifest.budgetSha256='0'.repeat(64),m=>m.databaseManifest.environment='staging']){
  const raw=structuredClone(f.manifest);change(raw);assert.throws(()=>resourceConsumerTargetManifest(raw));
 }
});

test('missing expected app roles remain unresolved without borrowing attestor credentials',async t=>{
 const f=await fixture(t);f.manifest.bindings.splice(1,1);const roles=[];
 const r=await run(f,{readTarget:async c=>{roles.push(c.user);return f.readTarget(c)}});
 assert.equal(r.allConfiguredTargetsVerified,false);assert.equal(r.bindings.length,3);assert.equal(r.unresolvedTargets[0].consumerId,'alert-worker');
 assert(!roles.includes(f.roles.alert));
});

test('all declared source files/DSNs, mappings and reserved checker slots are validated before the first connection',async t=>{
 for(const mutate of [async f=>{f.manifest.bindings[0].consumerId='unknown'},async f=>{delete f.api.environment.ROOMQC_CONTROL_DATABASE_URL},
  async f=>{f.api.environment.ROOMQC_CONTROL_DATABASE_URL+='&options=-c%20role=postgres'},async f=>{f.api.environment.PGOPTIONS='private-injection'},
  async f=>{f.resolved.native.secrets['alert-dsn'].external=true},async f=>{f.alert.environment.ROOMQC_ALERT_DATABASE_URL_FILE='/unmounted/secret'},
  async f=>{f.budget.databases[1].consumers.pop();await f.rebind()},async f=>{await f.put('attestor-1.dsn','postgresql://invalid')},
  async f=>{f.manifest.bindings[0].role='other_role'}]){
  const f=await fixture(t);await mutate(f);let calls=0;await assert.rejects(()=>run(f,{readTarget:async()=>{calls++;throw Error('SECRET')}}));assert.equal(calls,0);
 }
});

test('same configured database name on the wrong server, wrong OID, session role, recovery or elevated role is rejected',async t=>{
 const f=await fixture(t);
 for(const change of [{systemIdentifier:'987654321'},{databaseOid:'999'},{sessionRole:'other'},{inRecovery:true},{superuser:true},
  {createDatabase:true},{createRole:true},{replication:true},{bypassRls:true},{readOnly:false},{roleConnectionLimit:0},{memberships:-1}]){
  await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.user===f.roles.auth?change:{})})}));
 }
});

test('app role memberships are not confused with attestor isolation and cannot weaken the attestor role checks',async t=>{
 const f=await fixture(t),r=await run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.user===f.roles.api?{memberships:1}:{})})});
 assert.equal(r.allConfiguredTargetsVerified,true);
 await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.user===f.attestor?{memberships:1}:{})})}),{code:'RESOURCE_DATABASE_ROLE_MISMATCH'});
});

test('app endpoint settings/restart must match its separately checked database, with stable observations on both passes',async t=>{
 const f=await fixture(t);
 for(const change of [{maxConnections:101},{postmasterStartedAt:'2026-10-30 02:00:00+00'}]){
  await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.user===f.roles.api?change:{})})}),{code:'RESOURCE_CONSUMER_TARGET_SERVER_MISMATCH'});
 }
 let seen=0;await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.user===f.roles.api&&++seen===2?{memberships:1}:{})})}),{code:'RESOURCE_CONSUMER_TARGET_OBSERVATION_DRIFT'});
});

test('secret replacement during observations is rejected without logging its bytes',async t=>{
 const f=await fixture(t);let changed=false;
 await assert.rejects(()=>run(f,{readTarget:async c=>{if(!changed){changed=true;await f.put('alert.dsn',f.uri(f.roles.alert,0).replace('owned-private-password','NEW-SECRET'))}return f.readTarget(c)}}),{code:'RESOURCE_CONSUMER_TARGET_FILE_DRIFT'});
});

test('Compose credential replacement after the first resolve is detected even if pool plan is unchanged',async t=>{
 const f=await fixture(t);let calls=0;
 await assert.rejects(()=>run(f,{resolveProject:async p=>{const r=await f.resolveProject(p);if(p.id==='native'&&++calls===2)r.services.api.environment.ROOMQC_CONTROL_DATABASE_URL=r.services.api.environment.ROOMQC_CONTROL_DATABASE_URL.replace('owned-private-password','replacement');return r}}),{code:'RESOURCE_CONSUMER_TARGET_COMPOSE_DRIFT'});
});

test('shared-server oversubscription stays rejected after successful individual consumer observations',async t=>{
 const f=await fixture(t);f.budget.databases[1].maxConnections=30;await f.rebind();
 await assert.rejects(()=>run(f),{code:'RESOURCE_DATABASE_SERVER_OVERCOMMITTED'});
});

test('CLI preserves partial/full scoped outcomes and suppresses raw driver/resolve/private errors',async t=>{
 const f=await fixture(t),file=await f.put('manifest.json',f.manifest);let output='';const out={write:s=>{output+=s}};
 const dependencies={output:out,resolveProject:f.resolveProject,attest:(raw,{resolveProject})=>attestResourceConsumerTargets(raw,{resolveProject,readTarget:f.readTarget})};
 assert.equal(await resourceConsumerTargetMain(['--manifest',file],dependencies),0);assert.equal(JSON.parse(output).allConfiguredTargetsVerified,true);
 f.manifest.bindings.pop();await f.put('manifest.json',f.manifest);output='';assert.equal(await resourceConsumerTargetMain(['--manifest',file],dependencies),2);
 output='';assert.equal(await resourceConsumerTargetMain(['--manifest',file],{output:out,attest:async()=>{throw Error('postgresql://PRIVATE:PASSWORD@host/database')}}),1);
 assert.equal(JSON.parse(output).code,'RESOURCE_CONSUMER_TARGET_CHECK_FAILED');assert.doesNotMatch(output,/PRIVATE|PASSWORD|postgresql/);
});

test('driver failures and malformed private JSON are redacted and never pass a target',async t=>{
 const f=await fixture(t);
 await assert.rejects(()=>run(f,{readTarget:async()=>{throw Error('postgresql://SECRET')}}),{code:'RESOURCE_CONSUMER_TARGET_READ_FAILED'});
 let called=0;await assert.rejects(()=>run(f,{readFile:async file=>{if(file===f.alertDsnFile)throw Error('PRIVATE');return readFile(file,'utf8')},readTarget:async()=>{called++;throw 0}}),{code:'RESOURCE_CONSUMER_TARGET_FILE_INVALID'});assert.equal(called,0);
});

async function addSummary(f){
 const dirs={};for(const name of ['private','journal','output']){dirs[name]=join(f.root,name);await mkdir(dirs[name])}
 const put=async(name,value)=>writeFile(join(dirs.private,name),typeof value==='string'?value:JSON.stringify(value),{mode:0o600});
 for(const db of f.budget.databases)db.consumers.push({id:'summary-credential-rotation',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
 const alert=JSON.parse(await readFile(join(f.root,'alert.json'),'utf8'));alert.connectionBudget.otherAllocatedConnections++;
 await f.put('alert.json',alert);await f.rebind();
 const policy=JSON.parse(await readFile(new URL('../../deploy/monitoring/summary-rotation.example.json',import.meta.url),'utf8'));
 const config=JSON.parse(await readFile(new URL('../../deploy/monitoring/summary-installer.template.json',import.meta.url),'utf8'));
 config.environment='local';config.businessDatabaseId='business-example';config.resourceBudgetSha256=f.consumerManifest.budgetSha256;
 for(const [i,kind]of ['directory','business'].entries()){
  config[kind].expected={...f.databaseManifest.databases[i].expected,role:'summary_'+kind};
  await put('summary-'+kind+'.dsn',f.uri('summary_'+kind,i));
  f.manifest.bindings.push({project:'summary',service:'rotation',databaseId:f.budget.databases[i].id,consumerId:'summary-credential-rotation',role:'summary_'+kind});
 }
 config.target.cluster={id:'fixture-cluster',hostId:'fixture-host',inventoryRef:'fixture-cluster',credentialRef:'fixture-cluster',url:'https://fixture.invalid',internalUrl:null,approvedAddresses:[]};
 config.target.expected={clusterId:'fixture-cluster',releaseId:'fixture-release',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
 config.target.approval={testOnly:'not-a-release-approval'};config.publisher.signer.fingerprint='5'.repeat(64);
 await put('resource-budget.json',f.budget);await put('summary-installer.json',config);
 const policyFile=await f.put('rotation.json',policy),image=f.api.image,mount=(source,target,read_only=true)=>({type:'bind',source,target,read_only,bind:{create_host_path:false}});
 const service={image,working_dir:'/app',command:['node','workers/summary-rotation-runtime.mjs','--config-file','/etc/roomqc/rotation.json'],user:'1000:1000',read_only:true,
  cap_drop:['ALL'],security_opt:['no-new-privileges:true'],environment:{ROOMQC_RESOURCE_ENVIRONMENT:'local'},
  volumes:[mount(policyFile,'/etc/roomqc/rotation.json'),mount(dirs.private,'/etc/roomqc/private'),mount(dirs.journal,'/var/lib/roomqc/summary-rotation-journal',false),mount(dirs.output,'/run/roomqc/summary',false)]};
 f.consumerManifest.nativeProjects.push({id:'summary',files:[join(f.root,'summary.compose.json')],envFiles:[],profiles:[],services:[{name:'rotation',adapter:'summary-credential-rotation',databaseId:'business-example',image}]});
 f.resolved.summary={name:'summary',services:{rotation:service}};return {dirs,config,put};
}

test('dual-database summary recipe follows only its validated private DSN files and counts both target LOGINs',async t=>{
 const f=await fixture(t);await addSummary(f);const r=await run(f);
 assert.equal(r.allConfiguredTargetsVerified,true);assert.equal(r.bindings.length,6);
 assert.equal(r.bindings.filter(b=>b.consumerId==='summary-credential-rotation').length,2);
 assert.doesNotMatch(JSON.stringify(r),/summary_directory|summary_business|not-a-release-approval|private-password|dsnFile/);
 f.manifest.bindings.find(b=>b.role==='summary_directory').role='other_role';
 await assert.rejects(()=>run(f),{code:'RESOURCE_CONSUMER_TARGET_ROLE_MISMATCH'});
});

test('booking DSN secret is read without opening provider credentials; a custom CA stays explicitly unresolved',async t=>{
 const f=await fixture(t),consumer=f.budget.databases[1].consumers.find(c=>c.id==='external-notifications');consumer.replicas=1;await f.rebind();
 const raw={version:1,instanceId:'fixture-booking',databaseUrlFile:'/run/secrets/booking-dsn',channels:['telegram'],
  telegram:{botTokenFile:'/DO-NOT-OPEN/provider-token',appOrigin:'https://roomqc.invalid'},
  connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:16,workerInstances:1,workerPoolMax:2}};
 const file=await f.put('booking.json',raw),dsn=await f.put('booking.dsn',f.uri('booking_role',1));
 const service={image:f.api.image,working_dir:'/app',command:['node','workers/booking-external-runtime.mjs','--config-file','/etc/roomqc/booking-external.json'],
  environment:{...f.api.environment,ROOMQC_RESOURCE_DATABASE_ID:'business-example'},volumes:[...f.api.volumes,
   {type:'bind',source:file,target:'/etc/roomqc/booking-external.json',read_only:true,bind:{create_host_path:false}}],secrets:['booking-dsn']};
 f.resolved.native.services.booking=service;f.resolved.native.secrets['booking-dsn']={file:dsn};
 f.consumerManifest.nativeProjects[0].services.push({name:'booking',adapter:'external-notifications',databaseId:'business-example',image:f.api.image});
 f.manifest.bindings.push({project:'native',service:'booking',databaseId:'business-example',consumerId:'external-notifications',role:'booking_role'});
 assert.equal((await run(f)).bindings.length,5);
 raw.databaseCaFile='/DO-NOT-OPEN/private-ca';await f.put('booking.json',raw);const r=await run(f);
 assert.equal(r.allConfiguredTargetsVerified,false);assert.equal(r.bindings.length,4);assert(r.unresolvedTargets.some(t=>t.service==='booking'&&t.reason==='connection_recipe_unresolved'));
});

test('health observation and probe catalog follow their two distinct configured secret files',async t=>{
 const f=await fixture(t),directory=f.budget.databases[0];
 for(const id of ['health-worker','probe-catalog','db-exporter','migration'])directory.consumers.find(c=>c.id===id).replicas=1;
 const alert=JSON.parse(await readFile(join(f.root,'alert.json'),'utf8'));alert.connectionBudget.otherAllocatedConnections=11;
 await f.put('alert.json',alert);await f.rebind();
 const raw={schemaVersion:2,instanceId:'fixture-health',targets:[{target:fixtureTarget('fixture-cluster'),prometheus:{url:'https://metrics.invalid',approvedAddresses:[]}}],
  connectionBudget:{maxConnections:100,reservedConnections:5,apiInstances:1,apiPoolMax:5,reconcileInstances:0,reconcilePoolMax:2,
   healthInstances:1,healthPoolMax:2,exporterConnections:1,migrationConnections:1,probeInstances:1,probePoolMax:1}};
 const metadata=await f.put('health.json',raw),healthDsn=await f.put('health.dsn',f.uri('health_role',0)),probeDsn=await f.put('probe.dsn',f.uri('probe_role',0));
 const service={image:f.api.image,working_dir:'/app',command:['node','workers/health-runtime.mjs'],
  environment:{ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/budget.json',ROOMQC_HEALTH_CONFIG_FILE:'/etc/roomqc/health.json',
   ROOMQC_HEALTH_ALLOW_LOCAL:'true',ROOMQC_HEALTH_DATABASE_URL_FILE:'/run/secrets/health-dsn',ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:'/run/secrets/probe-dsn'},
  volumes:[...f.api.volumes,{type:'bind',source:metadata,target:'/etc/roomqc/health.json',read_only:true,bind:{create_host_path:false}}],secrets:['health-dsn','probe-dsn']};
 f.resolved.native.services.health=service;Object.assign(f.resolved.native.secrets,{'health-dsn':{file:healthDsn},'probe-dsn':{file:probeDsn}});
 f.consumerManifest.nativeProjects[0].services.push({name:'health',adapter:'health-worker',databaseId:directory.id,image:f.api.image});
 for(const [consumerId,role]of [['health-worker','health_role'],['probe-catalog','probe_role']])f.manifest.bindings.push({project:'native',service:'health',databaseId:directory.id,consumerId,role});
 const observed=[];const result=await run(f,{readTarget:async c=>{observed.push(c.user);return f.readTarget(c)}});
 assert.equal(result.allConfiguredTargetsVerified,true);assert.equal(result.bindings.length,6);
 assert.equal(observed.filter(r=>r==='health_role').length,2);assert.equal(observed.filter(r=>r==='probe_role').length,2);
 await f.put('probe.dsn',f.uri('health_role',0));let queries=0;
 await assert.rejects(()=>run(f,{readTarget:async()=>{queries++;throw 0}}),{code:'RESOURCE_DATABASE_DSN_INVALID'});assert.equal(queries,0);
});

test('provisioning target uses only its configured DSN secret and never reads recovery credential contents',async t=>{
 const f=await fixture(t),directory=f.budget.databases[0];directory.consumers.find(c=>c.id==='provisioning-worker').replicas=1;
 const alert=JSON.parse(await readFile(join(f.root,'alert.json'),'utf8'));alert.connectionBudget.otherAllocatedConnections=8;
 await f.put('alert.json',alert);await f.rebind();
 const cluster={id:'cluster-a',url:'https://cluster.example.invalid',internalUrl:null,inventoryRef:'cluster-a',credentialRef:'cluster-a',hostId:'host-a',approvedAddresses:[]};
 const raw={schemaVersion:1,instanceId:'fixture-setup',poolMax:2,concurrency:2,intervalMs:1000,requestTimeoutMs:6000,leaseMs:60000,retryBaseMs:1000,shutdownTimeoutMs:10000,
  targets:[{cluster,approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease)),credentialFile:'/run/roomqc/setup/absent.json'}],
  connectionBudget:{maxConnections:100,otherAllocatedConnections:7,instances:1,reservedConnections:5}};
 const config=await f.put('setup.json',raw),trust=await f.put('setup-trust.json',fixtureReleaseTrustRaw),dsn=await f.put('setup.dsn',f.uri('setup_role',0));
 const credentials=join(f.root,'setup-credentials');await mkdir(credentials);
 const mount=(source,target)=>({type:'bind',source,target,read_only:true,bind:{create_host_path:false}});
 const service={image:f.api.image,working_dir:'/app',command:['node','workers/setup-runtime.mjs'],user:'1000:1000',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],
  environment:{ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json',ROOMQC_SETUP_CONFIG_FILE:'/etc/roomqc/setup.json',
   ROOMQC_SETUP_RELEASE_TRUST_FILE:'/etc/roomqc/setup-trust.json',ROOMQC_SETUP_DATABASE_URL_FILE:'/run/secrets/setup-dsn'},secrets:['setup-dsn'],
  volumes:[mount(config,'/etc/roomqc/setup.json'),mount(trust,'/etc/roomqc/setup-trust.json'),mount(f.budgetFile,'/etc/roomqc/resource-budget.json'),mount(credentials,'/run/roomqc/setup')]};
 f.resolved.native.services.setup=service;f.resolved.native.secrets['setup-dsn']={file:dsn};
 f.consumerManifest.nativeProjects[0].services.push({name:'setup',adapter:'provisioning-worker',databaseId:directory.id,image:f.api.image});
 f.manifest.bindings.push({project:'native',service:'setup',databaseId:directory.id,consumerId:'provisioning-worker',role:'setup_role'});
 const files=[];const result=await run(f,{readFile:async(file,max,sensitive)=>{files.push(file);return readFile(file,'utf8')}});
 assert.equal(result.allConfiguredTargetsVerified,true);assert.equal(result.bindings.length,5);assert(files.includes(dsn));
 assert(!files.some(p=>p.startsWith(credentials)));assert.doesNotMatch(JSON.stringify(result),/absent\.json|setup_role|postgresql/);
});
