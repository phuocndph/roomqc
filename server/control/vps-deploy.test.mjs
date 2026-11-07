import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {inventoryFixture} from './vps-onboarding.mjs';
import {buildReleasePlan,deployArguments,executeReleasePlan,releasePaths,shellQuote,deploymentCompose,assertDeploymentTarget} from './vps-deploy.mjs';

const absInventory=resolve(tmpdir(),'i.json'),absCompose=resolve(tmpdir(),'c.yml');
const image='roomqc/control@sha256:'+'b'.repeat(64);
const options={clusterId:'cluster-fixture',releaseId:'release-fixture',image,composeFile:'C:\\fixture\\compose.yml'};
const model=()=>({services:{control:{image,environment:{ROOMQC_CONTROL_SIGNUP_ENABLED:'false'},healthcheck:{test:['CMD','true']}}}});
const compose=deploymentCompose(model(),options);

test('release plan is pinned, health-gated and keeps admission closed',()=>{
  const plan=buildReleasePlan({document:inventoryFixture({frontendReady:true}),options,compose,allowLocal:true});
  assert.equal(plan.kind,'roomqc-vps-release-plan');assert.equal(plan.decision,'ready');assert.equal(plan.executeAllowed,true);
  assert.equal(plan.admission,'closed');assert.equal(plan.project,'roomqc-cluster-fixture');assert.equal(plan.rollback.restorePrevious,true);
  assert.equal(plan.paths.releaseDir,'/opt/RoomQC/clusters/cluster-fixture/releases/release-fixture');
  assert.equal(plan.paths.previousFile,'/opt/RoomQC/clusters/cluster-fixture/current/compose.json');
  assert.notEqual(releasePaths('another-cluster','release-fixture').root,plan.paths.root);
  assert.equal(plan.compose.source,undefined);assert.equal(plan.compose.model,undefined);
});

test('release transaction commits only after health and rolls back on failure',async()=>{
  const plan=buildReleasePlan({document:inventoryFixture({frontendReady:true}),options,compose,allowLocal:true});
  const calls=[];const remote={
    stage:async()=>calls.push('stage'),validate:async()=>calls.push('validate'),start:async()=>calls.push('start'),
    health:async()=>{calls.push('health');return true},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback')};
  const deployed=await executeReleasePlan(plan,{remote});assert.equal(deployed.status,'deployed');assert.deepEqual(calls,['stage','validate','start','health','commit']);
  calls.length=0;remote.health=async()=>{calls.push('health');return false};const failed=await executeReleasePlan(plan,{remote});assert.equal(failed.status,'rolled_back');assert.deepEqual(calls,['stage','validate','start','health','rollback']);assert.equal(failed.admission,'unchanged');
});

test('release transaction rolls back on remote exception and refuses blocked plan',async()=>{
  const plan=buildReleasePlan({document:inventoryFixture({environment:'staging',frontendReady:true,preflight:{capturedAt:new Date().toISOString(),deploymentAllowed:false,diskFreePercent:11,dockerServerVersion:'29.1.3'}}),options,compose});
  assert.equal(plan.decision,'blocked');assert.equal((await executeReleasePlan(plan,{remote:{}})).status,'blocked');
  const ready=buildReleasePlan({document:inventoryFixture({frontendReady:true}),options,compose,allowLocal:true});let rolled=false;
  const result=await executeReleasePlan(ready,{remote:{stage:async()=>{},validate:async()=>{throw Object.assign(new Error('bad'),{code:'VALIDATE_FAILED'})},start:async()=>{},health:async()=>true,commit:async()=>{},rollback:async()=>{rolled=true}}});
  assert.equal(result.status,'not_started');assert.equal(result.failedPhase,'validate_compose');assert.equal(result.errorCode,'VALIDATE_FAILED');assert.equal(rolled,false);
});

test('deploy refuses a different SSH host even when preflight would be healthy',()=>{
  const document=inventoryFixture();
  assert.throws(()=>assertDeploymentTarget(document,{...options,host:'1.1.1.1'}),{code:'VPS_DEPLOY_TARGET_MISMATCH'});
  assert.equal(assertDeploymentTarget(document,{...options,host:'127.0.0.1'}).hostId,'host-fixture');
  assert.throws(()=>buildReleasePlan({document,options,compose,allowLocal:true,host:'127.0.0.1',
    preflight:{host:'1.1.1.1',deploymentAllowed:true}}),{code:'VPS_DEPLOY_PREFLIGHT_MISMATCH'});
});

test('Compose rejects comment-only pin, mutable secondary images and dangerous shared resources',()=>{
  for(const mutate of [
    m=>{m.services.control.image='roomqc/control:latest'},
    m=>{m.services.other={image:'nginx:latest',healthcheck:{test:['CMD','true']}}},
    m=>{m.services.control.container_name='shared-crm'},
    m=>{m.services.control.privileged=true},
    m=>{m.services.control.network_mode='host'},
    m=>{m.services.control.build='.'},
    m=>{m.services.control.volumes=[{type:'bind',source:'/var/run/docker.sock',target:'/var/run/docker.sock',read_only:true}]},
    m=>{m.volumes={data:{external:true,name:'crm-data'}}},
    m=>{m.networks={shared:{name:'crm-network'}}},
    m=>{delete m.services.control.healthcheck},
    m=>{m.services.control.environment.ROOMQC_CONTROL_SIGNUP_ENABLED='true'},
    m=>{m.services.control.environment.DATABASE_URL='postgresql://private-value'},
    m=>{m.services.control.env_file=[{path:'/tmp/private.env'}]},
    m=>{m.services.control.environment.URL='${UNREVIEWED_VALUE}'},
  ]){
    const input=model();mutate(input);assert.throws(()=>deploymentCompose(input,options));
  }
  const input=model();input.services.control.volumes=[{type:'bind',source:'/opt/RoomQC/clusters/cluster-fixture/config/db-url',target:'/run/secrets/db-url',read_only:true}];
  const value=deploymentCompose(input,options);assert.equal(value.model.services.control.labels['com.roomqc.release'],options.releaseId);
  assert.equal(value.services[0].image,image);
  input.services.control.environment.ROOMQC_CONTROL_DATABASE_URL_FILE='/run/secrets/db-url';
  assert.doesNotThrow(()=>deploymentCompose(input,options));
  input.services.control.environment.ROOMQC_CONTROL_DATABASE_URL_FILE='/run/../etc/private';
  assert.throws(()=>deploymentCompose(input,options),{code:'VPS_DEPLOY_SECRET_FILE_INVALID'});
});

test('start failure restores previous release, failed rollback is not retried or unlocked',async()=>{
  const plan=buildReleasePlan({document:inventoryFixture(),options,compose,allowLocal:true}),calls=[];
  const remote={stage:async()=>{},validate:async()=>{},start:async()=>{throw new Error('start failed')},health:async()=>true,
    commit:async()=>{},rollback:async()=>{calls.push('rollback');throw Object.assign(new Error('failed'),{code:'ROLLBACK_FAILED'})},release:async()=>calls.push('release')};
  const result=await executeReleasePlan(plan,{remote});assert.equal(result.status,'rollback_failed');assert.equal(result.failedPhase,'start_release');
  assert.deepEqual(calls,['rollback']);
});

test('Compose accepts and strips only its own generated resource names',()=>{
  const input=model();input.volumes={state:{name:'roomqc-cluster-fixture_state'}};input.networks={default:{name:'roomqc-cluster-fixture_default'}};
  const value=deploymentCompose(input,options);assert.equal(value.model.volumes.state.name,undefined);assert.equal(value.model.networks.default.name,undefined);
  input.volumes.state.name='roomqc-another-cluster_state';assert.throws(()=>deploymentCompose(input,options),{code:'VPS_DEPLOY_SHARED_RESOURCE_UNSAFE'});
});

test('lost commit response preserves the release and lock rather than undoing a possible commit',async()=>{
  const plan=buildReleasePlan({document:inventoryFixture(),options,compose,allowLocal:true}),calls=[];
  const result=await executeReleasePlan(plan,{remote:{stage:async()=>{},validate:async()=>{},start:async()=>{},health:async()=>true,
    commit:async()=>{throw new Error('connection lost after commit')},rollback:async()=>calls.push('rollback'),release:async()=>calls.push('release')}});
  assert.equal(result.status,'outcome_unknown');assert.equal(result.failedPhase,'commit_release');assert.deepEqual(calls,[]);
});

test('production installation remains blocked until authoritative admission, backup and schema gates are wired',async()=>{
  const plan=buildReleasePlan({document:inventoryFixture({environment:'production',preflight:{capturedAt:new Date().toISOString(),deploymentAllowed:true,diskFreePercent:40,dockerServerVersion:'29'}}),options,compose});
  const result=await executeReleasePlan(plan,{remote:{}});
  assert.equal(result.status,'blocked');assert.equal(result.admission,'unchanged');assert.equal(result.errorCode,'VPS_DEPLOY_PRODUCTION_GATES_REQUIRED');
});

test('deploy parser requires target only for execute and shell values stay bounded',()=>{
  assert.deepEqual(deployArguments(['--inventory-file',absInventory,'--cluster-id','cluster-fixture','--release-id','release-fixture','--image',image,'--compose-file',absCompose,'--mode','plan']).mode,'plan');
  assert.throws(()=>deployArguments(['--inventory-file',absInventory,'--cluster-id','cluster-fixture','--release-id','release-fixture','--image',image,'--compose-file',absCompose,'--mode','execute']),{code:'VPS_DEPLOY_EXECUTION_TARGET_REQUIRED'});
  assert.match(shellQuote("a'b"),/^'a'\\''b'$/);assert.throws(()=>shellQuote('bad\nvalue'),{code:'VPS_DEPLOY_SHELL_VALUE_INVALID'});
});
