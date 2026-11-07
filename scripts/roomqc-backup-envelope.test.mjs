import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {createPrivateBackupDirectory,createRoomqcBackupKey,sealRoomqcBackup,openRoomqcBackup} from './roomqc-backup-envelope.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
test('authenticated backup refuses corrupt packets, wrong keys, unsupported versions and overwrites',async t=>{
  const root=await mkdtemp(join(tmpdir(),'roomqc-backup-envelope-'));
  try{
    const input=await createPrivateBackupDirectory(join(root,'source'));
    const keyDirectory=await createPrivateBackupDirectory(join(root,'keys'));
    const archives=await createPrivateBackupDirectory(join(root,'archives'));
    const recovery=await createPrivateBackupDirectory(join(root,'recovery'));
    const files={'database.dump':Buffer.from('synthetic isolated dump\0\xff'),'roles.sql':Buffer.from('CREATE ROLE supabase_admin;\n'),
      'pgmq-queues.sql':Buffer.from('TRUNCATE pgmq.meta;\n'),'expected.json':Buffer.from('[]')};
    const checksums=Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,sha(bytes)]));
    files['checksums.json']=Buffer.from(JSON.stringify(checksums));
    files['result.json']=Buffer.from(JSON.stringify({sourceImage:'sha256:'+'a'.repeat(64),snapshotAt:'2026-10-30T00:00:00Z',checksums}));
    for(const [name,bytes]of Object.entries(files))await writeFile(join(input,name),bytes,{mode:0o600});
    const key=await createRoomqcBackupKey(keyDirectory),packet=join(archives,'snapshot.rqbk');
    const sealed=await sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:packet});
    await t.test('round trip preserves every input byte',async()=>{
      const restored=join(recovery,'valid');
      const opened=await openRoomqcBackup({encryptedFile:packet,keyFile:key.keyFile,outputDirectory:restored,expectedSha256:sealed.encryptedSha256});
      assert.equal(opened.authenticated,true);assert.equal(opened.files,6);
      for(const [name,bytes]of Object.entries(files))assert.deepEqual(await readFile(join(restored,name)),bytes);
    });
    await t.test('wrong key cannot publish plaintext',async()=>{
      const other=await createRoomqcBackupKey(keyDirectory),output=join(recovery,'wrong-key');
      await assert.rejects(openRoomqcBackup({encryptedFile:packet,keyFile:other.keyFile,outputDirectory:output,expectedSha256:sealed.encryptedSha256}),/BACKUP_WRONG_KEY/);
      await assert.rejects(access(output));
    });
    await t.test('changed encrypted bytes fail the independent digest',async()=>{
      const content=await readFile(packet);content[content.length-18]^=1;
      const changed=join(archives,'corrupt.rqbk');await writeFile(changed,content,{mode:0o600});
      await assert.rejects(openRoomqcBackup({encryptedFile:changed,keyFile:key.keyFile,outputDirectory:join(recovery,'digest'),expectedSha256:sealed.encryptedSha256}),/BACKUP_PACKET_DIGEST_MISMATCH/);
    });
    await t.test('authentication rejects content even when transport digest is replaced',async()=>{
      const content=await readFile(packet);content[content.length-18]^=1;
      const changed=join(archives,'auth.rqbk');await writeFile(changed,content,{mode:0o600});
      const output=join(recovery,'auth');
      await assert.rejects(openRoomqcBackup({encryptedFile:changed,keyFile:key.keyFile,outputDirectory:output,expectedSha256:sha(content)}),/BACKUP_AUTHENTICATION_FAILED/);
      await assert.rejects(access(output));
    });
    await t.test('unsupported format never creates the output directory',async()=>{
      const content=await readFile(packet);content[7]=0x32;
      const changed=join(archives,'version.rqbk');await writeFile(changed,content,{mode:0o600});
      const output=join(recovery,'version');
      await assert.rejects(openRoomqcBackup({encryptedFile:changed,keyFile:key.keyFile,outputDirectory:output,expectedSha256:sha(content)}),/BACKUP_FORMAT_UNSUPPORTED/);
      await assert.rejects(access(output));
    });
    await t.test('existing plaintext output is preserved',async()=>{
      const output=join(recovery,'valid'),before=await readFile(join(output,'database.dump'));
      await assert.rejects(openRoomqcBackup({encryptedFile:packet,keyFile:key.keyFile,outputDirectory:output,expectedSha256:sealed.encryptedSha256}),/BACKUP_OUTPUT_EXISTS/);
      assert.deepEqual(await readFile(join(output,'database.dump')),before);
    });
    await t.test('existing encrypted output is preserved',async()=>{
      const before=await readFile(packet);
      await assert.rejects(sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:packet}),{code:'EEXIST'});
      assert.deepEqual(await readFile(packet),before);
    });
    await t.test('source data mismatch prevents publication',async()=>{
      await writeFile(join(input,'database.dump'),'changed',{mode:0o600});
      const output=join(archives,'invalid.rqbk');
      await assert.rejects(sealRoomqcBackup({sourceDirectory:input,keyFile:key.keyFile,outputFile:output}),/BACKUP_CHECKSUM_MISMATCH/);
      await assert.rejects(access(output));
    });
  }finally{
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.match(basename(root),/^roomqc-backup-envelope-[A-Za-z0-9]+$/);
    await rm(root,{recursive:true,force:true});
  }
});
