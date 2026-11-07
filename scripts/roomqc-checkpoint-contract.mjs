import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const sha=b=>createHash('sha256').update(b).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// The expected digest must come from the operator's capture receipt. A matching
// descriptor pair alone never proves that application writers were stopped.
export function validateCheckpointPair({checkpointBytes,expectedSha256,businessDescriptorBytes,controlDescriptorBytes}){
 assert.match(expectedSha256,/^[a-f0-9]{64}$/,'CHECKPOINT_DIGEST_REQUIRED');
 assert.equal(sha(checkpointBytes),expectedSha256,'CHECKPOINT_DIGEST_MISMATCH');
 const proof=JSON.parse(checkpointBytes),business=JSON.parse(businessDescriptorBytes),control=JSON.parse(controlDescriptorBytes);
 assert.equal(proof.version,1);assert.equal(proof.kind,'roomqc-quiesced-application-checkpoint');assert.match(proof.checkpointId,uuid);
 assert.equal(proof.applicationWritersStopped,true);assert.equal(proof.databaseInventoriesStable,true);
 assert.equal(proof.unexpectedDatabaseClients,false);assert.equal(proof.restoreBeforeServingRequired,true);
 assert.equal(proof.globalCredentialReissueRequired,true);assert.equal(proof.fullServiceRecoveryVerified,false);
 const start=Date.parse(proof.freezeStartedAt),end=Date.parse(proof.captureCompletedAt);
 assert(Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&end-start<=240000,'CHECKPOINT_INTERVAL_INVALID');
 assert(Array.isArray(proof.writers)&&proof.writers.length>0&&proof.writers.length<=64,'CHECKPOINT_WRITERS_REQUIRED');
 const ids=new Set(),names=new Set();
 for(const writer of proof.writers){
  assert.match(writer.id,/^[a-f0-9]{64}$/);assert.match(writer.name,/^roomqc-[a-z0-9-]+$/);assert.match(writer.project,/^roomqc-[a-z0-9-]+$/);
  assert(!ids.has(writer.id)&&!names.has(writer.name),'CHECKPOINT_WRITER_DUPLICATE');ids.add(writer.id);names.add(writer.name);
 }
 assert.equal(business.packetKind,'roomqc-logical-backup');assert.equal(control.packetKind,'roomqc-control-storage-backup');
 assert.equal(sha(businessDescriptorBytes),proof.businessDescriptorSha256,'CHECKPOINT_BUSINESS_PAIR_MISMATCH');
 assert.equal(sha(controlDescriptorBytes),proof.controlDescriptorSha256,'CHECKPOINT_CONTROL_PAIR_MISMATCH');
 for(const descriptor of [business,control]){
  assert.equal(descriptor.checkpointId,proof.checkpointId,'CHECKPOINT_ID_MISMATCH');
  assert.equal(descriptor.sourceHost,proof.sourceHost,'CHECKPOINT_SOURCE_MISMATCH');
  const time=Date.parse(descriptor.snapshotAt);assert(Number.isFinite(time)&&time>=start&&time<=end,'CHECKPOINT_SNAPSHOT_OUTSIDE_FENCE');
 }
 return {checkpointId:proof.checkpointId,sourceHost:proof.sourceHost,expectedSha256,freezeStartedAt:proof.freezeStartedAt,
  captureCompletedAt:proof.captureCompletedAt,writerCount:proof.writers.length,
  businessDescriptorSha256:proof.businessDescriptorSha256,controlDescriptorSha256:proof.controlDescriptorSha256,
  applicationWriterCheckpointVerified:true,globalCredentialReissueRequired:true,fullServiceRecoveryVerified:false};
}
