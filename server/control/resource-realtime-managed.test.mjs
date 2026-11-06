import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {preflightResourceConsumers,resourceConsumerManifest} from './resource-vendor.mjs';
import {vendorResourceCatalog} from './resource-vendor-catalog.mjs';
import {realtimeBaseImage,realtimeSourceDateEpoch} from './realtime-image-contract.mjs';
import {resourceConsumerMain} from '../../scripts/control-backend-resource-consumer-preflight.mjs';
const image='sha256:'+'a'.repeat(64),clone=v=>structuredClone(v),sha=v=>createHash('sha256').update(v).digest('hex');
const proof=()=>({schemaVersion:1,kind:'roomqc-realtime-build',imageRef:image,imageId:image,sourceHash:'b'.repeat(64),
  baseImage:realtimeBaseImage,sourceDateEpoch:realtimeSourceDateEpoch,rebuiltWithoutCache:true,deterministicImageMatch:true});
function fixture(t){
  const base=realpathSync(tmpdir()),root=mkdtempSync(join(base,'roomqc-managed-realtime-plan-'));
  t.after(()=>{assert.equal(dirname(realpathSync(root)),base);assert.match(basename(root),/^roomqc-managed-realtime-plan-/);rmSync(root,{recursive:true})});
  const budget=JSON.parse(readFileSync(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  budget.environment='local';for(const d of budget.databases)for(const c of d.consumers)c.replicas=0;
  budget.databases.find(d=>d.kind==='directory').consumers.find(c=>c.id==='control-api').replicas=1;
  const db=budget.databases.find(d=>d.kind==='business');db.consumers.find(c=>c.id==='realtime').replicas=1;
  const file=join(root,'budget.json');writeFileSync(file,JSON.stringify(budget));
  const manifest={schemaVersion:1,environment:'local',budgetFile:file,budgetSha256:sha(readFileSync(file)),vendorCatalogId:vendorResourceCatalog.id,
    nativeProjects:[],vendorProjects:[{id:'managed',files:[join(root,'compose.json')],envFiles:[],profiles:[],
      services:[{name:'realtime',adapter:'realtime-managed',databaseId:db.id,image}]}]};
  const service={image,environment:{DB_POOL_SIZE:'2',SEED_SELF_HOST:'true',RUN_JANITOR:'true'}};
  const resolveProject=async()=>({name:'managed',services:{realtime:clone(service)}});
  return {root,manifest,service,resolveProject,run:verifyManagedImage=>preflightResourceConsumers(manifest,{resolveProject,verifyManagedImage})};
}
test('managed PLAN requires immutable image and explicit rebuild; opt-out cannot borrow a receipt or bound',async t=>{
  const f=fixture(t),r=await f.run();assert.equal(r.fullyCovered,false);assert.equal(r.services[0].poolPlanVerified,false);
  assert.deepEqual(r.services[0].reasons,['managed_realtime_independent_image_rebuild_required']);assert.equal(r.services[0].inventory,undefined);
  for(const value of ['roomqc/realtime:latest','sha256:bad','--help']){const m=clone(f.manifest);m.vendorProjects[0].services[0].image=value;assert.throws(()=>resourceConsumerManifest(m))}
  const m=clone(f.manifest);m.vendorProjects[0].services[0].adapter='auth';assert.throws(()=>resourceConsumerManifest(m));
});
test('verified managed image exposes corrected lifecycle but retains tenant, TLS and capacity blockers',async t=>{
  const f=fixture(t),r=await f.run(async requested=>{assert.equal(requested,image);return proof()});const s=r.services[0];
  assert.equal(s.imageRebuildVerified,true);assert.equal(s.inventory.startup.seedImplementation,'roomqc-preserve-existing');
  assert.equal(s.inventory.startup.storedTenantOverridesSurviveReseed,true);assert.equal(s.inventory.startup.bootstrapSessionAdvisoryLockImplemented,true);
  assert.equal(s.inventory.startup.globalBootstrapConcurrencyBoundVerified,false);assert.equal(s.plannedServerConnections,null);
  assert.ok(!s.reasons.includes('self_host_seed_deletes_and_recreates_existing_tenant'));
  assert.ok(!s.reasons.includes('vendor_readiness_and_actual_subscriber_pools_use_different_stored_keys'));
  assert.ok(s.reasons.includes('tenant_tls_peer_verification_not_configured'));assert.ok(r.unresolvedConsumers.some(c=>c.consumerId==='realtime'));
  assert.equal(r.sourceToImageProvenanceVerified,false);assert.equal(r.runtimeVerified,false);assert.equal(r.capacityProven,false);assert.equal(r.deploymentReady,false);
});
test('managed PLAN rejects unverifiable or misbound tool proofs instead of accepting caller claims',async t=>{
  const f=fixture(t);
  for(const change of [p=>p.extra='private',p=>p.imageRef='other',p=>p.imageId='sha256:'+'c'.repeat(64),p=>p.sourceHash='bad',
    p=>p.baseImage='unreviewed',p=>p.sourceDateEpoch++,p=>p.rebuiltWithoutCache=false,p=>p.deterministicImageMatch=false]){
    const p=proof();change(p);await assert.rejects(f.run(async()=>p),{code:'RESOURCE_MANAGED_REALTIME_PROOF_INVALID'});
  }
});
test('managed TLS recipe requires one read-only CA mount and cannot promote runtime or capacity proof',async t=>{
  const f=fixture(t);Object.assign(f.service.environment,{DB_SSL:'true',DB_SSL_CA_CERT:'/run/roomqc-ca/ca.crt'});
  let r=await f.run(async()=>proof());assert.equal(r.services[0].inventory.tenantTlsPeerVerificationSupportedByReviewedPath,false);
  f.service.volumes=[{type:'bind',source:join(f.root,'public-ca'),target:'/run/roomqc-ca',read_only:true}];
  r=await f.run(async()=>proof());assert.equal(r.services[0].inventory.tenantTlsPeerVerificationSupportedByReviewedPath,true);
  assert.ok(!r.services[0].reasons.includes('tenant_tls_peer_verification_not_configured'));
  assert.equal(r.runtimeVerified,false);assert.equal(r.capacityProven,false);assert.equal(r.fullyCovered,false);
  for(const mutate of [s=>s.volumes[0].read_only=false,s=>s.volumes[0].target='/app',s=>s.volumes.push({...s.volumes[0]}),s=>s.environment.DB_SSL='yes']){
    const before=clone(f.service);mutate(f.service);await assert.rejects(f.run(async()=>proof()));
    Object.keys(f.service).forEach(k=>delete f.service[k]);Object.assign(f.service,before);
  }
});
test('managed staging plan cannot use local plaintext or claim TLS from an unmounted CA path',async t=>{
  const f=fixture(t),budget=JSON.parse(readFileSync(f.manifest.budgetFile,'utf8'));
  budget.environment='staging';writeFileSync(f.manifest.budgetFile,JSON.stringify(budget));
  f.manifest.environment='staging';f.manifest.budgetSha256=sha(readFileSync(f.manifest.budgetFile));
  await assert.rejects(f.run(async()=>proof()),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
  Object.assign(f.service.environment,{DB_SSL:'true',DB_SSL_CA_CERT:'/run/roomqc-ca/ca.crt'});
  await assert.rejects(f.run(async()=>proof()),{code:'RESOURCE_VENDOR_TARGET_INVALID'});
  f.service.volumes=[{type:'volume',source:'public-ca',target:'/run/roomqc-ca',read_only:true}];
  const r=await f.run(async()=>proof());assert.equal(r.services[0].inventory.tenantTlsPeerVerificationSupportedByReviewedPath,true);
  assert.equal(r.runtimeVerified,false);assert.equal(r.deploymentReady,false);
});
test('verified image cannot borrow the process recipe with destructive startup, loader injection or invalid pools',async t=>{
  const f=fixture(t),initial=clone(f.service);
  for(const change of [s=>s.environment.SEED_SELF_HOST='false',s=>s.environment.ROOMQC_REALTIME_CONNECT_POOL='0',
    s=>s.environment.ROOMQC_REALTIME_SUBSCRIBER_POOL='02',s=>s.environment.ERL_ZFLAGS='-eval private',
    s=>s.volumes=[{target:'/app'}],s=>s.command=['sh','-c','/app/bin/server']]){
    Object.keys(f.service).forEach(k=>delete f.service[k]);Object.assign(f.service,clone(initial));change(f.service);
    await assert.rejects(f.run(async()=>proof()));
  }
});
test('CLI only invokes rebuild on the explicit option and reports mismatch without private diagnostics',async t=>{
  const f=fixture(t),file=join(f.root,'manifest.json');writeFileSync(file,JSON.stringify(f.manifest));let calls=0,output='';
  const options={resolveProject:f.resolveProject,verifyManagedImage:async()=>{calls++;return proof()},output:{write:s=>output+=s}};
  assert.equal(await resourceConsumerMain(['--manifest',file],options),2);assert.equal(calls,0);
  output='';assert.equal(await resourceConsumerMain(['--manifest',file,'--verify-managed-builds'],options),2);assert.equal(calls,1);
  assert.equal(JSON.parse(output).services[0].imageRebuildVerified,true);
  output='';assert.equal(await resourceConsumerMain(['--manifest',file,'--other'],options),1);assert.equal(calls,1);
  output='';options.verifyManagedImage=async()=>{throw Object.assign(new Error('fixture-private-data'),{code:'RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH'})};
  assert.equal(await resourceConsumerMain(['--manifest',file,'--verify-managed-builds'],options),1);
  assert.equal(JSON.parse(output).code,'RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH');assert.ok(!output.includes('fixture-private-data'));
});
