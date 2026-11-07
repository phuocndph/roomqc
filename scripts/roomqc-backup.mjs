// Keys are accepted only by private file path; never as command-line material.
import {resolve} from 'node:path';
import {lstat} from 'node:fs/promises';
import {assertSetupBackfillAccess} from '../server/control/setup-backfill-files.mjs';
import {createPrivateBackupDirectory,createRoomqcBackupKey,sealRoomqcBackup,openRoomqcBackup} from './roomqc-backup-envelope.mjs';
const usage=`RoomQC logical-backup encryption (bounded to 256 MiB plaintext):
  keygen --key-dir <new or private directory>
  seal --backup-dir <snapshot directory> --key-file <private key file> --output <new encrypted file>
  open --input <encrypted file> --key-file <private key file> --output-dir <new directory> --sha256 <expected packet digest>
Parents of outputs must be private. Key storage must be separate from the backup directory.
This tool does not configure an offsite provider, retention, scheduling or key escrow.`;
const [action,...args]=process.argv.slice(2);
try{
  if(!action||action==='--help'){console.log(usage)}else{
    const expected={keygen:['--key-dir'],seal:['--backup-dir','--key-file','--output'],open:['--input','--key-file','--output-dir','--sha256']}[action];
    if(!expected||args.length!==expected.length*2)throw new Error('BACKUP_ARGUMENTS_INVALID');
    const values=new Map();
    for(let i=0;i<args.length;i+=2){if(!expected.includes(args[i])||values.has(args[i]))throw new Error('BACKUP_ARGUMENTS_INVALID');values.set(args[i],args[i+1])}
    let result;
    if(action==='keygen'){
      const directory=resolve(values.get('--key-dir'));
      try{await lstat(directory);await assertSetupBackfillAccess(directory,{directory:true})}
      catch(error){if(error.code!=='ENOENT')throw error;await createPrivateBackupDirectory(directory)}
      result=await createRoomqcBackupKey(directory);
    }else if(action==='seal')result=await sealRoomqcBackup({sourceDirectory:values.get('--backup-dir'),keyFile:values.get('--key-file'),outputFile:values.get('--output')});
    else result=await openRoomqcBackup({encryptedFile:values.get('--input'),keyFile:values.get('--key-file'),outputDirectory:values.get('--output-dir'),expectedSha256:values.get('--sha256')});
    console.log(JSON.stringify(result));
  }
}catch(error){
  console.error(/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message??'')?error.message:'BACKUP_OPERATION_FAILED');process.exitCode=1;
}
