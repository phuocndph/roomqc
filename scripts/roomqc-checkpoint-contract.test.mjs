import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCheckpointPair} from './roomqc-checkpoint-contract.mjs';
const bytes=x=>Buffer.from(JSON.stringify(x)),sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const common={checkpointId:'12345678-1234-1234-1234-123456789012',sourceHost:'192.0.2.1',snapshotAt:'2026-11-01T00:00:02Z'};
 const business={...common,packetKind:'roomqc-logical-backup'},control={...common,packetKind:'roomqc-control-storage-backup'};
 const proof={version:1,kind:'roomqc-quiesced-application-checkpoint',checkpointId:common.checkpointId,sourceHost:common.sourceHost,
  freezeStartedAt:'2026-11-01T00:00:00Z',captureCompletedAt:'2026-11-01T00:00:03Z',applicationWritersStopped:true,
  databaseInventoriesStable:true,unexpectedDatabaseClients:false,restoreBeforeServingRequired:true,
  globalCredentialReissueRequired:true,fullServiceRecoveryVerified:false,
  writers:[{id:'a'.repeat(64),name:'roomqc-test-control-1',project:'roomqc-test'}]};
 return {business,control,proof};
}
function pair(f){
 const businessDescriptorBytes=bytes(f.business),controlDescriptorBytes=bytes(f.control);
 const checkpointBytes=bytes({...f.proof,businessDescriptorSha256:sha(businessDescriptorBytes),controlDescriptorSha256:sha(controlDescriptorBytes)});
 return {checkpointBytes,expectedSha256:sha(checkpointBytes),businessDescriptorBytes,controlDescriptorBytes};
}
test('a pinned checkpoint binds both payloads and retains the mandatory credential/recovery gates',()=>{
 const value=validateCheckpointPair(pair(fixture()));assert.equal(value.applicationWriterCheckpointVerified,true);
 assert.equal(value.globalCredentialReissueRequired,true);assert.equal(value.fullServiceRecoveryVerified,false);
});
test('substituted checkpoint or either descriptor cannot pass a pinned capture digest',()=>{
 const input=pair(fixture());
 for(const field of ['checkpointBytes','businessDescriptorBytes','controlDescriptorBytes']){
  const other={...input,[field]:Buffer.from(input[field].toString().replace('192.0.2.1','192.0.2.2'))};
  assert.throws(()=>validateCheckpointPair(other));
 }
});
test('a rewritten manifest cannot hide missing fences, duplicate writers or an out-of-window snapshot',()=>{
 const cases=[f=>f.proof.applicationWritersStopped=false,f=>f.proof.databaseInventoriesStable=false,
  f=>f.proof.unexpectedDatabaseClients=true,f=>f.proof.globalCredentialReissueRequired=false,
  f=>f.proof.fullServiceRecoveryVerified=true,f=>f.proof.writers=[],f=>f.proof.writers.push({...f.proof.writers[0]}),
  f=>f.proof.captureCompletedAt='2026-11-01T00:05:00Z',f=>f.business.snapshotAt='2026-10-31T23:59:59Z',
  f=>f.control.checkpointId='99999999-1234-1234-1234-123456789012',f=>f.control.sourceHost='192.0.2.2'];
 for(const mutate of cases){const f=fixture();mutate(f);assert.throws(()=>validateCheckpointPair(pair(f)));}
});
