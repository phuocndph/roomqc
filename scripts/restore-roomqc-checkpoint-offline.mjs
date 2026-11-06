import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCheckpointPair} from './roomqc-checkpoint-contract.mjs';
import {restoreRoomqcBackupOffline} from './restore-roomqc-backup-offline.mjs';
import {restoreControlStorageOffline} from './restore-roomqc-control-storage-offline.mjs';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {readSetupBackfillFile,assertSetupBackfillAccess} from '../server/control/setup-backfill-files.mjs';

export async function restoreCheckpointOffline({checkpointFile,expectedSha256,businessDirectory,controlDirectory,outputDirectory}){
 const business=resolve(businessDirectory),control=resolve(controlDirectory);
 for(const path of [business,control,resolve(outputDirectory)])await assertSetupBackfillAccess(path,{directory:true});
 const read=async path=>Buffer.from(await readSetupBackfillFile(path,65536));
 const pair=validateCheckpointPair({checkpointBytes:await read(resolve(checkpointFile)),expectedSha256,
  businessDescriptorBytes:await read(join(business,'result.json')),controlDescriptorBytes:await read(join(control,'result.json'))});
 const output=await createPrivateBackupDirectory(join(resolve(outputDirectory),'checkpoint-'+pair.checkpointId));
 const restoredBusiness=await restoreRoomqcBackupOffline({backupDirectory:business,descriptorSha256:pair.businessDescriptorSha256,outputDirectory:output});
 const restoredControl=await restoreControlStorageOffline({bundleDirectory:control,descriptorSha256:pair.controlDescriptorSha256,outputDirectory:output});
 for(const result of [restoredBusiness,restoredControl]){assert.equal(result.verified,true);assert.equal(result.cleaned,true);assert.equal(result.sourceHostContacted,false)}
 const result={version:1,kind:'roomqc-offline-application-checkpoint-restore',verifiedAt:new Date().toISOString(),...pair,
  sourceHostContacted:false,business:{verified:true,counts:restoredBusiness.counts,sourceSnapshotAt:restoredBusiness.sourceSnapshotAt,
   restoredSchemaFingerprint:restoredBusiness.restoredSchemaFingerprint,releaseReapprovalRequired:restoredBusiness.releaseReapprovalRequired},
  control:{verified:true,counts:restoredControl.counts,migrations:restoredControl.migrations,sourceSnapshotAt:restoredControl.sourceSnapshotAt,
   archiveVerification:restoredControl.archiveVerification},
  cleaned:true,productionAdmissionChanged:false,verified:true,
  limitations:['Application-writer stop checkpoint; independent privileged operator writes are outside this operational fence',
   'Database logins, JWT/session secrets and scoped credentials must be reissued before serving',
   'Full Auth/API/worker/web restart and target release approval are not verified here',
   'No unattended durable offsite retention or independent key escrow']};
 await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return {...result,privateOutput:output};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options=new Map();assert.equal(args.length,10);
  for(let i=0;i<args.length;i+=2){assert(['--checkpoint-file','--sha256','--business-dir','--control-dir','--output-dir'].includes(args[i])&&!options.has(args[i]));options.set(args[i],args[i+1])}
  console.log(JSON.stringify(await restoreCheckpointOffline({checkpointFile:options.get('--checkpoint-file'),expectedSha256:options.get('--sha256'),
   businessDirectory:options.get('--business-dir'),controlDirectory:options.get('--control-dir'),outputDirectory:options.get('--output-dir')})));
 }catch(error){console.error(/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'CHECKPOINT_OFFLINE_RESTORE_FAILED');process.exitCode=1}
}
