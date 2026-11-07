import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {createPrivateBackupDirectory,createRoomqcBackupKey,sealRoomqcBackup,openRoomqcBackup} from './roomqc-backup-envelope.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('control/storage profile authenticates its complete fixed file set and refuses cross-profile or missing content',async()=>{
 const root=await mkdtemp(join(tmpdir(),'roomqc-control-envelope-'));
 try{
  const input=await createPrivateBackupDirectory(join(root,'source')),keys=await createPrivateBackupDirectory(join(root,'keys')),
   archives=await createPrivateBackupDirectory(join(root,'archives'));
  const files=Object.fromEntries(['database.dump','roles.sql','expected.json','storage.tar','storage-files.json','service-config.tar','service-files.json']
   .map(name=>[name,Buffer.from('synthetic private '+name)]));
  const checksums=Object.fromEntries(Object.entries(files).map(([name,b])=>[name,sha(b)]));
  const descriptor={packetKind:'roomqc-control-storage-backup',sourceImage:'sha256:'+'b'.repeat(64),snapshotAt:'2026-11-01T00:00:00Z',checksums};
  files['checksums.json']=Buffer.from(JSON.stringify(checksums));files['result.json']=Buffer.from(JSON.stringify(descriptor,null,2)+'\n');
  for(const [name,b]of Object.entries(files))await writeFile(join(input,name),b,{mode:0o600});
  const key=await createRoomqcBackupKey(keys),packet=join(archives,'packet.rqbk');
  const sealed=await sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:packet});
  assert.equal(sealed.files,9);assert.equal(sealed.kind,'roomqc-encrypted-control-storage-backup');
  const output=join(archives,'opened');
  const opened=await openRoomqcBackup({encryptedFile:packet,keyFile:key.keyFile,outputDirectory:output,expectedSha256:sealed.encryptedSha256});
  assert.equal(opened.authenticated,true);assert.equal(opened.files,9);
  for(const [name,b]of Object.entries(files))assert.deepEqual(await readFile(join(output,name)),b);
  await writeFile(join(input,'result.json'),JSON.stringify({...descriptor,packetKind:'__proto__'}),{mode:0o600});
  await assert.rejects(sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:join(archives,'bad-kind')}),/BACKUP_FORMAT_UNSUPPORTED/);
  await writeFile(join(input,'result.json'),JSON.stringify(descriptor),{mode:0o600});
  await writeFile(join(input,'storage.tar'),'different storage bytes',{mode:0o600});
  const corrupt=join(archives,'bad-storage');
  await assert.rejects(sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:corrupt}),/BACKUP_CHECKSUM_MISMATCH/);
  await assert.rejects(access(corrupt));
  await rm(join(input,'service-config.tar'));
  await assert.rejects(sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:join(archives,'missing-config')}));
 }finally{
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.match(basename(root),/^roomqc-control-envelope-[A-Za-z0-9]+$/);
  await rm(root,{recursive:true,force:true});
 }
});
