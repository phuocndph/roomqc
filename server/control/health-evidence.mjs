import {isIP} from 'node:net';
import {ControlError} from './errors.mjs';
import {probeBinding,probeSessionPolicy} from './probe-credentials.mjs';
import {releaseApprovalIdentity,sameReleaseApproval} from './release-authority.mjs';

const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const positive=value=>Number.isSafeInteger(value)&&value>0;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const invalid=()=>new ControlError(422,'INVALID_HEALTH_PROOF','Thiếu hoặc sai bằng chứng kiểm tra dịch vụ.');
export const healthProofPolicy=Object.freeze({commitMaxAgeMs:30000,snapshotMaxAgeMs:120000,futureSkewMs:5000});

// Public identities only: never a token, user/session ID, key or ciphertext.
export function normalizeHealthProof(input){
  if(!exact(input,['version','binding','releaseApproval','credentialRevision','policyVersion','targetFingerprint','targetVersion','checkedAt'])
    ||input.version!==2||!positive(input.credentialRevision)||!positive(input.policyVersion)||!positive(input.targetVersion)
    ||!digest(input.targetFingerprint)||typeof input.checkedAt!=='string'||!Number.isFinite(Date.parse(input.checkedAt)))throw invalid();
  const b=input.binding;
  if(!exact(b,['clusterId','credentialRef','inventoryRef','url','internalUrl','approvedAddresses','releaseFingerprint','expected','bindingHash'])
    ||!Array.isArray(b.approvedAddresses)||b.approvedAddresses.length>64||b.approvedAddresses.some(ip=>typeof ip!=='string'||!isIP(ip)))throw invalid();
  let binding;
  try{binding=probeBinding({id:b.clusterId,credentialRef:b.credentialRef,inventoryRef:b.inventoryRef,url:b.url,
    internalUrl:b.internalUrl??undefined,approvedAddresses:b.approvedAddresses},b.expected)}catch{throw invalid()}
  if(binding.bindingHash!==b.bindingHash||binding.releaseFingerprint!==b.releaseFingerprint)throw invalid();
  let releaseApproval;
  try{
    if(!exact(input.releaseApproval,['approvalId','epoch','envelopeDigest']))throw invalid();
    releaseApproval=releaseApprovalIdentity(input.releaseApproval);
  }catch{throw invalid()}
  return {version:2,binding,releaseApproval,credentialRevision:input.credentialRevision,policyVersion:input.policyVersion,
    targetFingerprint:input.targetFingerprint,targetVersion:input.targetVersion,checkedAt:new Date(input.checkedAt).toISOString()};
}
export const healthProofProjection=proof=>({version:2,releaseApproval:releaseApprovalIdentity(proof.releaseApproval),bindingHash:proof.binding.bindingHash,credentialRevision:proof.credentialRevision,
  policyVersion:proof.policyVersion,targetFingerprint:proof.targetFingerprint,targetVersion:proof.targetVersion,checkedAt:proof.checkedAt});
export function assertHealthProof(proof,row,{clusterId,targetFingerprint,policyVersion,targetVersion,now}){
  const b=proof.binding;
  if(b.clusterId!==clusterId||b.url!==row.api_url||b.inventoryRef!==row.inventory_ref||b.credentialRef!==row.credential_ref
    ||b.expected.releaseId!==row.release_id||b.expected.schemaManifestHash!==row.schema_manifest_hash||row.validation_state!=='valid'
    ||row.probe_state!=='ready'||Number(row.probe_revision)!==proof.credentialRevision||row.probe_binding_hash!==b.bindingHash
    ||row.probe_credential_ref!==b.credentialRef||proof.policyVersion!==Number(policyVersion)||proof.targetVersion!==Number(targetVersion)
    ||proof.targetFingerprint!==targetFingerprint)throw new ControlError(409,'HEALTH_PROOF_CHANGED','Bằng chứng kiểm tra không còn thuộc cấu hình hiện hành.');
  const checked=Date.parse(proof.checkedAt),auth=Date.parse(row.probe_auth_expires_at),probe=Date.parse(row.probe_expires_at);
  if(checked<now-healthProofPolicy.commitMaxAgeMs||checked>now+healthProofPolicy.futureSkewMs||!Number.isFinite(auth)||!Number.isFinite(probe)
    ||auth<=now+probeSessionPolicy.minimumValidityMs||probe<=now+probeSessionPolicy.minimumValidityMs){
    throw new ControlError(409,'HEALTH_PROOF_EXPIRED','Bằng chứng hoặc credential kiểm tra đã quá hạn.');
  }
}
export function healthProofReasons(row,now){
  const p=row.evaluator_state?.probeEvidence;
  if(!p||p.version!==2||!digest(p.bindingHash)||!positive(p.credentialRevision)||!positive(p.policyVersion)||!positive(p.targetVersion)
    ||!digest(p.targetFingerprint)||typeof p.checkedAt!=='string'||!Number.isFinite(Date.parse(p.checkedAt)))return ['HEALTH_PROOF_UNVERIFIED'];
  const codes=[];
  const a=row.release_authority;
  if(!a||a.authority_state!=='active'||a.authority_key_revoked!==false||!sameReleaseApproval(p.releaseApproval,
    {approvalId:a.approval_id,epoch:Number(a.authority_epoch),envelopeDigest:a.envelope_digest}))codes.push('HEALTH_PROOF_CHANGED');
  if(row.probe_state!=='ready'||Number(row.probe_revision)!==p.credentialRevision||row.probe_binding_hash!==p.bindingHash
    ||row.probe_expected_binding_hash!==p.bindingHash||row.probe_credential_ref!==row.credential_ref
    ||p.targetFingerprint!==row.telemetry_target_fingerprint||p.targetVersion!==Number(row.telemetry_target_version)
    ||p.policyVersion!==Number(row.policy_version))codes.push('HEALTH_PROOF_CHANGED');
  const auth=Date.parse(row.probe_auth_expires_at),probe=Date.parse(row.probe_expires_at),checked=Date.parse(p.checkedAt);
  if(!Number.isFinite(auth)||!Number.isFinite(probe)||auth<=now+probeSessionPolicy.minimumValidityMs||probe<=now+probeSessionPolicy.minimumValidityMs
    ||checked<now-healthProofPolicy.snapshotMaxAgeMs||checked>now+healthProofPolicy.futureSkewMs)codes.push('HEALTH_PROOF_EXPIRED');
  return codes;
}
