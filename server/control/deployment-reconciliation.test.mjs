import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {reconciliationPlan,reconciliationEvidence,evidenceHash,reconcileDeployment} from './deployment-reconciliation.mjs';
import {inventoryFixture} from './vps-onboarding.mjs';
import {reconciliationArguments} from '../../scripts/roomqc-vps-reconcile.mjs';

const row={id:randomUUID(),cluster_id:'cluster-fixture',host_id:'host-fixture',environment:'local',release_id:'release-new',compose_sha256:'a'.repeat(64)};
const plan=()=>reconciliationPlan(row,inventoryFixture(),'127.0.0.1');
const image='nginx@sha256:'+'b'.repeat(64);
const manifest=(releaseId='release-new')=>({manifest:{version:1,clusterId:'cluster-fixture',project:'roomqc-cluster-fixture',releaseId,
  composeSha256:'a'.repeat(64),services:[{name:'web',image}],previousRelease:releaseId==='release-new'?'release-old':null},composeSha256:'a'.repeat(64)});
const container=(release='release-new')=>({Id:'b'.repeat(64),Config:{Image:image,Labels:{'com.docker.compose.project':'roomqc-cluster-fixture',
  'com.docker.compose.service':'web','com.roomqc.cluster':'cluster-fixture','com.roomqc.release':release},Env:['PRIVATE=private-marker']},State:{Running:true,Health:{Status:'healthy'}}});
test('reconciliation binds approved target, host link and immutable run hash before transport',()=>{
  assert.equal(plan().journalRunId,row.id);
  for(const change of [{host_id:'wrong'},{environment:'staging'},{id:'not-uuid'},{compose_sha256:'invalid'}])
    assert.throws(()=>reconciliationPlan({...row,...change},inventoryFixture(),'127.0.0.1'));
  assert.throws(()=>reconciliationPlan(row,inventoryFixture(),'1.1.1.1'),{code:'VPS_DEPLOY_TARGET_MISMATCH'});
});
test('reconciliation proves healthy candidate, previous or empty state with no arbitrary inspected fields',()=>{
  const candidate=reconciliationEvidence(plan(),{currentRelease:'release-new',candidate:manifest(),current:manifest(),containers:[container()]});
  assert.equal(candidate.outcome,'candidate_healthy');assert.equal(JSON.stringify(candidate).includes('private-marker'),false);
  const previous=reconciliationEvidence(plan(),{currentRelease:'release-old',candidate:manifest(),current:manifest('release-old'),containers:[container('release-old')]});
  assert.equal(previous.outcome,'previous_healthy');
  assert.equal(reconciliationEvidence(plan(),{currentRelease:null,candidate:null,current:null,containers:[]}).outcome,'empty');
  const {evidenceSha256,...evidence}=candidate;
  assert.equal(evidenceHash(JSON.parse(JSON.stringify(evidence))),evidenceSha256);
  assert.equal(evidenceHash(Object.fromEntries(Object.entries(evidence).reverse())),evidenceSha256);
});
test('reconciliation refuses mismatched files, manifests, missing, unhealthy, foreign or duplicate containers',()=>{
  const base=()=>({currentRelease:'release-new',candidate:manifest(),current:manifest(),containers:[container()]});
  for(const mutate of [
    v=>{v.candidate.composeSha256='f'.repeat(64)},v=>{v.current.manifest.releaseId='wrong'},v=>{v.containers=[]},
    v=>{v.containers[0].State.Health.Status='unhealthy'},v=>{v.containers[0].Config.Labels['com.roomqc.cluster']='foreign'},
    v=>{v.containers.push(container())},v=>{v.containers[0].Config.Image='nginx:latest'},
    v=>{v.containers[0].Config.Env=['ROOMQC_CONTROL_SIGNUP_ENABLED=true']},v=>{v.currentRelease=null},
    v=>{v.current.manifest.services.push({name:'web',image})},v=>{v.current.manifest.services[0].image='nginx:latest'},
  ]){const input=base();mutate(input);assert.throws(()=>reconciliationEvidence(plan(),input))}
});
test('reconciliation saves proof before releasing its fence; failed DB save never unlocks',async()=>{
  const calls=[],proof={marker:'proof'},journal={read:async()=>row,resolve:async(r,p)=>{assert.equal(p,proof);calls.push('save');return {id:'resolution'}}};
  const remote={observe:async()=>{calls.push('fence-observe');return proof},release:async()=>calls.push('release')};
  const result=await reconcileDeployment({journal,runId:row.id,document:inventoryFixture(),host:'127.0.0.1',remote});
  assert.equal(result.lockReleased,true);assert.deepEqual(calls,['fence-observe','save','release']);
  calls.length=0;journal.resolve=async()=>{throw new Error('database lost')};
  await assert.rejects(()=>reconcileDeployment({journal,runId:row.id,document:inventoryFixture(),host:'127.0.0.1',remote}));
  assert.deepEqual(calls,['fence-observe']);
});
test('reconciliation retries cleanup after a saved receipt without creating a new observation',async()=>{
  const resolution={id:randomUUID()},journal={read:async()=>({...row,resolution})};
  const remote={observe:async()=>{throw new Error('must not observe again')},release:async()=>{throw new Error('transport lost')}};
  const result=await reconcileDeployment({journal,runId:row.id,document:inventoryFixture(),host:'127.0.0.1',remote});
  assert.equal(result.resolution,resolution);assert.equal(result.lockReleased,false);
});
test('reconciliation CLI rejects unknown, duplicate, inline secret and incomplete arguments',()=>{
  const args=['--run-id',row.id,'--inventory-file',process.platform==='win32'?'C:\\fixture\\inventory.json':'/fixture/inventory.json','--host','1.1.1.1','--user','root'];
  assert.equal(reconciliationArguments(args).mode,'plan');
  for(const extra of [['--password','private-marker'],['--mode','execute','--mode','execute'],['--mode','drop'],['--output','relative']])
    assert.throws(()=>reconciliationArguments([...args,...extra]));
  assert.throws(()=>reconciliationArguments(['--run-id',row.id]));
});
