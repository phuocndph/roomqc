import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {healthConfiguration,boundedHealthFile} from './workers/health-config.mjs';
import {managedHealthConfiguration,loadManagedHealthConfiguration,createHealthProbePool} from './workers/health-probes.mjs';
import {startHealthRuntime} from './workers/health-runtime.mjs';
import {fixtureTarget} from './test-fixtures.mjs';
import {syntheticRelease,syntheticBundle,syntheticToken} from './probe-test-fixtures.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrust,fixtureReleaseTrustRaw,
  fixtureReleaseMaximumValidityMs} from './release-test-fixtures.mjs';

const metricsDsn='postgresql://metrics:fixture-metrics@127.0.0.1:5432/fixture';
const probeDsn='postgresql://probe:fixture-probe@127.0.0.1:5432/fixture';
function raw(){return {schemaVersion:2,instanceId:'managed-fixture',targets:[{target:fixtureTarget('cluster-a'),
  prometheus:{url:'http://127.0.0.1:9090',approvedAddresses:['127.0.0.1']}}],
  connectionBudget:{maxConnections:30,reservedConnections:5,apiInstances:2,apiPoolMax:5,reconcileInstances:1,reconcilePoolMax:2,
    healthInstances:2,healthPoolMax:2,probeInstances:2,probePoolMax:2,exporterConnections:1,migrationConnections:1}}}
const health=()=>healthConfiguration(raw(),{databaseUrl:metricsDsn,production:false,allowLocal:true});
function metadata(){return approve({version:2,targets:[{cluster:{id:'cluster-a',hostId:'cluster-a',url:'http://127.0.0.1:54321',
  internalUrl:null,inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1'],publishableKey:'fixture-public'},
expected:{...syntheticRelease},storage:{sha256:'a'.repeat(64)}}]})}
function approve(value,environment='local'){
  for(const entry of value.targets)entry.approval=fixtureReleaseApproval(fixtureReleaseContext(entry.cluster,entry.expected,{environment}));
  return value;
}
const managed=()=>managedHealthConfiguration(metadata(),{health:health(),databaseUrl:probeDsn,trust:fixtureReleaseTrust});

test('managed health v2 accounts both role pools across replicas; legacy config cannot allocate an unbudgeted probe pool',()=>{
  assert.equal(health().connectionBudget.allocatedConnections,27);assert.equal(managed().poolMax,2);
  for(const change of [v=>{v.connectionBudget.maxConnections=26},v=>{v.connectionBudget.probeInstances=1},
    v=>{v.connectionBudget.probePoolMax=0},v=>{v.connectionBudget.probePoolMax=5},v=>{v.schemaVersion=1}]){
    const value=raw();change(value);assert.throws(()=>healthConfiguration(value,{databaseUrl:metricsDsn,production:false,allowLocal:true}));
  }
  const old=raw();old.schemaVersion=1;delete old.connectionBudget.probeInstances;delete old.connectionBudget.probePoolMax;
  const legacy=healthConfiguration(old,{databaseUrl:metricsDsn,production:false,allowLocal:true});
  assert.equal(legacy.connectionBudget.allocatedConnections,23);
  assert.throws(()=>managedHealthConfiguration(metadata(),{health:legacy,databaseUrl:probeDsn,trust:fixtureReleaseTrust}),{code:'INVALID_MANAGED_HEALTH_CONFIG'});
});
test('managed catalog binds exact target/host/release and immutable allowlisted metadata, with no token or service key',()=>{
  const config=managed(),target=fixtureTarget('cluster-a'),entry=config.catalog.get(target);
  assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.cluster.approvedAddresses));
  assert.equal(entry.config.inventory.set,undefined);assert.equal(entry.config.inventory.get('other'),undefined);
  assert.equal(entry.config.inventory.get('cluster-a').url,entry.cluster.url);
  assert.throws(()=>config.catalog.get({...target,hostId:'other-host'}),{code:'PROBE_TARGET_CHANGED'});
  for(const change of [v=>{v.password='private'},v=>{v.targets=[]},v=>{v.targets.push(v.targets[0])},
    v=>{v.targets[0].cluster.hostId='other-host'},v=>{v.targets[0].expected.clusterId='cluster-b'},
    v=>{v.targets[0].cluster.serviceKey='private'},v=>{v.targets[0].auth={token:'private'}},
    v=>{v.targets[0].storage.sha256='bad'},v=>{v.targets[0].cluster.url+='/'},
    v=>{v.targets[0].cluster.internalUrl='http://169.254.169.254'},v=>{v.targets[0].cluster.approvedAddresses=[]},
    v=>{v.targets[0].cluster.approvedAddresses=['127.0.0.1','127.0.0.1']},v=>{v.targets[0].cluster.approvedAddresses=['169.254.169.254']},
    v=>{v.targets[0].cluster.publishableKey='sb_secret_fixture'},
    v=>{v.targets[0].cluster.publishableKey=syntheticToken({role:'service_role'})}]){
    const value=metadata();change(value);assert.throws(()=>managedHealthConfiguration(value,{health:health(),databaseUrl:probeDsn,trust:fixtureReleaseTrust}));
  }
});

test('managed catalog requires signed v2 bound to release, endpoint and environment; legacy, tamper and expired approval reject',()=>{
  const configure=value=>managedHealthConfiguration(value,{health:health(),databaseUrl:probeDsn,trust:fixtureReleaseTrust});
  assert.throws(()=>managedHealthConfiguration(metadata(),{health:health(),databaseUrl:probeDsn}),{code:'INVALID_MANAGED_HEALTH_CONFIG'});
  for(const change of [v=>{v.version=1},v=>{delete v.targets[0].approval},
    v=>{v.targets[0].approval.signature='A'.repeat(86)},v=>{v.targets[0].approval.payload.environment='production'},
    v=>{v.targets[0].cluster.credentialRef='different-credential'},v=>{v.targets[0].expected.releaseId='different-release'}]){
    const value=metadata();change(value);assert.throws(()=>configure(value));
  }
  const expired=metadata(),entry=expired.targets[0];
  entry.approval=fixtureReleaseApproval(fixtureReleaseContext(entry.cluster,entry.expected),
    {notBefore:Date.now()-2000,expiresAt:Date.now()-1000});
  assert.throws(()=>configure(expired),{code:'RELEASE_APPROVAL_INVALID'});
  const config=configure(metadata()),approval=config.catalog.get(fixtureTarget('cluster-a')).approval;
  assert.equal(approval.clusterId,'cluster-a');assert.equal(approval.environment,'local');
  assert.ok(Object.isFrozen(approval));
});
test('probe DSN must be a distinct login on the same primary directory with exact TLS and no overriding URL options',()=>{
  for(const databaseUrl of [metricsDsn,probeDsn.replace('/fixture','/another'),probeDsn.replace('127.0.0.1','localhost'),
    probeDsn.replace('5432','5433'),probeDsn.replace('//probe:', '//%6detrics:'),probeDsn+'?ssl=false',
    probeDsn+'?options=role%3Dpostgres',probeDsn+'?sslmode=disable&sslmode=verify-full']){
    assert.throws(()=>managedHealthConfiguration(metadata(),{health:health(),databaseUrl,trust:fixtureReleaseTrust}));
  }
  const p=raw();p.targets[0].target={...fixtureTarget('cluster-a'),environment:'production',measurementScope:'linux-host'};
  p.targets[0].prometheus={url:'https://metrics.example.invalid',approvedAddresses:['10.0.0.2']};
  const h=healthConfiguration(p,{databaseUrl:'postgresql://metrics:fixture@directory.invalid/fixture?sslmode=verify-full'});
  const m=metadata();m.targets[0].cluster.url='https://api.example.invalid';m.targets[0].cluster.approvedAddresses=['10.0.0.3'];
  approve(m,'production');
  assert.equal(managedHealthConfiguration(m,{health:h,databaseUrl:'postgresql://probe:fixture@directory.invalid/fixture?sslmode=verify-full',trust:fixtureReleaseTrust}).poolMax,2);
  m.targets[0].cluster.internalUrl='http://127.0.0.1:8000';
  assert.throws(()=>managedHealthConfiguration(m,{health:h,databaseUrl:'postgresql://probe:fixture@directory.invalid/fixture?sslmode=verify-full',trust:fixtureReleaseTrust}));
});
test('managed loader requires private files plus public release trust and expiry policy; no raw env or API secret fallback',async()=>{
  assert.equal(await loadManagedHealthConfiguration({},health()),null);
  const directory=await mkdtemp(join(tmpdir(),'roomqc-managed-config-'));
  const env={ROOMQC_HEALTH_PROBE_CONFIG_FILE:join(directory,'metadata.json'),ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:join(directory,'probe-dsn'),
    ROOMQC_HEALTH_PROBE_KEYRING_FILE:join(directory,'keyring.json'),ROOMQC_HEALTH_RELEASE_TRUST_FILE:join(directory,'trust.json'),
    ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(fixtureReleaseMaximumValidityMs)};
  try{
    await writeFile(env.ROOMQC_HEALTH_PROBE_CONFIG_FILE,JSON.stringify(metadata()),{mode:0o600});
    await writeFile(env.ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE,probeDsn+'\n',{mode:0o600});
    await writeFile(env.ROOMQC_HEALTH_PROBE_KEYRING_FILE,JSON.stringify({version:1,activeKeyId:'fixture-key',keys:{'fixture-key':randomBytes(32).toString('hex')}}),{mode:0o600});
    await writeFile(env.ROOMQC_HEALTH_RELEASE_TRUST_FILE,JSON.stringify(fixtureReleaseTrustRaw),{mode:0o600});
    const loaded=await loadManagedHealthConfiguration(env,health());assert.equal(loaded.databaseUrl,probeDsn);
    assert.equal(typeof loaded.keyring.seal,'function');
    for(const changes of [{ROOMQC_HEALTH_PROBE_CONFIG_FILE:undefined},{ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:undefined},
      {ROOMQC_HEALTH_PROBE_KEYRING_FILE:undefined},{ROOMQC_HEALTH_PROBE_CONFIG_FILE:'relative.json'},
      {ROOMQC_HEALTH_RELEASE_TRUST_FILE:undefined},{ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:undefined},
      {ROOMQC_HEALTH_RELEASE_TRUST_FILE:'relative.json'},{ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:'invalid'},
      {ROOMQC_HEALTH_PROBE_CONFIG_FILE:directory},{ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:join(directory,'absent')}]){
      await assert.rejects(()=>loadManagedHealthConfiguration({...env,...changes},health()),{code:'INVALID_MANAGED_HEALTH_CONFIG'});
    }
    await writeFile(env.ROOMQC_HEALTH_PROBE_CONFIG_FILE,'fixture-private-marker'.repeat(7000));
    await assert.rejects(()=>loadManagedHealthConfiguration(env,health()),e=>e.code==='INVALID_MANAGED_HEALTH_CONFIG'&&!e.message.includes('fixture-private-marker'));
    await assert.rejects(()=>boundedHealthFile(directory,16),{code:'INVALID_HEALTH_CONFIG'});
    assert.equal(await loadManagedHealthConfiguration({ROOMQC_CONTROL_SERVICE_KEY:'unrelated'},health()),null);
  }finally{await rm(directory,{recursive:true})}
});
test('probe pool is separately named, bounded and lazy; never creates one connection per target',async()=>{
  const pool=createHealthProbePool(managed());
  try{assert.equal(pool.options.max,2);assert.equal(pool.options.application_name,'roomqc-health-probe');
    assert.equal(pool.options.connectionTimeoutMillis,2000);assert.equal(pool.options.statement_timeout,3000);
    assert.equal(pool.options.lock_timeout,2000);assert.equal(pool.totalCount,0);
  }finally{await pool.end()}
});
function controlled(){
  const bundle=syntheticBundle();let denied=false,reads=0,checks=0;
  return {bundle,deny:value=>{denied=value},get reads(){return reads},get checks(){return checks},
    store:{readiness:async()=>{reads++;if(denied)throw new Error('fixture-private-db-failure')},
      assertReleaseApproval:async approval=>{assert.equal(approval.clusterId,'cluster-a');assert.equal(approval.environment,'local')},
      acquire:async()=>({kind:'ready',revision:1,bundle}),assertCurrent:async()=>{checks++}}};
}
test('managed runtime wiring: narrow callback receives no refresh/installer secret; probe outage does not block stale sweep and recovers',async()=>{
  const f=controlled();let sweeps=0,records=0,metricsClosed=0,probeClosed=0,collections=0;
  const target=fixtureTarget('cluster-a'),context={fingerprint:telemetryTargetFingerprint(target),targetVersion:1,policyVersion:1};
  const store={readiness:async()=>{},expireStale:async()=>sweeps++,assertTarget:async()=>context,record:async(id,sample)=>{
    assert.equal(id,'cluster-a');assert.equal(sample.probeEvidence.credentialRevision,1);assert.equal(sample.probeEvidence.targetFingerprint,context.fingerprint);
    assert.equal(sample.probeEvidence.version,2);assert.ok(sample.probeEvidence.releaseApproval.approvalId);
    records++;return {accepted:true};
  }};
  const runtime=await startHealthRuntime(health(),{store,pool:{end:async()=>metricsClosed++},probePool:{end:async()=>probeClosed++},managed:managed(),
    probeStore:f.store,port:0,autoStart:false,sourceFor:()=>({collect:async(target,probes)=>({probes})}),
    collect:async(config,cluster,input,{signal})=>{
      collections++;assert.equal(input.auth.refreshToken,undefined);assert.equal(input.auth.sessionId,undefined);assert.equal(input.installer,undefined);
      assert.equal(cluster.serviceKey,undefined);assert.equal(config.serviceKey,undefined);assert.equal(input.storage.sha256,'a'.repeat(64));
      signal.throwIfAborted();return {probes:{auth:true,rest:true,storage:true,realtime:true,functions:true}};
    }});
  try{
    assert.equal((await runtime.worker.tick()).ready,true);assert.equal(records,1);assert.equal(f.checks,1);
    f.deny(true);const failed=await runtime.worker.tick();assert.equal(failed.ready,false);assert.equal(sweeps,2);assert.equal(records,1);
    assert.ok(!JSON.stringify(failed).includes('fixture-private-db-failure'));assert.equal(collections,1);
    f.deny(false);assert.equal((await runtime.worker.tick()).ready,true);assert.equal(sweeps,3);assert.equal(records,2);
  }finally{assert.equal((await runtime.shutdown()).timedOut,false);await runtime.shutdown()}
  assert.equal(metricsClosed,1);assert.equal(probeClosed,1);
});
test('managed runtime rejects a bundle using a publishable key different from approved target without invoking collector',async()=>{
  const f=controlled();f.bundle.credential.publishableKey='other-public';let collected=0;
  const runtime=await startHealthRuntime(health(),{managed:managed(),probePool:{end:async()=>{}},probeStore:f.store,
    store:{readiness:async()=>{},expireStale:async()=>{},assertTarget:async()=>({}),record:async()=>assert.fail('No snapshot expected')},
    port:0,autoStart:false,collect:async()=>{collected++}});
  try{assert.equal((await runtime.worker.tick()).lastErrorCode,'PROBE_TARGET_CHANGED');assert.equal(collected,0)}finally{await runtime.shutdown()}
});
test('all startup failures close both owned pools, and a shared metrics/probe pool is rejected and closed only once',async()=>{
  let closed=0;const shared={end:async()=>closed++};
  await assert.rejects(()=>startHealthRuntime(health(),{managed:managed(),pool:shared,probePool:shared,port:0}),{code:'INVALID_MANAGED_HEALTH_CONFIG'});
  assert.equal(closed,1);
  let metricsClosed=0,probeClosed=0;
  await assert.rejects(()=>startHealthRuntime({...health(),concurrency:5},{managed:managed(),pool:{end:async()=>metricsClosed++},
    probePool:{end:async()=>probeClosed++},port:0}),{code:'INVALID_HEALTH_WORKER'});
  assert.equal(metricsClosed,1);assert.equal(probeClosed,1);
});
test('managed shutdown and failed-start cleanup are bounded even when a pool end never settles',async()=>{
  let closing=0;const hung={end:()=>{closing++;return new Promise(()=>{})}},short={...health(),shutdownTimeoutMs:20};
  const runtime=await startHealthRuntime(short,{managed:managed(),probePool:hung,store:{},port:0,autoStart:false});
  assert.equal((await runtime.shutdown()).timedOut,true);assert.equal(closing,1);assert.equal(runtime.server.listening,false);
  await assert.rejects(()=>startHealthRuntime({...short,concurrency:5},{managed:managed(),probePool:hung,store:{},port:0}),{code:'INVALID_HEALTH_WORKER'});
  assert.equal(closing,2);
});
test('managed compose override adds only the approved backend network and private canary mounts, not issuer/service/API secrets',async()=>{
  const compose=JSON.parse(await readFile(new URL('../../deploy/monitoring/health-worker.managed.compose.yml',import.meta.url),'utf8'));
  const worker=compose.services['health-worker'];assert.deepEqual(worker.networks,['backend']);
  assert.deepEqual(worker.secrets,['probe-dsn','probe-keyring']);assert.equal(worker.volumes.length,2);
  for(const volume of worker.volumes){assert.equal(volume.read_only,true);assert.equal(volume.bind.create_host_path,false)}
  assert.deepEqual(Object.keys(worker.environment).sort(),['ROOMQC_HEALTH_PROBE_CONFIG_FILE','ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE','ROOMQC_HEALTH_PROBE_KEYRING_FILE',
    'ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS','ROOMQC_HEALTH_RELEASE_TRUST_FILE']);
  for(const name of ['ports','privileged','env_file','command'])assert.equal(worker[name],undefined);
  assert.equal(compose.networks.backend.external,true);assert.ok(!/service_role|installer|migrator|docker.sock/.test(JSON.stringify(worker)));
});
