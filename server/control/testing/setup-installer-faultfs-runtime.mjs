// Prepared native fixture. Not used by product HTTP/CLI code.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,chown,readFile,lstat,statfs} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function createInstallerFaultFilesystem({expectedCSourceSha256,expectedBinarySha256}){
 assert.equal(process.getuid(),0);assert.match(expectedCSourceSha256,/^[a-f0-9]{64}$/);assert.match(expectedBinarySha256,/^[a-f0-9]{64}$/);
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(await readFile('/usr/local/share/roomqc-faultfs.c')),expectedCSourceSha256);
 assert.equal(hash(await readFile('/usr/local/bin/roomqc-faultfs')),expectedBinarySha256);
 for(const path of ['/backing','/fault-control']){
  const s=await lstat(path);assert.equal(s.isDirectory(),true);assert.equal(s.isSymbolicLink(),false);
  assert.equal(s.uid,0);assert.equal(s.mode&0o077,0);
 }
 const fs=await statfs('/backing');assert.equal(fs.type,0x01021994);assert.ok(fs.blocks*fs.bsize<=256*1024);
 await mkdir('/backing/data',{mode:0o700});await chown('/backing/data',10001,10001);
 await mkdir('/backing/shadows',{mode:0o700});
 let server,exit,events='';
 const until=async(f,label,timeout=5000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await f())return;await new Promise(r=>setTimeout(r,20))}throw Error('INSTALLER_FAULTFS_TIMEOUT_'+label)};
 const mounts=async()=> (await readFile('/proc/self/mountinfo','utf8')).split('\n').filter(l=>{
  const [left,right]=l.split(' - ');return left?.split(' ')[4]==='/faults'&&right?.startsWith('fuse.roomqc-owned ');
 });
 const start=async(readOnly=false)=>{
  assert.equal((await mounts()).length,0);exit=undefined;
  server=spawn('/usr/local/bin/roomqc-faultfs',['/faults','-f','-s','-o',
   'default_permissions,allow_other,fsname=roomqc-owned-faultfs,subtype=roomqc-owned,attr_timeout=0,entry_timeout=0,negative_timeout=0'+(readOnly?',ro':'')],
   {env:{PATH:process.env.PATH},stdio:['ignore','ignore','pipe']});
  server.stderr.on('data',b=>{events+=b;if(events.length>65536)server.kill('SIGKILL')});
  server.once('close',(code,signal)=>exit={code,signal});
  await until(async()=>{if(exit)throw Error('INSTALLER_FAULTFS_SERVER_ENDED');return (await mounts()).length===1},'mount');
  const row=(await mounts())[0].split(' - ')[0].split(' ');
  assert.equal(row[5].split(',').includes('ro'),readOnly);
  const s=await lstat('/faults');assert.equal(s.uid,10001);assert.equal(s.gid,10001);assert.equal(s.mode&0o777,0o700);
 };
 const stop=async()=>{
  if(!server)return;
  if(!exit){assert.equal(server.kill('SIGTERM'),true);await until(()=>exit,'stop')}
  await until(async()=>(await mounts()).length===0,'unmount');server=undefined;
 };
 const observations=()=>{const rows=[];for(const line of events.split('\n'))try{
  const v=JSON.parse(line);if(v.event==='owned_fuse_fault')rows.push(v);
 }catch{}return rows};
 return {start,stop,observations,backingCapacityBytes:fs.blocks*fs.bsize,
  runtimePackages:await readFile('/usr/local/share/roomqc-faultfs-runtime-packages.txt','utf8'),
  buildPackages:await readFile('/usr/local/share/roomqc-faultfs-build-packages.txt','utf8')};
}
