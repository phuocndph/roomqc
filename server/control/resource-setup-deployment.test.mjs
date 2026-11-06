import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {preflightResourceDeployment} from './resource-deployment.mjs';
import {inspectResourceDeployment,nativeResourceProbe} from './resource-deployment-runtime.mjs';
import {preflightResourceConsumers} from './resource-vendor.mjs';
import {vendorResourceCatalog} from './resource-vendor-catalog.mjs';
import {resourcePreflightMain,resolveResourceCompose} from '../../scripts/control-backend-resource-preflight.mjs';
import {loadRuntimeResourceContext,runtimeResourceView} from './resource-runtime.mjs';
import {setupConfiguration} from './workers/setup-config.mjs';
import {startSetupRuntime} from './workers/setup-runtime.mjs';
import {recoveryBinding} from './setup-recovery.mjs';
import {syntheticRelease,syntheticToken} from './probe-test-fixtures.mjs';
import {fixtureReleaseTrust,fixtureReleaseTrustRaw,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';

const image='registry.example.invalid/roomqc/control@sha256:'+'a'.repeat(64),imageId='sha256:'+'b'.repeat(64);
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'roomqc-resource-setup-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(name,value)=>{const p=join(root,name);await writeFile(p,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});return p};
 const credentials=join(root,'credentials');await mkdir(credentials);
 const budget=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
 budget.environment='staging';const directory=budget.databases[0];
 directory.consumers.find(c=>c.id==='provisioning-worker').replicas=1;
 const cluster={id:'cluster-a',url:'https://cluster.example.invalid',internalUrl:null,inventoryRef:'cluster-a',credentialRef:'cluster-a',hostId:'host-a',approvedAddresses:[]};
 const raw={schemaVersion:1,instanceId:'setup-fixture',poolMax:2,concurrency:2,intervalMs:1000,requestTimeoutMs:6000,leaseMs:60000,
  retryBaseMs:1000,shutdownTimeoutMs:10000,targets:[{cluster,approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease,{environment:'staging'})),
   credentialFile:'/run/roomqc/setup/customer.json'}],connectionBudget:{maxConnections:100,otherAllocatedConnections:12,instances:1,reservedConnections:5}};
 const configFile=await put('setup.json',raw),budgetFile=await put('budget.json',budget),trustFile=await put('trust.json',fixtureReleaseTrustRaw);
 const mount=(source,target)=>({type:'bind',source,target,read_only:true,bind:{create_host_path:false}});
 const env={NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'staging',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json',
  ROOMQC_SETUP_CONFIG_FILE:'/etc/roomqc/setup.json',ROOMQC_SETUP_DATABASE_URL_FILE:'/run/secrets/setup-dsn',ROOMQC_SETUP_RELEASE_TRUST_FILE:'/etc/roomqc/setup-trust.json'};
 const service={image,working_dir:'/app',command:['node','workers/setup-runtime.mjs'],user:'1000:1000',read_only:true,init:true,
  cap_drop:['ALL'],security_opt:['no-new-privileges:true'],environment:env,secrets:['setup-dsn'],
  volumes:[mount(configFile,env.ROOMQC_SETUP_CONFIG_FILE),mount(budgetFile,env.ROOMQC_RESOURCE_BUDGET_FILE),
   mount(trustFile,env.ROOMQC_SETUP_RELEASE_TRUST_FILE),mount(credentials,'/run/roomqc/setup')],
  healthcheck:{test:['CMD','node','-e',"fetch('http://127.0.0.1:8095/readyz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]}};
 const project={id:'setup-fixture',files:[join(root,'compose.json')],envFiles:[],profiles:[],
  services:[{name:'setup',adapter:'provisioning-worker',databaseId:directory.id,image}]};
 const manifest={schemaVersion:1,environment:'staging',budgetFile,budgetSha256:'',projects:[project]};
 const resolved={name:project.id,services:{setup:service},networks:{default:{name:'setup-fixture-net'}},secrets:{'setup-dsn':{file:join(root,'DSN-IS-ABSENT')}}};
 const save=async()=>{await put('setup.json',raw);await put('budget.json',budget);manifest.budgetSha256=createHash('sha256').update(JSON.stringify(budget)).digest('hex')};await save();
 const run=()=>preflightResourceDeployment(manifest,{resolveProject:async()=>resolved});
 return {root,put,credentials,budget,directory,raw,cluster,configFile,budgetFile,trustFile,env,service,project,manifest,resolved,save,run};
}

test('setup PLAN accepts the separate public directory CA without widening metadata or secret mounts',async t=>{
 const f=await fixture(t);
 f.service.volumes.push({type:'volume',source:'directory-ca',target:'/run/roomqc-directory-ca',read_only:true});
 f.env.NODE_EXTRA_CA_CERTS='/run/roomqc-directory-ca/ca.crt';
 assert.equal((await f.run()).nativePlanVerified,true);
});

test('setup worker PLAN validates public signed metadata and counts pool without opening absent DSN/recovery files',async t=>{
 const f=await fixture(t),r=await f.run();assert.equal(r.nativePlanVerified,true);assert.equal(r.fullyCovered,false);
 assert(!r.unresolvedConsumers.some(c=>c.consumerId==='provisioning-worker'));
 assert.deepEqual(r.services[0].resources.consumers,[{id:'provisioning-worker',replicas:1,pools:[{id:'main',max:2}],fixedConnectionsPerReplica:0}]);
 assert.equal(r.services[0].resources.databaseId,'directory-example');
 for(const k of ['databaseIdentityVerified','runtimeVerified','capacityProven','deploymentReady'])assert.equal(r[k],false);
 assert.doesNotMatch(JSON.stringify(r),/postgresql|DSN-IS-ABSENT|customer.json|setup-fixture-net|publicKey|approvalId|credentialFile/);
});

test('wrong budget hash, database binding, environment or resource ID is rejected before runtime',async t=>{
 for(const [mutate,code] of [
  [f=>f.manifest.budgetSha256='0'.repeat(64),'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'],
  [f=>f.project.services[0].databaseId='business-example','RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'],
  [f=>f.env.ROOMQC_RESOURCE_ENVIRONMENT='production','RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH'],
  [f=>f.env.ROOMQC_RESOURCE_DATABASE_ID='wrong','RESOURCE_RUNTIME_MISMATCH']]){
  const f=await fixture(t);mutate(f);await assert.rejects(f.run,{code});
 }
});

test('disabled allocation, wrong pool, totals, replicas and malformed setup metadata cannot pass',async t=>{
 for(const mutate of [f=>f.directory.consumers.find(c=>c.id==='provisioning-worker').replicas=0,
  f=>f.raw.poolMax=1,f=>f.raw.connectionBudget.otherAllocatedConnections++,f=>f.raw.connectionBudget.instances=2,
  f=>f.raw.concurrency=3,f=>f.raw.targets[0].credentialFile='/etc/roomqc/setup.json',
  f=>f.raw.targets[0].credentialFile='/run/roomqc/setup/../private.json',f=>f.raw.targets[0].approval.signature='tampered']){
  const f=await fixture(t);mutate(f);await f.save();await assert.rejects(f.run);
 }
});

test('unapproved process, extra secret, writable/overlaid config and broad credential mounts fail closed',async t=>{
 for(const mutate of [s=>s.working_dir='/',s=>s.command.push('--once'),s=>s.entrypoint=['sh'],s=>s.environment.NODE_OPTIONS='--import /tmp/x',
  s=>s.environment.ROOMQC_SETUP_DATABASE_URL='postgresql://SECRET',s=>s.environment.ROOMQC_SETUP_ALLOW_LOCAL='true',s=>s.user='0:0',
  s=>s.ports=['8095:8095'],s=>s.secrets.push('extra'),s=>s.secrets=[{source:'setup-dsn',target:'/app/server.mjs'}],
  s=>s.volumes[0].read_only=false,s=>s.volumes[0].bind.create_host_path=true,s=>s.volumes[3].target='/run',
  s=>s.volumes.push({...s.volumes[0],target:'/app'}),s=>s.healthcheck.test=['CMD','psql'],s=>s.tmpfs=['/etc/roomqc']]){
  const f=await fixture(t);mutate(f.service);await assert.rejects(f.run);
 }
});

test('credential directory must be separate from metadata and public trust cannot be malformed or missing',async t=>{
 const f=await fixture(t);f.service.volumes[3].source=f.root;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 f.service.volumes[3].source=f.credentials;await f.put('trust.json',{version:1,keys:[]});await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_METADATA_INVALID'});
 await f.put('trust.json',fixtureReleaseTrustRaw);assert.equal((await f.run()).nativePlanVerified,true);
 await rm(f.configFile);await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
});

test('setup replicas use separate service instance IDs; duplicate identities and scaling one service are rejected',async t=>{
 const f=await fixture(t);
 for(const scale of [0,2]){f.service.scale=scale;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_SCALE_INVALID'})}delete f.service.scale;
 f.directory.consumers.find(c=>c.id==='provisioning-worker').replicas=2;f.raw.connectionBudget.instances=2;await f.save();
 f.project.services.push({...f.project.services[0],name:'setup-b'});f.resolved.services['setup-b']=structuredClone(f.service);
 await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
 const other={...f.raw,instanceId:'setup-second'},otherFile=await f.put('setup-b.json',other);
 f.resolved.services['setup-b'].volumes[0].source=otherFile;
 const r=await f.run();assert.equal(r.services.length,2);assert(!r.unresolvedConsumers.some(c=>c.consumerId==='provisioning-worker'));
});

test('combined native/vendor inventory retains provisioning contribution and does not hide other consumers',async t=>{
 const f=await fixture(t),r=await preflightResourceConsumers({schemaVersion:1,environment:'staging',budgetFile:f.budgetFile,budgetSha256:f.manifest.budgetSha256,
  nativeProjects:f.manifest.projects,vendorProjects:[],vendorCatalogId:vendorResourceCatalog.id},{resolveProject:async()=>f.resolved});
 assert.equal(r.consumerPlanChecked,true);assert.equal(r.fullyCovered,false);assert(!r.unresolvedConsumers.some(c=>c.consumerId==='provisioning-worker'));
 assert(r.unresolvedConsumers.some(c=>c.consumerId==='backup'));assert(r.unresolvedConsumers.some(c=>c.consumerId==='auth'));
});

test('actual setup Compose profile resolves with working directory, secrets and canonical healthcheck', {skip:process.env.ROOMQC_SKIP_COMPOSE_TEST==='true'},async t=>{
 const f=await fixture(t),profile=JSON.parse(await readFile(new URL('../../deploy/monitoring/setup-worker.compose.yml',import.meta.url),'utf8'));
 const envFile=await f.put('explicit.env',Object.entries({ROOMQC_SETUP_PROJECT:'setup-fixture',ROOMQC_SETUP_IMAGE:image,ROOMQC_RESOURCE_ENVIRONMENT:'staging',
  ROOMQC_SETUP_CONFIG_FILE:f.configFile,ROOMQC_RESOURCE_BUDGET_FILE:f.budgetFile,ROOMQC_SETUP_RELEASE_TRUST_FILE:f.trustFile,
  ROOMQC_SETUP_CREDENTIALS_DIR:f.credentials,ROOMQC_SETUP_DATABASE_URL_FILE:join(f.root,'DSN-IS-ABSENT'),
  ROOMQC_SETUP_DIRECTORY_NETWORK:'directory-fixture',ROOMQC_SETUP_EGRESS_NETWORK:'egress-fixture'}).map(([k,v])=>k+'='+JSON.stringify(v.replaceAll('\\','/'))).join('\n'));
 const file=await f.put('profile.json',profile),project={...f.project,files:[file],envFiles:[envFile],profiles:['setup-worker'],services:[{...f.project.services[0],name:'setup-worker'}]};
 const r=await preflightResourceDeployment({...f.manifest,projects:[project]},{resolveProject:resolveResourceCompose});
 assert.equal(r.nativePlanVerified,true);assert.equal(r.services[0].resources.consumers[0].id,'provisioning-worker');
 project.files.push((await import('node:url')).fileURLToPath(new URL('../../deploy/control/directory-clients/setup.compose.yml',import.meta.url)));
 await writeFile(envFile,(await readFile(envFile,'utf8'))+'\nROOMQC_DIRECTORY_CA_VOLUME=fixture-public-ca\n');
 assert.equal((await preflightResourceDeployment({...f.manifest,projects:[project]},{resolveProject:resolveResourceCompose})).nativePlanVerified,true);
});

test('CLI emits only safe mismatch codes and a valid partial plan remains exit2',async t=>{
 const f=await fixture(t),file=await f.put('manifest.json',f.manifest);let text='';
 const deps={resolveProject:async()=>f.resolved,output:{write:s=>{text+=s}}};
 assert.equal(await resourcePreflightMain(['--manifest',file],deps),2);assert.equal(JSON.parse(text).nativePlanVerified,true);
 f.env.ROOMQC_SETUP_CONFIG_FILE='/SECRET/password';text='';assert.equal(await resourcePreflightMain(['--manifest',file],deps),1);
 assert.equal(JSON.parse(text).code,'RESOURCE_DEPLOYMENT_MOUNT_INVALID');assert.doesNotMatch(text,/SECRET|password|postgresql/);
});

test('runtime inventory selects setup port8095, validates every bind and rejects an old cached pool',async t=>{
 const f=await fixture(t),plan=await f.run(),resources=plan.services[0].resources;
 const env={PATH:'/usr/local/bin',...f.env},entrypoint=['docker-entrypoint.sh'];f.service.networks={default:{}};
 const container={Id:'c'.repeat(64),Image:imageId,Path:entrypoint[0],Args:f.service.command,Config:{Image:image,Cmd:f.service.command,Entrypoint:entrypoint,
  WorkingDir:'/app',User:'1000:1000',Tty:false,OpenStdin:false,Env:Object.entries(env).map(([k,v])=>k+'='+v),Healthcheck:{Test:f.service.healthcheck.test},
  Labels:{'com.docker.compose.project':'setup-fixture','com.docker.compose.service':'setup','com.docker.compose.oneoff':'False','com.docker.compose.container-number':'1'}},
  HostConfig:{Privileged:false,ReadonlyRootfs:true,Init:true,Devices:[],DeviceRequests:[],VolumesFrom:[],CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges:true'],Tmpfs:{}},
  Mounts:[...f.service.volumes.map(m=>({Type:'bind',Source:m.source,Destination:m.target,RW:false,Propagation:'rprivate'})),
   {Type:'bind',Source:f.resolved.secrets['setup-dsn'].file,Destination:'/run/secrets/setup-dsn',RW:false,Propagation:'rprivate'}],
  NetworkSettings:{Networks:{'setup-fixture-net':{}}},State:{Status:'running',Running:true,Paused:false,Restarting:false,Dead:false,Pid:101,StartedAt:'2026-10-30T00:00:00Z'}};
 let inventories=0,loaded=structuredClone(resources);
 const deps={resolveProject:async()=>f.resolved,inventoryProject:async()=>{inventories++;return [structuredClone(container)]},
  inspectImage:async()=>({Id:imageId,RepoDigests:[image],Config:{Env:['PATH=/usr/local/bin'],Entrypoint:entrypoint,User:'node'}}),
  probeContainer:async(_id,options)=>{assert.deepEqual(options,{adapter:'provisioning-worker',port:8095});return loaded}};
 const r=await inspectResourceDeployment(f.manifest,deps);assert.equal(r.nativeRuntimeVerified,true);assert.equal(inventories,2);assert.equal(r.deploymentReady,false);
 loaded.consumers[0].pools[0].max=1;await assert.rejects(()=>inspectResourceDeployment(f.manifest,deps),{code:'RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH'});
 loaded=resources;container.Mounts[0].RW=true;await assert.rejects(()=>inspectResourceDeployment(f.manifest,deps),{code:'RESOURCE_RUNTIME_MOUNT_MISMATCH'});
});

test('real setup HTTP startup caches resource projection and the closed child probe reads it without secret output',async t=>{
 const f=await fixture(t),credentialFile=join(f.credentials,'customer.json'),binding=recoveryBinding(f.cluster,syntheticRelease),now=Math.floor(Date.now()/1000);
 await writeFile(credentialFile,JSON.stringify({version:1,clusterId:f.cluster.id,bindingSha256:binding.bindingHash,publishableKey:'sb_publishable_fixture',
  token:syntheticToken({iss:'roomqc-setup-recovery/v1',aud:'authenticated',role:'roomqc_setup_recovery',jti:randomUUID(),iat:now-1,exp:now+1800,
   cluster_id:f.cluster.id,binding_sha256:binding.bindingHash})}),{mode:0o600});
 const raw=structuredClone(f.raw);raw.targets[0].credentialFile=credentialFile;
 const context=loadRuntimeResourceContext({...f.env,ROOMQC_RESOURCE_BUDGET_FILE:f.budgetFile},{kind:'directory'});
 const config={...setupConfiguration(raw,{databaseUrl:'postgresql://fixture:UNUSABLE-SECRET@db.invalid/unused?sslmode=verify-full',
  trust:fixtureReleaseTrust,environment:'staging'}),resourceContext:context};
 // Explicit store/credential transport doubles: this is real HTTP and a real
 // product worker, not evidence of SQL/provisioning/cluster end-to-end execution.
 const runtime=await startSetupRuntime(config,{port:0,autoStart:false,store:{readiness:async()=>{},claim:async()=>null,settle:async()=>({settled:false})},credentialReadiness:async()=>{}});
 t.after(()=>runtime.shutdown());const port=runtime.server.address().port;await runtime.worker.tick();
 assert.equal((await fetch('http://127.0.0.1:'+port+'/readyz')).status,200);
 const probe=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',nativeResourceProbe,'provisioning-worker',String(port)],{windowsHide:true});
  let output='';child.stdout.on('data',b=>{output+=b});child.on('error',reject);child.on('close',code=>resolve({code,output}))});
 const first=await probe();assert.equal(first.code,0);assert.deepEqual(JSON.parse(first.output).resources,runtimeResourceView(config,'provisioning-worker'));
 f.directory.consumers.find(c=>c.id==='provisioning-worker').pools[0].max=3;await f.save();
 assert.deepEqual(await probe(),first,'mounted file replacement cannot pretend the startup pool changed');
 assert.doesNotMatch(first.output,/UNUSABLE-SECRET|postgresql|credential|publicKey|approval|fixture:/);
 assert.equal((await runtime.shutdown()).timedOut,false);
});
