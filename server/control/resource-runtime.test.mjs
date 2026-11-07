import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {resourceMode,loadRuntimeResourceContext,assertControlResources,assertHealthResources,assertAlertResources,assertBookingResources,runtimeResourceView} from './resource-runtime.mjs';
import {loadConfig} from './config.mjs';
import {ControlStore} from './store.mjs';
import {startControl} from './server.mjs';
import {fixtureTarget} from './test-fixtures.mjs';
import {loadHealthConfiguration,healthConfiguration} from './workers/health-config.mjs';
import {startHealthRuntime,createHealthPool} from './workers/health-runtime.mjs';
import {loadAlertConfiguration,alertConfiguration} from './workers/alert-config.mjs';
import {startAlertRuntime} from './workers/alert-runtime.mjs';
import {loadBookingWorkerConfiguration} from './booking-notification-config.mjs';
import {startBookingExternalRuntime} from './workers/booking-external-runtime.mjs';

const example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const rawBudget=(environment='production')=>({...structuredClone(example),environment});
async function files(t,environment='production'){
  const root=await mkdtemp(join(tmpdir(),'roomqc-shared-resources-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,value)=>{const path=join(root,name);await writeFile(path,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});return path};
  const raw=rawBudget(environment),path=await put('budget.json',raw);
  const env={NODE_ENV:environment==='example'?'test':'production',ROOMQC_RESOURCE_ENVIRONMENT:environment==='example'?'local':environment,ROOMQC_RESOURCE_BUDGET_FILE:path};
  return {root,raw,path,put,env,context:kind=>loadRuntimeResourceContext({...env,...(kind==='business'?{ROOMQC_RESOURCE_DATABASE_ID:'business-example'}:{})},{kind})};
}
function apiEnvironment(f){return {...f.env,ROOMQC_PUBLIC_URL:'https://roomqc.invalid',ROOMQC_CONTROL_DATABASE_URL:'postgresql://fixture:unusable@db.invalid/owned?sslmode=verify-full',
  ROOMQC_CONTROL_EMAIL_HASH_KEY:'unusable-fixture-key-'.repeat(3),ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'cluster-a',url:'https://cluster.invalid',
    publishableKey:'public-fixture',serviceKey:'unusable-server-fixture',vapidPublicKey:'public-vapid-fixture',maxWorkspaces:10}])}}
function healthRaw(environment='production'){return {schemaVersion:2,instanceId:'resource-health',targets:[{target:{...fixtureTarget('cluster-a'),environment,measurementScope:'linux-host'},
  prometheus:{url:'https://metrics.invalid',approvedAddresses:[]}}],connectionBudget:{maxConnections:100,reservedConnections:5,apiInstances:1,apiPoolMax:5,
    reconcileInstances:0,reconcilePoolMax:2,healthInstances:1,healthPoolMax:2,exporterConnections:1,migrationConnections:1,probeInstances:1,probePoolMax:1}}}
function health(context){return {...healthConfiguration(healthRaw(context.environment),{databaseUrl:'postgresql://metrics:unusable@db.invalid/owned?sslmode=verify-full'}),resourceContext:context}}
const alertRaw=()=>({schemaVersion:1,instanceId:'resource-alerts',poolMax:1,concurrency:1,intervalMs:1000,requestTimeoutMs:1000,leaseMs:12000,
  shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:100,otherAllocatedConnections:11,instances:1,reservedConnections:5}});
function alert(context){return {...alertConfiguration(alertRaw(),{databaseUrl:'postgresql://alerts:unusable@db.invalid/owned?sslmode=verify-full',
  endpoint:'https://receiver.invalid/alerts',token:'unusable-fixture-token'}),resourceContext:context}}
const booking=context=>({production:true,resourceContext:context,connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:30,workerInstances:1,workerPoolMax:2}});

test('resource mode cannot silently downgrade production and staging requires its exact profile',t=>{
  assert.deepEqual(resourceMode({NODE_ENV:'test'}),{environment:'local',production:false});
  assert.deepEqual(resourceMode({NODE_ENV:'development',ROOMQC_RESOURCE_ENVIRONMENT:'staging'}),{environment:'staging',production:true});
  for(const env of [{NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'local'},{ROOMQC_RESOURCE_ENVIRONMENT:'example'},{ROOMQC_RESOURCE_ENVIRONMENT:''}])
    assert.throws(()=>resourceMode(env),{code:'RESOURCE_RUNTIME_MISMATCH'});
  for(const environment of ['production','staging'])assert.throws(()=>loadRuntimeResourceContext({ROOMQC_RESOURCE_ENVIRONMENT:environment},{kind:'directory'}),{code:'RESOURCE_BUDGET_REQUIRED'});
  assert.equal(loadRuntimeResourceContext({NODE_ENV:'test'},{kind:'directory'}),null);
});
test('one shared file binds environment and exact database; aliases cannot select two profiles',async t=>{
  const f=await files(t),context=f.context('directory');assert.equal(context.databaseId,'directory-example');assert.ok(Object.isFrozen(context.budget.databases[0].consumers));
  assert.throws(()=>{context.budget.databases[0].consumers[0].replicas=2},TypeError);
  for(const env of [{...f.env,ROOMQC_RESOURCE_ENVIRONMENT:'staging'}, {...f.env,ROOMQC_RESOURCE_DATABASE_ID:'business-example'},
    {...f.env,NODE_ENV:'test',ROOMQC_RESOURCE_ENVIRONMENT:'local'}])assert.throws(()=>loadRuntimeResourceContext(env,{kind:'directory'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  assert.throws(()=>loadRuntimeResourceContext(f.env,{kind:'business'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  assert.throws(()=>loadRuntimeResourceContext({...f.env,ROOMQC_RESOURCE_DATABASE_ID:'directory-example'},{kind:'business'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  assert.equal(f.context('business').databaseId,'business-example');
  assert.throws(()=>loadRuntimeResourceContext(f.env,{kind:'directory',legacyFile:join(f.root,'another.json')}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  assert.equal(loadRuntimeResourceContext(f.env,{kind:'directory',legacyFile:f.path}).databaseId,'directory-example');
  f.raw.environment='example';await f.put('budget.json',f.raw);
  assert.throws(()=>f.context('directory'),{code:'RESOURCE_RUNTIME_MISMATCH'});
});
test('API loader and runtime require the shared profile before any production store or socket is created',async t=>{
  const f=await files(t),env=apiEnvironment(f),config=loadConfig(env);assertControlResources(config);
  assert.equal(config.production,true);assert.equal(config.resourceBudget,config.resourceContext.budget);
  assert.throws(()=>loadConfig({...env,ROOMQC_RESOURCE_BUDGET_FILE:undefined}),{code:'RESOURCE_BUDGET_REQUIRED'});
  assert.throws(()=>new ControlStore({...config,resourceContext:null}),{code:'RESOURCE_BUDGET_REQUIRED'});
  for(const change of [{apiInstances:2},{poolMax:6},{poolBudget:16},{resourceBudget:structuredClone(config.resourceBudget)}])
    assert.throws(()=>assertControlResources({...config,...change}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  let calls=0;await assert.rejects(()=>startControl({...config,resourceContext:null},{store:{close:async()=>calls++},gateway:{}}),{code:'RESOURCE_BUDGET_REQUIRED'});assert.equal(calls,0);
  const staging=await files(t,'staging');assert.equal(loadConfig(apiEnvironment(staging)).resourceContext.environment,'staging');
});
test('health loader binds both role pools, replicas and all overlapping legacy budget entries',async t=>{
  const f=await files(t),raw=healthRaw(),settings=await f.put('health.json',raw),dsn=await f.put('metrics-dsn','postgresql://metrics:unusable@db.invalid/owned?sslmode=verify-full');
  const env={...f.env,ROOMQC_HEALTH_CONFIG_FILE:settings,ROOMQC_HEALTH_DATABASE_URL_FILE:dsn};
  const loaded=await loadHealthConfiguration(env);assertHealthResources(loaded);assert.equal(loaded.connectionBudget.reconcileInstances,0);
  for(const mutate of [r=>r.healthPoolMax++,r=>r.healthInstances++,r=>r.probePoolMax++,r=>r.probeInstances++,r=>r.apiInstances++,
    r=>r.reconcileInstances++,r=>r.exporterConnections++,r=>r.migrationConnections++,r=>r.reservedConnections++,r=>r.maxConnections--]){
    const changed=structuredClone(raw);mutate(changed.connectionBudget);await f.put('health.json',changed);
    await assert.rejects(()=>loadHealthConfiguration(env));
  }
  await assert.rejects(()=>loadHealthConfiguration({...env,ROOMQC_RESOURCE_BUDGET_FILE:undefined}),{code:'RESOURCE_BUDGET_REQUIRED'});
  assert.throws(()=>createHealthPool({...loaded,poolMax:3}),{code:'RESOURCE_RUNTIME_MISMATCH'});
});
test('health startup refuses missing/shared-pool drift before taking ownership of dependencies',async t=>{
  const f=await files(t),config=health(f.context('directory'));let touched=0;
  for(const change of [{resourceContext:null},{poolMax:3}])await assert.rejects(()=>startHealthRuntime({...config,...change},{pool:{end:async()=>touched++},store:{},port:0,autoStart:false}));
  assert.equal(touched,0);
  // A v1 health process must not accidentally authorize an unaccounted probe pool.
  const legacy={...config,schemaVersion:1};assert.throws(()=>assertHealthResources(legacy),{code:'RESOURCE_RUNTIME_MISMATCH'});
  f.raw.databases[0].consumers.find(c=>c.id==='probe-catalog').replicas=0;await f.put('budget.json',f.raw);
  const allowed={...legacy,resourceContext:f.context('directory')};assertHealthResources(allowed);
  const runtime=await startHealthRuntime(allowed,{store:{},pool:{end:async()=>touched++},port:0,autoStart:false});
  try{assert.equal((await fetch('http://127.0.0.1:'+runtime.server.address().port+'/livez')).status,200)}finally{await runtime.shutdown()}
  assert.equal(touched,1);
});
test('alert loader reconciles other consumers with shared totals and refuses drift before readiness or sending',async t=>{
  const f=await files(t),settings=await f.put('alerts.json',alertRaw()),dsn=await f.put('alert-dsn','postgresql://alerts:unusable@db.invalid/owned?sslmode=verify-full'),
    endpoint=await f.put('endpoint','https://receiver.invalid/alerts'),token=await f.put('token','unusable-fixture-token');
  const env={...f.env,ROOMQC_ALERT_CONFIG_FILE:settings,ROOMQC_ALERT_DATABASE_URL_FILE:dsn,ROOMQC_ALERT_ENDPOINT_FILE:endpoint,ROOMQC_ALERT_TOKEN_FILE:token};
  const config=await loadAlertConfiguration(env);assertAlertResources(config);
  for(const mutate of [r=>r.otherAllocatedConnections--,r=>r.instances++,r=>r.reservedConnections++,r=>r.maxConnections--]){
    const raw=alertRaw();mutate(raw.connectionBudget);await f.put('alerts.json',raw);await assert.rejects(()=>loadAlertConfiguration(env),{code:'RESOURCE_RUNTIME_MISMATCH'});
  }
  await assert.rejects(()=>loadAlertConfiguration({...env,ROOMQC_RESOURCE_BUDGET_FILE:undefined}),{code:'RESOURCE_BUDGET_REQUIRED'});
  let reads=0,sends=0;const options={store:{readiness:async()=>reads++,claim:async()=>null,settle:async()=>{}},send:async()=>{sends++;},port:0,autoStart:false};
  await assert.rejects(()=>startAlertRuntime({...config,resourceContext:null},options),{code:'RESOURCE_BUDGET_REQUIRED'});
  await assert.rejects(()=>startAlertRuntime({...config,poolMax:2},options),{code:'RESOURCE_RUNTIME_MISMATCH'});assert.equal(reads+sends,0);
  const runtime=await startAlertRuntime(config,options);try{assert.equal(reads,1);assert.equal(sends,0)}finally{await runtime.shutdown()}
});
test('business binding selects the exact DB and accounts all external worker replicas without combining split pools',async t=>{
  const f=await files(t),config=booking(f.context('business'));assertBookingResources(config);
  for(const mutate of [b=>b.workerPoolMax++,b=>b.workerInstances++,b=>b.otherConnections--,b=>b.maxConnections--,b=>b.reservedConnections++]){
    const changed={...config,connectionBudget:{...config.connectionBudget}};mutate(changed.connectionBudget);
    assert.throws(()=>assertBookingResources(changed),{code:'RESOURCE_RUNTIME_MISMATCH'});
  }
  f.raw.databases[1].consumers.find(c=>c.id==='external-notifications').pools=[{id:'first',max:1},{id:'second',max:1}];await f.put('budget.json',f.raw);
  assert.throws(()=>assertBookingResources({...config,resourceContext:f.context('business')}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  let pools=0;await assert.rejects(()=>startBookingExternalRuntime({...config,resourceContext:null},{Pool:class{constructor(){pools++}}}),{code:'RESOURCE_BUDGET_REQUIRED'});assert.equal(pools,0);
});
test('booking loader checks its DB profile before reading any provider secret; local shared config still binds',async t=>{
  const f=await files(t,'example'),dsn=await f.put('booking-dsn','postgresql://fixture:unusable@127.0.0.1/owned'),token=await f.put('bot-token','123456789:'+('x'.repeat(30))),
    settings=await f.put('booking.json',{version:1,instanceId:'resource-booking',databaseUrlFile:dsn,channels:['telegram'],telegram:{botTokenFile:token,appOrigin:'https://roomqc.invalid'},
      connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:30,workerInstances:1,workerPoolMax:2}});
  const env={...f.env,ROOMQC_BOOKING_ALLOW_LOCAL:'true',ROOMQC_RESOURCE_DATABASE_ID:'business-example'},config=await loadBookingWorkerConfiguration(settings,env);
  assert.equal(config.production,false);assertBookingResources(config);
  await assert.rejects(()=>loadBookingWorkerConfiguration('absent-provider-file',{NODE_ENV:'production'}),{code:'RESOURCE_BUDGET_REQUIRED'});
  await assert.rejects(()=>loadBookingWorkerConfiguration(settings,{...env,ROOMQC_RESOURCE_DATABASE_ID:'directory-example'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  const changed=JSON.parse(await readFile(settings,'utf8'));changed.connectionBudget.otherConnections=29;await f.put('booking.json',changed);
  await assert.rejects(()=>loadBookingWorkerConfiguration(settings,env),{code:'RESOURCE_RUNTIME_MISMATCH'});
});
test('Linux production booking loader accepts secure files only with a matching production business profile',async t=>{
  if(process.platform==='win32'){t.skip('Production notification file modes are enforced on Linux');return}
  const f=await files(t),dsn=await f.put('booking-dsn','postgresql://fixture:unusable@db.invalid/owned?sslmode=verify-full'),token=await f.put('bot-token','123456789:'+('x'.repeat(30))),
    path=await f.put('booking.json',{version:1,instanceId:'resource-booking',databaseUrlFile:dsn,channels:['telegram'],telegram:{botTokenFile:token,appOrigin:'https://roomqc.invalid'},
      connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:30,workerInstances:1,workerPoolMax:2}});
  const config=await loadBookingWorkerConfiguration(path,{...f.env,ROOMQC_RESOURCE_DATABASE_ID:'business-example'});
  assert.equal(config.production,true);assertBookingResources(config);assert.equal(config.connection.ssl.rejectUnauthorized,true);
});
test('native production compose templates mount a single readonly metadata file without publishing worker ports',async()=>{
  for(const [file,name]of [['monitoring/health-worker.compose.yml','health-worker'],['monitoring/alert-worker.compose.yml','alert-worker'],['booking-notifications/compose.yml','booking-external-worker']]){
    const compose=JSON.parse(await readFile(new URL('../../deploy/'+file,import.meta.url),'utf8')),service=compose.services[name];
    assert.equal(service.environment.ROOMQC_RESOURCE_BUDGET_FILE,'/etc/roomqc/resource-budget.json');
    assert.equal(service.environment.NODE_ENV,'production');assert.equal(service.ports,undefined);assert.equal(service.read_only,true);
    const mounts=service.volumes.filter(v=>v.target==='/etc/roomqc/resource-budget.json');assert.equal(mounts.length,1);
    assert.equal(mounts[0].read_only,true);assert.equal(mounts[0].bind.create_host_path,false);assert.match(mounts[0].source,/ROOMQC_RESOURCE_BUDGET_FILE:\?/);
  }
});
test('snapshot hashes the exact bounded bytes including BOM/formatting and stays frozen after file replacement',async t=>{
  const f=await files(t),bytes='\uFEFF'+JSON.stringify(f.raw,null,2)+'\n';await f.put('budget.json',bytes);
  const snapshot=loadResourceBudgetSnapshot(f.path),context=f.context('directory');
  assert.equal(snapshot.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(context.budgetSha256,snapshot.sha256);
  const view=runtimeResourceView(alert(context),'alert-worker');assert.ok(Object.isFrozen(view.consumers[0].pools[0]));
  await f.put('budget.json',JSON.stringify(f.raw));assert.notEqual(f.context('directory').budgetSha256,context.budgetSha256);
  assert.equal(runtimeResourceView(alert(context),'alert-worker').budgetSha256,view.budgetSha256);
  assert.doesNotMatch(JSON.stringify(view),/unusable|db.invalid|budget.json|databaseUrl|targets|token/);
});
test('real API, health and alert HTTP liveness expose cached safe resource views while the mounted file changes',async t=>{
  const f=await files(t),context=f.context('directory');
  const schemas=JSON.parse(await readFile(new URL('./contracts/control-v3.openapi.json',import.meta.url),'utf8')).components.schemas;
  const api=await startControl({...loadConfig(apiEnvironment(f)),host:'127.0.0.1',port:0},{store:{close:async()=>{}},gateway:{}});
  const monitor=await startHealthRuntime(health(context),{store:{},port:0,autoStart:false});
  const alerts=await startAlertRuntime(alert(context),{store:{readiness:async()=>{},claim:async()=>assert.fail('no dispatch'),settle:async()=>{}},
    send:async()=>assert.fail('no send'),port:0,autoStart:false});
  t.after(async()=>{await api.shutdown();await monitor.shutdown();await alerts.shutdown()});
  const targets=[[api,'/api/control/livez','control-api'],[monitor,'/livez','health-worker'],[alerts,'/livez','alert-worker']];
  const check=async()=>{
    for(const [runtime,path,adapter] of targets){const response=await fetch('http://127.0.0.1:'+runtime.server.address().port+path);
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const body=await response.json();assert.equal(body.resources.budgetSha256,context.budgetSha256);
      assert.deepEqual(Object.keys(body.resources).sort(),schemas.RuntimeResources.required.slice().sort());
      assert.ok(Object.keys(body.resources).every(key=>Object.hasOwn(schemas.RuntimeResources.properties,key)));
      if(adapter==='control-api'){
        assert.ok(schemas.Live.required.every(key=>Object.hasOwn(body,key)));
        assert.ok(Object.keys(body).every(key=>Object.hasOwn(schemas.Live.properties,key)));
        assert.equal(schemas.Live.properties.resources.$ref,'#/components/schemas/RuntimeResources');
      }
      assert.equal(body.resources.consumers[0].id,adapter);assert.doesNotMatch(JSON.stringify(body.resources),/unusable|db.invalid|budget.json|token/);}
  };
  await check();await f.put('budget.json','invalid replacement; a running process must not reread this file');await check();
  assert.throws(()=>f.context('directory'),{code:'INVALID_RESOURCE_BUDGET'});
});
test('external booking HTTP projection uses the cached business profile without provider or database traffic',async t=>{
  const f=await files(t,'example'),dsn=await f.put('booking-dsn','postgresql://fixture:unusable@127.0.0.1/owned'),token=await f.put('bot-token','123456789:'+('x'.repeat(30))),
    settings=await f.put('booking.json',{version:1,instanceId:'snapshot-booking',databaseUrlFile:dsn,channels:['telegram'],telegram:{botTokenFile:token,appOrigin:'https://roomqc.invalid'},
      connectionBudget:{maxConnections:100,reservedConnections:10,otherConnections:30,workerInstances:1,workerPoolMax:2}});
  const config=await loadBookingWorkerConfiguration(settings,{...f.env,ROOMQC_BOOKING_ALLOW_LOCAL:'true',ROOMQC_RESOURCE_DATABASE_ID:'business-example'});
  const sql=[];class Pool{on(){}async end(){}async connect(){return {release(){},query:async query=>{sql.push(query);
    return {rows:[query.includes('AS safe')?{safe:true}:{result:{schema_version:1,channels:['push','telegram'].map(channel=>({channel,
      enabled:false,configuration_id:null,updated_at:'2026-10-28T00:00:00Z'}))}}]};}}}}
  const runtime=await startBookingExternalRuntime(config,{Pool,port:0,autoStart:false});t.after(()=>runtime.shutdown());
  await f.put('budget.json','invalid replacement');
  const response=await fetch('http://127.0.0.1:'+runtime.server.address().port+'/livez'),body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(body.resources,runtimeResourceView(config,'external-notifications'));
  assert.equal(body.resources.databaseId,'business-example');assert.equal(body.resources.consumers[0].pools[0].max,2);assert.equal(sql.length,2);
  assert.doesNotMatch(JSON.stringify(body),/unusable|bot-token|databaseUrl|providers/);
});
