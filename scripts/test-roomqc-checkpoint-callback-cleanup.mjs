// Opt-in native regression: a failure after both databases were verified must
// remove both owned sandboxes. Requires a pinned, already opened checkpoint.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {validateCheckpointPair} from './roomqc-checkpoint-contract.mjs';
import {restoreRoomqcBackupOffline} from './restore-roomqc-backup-offline.mjs';
import {restoreControlStorageOffline} from './restore-roomqc-control-storage-offline.mjs';

export async function testCheckpointCallbackCleanup({checkpointFile,expectedSha256,businessDirectory,controlDirectory,outputDirectory}){
 const pair=validateCheckpointPair({checkpointBytes:await readFile(resolve(checkpointFile)),expectedSha256,
  businessDescriptorBytes:await readFile(join(businessDirectory,'result.json')),
  controlDescriptorBytes:await readFile(join(controlDirectory,'result.json'))});
 const output=await createPrivateBackupDirectory(join(resolve(outputDirectory),'callback-cleanup-'+Date.now()));
 const owned=[];
 const inspect=database=>{
  assert.equal(database.verification.verified,true);
  const state=JSON.parse(execFileSync('docker',['inspect',database.name],{encoding:'utf8',windowsHide:true,timeout:10000}))[0];
  assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.NetworkSettings.Ports,{});
  owned.push({name:database.name,output:database.output});
 };
 await assert.rejects(restoreRoomqcBackupOffline({withVerifiedDatabase:'invalid'}),/OFFLINE_RESTORE_CALLBACK_INVALID/);
 await assert.rejects(restoreControlStorageOffline({withVerifiedDatabase:{}}),/CONTROL_RESTORE_CALLBACK_INVALID/);
 await assert.rejects(restoreRoomqcBackupOffline({backupDirectory:businessDirectory,descriptorSha256:pair.businessDescriptorSha256,outputDirectory:output,
  withVerifiedDatabase:async business=>{
   inspect(business);
   await assert.rejects(restoreControlStorageOffline({bundleDirectory:controlDirectory,descriptorSha256:pair.controlDescriptorSha256,outputDirectory:output,
    withVerifiedDatabase:async directory=>{inspect(directory);throw new Error('INJECTED_VERIFIED_CALLBACK_FAILURE')}}),{code:'CONTROL_RECOVERY_FAILED'});
   assert.equal(owned.length,2,'DIRECTORY_CALLBACK_WAS_NOT_REACHED');
   const failure=await readFile(join(owned[1].output,'failure.private.log'),'utf8');
   assert.match(failure,/INJECTED_VERIFIED_CALLBACK_FAILURE/);
   throw new Error('INJECTED_OUTER_CALLBACK_FAILURE');
  }}),{code:'OFFLINE_RESTORE_FAILED'});
 assert.equal(owned.length,2,'BOTH_VERIFIED_CALLBACKS_REQUIRED');
 assert.match(await readFile(join(owned[0].output,'private-error.log'),'utf8'),/INJECTED_OUTER_CALLBACK_FAILURE/);
 for(const database of owned){
  assert.equal(execFileSync('docker',['ps','-aq','--filter','name=^/'+database.name+'$'],{encoding:'utf8',windowsHide:true,timeout:10000}).trim(),'');
  await assert.rejects(readFile(join(database.output,'result.json')),{code:'ENOENT'});
 }
 const receipt={kind:'roomqc-checkpoint-callback-cleanup-regression',checkpointId:pair.checkpointId,
  verifiedAt:new Date().toISOString(),invalidCallbacksRejectedBeforeRestore:true,
  callbacksReachedOnlyAfterNativeVerification:2,injectedCallbackFailures:2,ownedDatabasesRemoved:2,
  failureNotPublishedAsSuccess:true,sourceHostContacted:false,productionAdmissionChanged:false,verified:true};
 await writeFile(join(output,'result.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),o=new Map();assert.equal(args.length,10);
  for(let i=0;i<args.length;i+=2){assert(['--checkpoint-file','--sha256','--business-dir','--control-dir','--output-dir'].includes(args[i])&&!o.has(args[i]));o.set(args[i],args[i+1])}
  console.log(JSON.stringify(await testCheckpointCallbackCleanup({checkpointFile:o.get('--checkpoint-file'),expectedSha256:o.get('--sha256'),
   businessDirectory:o.get('--business-dir'),controlDirectory:o.get('--control-dir'),outputDirectory:o.get('--output-dir')})));
 }catch{console.error('CHECKPOINT_CALLBACK_CLEANUP_TEST_FAILED');process.exitCode=1}
}
