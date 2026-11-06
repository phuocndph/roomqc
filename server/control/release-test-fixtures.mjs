// Synthetic signing authority for exact-owned tests only. Private material is
// generated in memory, never exported, persisted, logged or used by runtime.
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {ReleaseApprovalTrust,releaseApprovalEndpointFingerprint,releaseApprovalSigningBytes} from './release-approval.mjs';
const pair=generateKeyPairSync('ed25519'),rotated=generateKeyPairSync('ed25519'),cache=new Map(),notBefore=Date.now()-10000;
const signingKeys=new Map([['test-key',pair],['test-rotated-key',rotated]]);
export const fixtureReleaseMaximumValidityMs=86400000;
export const fixtureReleaseTrustRaw={version:1,keys:[...signingKeys].map(([keyId,key])=>({issuerId:'test-issuer',keyId,
  publicKey:key.publicKey.export({format:'jwk'}),environments:['local','staging','production']}))};
export const fixtureReleaseTrust=new ReleaseApprovalTrust(fixtureReleaseTrustRaw,{maximumValidityMs:fixtureReleaseMaximumValidityMs});
export function fixtureReleaseContext(cluster,expected,{hostId=cluster.hostId??cluster.id,environment='local'}={}){
  return {inventoryRef:cluster.inventoryRef??cluster.id,clusterId:cluster.id,hostId,environment,expected,
    endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,internalUrl:cluster.internalUrl??null,
      approvedAddresses:cluster.approvedAddresses??[],credentialRef:cluster.credentialRef??cluster.id})};
}
export function fixtureReleaseApproval(context,overrides={},keyId='test-key'){
  if(!signingKeys.has(keyId))throw new Error('UNKNOWN_FIXTURE_SIGNING_KEY');
  const identity=JSON.stringify({context,overrides,keyId});
  if(!cache.has(identity)){
    const unsigned={version:1,algorithm:'Ed25519',issuerId:'test-issuer',keyId,payload:{approvalId:randomUUID(),epoch:1,
      ...context,notBefore,expiresAt:notBefore+fixtureReleaseMaximumValidityMs,...overrides}};
    cache.set(identity,{...unsigned,signature:sign(null,releaseApprovalSigningBytes(unsigned),signingKeys.get(keyId).privateKey).toString('base64url')});
  }
  return structuredClone(cache.get(identity));
}
export async function seedFixtureReleaseAuthority(pool,context){
  const approval=fixtureReleaseTrust.verify(fixtureReleaseApproval(context),context);
  // Explicit synthetic superuser fixture, NOT the installer under test. One
  // statement creates matching rows atomically without fabricating audit events.
  await pool.query(`WITH inserted AS (
    INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,
      inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) RETURNING approval_id
  ) INSERT INTO roomqc_control.release_authority(cluster_id,approval_id,epoch,row_version,state)
    SELECT $2,approval_id,$3,1,'active' FROM inserted`,
  [approval.approvalId,approval.clusterId,approval.epoch,approval.envelopeDigest,approval.issuerId,approval.keyId,approval.keyFingerprint,
    approval.inventoryRef,approval.hostId,approval.environment,approval.endpointFingerprint,approval.expectationFingerprint,
    JSON.stringify(approval.expected),approval.notBefore,approval.expiresAt]);
  return approval;
}
