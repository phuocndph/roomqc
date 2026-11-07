import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentView,executeJournaledRelease,openDeploymentJournal} from './deployment-journal.mjs';
import {buildReleasePlan,deploymentCompose} from './vps-deploy.mjs';
import {inventoryFixture} from './vps-onboarding.mjs';

const image='roomqc/control@sha256:'+'a'.repeat(64),options={clusterId:'cluster-fixture',releaseId:'release-test',image};
const plan=()=>buildReleasePlan({document:inventoryFixture(),options,allowLocal:true,
  compose:deploymentCompose({services:{web:{image,healthcheck:{test:['CMD','true']}}}},options)});
function fixture(){
  const calls=[],journal={begin:async()=>{calls.push('reserve');return 'run'},phase:async(id,phase)=>calls.push('save:'+phase),
    finish:async(id,result)=>calls.push('finish:'+result.status)};
  const remote={stage:async()=>calls.push('stage'),validate:async()=>calls.push('validate'),start:async()=>calls.push('start'),
    health:async()=>{calls.push('health');return true},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback')};
  return {calls,journal,remote};
}
test('deployment journal persists each phase before its remote effect and writes the final receipt',async()=>{
  const f=fixture(),result=await executeJournaledRelease(plan(),f);
  assert.equal(result.runId,'run');assert.equal(result.status,'deployed');
  assert.deepEqual(f.calls,['reserve','save:stage_release','stage','save:validate_compose','validate','save:start_release','start',
    'save:health_gate','health','save:commit_release','commit','finish:deployed']);
});
test('deployment journal unavailable before stage prevents all remote effects',async()=>{
  const f=fixture();f.journal.begin=async()=>{throw new Error('offline')};
  await assert.rejects(()=>executeJournaledRelease(plan(),f));assert.deepEqual(f.calls,[]);
  const g=fixture();g.journal.phase=async()=>{throw new Error('offline')};
  const result=await executeJournaledRelease(plan(),g);assert.equal(result.status,'not_started');
  assert.deepEqual(g.calls,['reserve','finish:not_started']);
});
test('deployment journal failure before commit rolls back; failed final save is never reported as success',async()=>{
  const f=fixture();f.journal.phase=async(id,phase)=>{if(phase==='commit_release')throw new Error('offline')};
  const result=await executeJournaledRelease(plan(),f);assert.equal(result.status,'rolled_back');assert.equal(f.calls.includes('commit'),false);
  assert.equal(f.calls.includes('rollback'),true);
  const g=fixture();g.journal.finish=async()=>{throw new Error('private text')};
  await assert.rejects(()=>executeJournaledRelease(plan(),g),{code:'DEPLOYMENT_RECEIPT_UNCONFIRMED'});
  assert.equal(g.calls.includes('commit'),true);assert.equal(g.calls.includes('rollback'),false);
});
test('deployment journal preserves unknown commit and cancels before mutation when the reserved output fails',async()=>{
  const f=fixture();f.remote.commit=async()=>{throw new Error('lost connection')};
  assert.equal((await executeJournaledRelease(plan(),f)).status,'outcome_unknown');
  assert.equal(f.calls.includes('rollback'),false);assert.ok(f.calls.includes('finish:outcome_unknown'));
  const g=fixture();await assert.rejects(()=>executeJournaledRelease(plan(),{...g,onReserved:async()=>{throw new Error('output full')}}),{code:'DEPLOYMENT_OUTPUT_UNAVAILABLE'});
  assert.deepEqual(g.calls,['reserve','finish:not_started']);
});
test('deployment projection omits shell, Compose, addresses, secrets and unsafe errors',()=>{
  const safe=deploymentView({id:'run',phase_index:0,state:'running',error_code:'https://private.invalid',password:'private-marker',
    host:'private-marker',compose:'private-marker'});
  assert.equal(safe.phase,'preflight');assert.equal(safe.errorCode,null);assert.equal(JSON.stringify(safe).includes('private-marker'),false);
});
test('deployment executor requires a private database file, never an inline URL or disabled TLS',async()=>{
  for(const env of [{},{ROOMQC_DEPLOY_DATABASE_URL:'postgresql://private-marker'},
    {ROOMQC_DEPLOY_DATABASE_URL_FILE:'relative'}, {ROOMQC_DEPLOY_DATABASE_URL_FILE:'/unused',NODE_TLS_REJECT_UNAUTHORIZED:'0'}])
    await assert.rejects(()=>openDeploymentJournal(env));
});
