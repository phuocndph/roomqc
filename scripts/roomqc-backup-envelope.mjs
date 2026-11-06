// Authenticated encryption for the bounded logical-backup recovery packet.
// Keep the key separately. This does not configure an offsite provider or scheduler.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,mkdir,mkdtemp,open,readFile,rename,rm} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {promisify} from 'node:util';
import {assertSetupBackfillAccess,readSetupBackfillFile} from '../server/control/setup-backfill-files.mjs';

const execute=promisify(execFile),magic=Buffer.from('RQBK0001'),maxBytes=256*1024*1024;
const formats=Object.freeze({
  'roomqc-logical-backup':Object.freeze(['checksums.json','database.dump','expected.json','pgmq-queues.sql','result.json','roles.sql']),
  'roomqc-control-storage-backup':Object.freeze(['checksums.json','database.dump','expected.json','result.json','roles.sql',
    'service-config.tar','service-files.json','storage-files.json','storage.tar']),
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const invalid=code=>Object.assign(new Error(code),{code});
const inside=(parent,child)=>{const path=relative(resolve(parent),resolve(child));return !path||!path.startsWith('..')&&!isAbsolute(path)};

async function restrictNewDirectory(path){
  if(process.platform==='win32'){
    const identity=await execute('whoami',['/user','/fo','csv','/nh'],{windowsHide:true,timeout:8000});
    const sid=identity.stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid,'BACKUP_OWNER_UNRESOLVED');
    await execute('icacls',[path,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,timeout:8000});
  }
  await assertSetupBackfillAccess(path,{directory:true});return path;
}
export async function createPrivateBackupDirectory(path){
  path=resolve(path);await mkdir(path,{recursive:false,mode:0o700});return restrictNewDirectory(path);
}
async function writePrivate(path,bytes){
  await assertSetupBackfillAccess(dirname(path),{directory:true});
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  try{await assertSetupBackfillAccess(path);await file.writeFile(bytes);await file.sync()}finally{await file.close()}
}
async function readPrivate(path,max){
  await assertSetupBackfillAccess(dirname(path),{directory:true});await assertSetupBackfillAccess(path);
  const before=await lstat(path);assert.ok(before.size<=max,'BACKUP_FILE_LIMIT');
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    const info=await file.stat();assert.ok(info.dev===before.dev&&info.ino===before.ino&&info.nlink===1&&info.size<=max,'BACKUP_FILE_CHANGED');
    const bytes=await file.readFile();assert.ok(bytes.length<=max,'BACKUP_FILE_LIMIT');
    const after=await file.stat();assert.ok(after.nlink===1&&after.dev===info.dev&&after.ino===info.ino&&after.size===info.size,'BACKUP_FILE_CHANGED');
    await assertSetupBackfillAccess(path);return bytes;
  }finally{await file.close()}
}
async function readKey(path){
  const encoded=(await readSetupBackfillFile(resolve(path),128)).trim();
  assert.match(encoded,/^[A-Za-z0-9+/]{43}=$/,'BACKUP_KEY_INVALID');
  const key=Buffer.from(encoded,'base64');assert.equal(key.length,32,'BACKUP_KEY_INVALID');
  assert.equal(key.toString('base64'),encoded,'BACKUP_KEY_INVALID');return key;
}
export async function createRoomqcBackupKey(directory){
  directory=resolve(directory);await assertSetupBackfillAccess(directory,{directory:true});
  const path=join(directory,'backup-'+randomBytes(12).toString('hex')+'.key'),key=randomBytes(32);
  try{await writePrivate(path,Buffer.from(key.toString('base64')+'\n'));return {keyFile:path,keyId:sha(key).slice(0,24)}}finally{key.fill(0)}
}
export async function sealRoomqcBackup({sourceDirectory,keyFile,outputFile}){
  sourceDirectory=resolve(sourceDirectory);keyFile=resolve(keyFile);outputFile=resolve(outputFile);
  assert.ok(!inside(sourceDirectory,keyFile)&&!inside(dirname(outputFile),keyFile),'BACKUP_KEY_MUST_BE_SEPARATE');
  const key=await readKey(keyFile);
  try{
    const descriptorBytes=await readPrivate(join(sourceDirectory,'result.json'),65536),descriptor=JSON.parse(descriptorBytes);
    const kind=descriptor.packetKind??'roomqc-logical-backup';
    assert.ok(typeof kind==='string'&&Object.hasOwn(formats,kind),'BACKUP_FORMAT_UNSUPPORTED');
    const names=formats[kind];
    const files=[];let totalBytes=0;
    for(const name of names){
      const bytes=await readPrivate(join(sourceDirectory,name),maxBytes);totalBytes+=bytes.length;
      assert.ok(totalBytes<=maxBytes,'BACKUP_PACKET_LIMIT');files.push({name,bytes,sha256:sha(bytes)});
    }
    assert.equal(sha(files.find(file=>file.name==='result.json').bytes),sha(descriptorBytes),'BACKUP_DESCRIPTOR_CHANGED');
    const checksums=JSON.parse(files.find(file=>file.name==='checksums.json').bytes);
    assert.match(descriptor.sourceImage,/^sha256:[a-f0-9]{64}$/,'BACKUP_IMAGE_REQUIRED');
    assert.deepEqual(checksums,descriptor.checksums,'BACKUP_MANIFEST_MISMATCH');
    assert.deepEqual(Object.keys(checksums).sort(),names.filter(name=>!['checksums.json','result.json'].includes(name)));
    for(const [name,hash]of Object.entries(checksums))assert.equal(files.find(file=>file.name===name)?.sha256,hash,'BACKUP_CHECKSUM_MISMATCH');
    const nonce=randomBytes(12);
    const metadata={kind,formatVersion:1,cipher:'AES-256-GCM',
      nonce:nonce.toString('base64'),keyId:sha(key).slice(0,24),totalBytes,
      sourceImage:descriptor.sourceImage,snapshotAt:descriptor.snapshotAt,
      files:files.map(file=>({name:file.name,bytes:file.bytes.length,sha256:file.sha256}))};
    const header=Buffer.from(JSON.stringify(metadata)),length=Buffer.alloc(4);length.writeUInt32BE(header.length);
    const aad=Buffer.concat([magic,length,header]),cipher=createCipheriv('aes-256-gcm',key,nonce);
    cipher.setAAD(aad);
    const ciphertext=Buffer.concat([...files.map(file=>cipher.update(file.bytes)),cipher.final()]);
    const packet=Buffer.concat([aad,ciphertext,cipher.getAuthTag()]);
    await writePrivate(outputFile,packet);
    const readback=await readPrivate(outputFile,maxBytes+65536+28);assert.equal(sha(readback),sha(packet),'BACKUP_READBACK_MISMATCH');
    return {kind:kind==='roomqc-logical-backup'?'roomqc-encrypted-logical-backup':'roomqc-encrypted-control-storage-backup',formatVersion:1,cipher:metadata.cipher,keyId:metadata.keyId,
      files:files.length,plaintextBytes:totalBytes,encryptedBytes:packet.length,encryptedSha256:sha(packet),
      descriptorSha256:sha(files.find(file=>file.name==='result.json').bytes),
      sourceSnapshotAt:metadata.snapshotAt,sourceImage:metadata.sourceImage,readbackVerified:true};
  }finally{key.fill(0)}
}
export async function openRoomqcBackup({encryptedFile,keyFile,outputDirectory,expectedSha256}){
  assert.match(expectedSha256,/^[a-f0-9]{64}$/,'BACKUP_PACKET_DIGEST_REQUIRED');
  const packet=await readPrivate(resolve(encryptedFile),maxBytes+65536+28);
  assert.equal(sha(packet),expectedSha256,'BACKUP_PACKET_DIGEST_MISMATCH');
  assert.ok(packet.length>=28&&packet.subarray(0,8).equals(magic),'BACKUP_FORMAT_UNSUPPORTED');
  const length=packet.readUInt32BE(8);assert.ok(length>0&&length<=65536&&12+length+16<packet.length,'BACKUP_HEADER_INVALID');
  const header=JSON.parse(packet.subarray(12,12+length));
  assert.ok(typeof header.kind==='string'&&Object.hasOwn(formats,header.kind)&&header.formatVersion===1&&header.cipher==='AES-256-GCM','BACKUP_FORMAT_UNSUPPORTED');
  const names=formats[header.kind];
  assert.ok(Number.isSafeInteger(header.totalBytes)&&header.totalBytes>0&&header.totalBytes<=maxBytes,'BACKUP_PACKET_LIMIT');
  assert.equal(packet.length,12+length+header.totalBytes+16,'BACKUP_PACKET_LENGTH_MISMATCH');
  assert.deepEqual(header.files.map(file=>file.name),names,'BACKUP_FILE_SET_INVALID');
  assert.equal(header.files.reduce((n,file)=>n+file.bytes,0),header.totalBytes,'BACKUP_FILE_SIZE_INVALID');
  for(const file of header.files)assert.ok(Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=maxBytes&&/^[a-f0-9]{64}$/.test(file.sha256),'BACKUP_FILE_INVALID');
  assert.ok(typeof header.nonce==='string'&&/^[A-Za-z0-9+/]{16}$/.test(header.nonce),'BACKUP_NONCE_INVALID');
  const key=await readKey(keyFile);let plaintext;
  try{
    assert.equal(sha(key).slice(0,24),header.keyId,'BACKUP_WRONG_KEY');
    const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(header.nonce,'base64'));
    cipher.setAAD(packet.subarray(0,12+length));cipher.setAuthTag(packet.subarray(-16));
    try{plaintext=Buffer.concat([cipher.update(packet.subarray(12+length,-16)),cipher.final()])}
    catch{throw invalid('BACKUP_AUTHENTICATION_FAILED')}
    let offset=0;const files=[];
    for(const file of header.files){const bytes=plaintext.subarray(offset,offset+file.bytes);offset+=file.bytes;
      assert.equal(sha(bytes),file.sha256,'BACKUP_PLAINTEXT_MISMATCH');files.push({...file,content:bytes})}
    outputDirectory=resolve(outputDirectory);
    assert.ok(!inside(outputDirectory,resolve(keyFile)),'BACKUP_KEY_MUST_BE_SEPARATE');
    await assertSetupBackfillAccess(dirname(outputDirectory),{directory:true});
    try{await lstat(outputDirectory);throw invalid('BACKUP_OUTPUT_EXISTS')}catch(error){if(error.code!=='ENOENT')throw error}
    const temporary=await mkdtemp(join(dirname(outputDirectory),'.roomqc-decrypt-'));
    // Apply private access before publishing any plaintext, including on Windows.
    await restrictNewDirectory(temporary);
    try{
      for(const file of files)await writePrivate(join(temporary,file.name),file.content);
      await rename(temporary,outputDirectory);
    }catch(error){
      // The generated temporary directory is owned, checked and inside the private parent.
      assert.ok(inside(dirname(outputDirectory),temporary)&&temporary!==dirname(outputDirectory));
      await rm(temporary,{recursive:true,force:true});throw error;
    }
    return {kind:'roomqc-backup-decrypted',files:files.length,encryptedSha256:expectedSha256,
      descriptorSha256:header.files.find(file=>file.name==='result.json').sha256,authenticated:true,
      sourceImage:header.sourceImage,sourceSnapshotAt:header.snapshotAt};
  }finally{key.fill(0);plaintext?.fill(0)}
}
