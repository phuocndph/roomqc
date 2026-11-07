import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {classifySetupBackfill,setupBackfillFingerprint,SetupBackfillScanner} from './setup-backfill.mjs';
import {setupBackfillConfiguration} from './setup-backfill-config.mjs';
import {setupBackfillArguments} from '../../scripts/control-setup-backfill.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {fixtureReleaseTrust,fixtureReleaseContext,fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {resourceBudget} from './resource-budget.mjs';
import {assertBackfillResources} from './resource-runtime.mjs';

function fixture(){
  const now=Date.now(),w={id:randomUUID(),owner_id:randomUUID(),cluster_id:'cluster-a',status:'provisioning',routing_version:1,
    tenant_id:null,hotel_id:null,created_at:new Date(now-1000),updated_at:new Date(now-1000)},approvalId=randomUUID();
  const dispatch={id:randomUUID(),workspace_id:w.id,owner_id:w.owner_id,cluster_id:w.cluster_id,routing_version:1,
    payload_sha256:'a'.repeat(64),terminal_state:null,tenant_id:null,hotel_id:null,created_at:new Date(now-1000),settled_at:null};
  const snapshot={workspace:w,dispatch,job:{id:randomUUID(),workspace_id:w.id,state:'queued',attempts:0,dispatch_id:dispatch.id,
    expected_routing_version:1,lease_token:null,lease_until:null,deadline_at:new Date(now+86400000),max_attempts:8},
    cluster:{id:'cluster-a',api_url:'https://backend.invalid',status:'active',credential_ref:'cluster-a',host_id:'host-a',inventory_ref:'cluster-a'},
    authority:{approval_id:approvalId,epoch:1,state:'active'},approval:{approval_id:approvalId,epoch:1,cluster_id:'cluster-a',
      host_id:'host-a',inventory_ref:'cluster-a',environment:'local',not_before_ms:now-1000,expires_at_ms:now+10000,envelope_digest:'b'.repeat(64)},
    environment:'local',keyRevoked:false};
  const receipt={workspace_id:w.id,owner_id:w.owner_id,tenant_id:randomUUID(),hotel_id:randomUUID()};
  return {snapshot,receipt,now};
}
test('setup backfill classification never treats a missing receipt as closed or permits protected workspace activation',()=>{
  const {snapshot:s,receipt:r,now}=fixture(),missing={status:'missing'};
  assert.equal(classifySetupBackfill(s,missing,{now}).group,'dispatch_pending');
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).reason,'SETUP_RECEIPT_REQUIRES_DISPATCH_PROOF');
  s.dispatch.terminal_state='closed';assert.equal(classifySetupBackfill(s,missing,{now}).group,'closed');
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).group,'conflict');
  for(const status of ['suspended','migrating','expired','reserved']){
    s.workspace.status=status;assert.deepEqual(classifySetupBackfill(s,missing,{now}),{group:'legacy_unknown',reason:'SETUP_STATE_PROTECTED',action:'manual_review'});
  }
});
test('setup backfill classification verifies receipt identity, committed proof and current release before proposing review',()=>{
  const {snapshot:s,receipt:r,now}=fixture();
  Object.assign(s.dispatch,{terminal_state:'committed',tenant_id:r.tenant_id,hotel_id:r.hotel_id});
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).group,'committed_pending');
  assert.equal(classifySetupBackfill(s,{status:'missing'},{now}).group,'conflict');
  for(const patch of [{workspace_id:randomUUID()},{owner_id:randomUUID()},{tenant_id:randomUUID()},{hotel_id:null}])
    assert.equal(classifySetupBackfill(s,{status:'present',receipt:{...r,...patch}},{now}).group,'conflict');
  s.keyRevoked=true;assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).group,'unavailable');s.keyRevoked=false;
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now:now+10000}).group,'unavailable');
  s.workspace.status='active';s.workspace.tenant_id=r.tenant_id;s.workspace.hotel_id=r.hotel_id;
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).reason,'SETUP_ACTIVE_JOB_UNFINISHED');
  s.job.state='succeeded';
  assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).group,'active_valid');
  s.dispatch.terminal_state=null;assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).reason,'SETUP_ACTIVE_DISPATCH_UNSETTLED');
  s.dispatch.terminal_state='closed';assert.equal(classifySetupBackfill(s,{status:'present',receipt:r},{now}).group,'conflict');
});
test('setup backfill fingerprint includes lease, routing, terminal and release drift without owner input or provider extras',()=>{
  const {snapshot:s}=fixture(),original=setupBackfillFingerprint(s);
  assert.equal(setupBackfillFingerprint({...s,workspace:{...s.workspace,email:'private',display_name:'private'}}),original);
  for(const patch of [{job:{...s.job,lease_token:randomUUID()}},{workspace:{...s.workspace,routing_version:2}},
    {dispatch:{...s.dispatch,terminal_state:'closed'}},{authority:{...s.authority,state:'withdrawn'}},
    {cluster:{...s.cluster,credential_ref:'rotated'}},{keyRevoked:true}])
    assert.notEqual(setupBackfillFingerprint({...s,...patch}),original);
  const reordered=Object.fromEntries(Object.entries(s).reverse());assert.equal(setupBackfillFingerprint(reordered),original);
  s.workspace.updated_at='2026-10-28T00:00:00.123001+00:00';const first=setupBackfillFingerprint(s);
  s.workspace.updated_at='2026-10-28T00:00:00.123002+00:00';assert.notEqual(setupBackfillFingerprint(s),first);
});
test('setup backfill budget requires its own declared one-shot reader and never borrows migration reserve',async()=>{
  assert.throws(()=>assertBackfillResources({production:true}),{code:'RESOURCE_BUDGET_REQUIRED'});
  const raw=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  const context=()=>({budget:resourceBudget(raw),budgetSha256:'a'.repeat(64),environment:'local',production:false,databaseId:'directory-example'});
  assert.throws(()=>assertBackfillResources({production:false,resourceContext:context()}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  raw.databases[0].consumers.push({id:'setup-backfill-reader',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  assertBackfillResources({production:false,resourceContext:context()});
  for(const change of [c=>c.replicas=0,c=>c.replicas=2,c=>c.pools[0].max=2,c=>c.fixedConnectionsPerReplica=1]){
    const original=structuredClone(raw.databases[0].consumers.at(-1));change(raw.databases[0].consumers.at(-1));
    assert.throws(()=>assertBackfillResources({production:false,resourceContext:context()}),{code:'RESOURCE_RUNTIME_MISMATCH'});
    raw.databases[0].consumers.splice(-1,1,original);
  }
});
test('setup backfill observation bounds ignored abort and rejects wrong signed binding without a close or fallback',async()=>{
  const {snapshot:s}=fixture();let reads=0,closes=0;
  const gateway={binding:{clusterId:'cluster-a',url:s.cluster.api_url},receipt:async()=>{reads++;await new Promise(r=>setTimeout(r,70));return null},
    close:async()=>{closes++}};
  const scanner=new SetupBackfillScanner({connect:async()=>{}},{expected:{systemIdentifier:'1',databaseOid:'2',databaseName:'owned',role:'reader'},
    bindings:[{clusterId:'cluster-a',approvalId:s.approval.approval_id,epoch:1,envelopeDigest:'b'.repeat(64),credentialRef:'cluster-a'}],
    gateways:[['cluster-a',gateway]],requestTimeoutMs:15});
  assert.deepEqual(await scanner.observe(s),{status:'unavailable'});assert.equal(reads,1);
  await new Promise(r=>setTimeout(r,80));assert.equal(closes,0);
  s.cluster.api_url='https://other.invalid';assert.deepEqual(await scanner.observe(s),{status:'unavailable'});assert.equal(reads,1);
});
test('setup backfill config requires signed target, exact shape, explicit local opt-in and production resource budget',()=>{
  const c={id:'cluster-a',url:'http://127.0.0.1:54321',internalUrl:null,credentialRef:'cluster-a',inventoryRef:'cluster-a',hostId:'cluster-a',approvedAddresses:[]};
  const raw={schemaVersion:1,environment:'local',directory:{dsnFile:resolve('.local','unused-dsn'),expected:{systemIdentifier:'1',databaseOid:'2',databaseName:'owned',role:'reader'}},
    releaseTrustFile:resolve('.local','unused-trust'),resourceBudgetFile:null,
    targets:[{cluster:c,approval:fixtureReleaseApproval(fixtureReleaseContext(c,syntheticRelease)),credentialFile:resolve('.local','unused-credential')}]};
  const load=r=>setupBackfillConfiguration(r,fixtureReleaseTrust,{allowLocal:true});assert.equal(load(raw).targets[0].identity.clusterId,'cluster-a');
  assert.throws(()=>setupBackfillConfiguration(raw,fixtureReleaseTrust),{code:'INVALID_SETUP_BACKFILL_CONFIG'});
  for(const mutate of [r=>r.directory.password='forbidden',r=>r.directory.expected.databaseOid='0',r=>r.targets[0].cluster.serviceKey='forbidden',
    r=>r.targets[0].approval.payload.expected.releaseId='tampered',r=>r.targets[0].cluster.url='http://127.0.0.1:54322',
    r=>r.targets[0].credentialFile='relative',r=>r.targets.push(r.targets[0]),r=>r.environment='production']){
    const changed=structuredClone(raw);mutate(changed);assert.throws(()=>load(changed),{code:'INVALID_SETUP_BACKFILL_CONFIG'});
  }
});
test('setup backfill CLI rejects mutation mode, ambiguous options and unsafe output before loading any secret',()=>{
  assert.deepEqual(setupBackfillArguments(['--help']),{help:true});const config=resolve('.local','config.json'),output=resolve('.local','new-report.json');
  assert.deepEqual(setupBackfillArguments(['--config',config,'--output',output,'--allow-local']),{configFile:config,outputFile:output,cursor:null,allowLocal:true});
  for(const args of [[],['--config','relative','--output',output],['--config',config,'--output',config],
    ['--config',config,'--output',output,'--apply'],['--config',config,'--output',output,'--config',config],
    ['--config',config,'--output',output,'--allow-local','--allow-local']])
    assert.throws(()=>setupBackfillArguments(args),{code:'INVALID_SETUP_BACKFILL_ARGUMENTS'});
});
