import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryFixture,buildOnboardingPlan,onboardingArguments,pinnedImage,runOnboardingFixture,summarizeCompose} from './vps-onboarding.mjs';

const image='roomqc/control@sha256:'+'a'.repeat(64);
const compose=`services:\n  control:\n    image: ${image}\n    restart: unless-stopped\n`;

test('onboarding plan validates a local candidate and keeps admission closed',()=>{
  const document=inventoryFixture({frontendReady:true});
  const plan=buildOnboardingPlan(document,{clusterId:'cluster-fixture',releaseId:'release-fixture',image},{allowLocal:true,compose:summarizeCompose(compose,{image})});
  assert.equal(plan.decision,'ready');assert.equal(plan.admission,'closed');
  assert.deepEqual(plan.sideEffects,{ssh:false,docker:false,database:false,provider:false,signupOpened:false});
  assert.deepEqual(runOnboardingFixture(plan),{version:1,kind:'roomqc-vps-onboarding-fixture',status:'health_gate_passed',planDecision:'ready',
    completedPhases:['preflight','inventory_validation','release_stage','compose_pin','service_start','health_gate','backup_gate'],failedPhase:null,
    rollback:{performed:false},admission:'closed',sideEffects:plan.sideEffects});
});

test('onboarding blocks a non-ready host before any install step',()=>{
  const document=inventoryFixture({environment:'staging',frontendReady:true,preflight:{capturedAt:new Date().toISOString(),deploymentAllowed:false,diskFreePercent:11,dockerServerVersion:'29.1.3'}});
  const plan=buildOnboardingPlan(document,{clusterId:'cluster-fixture',releaseId:'release-fixture',image},{compose:summarizeCompose(compose,{image})});
  assert.equal(plan.decision,'blocked');assert.deepEqual(plan.reasons,['HOST_PREFLIGHT_REQUIRED']);
  assert.equal(runOnboardingFixture(plan).status,'blocked');
});

test('health failure rolls back staged service and keeps admission closed',()=>{
  const document=inventoryFixture({frontendReady:true});
  const plan=buildOnboardingPlan(document,{clusterId:'cluster-fixture',releaseId:'release-fixture',image},{allowLocal:true,compose:summarizeCompose(compose,{image})});
  const result=runOnboardingFixture(plan,{health:false});
  assert.equal(result.status,'rolled_back');assert.equal(result.failedPhase,'health_gate');assert.equal(result.rollback.performed,true);assert.equal(result.admission,'closed');
});

test('parser and compose gate reject unsafe or unpinned inputs',()=>{
  assert.equal(pinnedImage(image),image);
  assert.throws(()=>pinnedImage('roomqc/control:latest'),{code:'VPS_ONBOARDING_IMAGE_NOT_PINNED'});
  assert.throws(()=>summarizeCompose('services:\n  control:\n    image: roomqc/control:latest\n',{image}),{code:'VPS_ONBOARDING_COMPOSE_IMAGE_MISMATCH'});
  assert.deepEqual(onboardingArguments(['--help']),{help:true});
  assert.throws(()=>onboardingArguments(['--cluster-id','cluster-fixture']),{code:'VPS_ONBOARDING_ARGUMENTS_INVALID'});
});
