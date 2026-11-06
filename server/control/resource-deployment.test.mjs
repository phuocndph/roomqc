import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {resourceDeploymentManifest,preflightResourceDeployment} from './resource-deployment.mjs';
import {composePreflightEnvironment,resourcePreflightMain,resolveResourceCompose} from '../../scripts/control-backend-resource-preflight.mjs';
import {fileURLToPath} from 'node:url';
import {fixtureTarget} from './test-fixtures.mjs';

const example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const image='roomqc/native@sha256:'+('a'.repeat(64));
const commands={api:['node','server.mjs'],health:['node','workers/health-runtime.mjs'],alerts:['node','workers/alert-runtime.mjs'],
  booking:['node','workers/booking-external-runtime.mjs','--config-file','/etc/roomqc/booking-external.json']};
const binding=(name,adapter,databaseId='directory-example')=>({name,adapter,databaseId,image});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'roomqc-deployment-plan-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,value)=>{const file=join(root,name);await writeFile(file,typeof value==='string'?value:JSON.stringify(value));return file};
  const budget={...structuredClone(example),environment:'production'},budgetFile=await put('budget.json',budget);
  const hash=async()=>createHash('sha256').update(await readFile(budgetFile)).digest('hex');
  const mount=(source,target)=>({type:'bind',source,target,read_only:true,bind:{create_host_path:false}});
  const service=(name)=>({image,command:commands[name],working_dir:'/app',environment:{NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'production',
    ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json'},volumes:[mount(budgetFile,'/etc/roomqc/resource-budget.json')]});
  const api=service('api'),health=service('health'),alerts=service('alerts'),booking=service('booking');
  const healthRaw={schemaVersion:2,instanceId:'fixture-health',targets:[{target:{...fixtureTarget('cluster-a'),environment:'production',measurementScope:'linux-host'},
    prometheus:{url:'https://metrics.invalid',approvedAddresses:[]}}],connectionBudget:{maxConnections:100,reservedConnections:5,apiInstances:1,apiPoolMax:5,
      reconcileInstances:0,reconcilePoolMax:2,healthInstances:1,healthPoolMax:2,exporterConnections:1,migrationConnections:1,probeInstances:1,probePoolMax:1}};
  const alertRaw={schemaVersion:1,instanceId:'fixture-alerts',poolMax:1,concurrency:1,intervalMs:1000,requestTimeoutMs:1000,leaseMs:12000,
    shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:100,otherAllocatedConnections:11,instances:1,reservedConnections:5}};
  const bookingRaw={version:1,instanceId:'fixture-booking',databaseUrlFile:'/DO-NOT-OPEN/private-dsn',channels:['telegram'],
    telegram:{botTokenFile:'/DO-NOT-OPEN/provider-token',appOrigin:'https://roomqc.invalid'},
    connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:30,workerInstances:1,workerPoolMax:2}};
  health.environment.ROOMQC_HEALTH_CONFIG_FILE='/etc/roomqc/health.json';
  health.volumes.push(mount(await put('health.json',healthRaw),'/etc/roomqc/health.json'));
  alerts.environment.ROOMQC_ALERT_CONFIG_FILE='/etc/roomqc/alerts.json';
  alerts.volumes.push(mount(await put('alerts.json',alertRaw),'/etc/roomqc/alerts.json'));
  booking.environment.ROOMQC_RESOURCE_DATABASE_ID='business-example';
  booking.volumes.push(mount(await put('booking.json',bookingRaw),'/etc/roomqc/booking-external.json'));
  const projects=[{id:'native-main',files:[await put('main.json',{})],envFiles:[],profiles:[],
    services:[binding('api','control-api'),binding('health','health-worker')]},
    {id:'native-workers',files:[await put('workers.json',{})],envFiles:[],profiles:[],
      services:[binding('alerts','alert-worker'),binding('booking','external-notifications','business-example')]}];
  const manifest={schemaVersion:1,environment:'production',budgetFile,budgetSha256:await hash(),projects};
  const resolved={'native-main':{name:'native-main',services:{api,health}},'native-workers':{name:'native-workers',services:{alerts,booking}}};
  const run=()=>preflightResourceDeployment(manifest,{resolveProject:async p=>resolved[p.id]});
  return {root,put,hash,mount,budget,budgetFile,manifest,resolved,api,health,alerts,booking,healthRaw,alertRaw,bookingRaw,run};
}
test('resolved native plans aggregate two projects, both health pools and exact business DB without reading secrets',async t=>{
  const f=await fixture(t);f.api.entrypoint=null; // Compose normalizes the inherited image entrypoint to null.
  const report=await f.run();assert.equal(report.nativePlanVerified,true);assert.equal(report.services.length,4);
  assert.deepEqual(report.services[1].resources.consumers.map(c=>c.id),['health-worker','probe-catalog']);
  assert.equal(report.fullyCovered,false);assert.ok(report.unresolvedConsumers.some(c=>c.consumerId==='auth'));
  assert.ok(report.unresolvedConsumers.some(c=>c.consumerId==='backup'));
  for(const key of ['runtimeVerified','databaseIdentityVerified','capacityProven','deploymentReady'])assert.equal(report[key],false);
  assert.deepEqual(report.acceptance,{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false});
  assert.doesNotMatch(JSON.stringify(report),/DO-NOT-OPEN|private-dsn|provider-token|budgetFile|targets|endpoint|databaseUrl/);
});
test('directory clients accept a read-only public CA without reading certificates or DSNs',async t=>{
  const f=await fixture(t);
  for(const service of [f.api,f.health,f.alerts]){
    service.volumes.push({type:'volume',source:'directory-ca',target:'/run/roomqc-directory-ca',read_only:true});
    service.environment.NODE_EXTRA_CA_CERTS='/run/roomqc-directory-ca/ca.crt';
  }
  assert.equal((await f.run()).nativePlanVerified,true);
});

test('actual API, health and alert Compose CA overlays pass native PLAN without touching live configuration',async t=>{
 const f=await fixture(t),file=p=>fileURLToPath(new URL('../../'+p,import.meta.url));
 // Copy the base into the fixture so its relative .env.control is synthetic.
 const base=await f.put('api-base.yml',await readFile(file('docker-compose.control.yml'),'utf8'));
 await f.put('.env.control','NODE_ENV=production\n');
 const vars={ROOMQC_CONTROL_IMAGE:image,ROOMQC_RESOURCE_BUDGET_FILE:f.budgetFile,ROOMQC_RESOURCE_ENVIRONMENT:'production',
  ROOMQC_DIRECTORY_NETWORK:'fixture-directory',ROOMQC_DIRECTORY_CA_VOLUME:'fixture-public-ca',ROOMQC_CONTROL_EGRESS_NETWORK:'fixture-egress',
  ROOMQC_HEALTH_PROJECT:'health-ca-plan',ROOMQC_HEALTH_IMAGE:image,ROOMQC_HEALTH_CONFIG_FILE:join(f.root,'health.json'),
  ROOMQC_HEALTH_DATABASE_URL_FILE:join(f.root,'DSN-ABSENT'),ROOMQC_HEALTH_DIRECTORY_NETWORK:'fixture-directory',ROOMQC_HEALTH_METRICS_NETWORK:'fixture-metrics',
  ROOMQC_ALERT_PROJECT:'alert-ca-plan',ROOMQC_ALERT_IMAGE:image,ROOMQC_ALERT_CONFIG_FILE:join(f.root,'alerts.json'),
  ROOMQC_ALERT_DATABASE_URL_FILE:join(f.root,'DSN-ABSENT'),ROOMQC_ALERT_ENDPOINT_FILE:join(f.root,'ENDPOINT-ABSENT'),ROOMQC_ALERT_TOKEN_FILE:join(f.root,'TOKEN-ABSENT'),
  ROOMQC_ALERT_DIRECTORY_NETWORK:'fixture-directory',ROOMQC_ALERT_EGRESS_NETWORK:'fixture-egress'};
 vars.ROOMQC_CONTROL_DATABASE_URL_FILE=join(f.root,'API-DSN-ABSENT');
 const envFile=await f.put('explicit.env',Object.entries(vars).map(([k,v])=>k+'='+JSON.stringify(v.replaceAll('\\','/'))).join('\n')+'\n');
 const configs=[['api-ca-plan','roomqc-control','control-api',[base,file('deploy/control/compose.yml'),file('deploy/control/directory-client.compose.yml'),file('deploy/control/directory-clients/api-secrets.compose.yml')],[]],
  ['health-ca-plan','health-worker','health-worker',[file('deploy/monitoring/health-worker.compose.yml'),file('deploy/control/directory-clients/health.compose.yml')],['health-worker']],
  ['alert-ca-plan','alert-worker','alert-worker',[file('deploy/monitoring/alert-worker.compose.yml'),file('deploy/control/directory-clients/alert.compose.yml')],['alert-worker']]];
 f.manifest.projects=configs.map(([id,name,adapter,files,profiles])=>({id,files,profiles,envFiles:[envFile],services:[binding(name,adapter)]}));
 const r=await preflightResourceDeployment(f.manifest,{resolveProject:resolveResourceCompose});
 assert.equal(r.nativePlanVerified,true);assert.equal(r.services.length,3);assert.equal(r.deploymentReady,false);
});

test('file-based API credential PLAN requires its exact secret target without opening the DSN',async t=>{
 const f=await fixture(t);f.api.environment.ROOMQC_CONTROL_DATABASE_URL_FILE='/run/secrets/control-dsn';f.api.secrets=['control-dsn'];
 assert.equal((await f.run()).nativePlanVerified,true);
 const baseline=structuredClone(f.api);
 for(const change of [s=>s.environment.ROOMQC_CONTROL_DATABASE_URL='postgresql://private',s=>s.environment.ROOMQC_CONTROL_DATABASE_URL_FILE='/tmp/dsn',
  s=>s.secrets=[],s=>s.secrets.push('control-dsn'),s=>s.secrets=[{source:'control-dsn',target:'/run/secrets/other'}]]){
  const s=structuredClone(baseline);change(s);f.resolved['native-main'].services.api=s;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 }
});

test('a native-only profile can be fully covered without becoming runtime/deployment acceptance',async t=>{
  const f=await fixture(t);for(const db of f.budget.databases)for(const c of db.consumers)if(c.id!=='control-api')c.replicas=0;
  await f.put('budget.json',f.budget);f.manifest.budgetSha256=await f.hash();f.manifest.projects.splice(1);
  f.manifest.projects[0].services.splice(1);delete f.resolved['native-main'].services.health;
  const r=await f.run();assert.equal(r.fullyCovered,true);assert.deepEqual(r.unresolvedConsumers,[]);assert.equal(r.deploymentReady,false);
});
test('manifest rejects tags, relative paths, duplicate projects/services and unknown adapters before resolving',async t=>{
  const f=await fixture(t);
  for(const change of [m=>m.environment='example',m=>m.budgetSha256='bad',m=>m.budgetFile='relative',m=>m.projects.push(m.projects[0]),
    m=>m.projects[0].services.push(m.projects[0].services[0]),m=>m.projects[0].services[0].image='roomqc:latest',
    m=>m.projects[0].services[0].adapter='auth',m=>m.projects[0].envFiles=['relative'],m=>m.projects[0].profiles=['*'],m=>m.token='private']){
    const changed=structuredClone(f.manifest);change(changed);assert.throws(()=>resourceDeploymentManifest(changed),{code:'RESOURCE_DEPLOYMENT_MANIFEST_INVALID'});
  }
});
test('extra, missing and wrongly named projects or services cannot silently escape the inventory',async t=>{
  const f=await fixture(t),original=structuredClone(f.resolved['native-main']);
  for(const change of [r=>r.name='another',r=>r.services.untracked=structuredClone(r.services.api),r=>delete r.services.health]){
    f.resolved['native-main']=structuredClone(original);change(f.resolved['native-main']);await assert.rejects(f.run);
  }
  f.resolved['native-main']=original;assert.equal((await f.run()).nativePlanVerified,true);
});
test('surplus replicas in one project or split across projects and missing replicas fail, then recover',async t=>{
  const f=await fixture(t);
  for(const scale of [0,2]){f.api.scale=scale;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_REPLICA_MISMATCH'})}
  delete f.api.scale;
  f.manifest.projects[1].services.push(binding('extra-api','control-api'));
  f.resolved['native-workers'].services['extra-api']=structuredClone(f.api);
  await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_REPLICA_MISMATCH'});
  delete f.resolved['native-workers'].services['extra-api'];f.manifest.projects[1].services.pop();
  assert.equal((await f.run()).nativePlanVerified,true);
});
test('scale/global/container-name conflicts cannot be interpreted as one replica',async t=>{
  const f=await fixture(t),original=structuredClone(f.api);
  for(const patch of [{scale:2,deploy:{replicas:1}},{scale:'2'},{scale:-1},{deploy:{mode:'global'}},{scale:2,container_name:'fixed'}]){
    f.resolved['native-main'].services.api={...original,...patch};await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_SCALE_INVALID'});
  }
});
test('only explicitly selected Compose profiles are active and must have an inventory entry',async t=>{
  const f=await fixture(t);f.resolved['native-main'].services.dormant={profiles:['maintenance'],image:'not-supported'};
  assert.equal((await f.run()).services.length,4);
  f.manifest.projects[0].profiles.push('maintenance');await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_UNCLASSIFIED_SERVICE'});
  f.manifest.projects[0].profiles=[];f.health.profiles=['monitoring'];await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_UNCLASSIFIED_SERVICE'});
  f.manifest.projects[0].profiles=['monitoring'];assert.equal((await f.run()).services.length,4);
});
test('individually valid but different shared budgets across projects fail exact byte binding',async t=>{
  const f=await fixture(t),other=structuredClone(f.budget);other.databases[1].maxConnections++;
  f.alerts.volumes[0].source=await f.put('other-budget.json',other);
  await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
  f.alerts.volumes[0].source=f.budgetFile;
  await f.put('budget.json',JSON.stringify(f.budget)+'\n');await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
  f.manifest.budgetSha256=await f.hash();assert.equal((await f.run()).nativePlanVerified,true);
});
test('environment downgrade, wrong exact database and conflicting API budget alias fail',async t=>{
  const f=await fixture(t);
  f.api.environment.ROOMQC_RESOURCE_ENVIRONMENT='local';await assert.rejects(f.run);
  f.api.environment.ROOMQC_RESOURCE_ENVIRONMENT='staging';await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH'});
  f.api.environment.ROOMQC_RESOURCE_ENVIRONMENT='production';
  f.booking.environment.ROOMQC_RESOURCE_DATABASE_ID='directory-example';await assert.rejects(f.run);
  f.booking.environment.ROOMQC_RESOURCE_DATABASE_ID='business-example';
  f.api.environment.ROOMQC_CONTROL_RESOURCE_BUDGET_FILE='/etc/roomqc/other.json';await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROFILE_MISMATCH'});
});
test('native metadata pool and replica declarations must match the shared profile',async t=>{
  const f=await fixture(t);f.api.environment.ROOMQC_CONTROL_API_INSTANCES='2';await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MISMATCH'});
  delete f.api.environment.ROOMQC_CONTROL_API_INSTANCES;f.healthRaw.connectionBudget.probePoolMax=2;
  await f.put('health.json',f.healthRaw);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MISMATCH'});
  f.healthRaw.connectionBudget.probePoolMax=1;await f.put('health.json',f.healthRaw);
  f.alertRaw.connectionBudget.otherAllocatedConnections=10;await f.put('alerts.json',f.alertRaw);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MISMATCH'});
  f.alertRaw.connectionBudget.otherAllocatedConnections=11;await f.put('alerts.json',f.alertRaw);
  f.bookingRaw.connectionBudget.workerPoolMax=3;await f.put('booking.json',f.bookingRaw);await assert.rejects(f.run,{code:'RESOURCE_RUNTIME_MISMATCH'});
});
test('writable, missing, ambiguous or shadowed budget mounts and secret/code overlays are refused',async t=>{
  const f=await fixture(t),original=structuredClone(f.api);
  for(const change of [s=>s.volumes[0].read_only=false,s=>s.volumes[0].bind.create_host_path=true,s=>s.volumes=[],
    s=>s.volumes.push(structuredClone(s.volumes[0])),s=>s.volumes.push(f.mount(f.root,'/etc')),
    s=>s.volumes.push(f.mount(f.root,'/app')),s=>s.secrets=[{source:'x',target:'/app/server.mjs'}],s=>s.tmpfs=['/etc/roomqc'],
    s=>s.environment.ROOMQC_RESOURCE_BUDGET_FILE='/etc/../budget.json']){
    const s=structuredClone(original);change(s);f.resolved['native-main'].services.api=s;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
  }
});
test('mutable/unapproved image, entrypoint/command and loader/lifecycle injection cannot retain a native binding',async t=>{
  const f=await fixture(t),original=structuredClone(f.api);
  for(const change of [s=>s.image='roomqc:latest',s=>s.image='roomqc/native@sha256:'+('b'.repeat(64)),s=>s.build='.',s=>s.command=['node','other.mjs'],
    s=>s.entrypoint=['sh'],s=>delete s.working_dir,s=>s.environment.NODE_OPTIONS='--import=private',s=>s.environment.LD_PRELOAD='private',
    s=>s.post_start=[{command:'private'}],s=>s.healthcheck={test:['CMD','node','-e','private']},s=>s.env_file=['private'],s=>s.privileged=true]){
    const s=structuredClone(original);change(s);f.resolved['native-main'].services.api=s;await assert.rejects(f.run,{code:'RESOURCE_DEPLOYMENT_PROCESS_MISMATCH'});
  }
});
test('CLI redacts resolver/JSON failures, keeps secret env out of reports and distinguishes incomplete coverage',async t=>{
  const f=await fixture(t),file=await f.put('manifest.json',f.manifest),lines=[],output={write:v=>lines.push(v)};
  const opts={output,resolveProject:async p=>f.resolved[p.id]};
  f.api.environment.ROOMQC_CONTROL_DATABASE_URL='postgresql://private:sentinel-secret@db.invalid/control';
  assert.equal(await resourcePreflightMain(['--manifest',file],opts),2);assert.doesNotMatch(lines.join(''),/sentinel-secret|postgresql/);
  lines.length=0;assert.equal(await resourcePreflightMain(['--manifest',file],{output,resolveProject:async()=>{throw new Error('sentinel-secret')}}),1);
  assert.doesNotMatch(lines.join(''),/sentinel-secret/);assert.equal(JSON.parse(lines[0]).nativePlanVerified,false);
  lines.length=0;assert.equal(await resourcePreflightMain(['--help'],{output,resolveProject:()=>assert.fail('must not resolve')}),0);
  assert.match(lines[0],/read-only/);
  assert.deepEqual(composePreflightEnvironment({PATH:'safe',ROOMQC_SECRET:'sentinel-secret',COMPOSE_FILE:'private',NODE_OPTIONS:'private'}),{PATH:'safe',COMPOSE_DISABLE_ENV_FILE:'true'});
});
