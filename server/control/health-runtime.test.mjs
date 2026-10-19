import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {healthConfiguration,loadHealthConfiguration,validateHealthSecretAccess} from './workers/health-config.mjs';
import {startHealthRuntime,createHealthPool} from './workers/health-runtime.mjs';
import {fixtureTarget} from './test-fixtures.mjs';

function raw(){return {schemaVersion:1,instanceId:'health-fixture',targets:[{target:fixtureTarget('cluster-a'),
  prometheus:{url:'http://127.0.0.1:9090',approvedAddresses:['127.0.0.1']}}],
  connectionBudget:{maxConnections:30,reservedConnections:5,apiInstances:2,apiPoolMax:5,reconcileInstances:1,reconcilePoolMax:2,
    healthInstances:2,healthPoolMax:2,exporterConnections:1,migrationConnections:1}}}
const local={databaseUrl:'postgresql://fixture:private-password@127.0.0.1:5432/fixture',production:false,allowLocal:true};
const config=()=>healthConfiguration(raw(),local);
test('health config reserves aggregate connection capacity and forbids unknown secrets, duplicate targets and unapproved transports',()=>{
  assert.equal(config().connectionBudget.allocatedConnections,23);assert.equal(config().intervalMs,30000);
  assert.equal(config().concurrency,1);assert.ok(Object.isFrozen(config().targets[0].target));
  for(const change of [r=>{r.serviceKey='secret'},r=>{r.intervalMs=1},r=>{r.targets=[]},r=>{r.targets.push(r.targets[0])},
    r=>{r.targets[0].prometheus.url='http://metadata.invalid'},r=>{r.targets[0].prometheus.url='https://monitor.invalid/path'},
    r=>{r.targets[0].prometheus.approvedAddresses=['invalid']},r=>{r.targets[0].prometheus.approvedAddresses=['127.0.0.1','127.0.0.1']},
    r=>{r.connectionBudget.healthPoolMax=5},r=>{r.connectionBudget.apiInstances=0},r=>{r.connectionBudget.reservedConnections=-1}]){
    const value=raw();change(value);assert.throws(()=>healthConfiguration(value,local));
  }
  const over=raw();over.connectionBudget.maxConnections=22;
  assert.throws(()=>healthConfiguration(over,local),{code:'HEALTH_CONNECTION_BUDGET'});
  for(const databaseUrl of ['https://fixture.invalid','postgresql://127.0.0.1/fixture','postgresql://user:pass@db.invalid/fixture']){
    assert.throws(()=>healthConfiguration(raw(),{...local,databaseUrl}));
  }
  assert.throws(()=>healthConfiguration(raw(),{...local,production:true}));
  const prod=raw();prod.targets[0]={target:{...fixtureTarget('cluster-a'),environment:'production',measurementScope:'linux-host'},
    prometheus:{url:'https://monitor.example.invalid',approvedAddresses:['10.0.0.2']}};
  assert.equal(healthConfiguration(prod,{databaseUrl:'postgresql://metrics:pass@directory.invalid/control?sslmode=verify-full'}).allowLocal,false);
});
test('health config loads bounded absolute files only, never API env secrets; errors are redacted',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'roomqc-health-config-'));
  const settings=join(dir,'health.json'),secret=join(dir,'metrics-dsn');
  const env={NODE_ENV:'development',ROOMQC_HEALTH_ALLOW_LOCAL:'true',ROOMQC_HEALTH_CONFIG_FILE:settings,ROOMQC_HEALTH_DATABASE_URL_FILE:secret,
    ROOMQC_CONTROL_DATABASE_URL:'not-usable',ROOMQC_CONTROL_EMAIL_HASH_KEY:'private-email-key'};
  try{
    await writeFile(settings,JSON.stringify(raw()));await writeFile(secret,local.databaseUrl+'\n',{mode:0o600});
    const loaded=await loadHealthConfiguration(env);assert.equal(loaded.databaseUrl,local.databaseUrl);
    assert.equal(loaded.emailKey,undefined);assert.equal(loaded.clusters,undefined);
    for(const changes of [{ROOMQC_HEALTH_DATABASE_URL_FILE:undefined},{ROOMQC_HEALTH_CONFIG_FILE:'relative.json'},
      {ROOMQC_HEALTH_CONFIG_FILE:dir},{ROOMQC_HEALTH_CONFIG_FILE:join(dir,'absent')}]){
      await assert.rejects(()=>loadHealthConfiguration({...env,...changes}),{code:'INVALID_HEALTH_CONFIG'});
    }
    await writeFile(secret,'private-password'.repeat(1000));
    await assert.rejects(()=>loadHealthConfiguration(env),error=>error.code==='INVALID_HEALTH_CONFIG'&&!error.message.includes('private-password'));
  }finally{await rm(dir,{recursive:true})}
});
test('health worker validates Unix secret access and --help cannot start a DB or worker',()=>{
  for(const info of [{uid:1000,gid:1000,mode:0o600},{uid:0,gid:1000,mode:0o640}])validateHealthSecretAccess(info);
  for(const info of [{uid:1000,gid:1000,mode:0o644},{uid:0,gid:0,mode:0o600},{uid:1000,gid:1,mode:0o640},
    {uid:1000,gid:1000,mode:0o660}])assert.throws(()=>validateHealthSecretAccess(info),{code:'INVALID_HEALTH_CONFIG'});
  const output=execFileSync(process.execPath,['server/control/workers/health-runtime.mjs','--help'],{encoding:'utf8'});
  assert.match(output,/No service probes configured until M06/);
});
test('metrics pool has bounded connections, SQL, lock and acquire deadlines without a DB connection at construction',async()=>{
  const pool=createHealthPool(config());
  try{
    assert.equal(pool.options.max,2);assert.equal(pool.options.connectionTimeoutMillis,2000);
    assert.equal(pool.options.statement_timeout,3000);assert.equal(pool.options.lock_timeout,2000);
    assert.equal(pool.options.application_name,'roomqc-health-worker');assert.equal(pool.totalCount,0);
  }finally{await pool.end()}
});
test('health worker compose is opt-in, non-root, private, bounded and has no API, migrator, email or service_role credentials',async()=>{
  const compose=JSON.parse(await readFile(new URL('../../deploy/monitoring/health-worker.compose.yml',import.meta.url),'utf8'));
  const worker=compose.services['health-worker'];
  assert.deepEqual(worker.profiles,['health-worker']);assert.equal(worker.user,'1000:1000');assert.equal(worker.read_only,true);
  assert.deepEqual(worker.cap_drop,['ALL']);assert.deepEqual(worker.security_opt,['no-new-privileges:true']);
  assert.deepEqual(worker.command,['node','workers/health-runtime.mjs']);
  for(const key of ['ports','privileged','network_mode','pid','env_file'])assert.equal(worker[key],undefined);
  assert.equal(JSON.stringify(worker.volumes).includes('docker.sock'),false);assert.equal(worker.volumes[0].read_only,true);
  assert.ok(worker.mem_limit&&worker.cpus&&worker.pids_limit&&worker.logging.options['max-size']);
  assert.deepEqual(Object.keys(worker.environment).sort(),['NODE_ENV','ROOMQC_HEALTH_CONFIG_FILE','ROOMQC_HEALTH_DATABASE_URL_FILE']);
  assert.deepEqual(worker.secrets,['metrics-dsn']);
  for(const network of Object.values(compose.networks))assert.equal(network.external,true);
  const dockerfile=await readFile(new URL('./Dockerfile',import.meta.url),'utf8');
  assert.match(dockerfile,/COPY server\/control\/workers \.\/workers/);assert.match(dockerfile,/FROM node:22-alpine@sha256:[a-f0-9]{64}/);
});
test('loopback worker runtime sweeps while probes are unconfigured, keeps readiness closed and exposes only safe heartbeat data',async()=>{
  let sweeps=0,records=0;
  const store={readiness:async()=>{},expireStale:async()=>sweeps++,assertTarget:async()=>{},record:async()=>{records++;return {accepted:true}}};
  const runtime=await startHealthRuntime(config(),{store,port:0,autoStart:false});
  const base='http://127.0.0.1:'+runtime.server.address().port;
  try{
    assert.equal(runtime.server.address().address,'127.0.0.1');
    assert.equal((await fetch(base+'/livez')).status,200);assert.equal((await fetch(base+'/readyz')).status,503);
    await runtime.worker.tick();assert.equal(sweeps,1);assert.equal(records,0);
    const response=await fetch(base+'/readyz'),body=await response.json();
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(body.lastErrorCode,'HEALTH_PROBES_UNCONFIGURED');
    assert.ok(!JSON.stringify(body).includes('private-password'));assert.ok(!JSON.stringify(body).includes('mountpoint'));
    assert.equal((await fetch(base+'/readyz?url=anything')).status,404);
    assert.equal((await fetch(base+'/readyz',{method:'POST'})).status,404);
  }finally{assert.equal((await runtime.shutdown()).timedOut,false)}
});
test('loopback readiness becomes true after a verified collection cycle, then shutdown cancels work and closes the owned pool once',async()=>{
  let closed=0;
  const store={readiness:async()=>{},expireStale:async()=>{},assertTarget:async()=>{},record:async()=>({accepted:true})};
  const runtime=await startHealthRuntime(config(),{store,pool:{end:async()=>closed++},port:0,autoStart:false,
    probe:async()=>({auth:false,rest:false,storage:false,realtime:false,functions:false}),sourceFor:()=>({collect:async()=>({})})});
  const base='http://127.0.0.1:'+runtime.server.address().port;
  await runtime.worker.tick();assert.equal((await fetch(base+'/readyz')).status,200);
  assert.equal((await runtime.shutdown()).timedOut,false);await runtime.shutdown();assert.equal(closed,1);
  assert.equal(runtime.worker.status().ready,false);assert.equal(runtime.server.listening,false);
});
