// Verifies the scoped local checkpoint. This never signs a release gate.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const source=await captureBackendSourceBinding(root);
assert.equal(source.sha256,'ede96ea6b5bf568785209ffd5d87ddbb06674d87cbfd2322c5015f342e98bca7');
assert.equal(source.files.length,301);
const paths={control:'artifacts/roomqc-workspace-recheck-838f5f251a47-local-2026-10-29.json',
 room:'artifacts/roomqc-backend-repair-room-writers-e0eb3b4a96aa-local-2026-10-29.json',
 volume:'artifacts/roomqc-backend-repair-setup-installer-volume-10c735c387c0-local-2026-10-29.json',
 audit:'artifacts/roomqc-vps-signup-execution-plan-audit-r3-2026-10-29.json'};
const [control,room,volume,audit]=await Promise.all(Object.values(paths).map(read));
for(const packet of [control,room,volume]){
 assert.equal(packet.verified,true);assertBackendSourceBinding(source,packet.backendSource??packet.source.backend);
 assert.deepEqual(packet.cleanup,{containers:0,volumes:0,networks:0});
 assert.equal(packet.acceptance.productAccepted,false);assert.equal(packet.acceptance.gatesChanged,false);
}
assert.equal(control.execution.exitCode,0);assert.equal(control.execution.timedOut,false);
assert.equal(control.sourceUnchanged,true);
assert.deepEqual(control.counts,{tests:678,pass:676,fail:0,cancelled:0,skipped:2});
assert.equal(control.cases.length,16);assert.ok(control.cases.every(c=>c.passed));
for(const packet of [room,volume]){
 assert.equal(packet.execution.terminalExitCode,0);assert.equal(packet.execution.cleaned,true);
 assert.equal(packet.execution.timedOut,false);assert.equal(packet.source.unchanged,true);
 assert.equal(packet.source.verifiedAtEnd,true);assert.equal(packet.source.appliesToCurrentSource,true);
 assert.equal(packet.source.businessMigrations.count,584);assert.equal(packet.source.schemaBefore,packet.source.schemaAfter);
 assert.equal(packet.controls.verified,true);assert.ok(packet.controls.checks.every(c=>c.passed));
}
assert.equal(room.controls.checks.length,539);
assert.equal(room.noPolicyControls.tables,41);
const installer=volume.controls.installer,v=installer.volumeFaults;
assert.equal(installer.scope,'volume-only');assert.equal(volume.controls.checks.length,17);
assert.deepEqual(installer.faultGroupsVerified,['IF15']);assert.equal(installer.privateFilesRemoved,true);
assert.equal(installer.directoryRoleCleanup.verified,true);
for(const key of ['fullFaultMatrixVerified','nonrootPermissionMatrixVerified','rotationDaemonVerified','runtimeMountReloadVerified','productAccepted'])
 assert.equal(installer[key],false);
for(const key of ['verified','actualCliProcesses','actualPostgres','actualRest','actualKernelCalls','noNodeSyscallResultSubstitution',
 'mountedFaultFilesystem','fuseEioInjection','positivePerFault','credentialIdPreserved','expiryPreserved','filesystemUnmounted'])assert.equal(v[key],true);
assert.equal(v.hardwareDiskDurabilityVerified,false);assert.equal(v.runtimeMountReloadVerified,false);
assert.equal(v.backingCapacityBytes,262144);assert.equal(v.productCliUid,10001);assert.equal(v.productCliGid,10001);
assert.deepEqual(v.groups,['IF15']);assert.deepEqual(v.cases,['FS07','FS08']);
const expected=[['enospc-intent','write','intent','ENOSPC'],['enospc-stage','write','stage','ENOSPC'],
 ['eacces-intent-open','open','intent','EACCES'],['eacces-stage-create','open','stage','EACCES'],['eacces-rename','rename','stage','EACCES'],
 ['eio-intent-fsync','fsync','intent','EIO'],['eio-stage-fsync','fsync','stage','EIO'],
 ['eio-directory-before-output','fsync','directory','EIO'],['eio-directory-after-rename','fsync','directory','EIO'],
 ['eio-rename','rename','stage','EIO'],['erofs-intent-open','open','intent','EROFS']];
assert.deepEqual(v.observations.map(c=>[c.label,c.operation,c.kind,c.nativeError]),expected);
for(const c of v.observations){
 for(const key of ['actualCli','positiveBeforeFault','denied','noFalseReady','zeroDatabaseEffects','sameKeyReceipt',
  'sameCredentialIatExp','nativeRpcRecovery','outsideCanaryUnchanged'])assert.equal(c[key],true);
 assert.equal(c.uid,10001);assert.equal(c.gid,10001);assert.equal(c.filesystemInjection,c.nativeError==='EIO');
}
const renamed=v.observations.find(c=>c.label==='eio-directory-after-rename');
assert.equal(renamed.completeOutputStillNotReady,true);assert.equal(renamed.recoveryPreservesOutputInode,true);
assert.equal(v.cleanups.length,33);
for(const c of v.cleanups)for(const key of ['sessionsEnded','businessMutexFree','directoryExclusiveFree'])assert.equal(c[key],true);
assert.equal(installer.cliIdentity.verified,true);assert.equal(installer.cliIdentity.spawns,38);
assert.equal(installer.cliIdentity.witnesses.length,38);
for(const w of installer.cliIdentity.witnesses){
 assert.equal(w.uid,10001);assert.equal(w.gid,10001);assert.equal(w.capEff,'0');assert.equal(w.noNewPrivileges,true);
 assert.equal(w.readOnlySource,true);assert.equal(w.sourceSha256,source.sha256);assert.ok(!w.groups.includes(0));
}
for(const packet of [room,volume])for(const [kind,args]of Object.entries({containers:['ps','-aq'],volumes:['volume','ls','-q'],networks:['network','ls','-q']})){
 const remaining=execFileSync('docker',[...args,'--filter','label=roomqc.control-backend-test='+packet.run],{encoding:'utf8',windowsHide:true}).trim();
 assert.equal(remaining,'','OWNED_'+kind.toUpperCase()+'_REMAIN');
}
assert.equal(audit.planStructureVerified,true);assert.equal(audit.documents.length,10);assert.equal(audit.linksChecked,643);
assert.equal(audit.currentCandidate.sha256,source.sha256);
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const file of [...audit.documents,audit.checklist,...audit.protectedArtifacts])assert.equal(sha(await readFile(resolve(root,file.path))),file.sha256);
assert.deepEqual(audit.counts,{waves:8,tasks:25,packages:27,cases:70,requiredCaseEnvironmentPairs:124,byEnvironment:{local:54,staging:69,pilot:1},handoffs:11});
assert.equal(audit.acceptance.productAccepted,false);assert.equal(audit.acceptance.goalComplete,false);assert.equal(audit.acceptance.gatesChanged,false);
assert.equal(audit.acceptance.reviewer,null);assert.equal(audit.acceptance.signoff,null);
assertBackendSourceBinding(source,await captureBackendSourceBinding(root));
console.log(JSON.stringify({verified:true,scope:'local-volume-only-and-plan-structure',sourceSha256:source.sha256,
 controlPassed:676,controlSkipped:2,roomWriterChecks:539,volumeCases:11,volumeCleanups:33,cliWitnesses:38,
 fullFilesystemVerified:false,fullIntegratedVerified:false,productAccepted:false,gatesChanged:false}));
