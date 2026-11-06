import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setupConfiguration,loadSetupConfiguration,setupCredentialsReady} from './workers/setup-config.mjs';
import {startSetupRuntime} from './workers/setup-runtime.mjs';
import {recoveryBinding} from './setup-recovery.mjs';
import {syntheticRelease,syntheticToken} from './probe-test-fixtures.mjs';
import {fixtureReleaseTrust,fixtureReleaseTrustRaw,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';
import {assertProvisioningResources,loadRuntimeResourceContext,runtimeResourceView} from './resource-runtime.mjs';

async function fixture(t,{origin='http://127.0.0.1:54321'}={}){
  const root=await mkdtemp(join(tmpdir(),'roomqc-setup-runtime-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,value)=>{const file=join(root,name);await writeFile(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});return file};
  const cluster={id:'cluster-a',url:origin,internalUrl:null,credentialRef:'cluster-a',inventoryRef:'cluster-a',hostId:'cluster-a',approvedAddresses:[]};
  const credentialFile=join(root,'credential.json'),binding=recoveryBinding(cluster,syntheticRelease),now=Math.floor(Date.now()/1000);
  const credential={version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:'sb_publishable_fixture',token:syntheticToken({
    iss:'roomqc-setup-recovery/v1',aud:'authenticated',role:'roomqc_setup_recovery',jti:randomUUID(),iat:now-1,exp:now+1800,
    cluster_id:cluster.id,binding_sha256:binding.bindingHash})};await put('credential.json',credential);
  const raw={schemaVersion:1,instanceId:'setup-test',poolMax:2,concurrency:2,intervalMs:1000,requestTimeoutMs:6000,leaseMs:60000,
    retryBaseMs:1000,shutdownTimeoutMs:10000,targets:[{cluster,approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease)),credentialFile}],
    connectionBudget:{maxConnections:100,otherAllocatedConnections:12,instances:1,reservedConnections:5}};
  const databaseUrl='postgresql://setup:unusable-fixture@127.0.0.1:5432/owned';
  const config=()=>setupConfiguration(raw,{databaseUrl,trust:fixtureReleaseTrust,environment:'local',allowLocal:true});
  const budget=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  return {root,put,raw,databaseUrl,config,credential,budget};
}
test('setup config requires signed target binding, restricted shape, TLS and coherent finite limits',async t=>{
  const f=await fixture(t),config=f.config();assert.ok(Object.isFrozen(config.targets[0].cluster));
  assert.equal(config.targets[0].identity.clusterId,'cluster-a');await setupCredentialsReady(config);
  const original=structuredClone(f.raw);
  for(const mutate of [r=>r.poolMax=0,r=>r.concurrency=3,r=>r.leaseMs=5000,r=>r.shutdownTimeoutMs=6000,
    r=>r.targets[0].cluster.serviceKey='forbidden',r=>r.targets[0].cluster.url='http://127.0.0.1:54322',
    r=>r.targets.push(structuredClone(r.targets[0])),r=>r.targets[0].approval.payload.expected.releaseId='tampered',
    r=>r.targets[0].credentialFile='relative',r=>r.connectionBudget.instances=10000]){
    Object.assign(f.raw,structuredClone(original));mutate(f.raw);assert.throws(f.config,{code:'INVALID_SETUP_WORKER_CONFIG'});
  }
  Object.assign(f.raw,original);assert.throws(()=>setupConfiguration(f.raw,{databaseUrl:f.databaseUrl,trust:fixtureReleaseTrust}),{code:'INVALID_SETUP_WORKER_CONFIG'});
  f.raw.targets[0].cluster.url='https://after-config.invalid';assert.equal(config.targets[0].cluster.url,'http://127.0.0.1:54321');
});
test('setup resource adapter refuses disabled replica, wrong pool/budget and absent production budget before startup',async t=>{
  const f=await fixture(t),config=f.config();let calls=0;
  await assert.rejects(()=>startSetupRuntime({...config,production:true},{store:{readiness:async()=>calls++}}),{code:'RESOURCE_BUDGET_REQUIRED'});assert.equal(calls,0);
  const file=await f.put('budget.json',f.budget),context=()=>loadRuntimeResourceContext({ROOMQC_RESOURCE_BUDGET_FILE:file},{kind:'directory'});
  assert.throws(()=>assertProvisioningResources({...config,resourceContext:context()}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  f.budget.databases[0].consumers.find(c=>c.id==='provisioning-worker').replicas=1;await f.put('budget.json',f.budget);
  const enabled={...config,resourceContext:context()};assertProvisioningResources(enabled);
  assert.equal(runtimeResourceView(enabled,'provisioning-worker').consumers[0].pools[0].max,2);
  for(const patch of [{poolMax:1},{connectionBudget:{...config.connectionBudget,instances:2}},
    {connectionBudget:{...config.connectionBudget,otherAllocatedConnections:11}}])
    assert.throws(()=>assertProvisioningResources({...enabled,...patch}),{code:'RESOURCE_RUNTIME_MISMATCH'});
});
test('setup loader reads file-only credentials/trust and rechecks expiry without accepting API secrets',async t=>{
  const f=await fixture(t);f.budget.databases[0].consumers.find(c=>c.id==='provisioning-worker').replicas=1;
  const env={ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_SETUP_ALLOW_LOCAL:'true',ROOMQC_RESOURCE_BUDGET_FILE:await f.put('budget.json',f.budget),
    ROOMQC_SETUP_CONFIG_FILE:await f.put('config.json',f.raw),ROOMQC_SETUP_DATABASE_URL_FILE:await f.put('dsn',f.databaseUrl),
    ROOMQC_SETUP_RELEASE_TRUST_FILE:await f.put('trust.json',fixtureReleaseTrustRaw)};
  const config=await loadSetupConfiguration(env);assert.equal(config.poolMax,2);
  await assert.rejects(()=>loadSetupConfiguration({...env,ROOMQC_SETUP_RELEASE_TRUST_FILE:undefined}),{code:'INVALID_SETUP_WORKER_CONFIG'});
  await f.put('credential.json',{...f.credential,token:syntheticToken({role:'service_role'})});
  await assert.rejects(()=>setupCredentialsReady(config),{code:'RECOVERY_CREDENTIAL_INVALID'});
  await f.put('credential.json',f.credential);await setupCredentialsReady(config);
});
test('setup HTTP runtime readiness follows credential state and exposes no tokens/DSN using explicit store doubles',async t=>{
  const f=await fixture(t),config=f.config();let claims=0;
  const store={readiness:async()=>{},claim:async()=>{claims++;return null},settle:async()=>({settled:false})};
  const runtime=await startSetupRuntime(config,{store,port:0,autoStart:false,credentialReadiness:async()=>{},reconcile:async()=>{throw Error('No jobs')}});
  t.after(()=>runtime.shutdown());const origin='http://127.0.0.1:'+runtime.server.address().port;
  assert.equal((await fetch(origin+'/livez')).status,200);assert.equal((await fetch(origin+'/readyz')).status,503);
  await runtime.worker.tick();const ready=await fetch(origin+'/readyz');assert.equal(ready.status,200);assert.equal(ready.headers.get('cache-control'),'no-store');
  const text=await ready.text();assert.ok(!text.includes(f.credential.token));assert.ok(!text.includes('unusable-fixture'));assert.ok(!text.includes(f.root));
  assert.equal(claims,2);await f.put('credential.json',{...f.credential,token:'invalid'});await runtime.worker.tick();
  assert.equal(claims,2);assert.equal((await fetch(origin+'/readyz')).status,503);
  await f.put('credential.json',f.credential);await runtime.worker.tick();assert.equal((await fetch(origin+'/readyz')).status,200);
  assert.equal((await fetch(origin+'/readyz?extra=1')).status,404);assert.equal((await runtime.shutdown()).timedOut,false);
});

test('default runtime checks live credential before claiming and reloads atomically replaced file without a restart',async t=>{
  let accepted,remoteStatus=200,remoteValue=null,calls=0;
  // Controlled HTTP fixture, not native PostgREST or signature verification.
  const remote=createServer((req,res)=>{
    calls++;assert.equal(req.method,'POST');assert.equal(req.url,'/rest/v1/rpc/receipt');
    assert.equal(req.headers['content-profile'],'roomqc_setup');
    const status=req.headers.authorization==='Bearer '+accepted?remoteStatus:403;
    res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(status===200?remoteValue:{code:'42501'}));
  });
  await new Promise(resolve=>remote.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>remote.close(resolve)));
  const f=await fixture(t,{origin:'http://127.0.0.1:'+remote.address().port});accepted=f.credential.token;
  let claims=0;
  const store={readiness:async()=>{},claim:async()=>{claims++;return null},settle:async()=>({settled:false})};
  const runtime=await startSetupRuntime(f.config(),{store,port:0,autoStart:false});
  t.after(()=>runtime.shutdown());
  assert.equal(calls,1,'startup must verify live remote credential, not only the unexpired file');
  await runtime.worker.tick();assert.equal(claims,2);assert.equal(runtime.worker.status().ready,true);
  remoteStatus=403;await runtime.worker.tick();
  assert.equal(claims,2,'a token revoked before the readiness check cannot consume a job attempt');
  assert.equal(runtime.worker.status().ready,false);
  remoteStatus=503;await runtime.worker.tick();assert.equal(claims,2);
  remoteStatus=200;remoteValue={unexpected:'non-null probe result'};
  await runtime.worker.tick();assert.equal(claims,2,'unexpected probe content cannot make the runtime ready');
  remoteValue=null;
  const parts=f.credential.token.split('.'),payload=JSON.parse(Buffer.from(parts[1],'base64url'));
  const next={...f.credential,token:syntheticToken({...payload,jti:randomUUID()})};accepted=next.token;
  await f.put('credential.stage',next);await rename(join(f.root,'credential.stage'),join(f.root,'credential.json'));
  await runtime.worker.tick();assert.equal(claims,4);assert.equal(runtime.worker.status().ready,true);
  assert.ok(calls>=6);const status=await (await fetch('http://127.0.0.1:'+runtime.server.address().port+'/readyz')).text();
  assert.ok(!status.includes(next.token));assert.ok(!status.includes(f.root));
});
