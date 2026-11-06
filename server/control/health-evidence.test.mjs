import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHealthProof,assertHealthProof,healthProofProjection,healthProofReasons} from './health-evidence.mjs';
import {syntheticWorkerProbe} from './health-test-fixtures.mjs';
import {fixtureTarget} from './test-fixtures.mjs';
import {managedHealthProbe} from './probe-session.mjs';

function fixture(){
  const proof=normalizeHealthProof(syntheticWorkerProbe(fixtureTarget('cluster-a')).evidence),b=proof.binding,now=Date.now();
  const row={api_url:b.url,credential_ref:b.credentialRef,inventory_ref:b.inventoryRef,release_id:b.expected.releaseId,
    schema_manifest_hash:b.expected.schemaManifestHash,validation_state:'valid',probe_credential_ref:b.credentialRef,
    probe_state:'ready',probe_revision:1,probe_binding_hash:b.bindingHash,probe_expected_binding_hash:b.bindingHash,
    probe_auth_expires_at:new Date(now+3600000).toISOString(),probe_expires_at:new Date(now+86400000).toISOString(),
    telemetry_target_fingerprint:proof.targetFingerprint,telemetry_target_version:1,policy_version:1,evaluator_state:{probeEvidence:healthProofProjection(proof)}};
  row.release_authority={authority_state:'active',authority_key_revoked:false,approval_id:proof.releaseApproval.approvalId,
    authority_epoch:proof.releaseApproval.epoch,envelope_digest:proof.releaseApproval.envelopeDigest};
  const context={clusterId:b.clusterId,targetFingerprint:proof.targetFingerprint,targetVersion:1,policyVersion:1,now};
  return {proof,row,context};
}
test('health evidence has an exact secret-free canonical identity and recomputes the entire binding hash',()=>{
  const {proof}=fixture();assert.deepEqual(normalizeHealthProof(proof),proof);
  for(const input of [undefined,null,{}, {...proof,version:1},{...proof,credentialRevision:'1'},{...proof,targetVersion:0},
    {...proof,releaseApproval:undefined},{...proof,releaseApproval:{...proof.releaseApproval,epoch:0}},
    {...proof,releaseApproval:{...proof.releaseApproval,token:'forbidden'}},
    {...proof,policyVersion:Number.MAX_SAFE_INTEGER+1},{...proof,token:'forbidden'},
    {...proof,binding:{...proof.binding,auth:'forbidden'}},{...proof,binding:{...proof.binding,bindingHash:'0'.repeat(64)}},
    {...proof,binding:{...proof.binding,url:'http://127.0.0.1:6000'}},{...proof,binding:{...proof.binding,approvedAddresses:['invalid']}}]){
    assert.throws(()=>normalizeHealthProof(input),{code:'INVALID_HEALTH_PROOF'});
  }
  assert.deepEqual(Object.keys(healthProofProjection(proof)).sort(),['bindingHash','checkedAt','credentialRevision','policyVersion','releaseApproval','targetFingerprint','targetVersion','version']);
});
test('health evidence checks live DB identity, revision, policy, target and credential validity at commit',()=>{
  const {proof,row,context}=fixture();assertHealthProof(proof,row,context);
  for(const change of [{probe_state:'refreshing'},{probe_state:'needs_recovery'},{probe_revision:2},{probe_binding_hash:'0'.repeat(64)},
    {credential_ref:'other'},{inventory_ref:'other'},{api_url:'https://different.invalid'},{release_id:'changed'},
    {schema_manifest_hash:'0'.repeat(64)},{validation_state:'invalid'}]){
    assert.throws(()=>assertHealthProof(proof,{...row,...change},context),{code:'HEALTH_PROOF_CHANGED'});
  }
  for(const change of [{policyVersion:2},{targetVersion:2},{targetFingerprint:'0'.repeat(64)}]){
    assert.throws(()=>assertHealthProof(proof,row,{...context,...change}),{code:'HEALTH_PROOF_CHANGED'});
  }
  for(const change of [{probe_auth_expires_at:new Date(context.now+30000).toISOString()},
    {probe_expires_at:'invalid'},{probe_auth_expires_at:null}]){
    assert.throws(()=>assertHealthProof(proof,{...row,...change},context),{code:'HEALTH_PROOF_EXPIRED'});
  }
});
test('admission proof cannot be bypassed by ignoring manual/capacity gates or missing current approval metadata',()=>{
  const {row,context}=fixture();assert.deepEqual(healthProofReasons(row,context.now),[]);
  for(const change of [{probe_revision:2},{probe_expected_binding_hash:null},{probe_state:'needs_recovery'},
    {telemetry_target_version:2},{policy_version:2}])assert.ok(healthProofReasons({...row,...change},context.now).includes('HEALTH_PROOF_CHANGED'));
  assert.deepEqual(healthProofReasons({...row,evaluator_state:{}},context.now),['HEALTH_PROOF_UNVERIFIED']);
  for(const revoked of [true,undefined])assert.ok(healthProofReasons({...row,
    release_authority:{...row.release_authority,authority_key_revoked:revoked}},context.now).includes('HEALTH_PROOF_CHANGED'));
  assert.ok(healthProofReasons(row,context.now+120001).includes('HEALTH_PROOF_EXPIRED'));
});
test('managed probe adapter requires server-owned storage identity and a complete collector before starting',()=>{
  for(const options of [{},{managerFor:()=>{}},{managerFor:()=>{},collect:()=>{}}]){
    assert.throws(()=>managedHealthProbe(options),{code:'SERVICE_PROBES_UNCONFIGURED'});
  }
});
