import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,writeFile,link,lstat,unlink,rm,realpath,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {assertSetupBackfillAccess,readSetupBackfillFile} from './setup-backfill-files.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

async function fixture(run){
 const parent=await realpath(tmpdir()),dir=await mkdtemp(join(parent,'roomqc-private-hardlinks-'));
 try{
  if(process.platform==='win32'){
   const sid=execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-\d+(?:-\d+)+/)?.[0];assert.ok(sid);
   execFileSync('icacls',[dir,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
  }else await chmod(dir,0o700);
  const file=join(dir,'private-input'),alias=join(dir,'alias');await writeFile(file,'public-synthetic-secret',{flag:'wx',mode:0o600});
  await run({file,alias});
 }finally{
  const actual=await realpath(dir);assert.equal(dirname(actual),parent);assert.ok(basename(actual).startsWith('roomqc-private-hardlinks-'));
  assert.equal((await lstat(dir)).isSymbolicLink(),false);await rm(actual,{recursive:true,force:true});
 }
}

test('private operator input rejects both names of a hardlinked inode and recovers after unlink',async()=>fixture(async({file,alias})=>{
 assert.equal(await readSetupBackfillFile(file,100),'public-synthetic-secret');const before=await lstat(file);
 await link(file,alias);const linked=await lstat(alias);assert.equal(linked.ino,before.ino);assert.equal(linked.dev,before.dev);assert.equal(linked.nlink,2);
 for(const path of [file,alias]){
  await assert.rejects(()=>assertSetupBackfillAccess(path),{code:'SETUP_BACKFILL_FILE_ACCESS'});
  await assert.rejects(()=>readSetupBackfillFile(path,100),{code:'SETUP_BACKFILL_FILE_ACCESS'});
 }
 await unlink(alias);assert.equal((await lstat(file)).nlink,1);assert.equal(await readSetupBackfillFile(file,100),'public-synthetic-secret');
 assert.equal((await lstat(file)).ino,before.ino);
}));

test('sensitive health-file reader rejects hardlinks on the opened inode without restricting ordinary public reads',async()=>fixture(async({file,alias})=>{
 assert.equal(await boundedHealthFile(file,100,{sensitive:true}),'public-synthetic-secret');await link(file,alias);
 for(const path of [file,alias])await assert.rejects(()=>boundedHealthFile(path,100,{sensitive:true}),{code:'INVALID_HEALTH_CONFIG'});
 assert.equal(await boundedHealthFile(alias,100),'public-synthetic-secret');await unlink(alias);
 assert.equal(await boundedHealthFile(file,100,{sensitive:true}),'public-synthetic-secret');
}));

test('sensitive reader refuses to return bytes when a real hardlink appears during its real read',async()=>fixture(async({file,alias})=>{
 assert.equal(await boundedHealthFile(file,100,{sensitive:true}),'public-synthetic-secret');
 const original=fs.promises.open;let linked=false;
 fs.promises.open=async function(...args){
  const handle=await original.apply(this,args);
  if(args[0]===file){const read=handle.read;handle.read=async function(...values){
   const result=await read.apply(this,values);
   if(result.bytesRead>0&&!linked){await link(file,alias);linked=true;assert.equal((await handle.stat()).nlink,2)}return result;
  }}return handle;
 };
 syncBuiltinESMExports();
 try{await assert.rejects(()=>boundedHealthFile(file,100,{sensitive:true}),{code:'INVALID_HEALTH_CONFIG'});assert.equal(linked,true)}
 finally{fs.promises.open=original;syncBuiltinESMExports()}
 assert.equal((await lstat(file)).nlink,2);await unlink(alias);assert.equal(await boundedHealthFile(file,100,{sensitive:true}),'public-synthetic-secret');
}));

test('empty owned intent prefix is opt-in and retains private inode and size boundaries',async()=>fixture(async({file,alias})=>{
 await writeFile(file,'');
 await assert.rejects(()=>boundedHealthFile(file,100,{sensitive:true}),{code:'INVALID_HEALTH_CONFIG'});
 await assert.rejects(()=>readSetupBackfillFile(file,100),{code:'INVALID_HEALTH_CONFIG'});
 assert.equal(await boundedHealthFile(file,100,{sensitive:true,allowEmpty:true}),'');
 await link(file,alias);
 for(const path of [file,alias])await assert.rejects(()=>boundedHealthFile(path,100,{sensitive:true,allowEmpty:true}),{code:'INVALID_HEALTH_CONFIG'});
 await unlink(alias);
 assert.equal(await boundedHealthFile(file,100,{sensitive:true,allowEmpty:true}),'');
 await writeFile(file,'x'.repeat(101));
 await assert.rejects(()=>boundedHealthFile(file,100,{sensitive:true,allowEmpty:true}),{code:'INVALID_HEALTH_CONFIG'});
 await writeFile(file,'owned-prefix');
 assert.equal(await boundedHealthFile(file,100,{sensitive:true,allowEmpty:true}),'owned-prefix');
 assert.equal(await readSetupBackfillFile(file,100),'owned-prefix');
}));
