import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {preflightResourceDeployment} from './resource-deployment.mjs';
import {inspectResourceDeployment} from './resource-deployment-runtime.mjs';
import {resolveResourceCompose,resourcePreflightMain} from '../../scripts/control-backend-resource-preflight.mjs';
import {resourceRuntimeMain} from '../../scripts/control-backend-resource-runtime-check.mjs';
import {preflightResourceConsumers} from './resource-vendor.mjs';
import {vendorResourceCatalog} from './resource-vendor-catalog.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials} from './directory-runtime-logins.mjs';
import {renderDirectoryRuntimeWiring} from './directory-runtime-wiring.mjs';
const repository=new URL('../../',import.meta.url);
const read=p=>readFile(new URL(p,repository),'utf8');
const image='registry.example.invalid/roomqc/control@sha256:'+'a'.repeat(64);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'roomqc-summary-resource-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(p,value)=>{await writeFile(p,typeof value==='string'?value:JSON.stringify(value));return p};
 const dirs=Object.fromEntries(['private','journal','output'].map(n=>[n,join(root,n)]));
 for(const dir of Object.values(dirs))await mkdir(dir);
 const budget=JSON.parse(await read('deploy/control-resource-budget.example.json'));budget.environment='staging';
 for(const db of budget.databases){
  for(const c of db.consumers)c.replicas=c.id==='control-api'?1:0;
  db.consumers.push({id:'summary-credential-rotation',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
 }
 const budgetFile=join(dirs.private,'resource-budget.json');
 const policy=JSON.parse(await read('deploy/monitoring/summary-rotation.example.json')),policyFile=join(root,'policy.json');
 const config=JSON.parse(await read('deploy/monitoring/summary-installer.template.json'));
 config.business.expected={systemIdentifier:'123',databaseOid:'16384',databaseName:'business',role:'fixture-summary-issuer'};
 config.directory.expected={systemIdentifier:'456',databaseOid:'16385',databaseName:'directory',role:'fixture-summary-observer'};
 config.businessDatabaseId='business-example';
 config.target.cluster={id:'fixture-cluster',hostId:'fixture-host',inventoryRef:'fixture-cluster',credentialRef:'fixture-cluster',
  url:'https://fixture.invalid',internalUrl:null,approvedAddresses:[]};
 config.target.expected={clusterId:'fixture-cluster',releaseId:'fixture-release',artifactDigest:'1'.repeat(64),
  frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
 config.target.approval={testOnly:'NOT_APPROVED_BY_PLAN'};config.publisher.signer.fingerprint='5'.repeat(64);
 const configFile=join(dirs.private,'summary-installer.json');
 const mount=(source,target,ro=true)=>({type:'bind',source,target,read_only:ro,bind:{create_host_path:false}});
 const summary={image,working_dir:'/app',command:['node','workers/summary-rotation-runtime.mjs','--config-file','/etc/roomqc/rotation.json'],
  user:'1000:1000',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],init:true,
  environment:{NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'staging'},
  volumes:[mount(policyFile,'/etc/roomqc/rotation.json'),mount(dirs.private,'/etc/roomqc/private'),
   mount(dirs.journal,'/var/lib/roomqc/summary-rotation-journal',false),mount(dirs.output,'/run/roomqc/summary',false)]};
 const api={image,working_dir:'/app',command:['node','server.mjs'],environment:{NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'staging',
  ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json'},volumes:[mount(budgetFile,'/etc/roomqc/resource-budget.json')]};
 const apiFile=await put(join(root,'api.compose.json'),{name:'native-main',services:{api}});
 const projects=[{id:'native-main',files:[apiFile],envFiles:[],profiles:[],services:[{name:'api',adapter:'control-api',databaseId:'directory-example',image}]},
  {id:'summary-native',files:[join(root,'summary.compose.json')],envFiles:[],profiles:[],
   services:[{name:'rotation',adapter:'summary-credential-rotation',databaseId:'business-example',image}]}];
 const manifest={schemaVersion:1,environment:'staging',budgetFile,budgetSha256:'',projects};
 const resolved={'native-main':{name:'native-main',services:{api}},'summary-native':{name:'summary-native',services:{rotation:summary}}};
 const save=async()=>{
  const text=JSON.stringify(budget);config.resourceBudgetSha256=manifest.budgetSha256=createHash('sha256').update(text).digest('hex');
  await put(budgetFile,text);await put(configFile,config);await put(policyFile,policy);
 };await save();
 const run=()=>preflightResourceDeployment(manifest,{resolveProject:async p=>resolved[p.id]});
 return {root,put,dirs,budget,budgetFile,policy,policyFile,config,configFile,summary,api,manifest,resolved,mount,save,run};
}
test('rotator PLAN accepts only the separate public directory CA alongside its existing scoped mounts',async t=>{
 const f=await fixture(t);
 f.summary.volumes.push({type:'volume',source:'directory-ca',target:'/run/roomqc-directory-ca',read_only:true});
 f.summary.environment.NODE_EXTRA_CA_CERTS='/run/roomqc-directory-ca/ca.crt';
 assert.equal((await f.run()).nativePlanVerified,true);
});

test('one rotator is counted once in BOTH databases; metadata plan never opens absent DSN/signing/trust files or grants release approval',async t=>{
 const f=await fixture(t),r=await f.run();assert.equal(r.nativePlanVerified,true);assert.equal(r.fullyCovered,true);
 const resources=r.services[1].resources;assert.equal(resources.schemaVersion,2);
 assert.deepEqual(resources.databases.map(d=>d.databaseId),['directory-example','business-example']);
 assert(resources.databases.every(d=>d.consumers[0].id==='summary-credential-rotation'&&d.consumers[0].replicas===1&&d.consumers[0].pools[0].max===1));
 assert.equal(r.databaseIdentityVerified,false);assert.equal(r.deploymentReady,false);assert.equal(r.acceptance.productAccepted,false);
 assert.doesNotMatch(JSON.stringify(r),/NOT_APPROVED|fixture-summary|systemIdentifier|dsnFile|keyFile|private|isolation/);
});
test('summary credential wiring uses the exact read-only child config/DSN pair and does not open the DSN',async t=>{
 const f=await fixture(t),config=await f.put(join(f.root,'wired-installer.json'),f.config),dsn=await f.put(join(f.root,'observer.dsn'),'UNUSABLE-DSN-DO-NOT-READ');
 f.summary.volumes.push(f.mount(config,'/etc/roomqc/private/summary-installer.json'),f.mount(dsn,'/etc/roomqc/private/summary-directory.dsn'));
 await f.put(f.configFile,{testOnly:'old parent input must be shadowed'});
 assert.equal((await f.run()).fullyCovered,true);
 const baseline=structuredClone(f.summary.volumes);
 for(const change of [v=>v.pop(),v=>v.at(-1).read_only=false,v=>v.at(-1).target='/etc/roomqc/private/other.dsn',
  v=>v.at(-1).source=f.dirs.private,v=>v.push({...v.at(-1)})]){
  f.summary.volumes=structuredClone(baseline);change(f.summary.volumes);await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 }
 f.summary.volumes=baseline;
 const wrong=structuredClone(f.config);wrong.directory.dsnFile='/etc/roomqc/private/other.dsn';await f.put(config,wrong);
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_METADATA_INVALID'});
});

test('actual generated API and summary overlays pass native PLAN with the overridden observer metadata',async t=>{
 const f=await fixture(t);f.config.directory.expected.databaseName='roomqc_control';await f.save();
 const snapshot=loadResourceBudgetSnapshot(f.budgetFile),plan=directoryRuntimePlan({version:1,environment:'staging',deploymentId:'generated-a',
  expected:{databaseName:'roomqc_control',databaseOid:'16385',systemIdentifier:'456'},budgetSha256:snapshot.sha256},snapshot);
 const credentials=join(f.root,'logins'),output=join(f.root,'wiring');await mkdir(credentials);await mkdir(output);
 const bundle=createDirectoryRuntimeCredentials(plan),rendered=renderDirectoryRuntimeWiring(plan,bundle,{credentialsDirectory:credentials,outputDirectory:output,
  summaryInputs:[{ordinal:1,installer:f.config}]});
 for(const role of plan.roles)await f.put(join(credentials,role.name+'.dsn'),'PLAN-MUST-NOT-OPEN-DSN');
 for(const file of rendered.files)await f.put(join(output,file.name),file.content);
 f.manifest.projects[0].services[0].name='roomqc-control';
 await f.put(f.manifest.projects[0].files[0],{name:'native-main',services:{'roomqc-control':f.api}});
 f.manifest.projects[0].files.push(join(output,'control-api-1.compose.json'));
 const project=f.manifest.projects[1],path=await import('node:url'),envFile=join(f.root,'generated-summary.env');
 project.files=[path.fileURLToPath(new URL('deploy/monitoring/summary-rotation.compose.yml',repository)),join(output,'summary-credential-rotation-1.compose.json')];
 project.envFiles=[envFile];project.profiles=['summary-rotation'];project.services[0].name='summary-credential-rotation';
 const vars={ROOMQC_SUMMARY_ROTATION_PROJECT:project.id,ROOMQC_SUMMARY_IMAGE:image,ROOMQC_RESOURCE_ENVIRONMENT:'staging',
  ROOMQC_SUMMARY_ROTATION_CONFIG_FILE:f.policyFile,ROOMQC_SUMMARY_INSTALLER_PRIVATE_DIR:f.dirs.private,
  ROOMQC_SUMMARY_ROTATION_JOURNAL_DIR:f.dirs.journal,ROOMQC_SUMMARY_CREDENTIALS_DIR:f.dirs.output,
  ROOMQC_SUMMARY_DIRECTORY_NETWORK:'fixture-directory',ROOMQC_SUMMARY_EGRESS_NETWORK:'fixture-egress'};
 await f.put(envFile,Object.entries(vars).map(([k,v])=>k+'='+JSON.stringify(v.replaceAll('\\','/'))).join('\n')+'\n');
 const report=await preflightResourceDeployment(f.manifest,{resolveProject:resolveResourceCompose});
 assert.equal(report.nativePlanVerified,true);assert.equal(report.fullyCovered,true);assert.equal(report.deploymentReady,false);
});

test('missing consumer on either database, wrong business ID/hash or pool/fixed/replica mismatch refuses the plan',async t=>{
 const f=await fixture(t),base=structuredClone(f.budget);
 for(const kind of ['directory','business'])for(const mutate of [d=>d.consumers.pop(),
  d=>d.consumers.at(-1).pools[0].max=2,d=>d.consumers.at(-1).fixedConnectionsPerReplica=1,d=>d.consumers.at(-1).replicas=2]){
  f.budget.databases=structuredClone(base.databases);mutate(f.budget.databases.find(d=>d.kind===kind));await f.save();
  await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
 }
 f.budget.databases=base.databases;await f.save();f.config.resourceBudgetSha256='f'.repeat(64);await f.put(f.configFile,f.config);
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
 await f.save();f.manifest.projects[1].services[0].databaseId='other-business';await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
});
test('combined native/vendor inventory preserves both summary DB contributions alongside the Auth pool',async t=>{
 const f=await fixture(t),business=f.budget.databases.find(d=>d.kind==='business');
 business.consumers.find(c=>c.id==='auth').replicas=1;await f.save();
 const authImage=vendorResourceCatalog.entries.find(e=>e.id==='auth').image;
 const vendor={id:'vendor-auth',files:[join(f.root,'vendor.json')],envFiles:[],profiles:[],
  services:[{name:'auth',adapter:'auth',databaseId:business.id,image:authImage}]};
 const consumerManifest={schemaVersion:1,environment:'staging',budgetFile:f.budgetFile,budgetSha256:f.manifest.budgetSha256,
  vendorCatalogId:vendorResourceCatalog.id,nativeProjects:f.manifest.projects,vendorProjects:[vendor]};
 f.resolved[vendor.id]={name:vendor.id,services:{auth:{image:authImage,environment:{GOTRUE_DB_DRIVER:'postgres',
  GOTRUE_DB_MAX_POOL_SIZE:'5',GOTRUE_DB_MAX_IDLE_POOL_SIZE:'5',GOTRUE_DB_CONN_PERCENTAGE:'0',
  GOTRUE_DB_DATABASE_URL:'postgresql://fixture:sentinel-fake-password@db.invalid/business?sslmode=verify-full'}}}};
 const r=await preflightResourceConsumers(consumerManifest,{resolveProject:async p=>f.resolved[p.id]});
 assert.equal(r.fullyCovered,true);assert.equal(r.nativePlanChecked,true);assert.deepEqual(r.unresolvedConsumers,[]);
 assert.equal(r.services.find(s=>s.adapter==='summary-credential-rotation').resources.databases.length,2);
 assert.equal(r.services.find(s=>s.adapter==='auth').plannedServerConnections,5);
 assert.doesNotMatch(JSON.stringify(r),/sentinel-fake|fixture-summary|dsnFile|keyFile/);
 assert.equal(r.runtimeVerified,false);assert.equal(r.deploymentReady,false);
});
test('actual Compose replicas cannot silently exceed or duplicate a single-login rotation service',async t=>{
 const f=await fixture(t);
 for(const scale of [0,2]){f.summary.scale=scale;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_SCALE_INVALID'})}
 delete f.summary.scale;assert.equal((await f.run()).fullyCovered,true);
});
test('two separately configured rotators aggregate both DBs and require distinct instance and SQL login identities',async t=>{
 const f=await fixture(t);for(const db of f.budget.databases)db.consumers.at(-1).replicas=2;f.config.replicas=2;await f.save();
 const secondPrivate=join(f.root,'private-b'),secondJournal=join(f.root,'journal-b');await mkdir(secondPrivate);await mkdir(secondJournal);
 const secondPolicy=structuredClone(f.policy),secondConfig=structuredClone(f.config),policyFile=join(f.root,'policy-b.json');
 const second=structuredClone(f.summary);second.volumes[0].source=policyFile;second.volumes[1].source=secondPrivate;second.volumes[2].source=secondJournal;
 f.resolved['summary-native'].services['rotation-b']=second;
 f.manifest.projects[1].services.push({...f.manifest.projects[1].services[0],name:'rotation-b'});
 await f.put(join(secondPrivate,'resource-budget.json'),await readFile(f.budgetFile,'utf8'));
 const saveSecond=async()=>{await f.put(policyFile,secondPolicy);await f.put(join(secondPrivate,'summary-installer.json'),secondConfig)};
 await saveSecond();await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
 secondPolicy.instanceId='summary-rotation-b';await saveSecond();await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
 secondConfig.business.expected.role='fixture-summary-issuer-b';await saveSecond();await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
 secondConfig.directory.expected.role='fixture-summary-observer-b';await saveSecond();assert.equal((await f.run()).fullyCovered,true);
});
test('extra reserved maintenance consumers stay unresolved instead of disappearing from the total',async t=>{
 const f=await fixture(t);for(const db of f.budget.databases)
  db.consumers.push({id:'summary-credential-issuer',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
 await f.save();const r=await f.run();assert.equal(r.fullyCovered,false);assert.equal(r.unresolvedConsumers.length,2);
 assert(r.unresolvedConsumers.every(c=>c.consumerId==='summary-credential-issuer'));
});
test('private/journal/output aliasing, extra or writable private mounts and output-contained inputs are refused',async t=>{
 const f=await fixture(t),original=structuredClone(f.summary.volumes);
 for(const mutate of [m=>m[1].read_only=false,m=>m[0].bind.create_host_path=true,m=>m.push(structuredClone(m[0])),
  m=>m[2].source=m[1].source,m=>m[3].source=f.root,m=>m[1].target='/etc',m=>m[3].type='volume']){
  f.summary.volumes=structuredClone(original);mutate(f.summary.volumes);await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 }
 const hiddenChild=join(f.dirs.private,'..output');await mkdir(hiddenChild);
 f.summary.volumes=structuredClone(original);f.summary.volumes[3].source=hiddenChild;
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 f.summary.volumes=original;f.config.business.dsnFile='/run/roomqc/summary/leaked-dsn';await f.put(f.configFile,f.config);
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_METADATA_INVALID'});
});
test('unreviewed process overrides and environment downgrade are denied before metadata can count capacity',async t=>{
 const f=await fixture(t),original=structuredClone(f.summary);
 for(const patch of [{user:'0'},{read_only:false},{command:['node','other.mjs']},{cap_add:['SYS_ADMIN']},
  {environment:{...f.summary.environment,NODE_OPTIONS:'--import=private'}},{working_dir:'/other'},
  {security_opt:['no-new-privileges:true','seccomp=unconfined']},{healthcheck:{test:['CMD','arbitrary']}}]){
  f.resolved['summary-native'].services.rotation={...original,...patch};await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
 }
 f.resolved['summary-native'].services.rotation=original;original.environment.ROOMQC_RESOURCE_ENVIRONMENT='production';
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH'});
});
test('summary runtime checks loaded dual-DB profile, detects stale config and recovers only with matching cached metadata',async t=>{
 const f=await fixture(t),project=f.manifest.projects[1],imageId='sha256:'+'b'.repeat(64),id='c'.repeat(64);
 f.manifest.projects=[project];f.summary.networks={directory:null};f.resolved[project.id].networks={directory:{name:'fixture-directory'}};
 const initial=(await f.run()).services[0].resources;let cached=initial;
 const imageConfig={Id:imageId,RepoDigests:[image],Config:{Env:['PATH=/usr/local/bin'],Entrypoint:['docker-entrypoint.sh'],User:'node'}};
 const container={Id:id,Image:imageId,Path:'docker-entrypoint.sh',Args:f.summary.command,
  Config:{Image:image,Cmd:f.summary.command,Entrypoint:['docker-entrypoint.sh'],WorkingDir:'/app',User:'1000:1000',Tty:false,OpenStdin:false,
   Env:Object.entries({PATH:'/usr/local/bin',...f.summary.environment}).map(([k,v])=>k+'='+v),
   Labels:{'com.docker.compose.project':project.id,'com.docker.compose.service':'rotation','com.docker.compose.oneoff':'False','com.docker.compose.container-number':'1'}},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,Init:true,Devices:[],DeviceRequests:[],VolumesFrom:[],CapAdd:null,CapDrop:['ALL'],
   SecurityOpt:['no-new-privileges:true'],Tmpfs:{}},
  Mounts:f.summary.volumes.map(m=>({Type:'bind',Source:m.source,Destination:m.target,RW:!m.read_only,Propagation:'rprivate'})),
  NetworkSettings:{Networks:{'fixture-directory':{}}},State:{Status:'running',Running:true,Paused:false,Restarting:false,Dead:false,Pid:123,StartedAt:'2026-10-29T00:00:00Z'}};
 const dependencies={resolveProject:async p=>f.resolved[p.id],inventoryProject:async()=>[structuredClone(container)],inspectImage:async()=>imageConfig,
  probeContainer:async(_id,{adapter,port})=>{assert.equal(adapter,'summary-credential-rotation');assert.equal(port,8097);return cached}};
 const run=()=>inspectResourceDeployment(f.manifest,dependencies);
 assert.equal((await run()).nativeRuntimeVerified,true);assert.equal((await run()).deploymentReady,false);
 f.policy.instanceId='changed-instance';await f.save();await assert.rejects(run,{code:'RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH'});
 cached=(await f.run()).services[0].resources;assert.equal((await run()).nativeRuntimeVerified,true);
 cached={...cached,configurationSha256:'f'.repeat(64)};await assert.rejects(run,{code:'RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH'});
 cached=(await f.run()).services[0].resources;
 const lines=[],path=await f.put(join(f.root,'manifest.json'),f.manifest);
 assert.equal(await resourceRuntimeMain(['--manifest',path],{dependencies,output:{write:s=>lines.push(s)}}),2);
 assert.equal(JSON.parse(lines[0]).nativeRuntimeVerified,true); // control-api remains explicitly unresolved.
});
test('CLI redacts malformed metadata content and does not print resolved secrets',async t=>{
 const f=await fixture(t),path=await f.put(join(f.root,'manifest.json'),f.manifest),lines=[];
 await f.put(f.configFile,'sentinel-private-content');
 assert.equal(await resourcePreflightMain(['--manifest',path],{resolveProject:async p=>f.resolved[p.id],output:{write:s=>lines.push(s)}}),1);
 assert.equal(JSON.parse(lines[0]).code,'RESOURCE_DEPLOYMENT_METADATA_INVALID');assert.doesNotMatch(lines.join(''),/sentinel-private|dsn|password/);
});
test('real Compose summary profile passes resource PLAN adapter with both databases accounted and no resources created',
 {skip:process.env.ROOMQC_SUMMARY_COMPOSE_TEST!=='1'},async t=>{
 const f=await fixture(t),project=f.manifest.projects[1],envFile=join(f.root,'summary.env');
 const path=await import('node:url');project.files=[path.fileURLToPath(new URL('deploy/monitoring/summary-rotation.compose.yml',repository))];
 project.envFiles=[envFile];project.profiles=['summary-rotation'];project.services[0].name='summary-credential-rotation';
 const vars={ROOMQC_SUMMARY_ROTATION_PROJECT:project.id,ROOMQC_SUMMARY_IMAGE:image,ROOMQC_RESOURCE_ENVIRONMENT:'staging',
  ROOMQC_SUMMARY_ROTATION_CONFIG_FILE:f.policyFile,ROOMQC_SUMMARY_INSTALLER_PRIVATE_DIR:f.dirs.private,
  ROOMQC_SUMMARY_ROTATION_JOURNAL_DIR:f.dirs.journal,ROOMQC_SUMMARY_CREDENTIALS_DIR:f.dirs.output,
  ROOMQC_SUMMARY_DIRECTORY_NETWORK:'fixture-directory',ROOMQC_SUMMARY_EGRESS_NETWORK:'fixture-egress'};
 await f.put(envFile,Object.entries(vars).map(([k,v])=>k+'='+JSON.stringify(v.replaceAll('\\','/'))).join('\n')+'\n');
 const report=await preflightResourceDeployment(f.manifest,{resolveProject:resolveResourceCompose});
 assert.equal(report.fullyCovered,true);assert.equal(report.services[1].resources.databases.length,2);assert.equal(report.deploymentReady,false);
 project.files.push(path.fileURLToPath(new URL('deploy/control/directory-clients/summary.compose.yml',repository)));
 await f.put(envFile,(await readFile(envFile,'utf8'))+'\nROOMQC_DIRECTORY_CA_VOLUME=fixture-public-ca\n');
 assert.equal((await preflightResourceDeployment(f.manifest,{resolveProject:resolveResourceCompose})).fullyCovered,true);
});
