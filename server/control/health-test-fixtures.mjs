// Explicit synthetic proof for directory metric/window tests ONLY. This does
// not claim five real services passed. Production HealthStore never supplies a
// missing proof; race and credential tests use it directly, without this helper.
import {HealthStore} from './telemetry.mjs';
import {probeBinding} from './probe-credentials.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {fixtureCluster} from './test-fixtures.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {fixtureReleaseTrust,fixtureReleaseContext,fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {releaseApprovalIdentity} from './release-authority.mjs';

export function syntheticWorkerProbe(target,context={}){
  const bindingContext=fixtureReleaseContext({...fixtureCluster,id:target.clusterId},{...syntheticRelease,clusterId:target.clusterId});
  const releaseApproval=releaseApprovalIdentity(fixtureReleaseTrust.verify(fixtureReleaseApproval(bindingContext),bindingContext));
  return {probes:{auth:false,rest:false,storage:false,realtime:false,functions:false},evidence:{version:2,releaseApproval,
    binding:probeBinding({...fixtureCluster,id:target.clusterId},{...syntheticRelease,clusterId:target.clusterId}),
    credentialRevision:1,policyVersion:context.policyVersion??1,targetVersion:context.targetVersion??1,
    targetFingerprint:context.fingerprint??telemetryTargetFingerprint(target),checkedAt:new Date().toISOString()}};
}

export async function syntheticHealthEvidence(pool,clusterId='cluster-a'){
  const row=(await pool.query(`SELECT c.api_url,c.credential_ref,c.inventory_ref,c.telemetry_target_fingerprint,
    c.telemetry_target_version,p.row_version,q.revision,a.approval_id,a.envelope_digest,r.epoch AS approval_epoch FROM roomqc_control.clusters c
    JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id JOIN roomqc_control.probe_credentials q ON q.cluster_id=c.id
    JOIN roomqc_control.release_authority r ON r.cluster_id=c.id JOIN roomqc_control.release_approvals a ON a.approval_id=r.approval_id WHERE c.id=$1`,[clusterId])).rows[0];
  return {version:2,releaseApproval:{approvalId:row.approval_id,envelopeDigest:row.envelope_digest,epoch:Number(row.approval_epoch)},
    binding:probeBinding({id:clusterId,url:row.api_url,credentialRef:row.credential_ref,inventoryRef:row.inventory_ref},
    {...syntheticRelease,clusterId}),credentialRevision:Number(row.revision),policyVersion:Number(row.row_version),
    targetFingerprint:row.telemetry_target_fingerprint,targetVersion:Number(row.telemetry_target_version),checkedAt:new Date().toISOString()};
}
export class SyntheticHealthStore extends HealthStore{
  async record(clusterId,sample,requestId){
    return super.record(clusterId,{...sample,probeEvidence:sample.probeEvidence??await syntheticHealthEvidence(this.pool,clusterId)},requestId);
  }
}
