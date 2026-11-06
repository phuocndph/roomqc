// Prepared IF15: actual CLI/database/REST and mounted fault filesystem.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat,rename,unlink,chmod,chown,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createInstallerFaultFilesystem} from './setup-installer-faultfs-runtime.mjs';
import {installerVolumeObserverPreload} from './setup-installer-volume-preload.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runInstallerVolumeFaults(c){
 const {input,db,maintenance,directory,config,json,text,child,until,businessState,names,check,root,cliUid,cliGid}=c;
 assert.equal(cliUid,10001);assert.equal(cliGid,10001);
 const fs=await createInstallerFaultFilesystem(input.faultFilesystem),output='/faults/credential.json';
 const receiptKey=(await db.query("SELECT c.key FROM private.setup_recovery_commands c JOIN private.setup_recovery_management m ON m.singleton AND c.result->>'credentialId'=m.head_credential_id::text WHERE c.request->>'operation'='issue'")).rows[0].key;
 const receipt=(await db.query('SELECT result FROM private.setup_recovery_commands WHERE key=$1',[receiptKey])).rows[0].result;
 const raw={...config,publisher:{...config.publisher,outputFile:output}},configFile=await json('volume-config.json',raw);
 const commandFile=await json('volume-publish.json',{version:1,operation:'publish',key:receiptKey});
 const intent='/backing/data/.credential.json.'+receiptKey+'.intent',stage='/backing/data/.credential.json.'+receiptKey+'.stage',backOutput='/backing/data/credential.json';
 const observer=await text('volume-observer-preload.mjs',installerVolumeObserverPreload());
 const beforeRenameObserver=await text('volume-rename-preload.mjs',installerVolumeObserverPreload({stopBeforeRename:true}));
 const canary=join(root,'volume-outside-canary');await writeFile(canary,'owned-outside-volume',{flag:'wx',mode:0o600});await chown(canary,cliUid,cliGid);
 const snap=async path=>{const s=await lstat(path);assert.equal(s.isSymbolicLink(),false);return {dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode&0o777,nlink:s.nlink,sha256:sha(await readFile(path))}};
 const canaryBefore=await snap(canary),observations=[],cleanups=[],active=new Set();
 const absent=path=>assert.rejects(()=>lstat(path),{code:'ENOENT'});
 const parse=source=>{const rows=[];for(const line of source.split('\n'))try{rows.push(JSON.parse(line))}catch{}return rows};
 const run=async({preload=observer,onSpawn}={})=>{
  const h=child(configFile,commandFile,{preload});active.add(h);
  try{
   if(onSpawn)await onSpawn(h);
   await until(()=>h.exit,'volume-cli-terminal',60000);assert.equal(h.identityError,undefined);
   const rows=parse(h.output),values=rows.filter(v=>typeof v.ok==='boolean');assert.equal(values.length,1);
   return {exit:h.exit,value:values[0],events:rows.filter(v=>v.event==='installer_volume_syscall')};
  }finally{if(h.exit)active.delete(h)}
 };
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,'volume-sessions-'+label,15000);
  for(const [pool,id]of [[maintenance,727012],[directory,727001]]){
   const client=await pool.connect();try{
    assert.equal((await client.query('SELECT pg_try_advisory_lock($1) AS locked',[id])).rows[0].locked,true);
    assert.equal((await client.query('SELECT pg_advisory_unlock($1) AS unlocked',[id])).rows[0].unlocked,true);
   }finally{client.release()}
  }
  cleanups.push({label,sessionsEnded:true,businessMutexFree:true,directoryExclusiveFree:true});
 };
 const claims=async path=>{
  const value=JSON.parse(await readFile(path,'utf8')),p=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
  assert.equal(p.jti,receipt.credentialId);assert.equal(p.iat,receipt.iat);assert.equal(p.exp,receipt.exp);
 };
 const effects=async()=>{
  const row=(await db.query('SELECT '+
   '(SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,'+
   '(SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,'+
   '(SELECT count(*)::int FROM private.setup_recovery_credentials WHERE id=$2) AS credentials',[receiptKey,receipt.credentialId])).rows[0];
  assert.deepEqual(row,{commands:1,audits:1,credentials:1});
 };
 const positive=async()=>{
  const r=await run(),safeCode=/^(?:SETUP_INSTALLER|SETUP_PUBLICATION)_[A-Z_]{1,64}$/.test(r.value.code??'')?r.value.code:'UNKNOWN';
  assert.deepEqual(r.exit,{code:0,signal:null},'INSTALLER_VOLUME_POSITIVE_'+safeCode);assert.equal(r.value.nativeRpcVerified,true);
  assert.equal(r.value.credentialId,receipt.credentialId);assert.equal(r.value.expiresAt,receipt.exp*1000);await claims(output);
  const s=await snap(backOutput);assert.equal(s.uid,10001);assert.equal(s.gid,10001);assert.equal(s.mode,0o600);assert.equal(s.nlink,1);return s;
 };
 const move=async(paths,label)=>{
  const rows=[];for(const [index,path]of paths.entries()){
   const shadow='/backing/shadows/'+label+'-'+index;await rename(path,shadow);rows.push({shadow,before:await snap(shadow)});
  }
  return {verify:async()=>{for(const row of rows)assert.deepEqual(await snap(row.shadow),row.before)},
   remove:async()=>{for(const row of rows){assert.deepEqual(await snap(row.shadow),row.before);await unlink(row.shadow)}}};
 };
 const fill=async()=>{
  const file=await open('/backing/filler','wx',0o600);let code,bytes=0;
  try{for(let i=0;i<32;i++){await file.writeFile(Buffer.alloc(16384));bytes+=16384}}catch(e){code=e.code}finally{await file.close()}
  assert.equal(code,'ENOSPC');assert.ok(bytes>0&&bytes<=fs.backingCapacityBytes);
  return {bytes,undo:()=>unlink('/backing/filler')};
 };
 const round=async(label,mutate)=>{
  const beforeFile=await positive(),beforeDb=await businessState();await cleanup(label+'-positive');
  let fault,negativeOutput;
  try{
   fault=await mutate();const r=await run(fault.run??{});assert.deepEqual(r.exit,{code:1,signal:null});
   assert.equal(r.value.ok,false);assert.match(r.value.code,/^(?:SETUP_INSTALLER|SETUP_PUBLICATION)_[A-Z_]+$/);
   assert.notEqual(r.value.filePublished,true);assert.notEqual(r.value.nativeRpcVerified,true);
   assert.ok(r.events.some(v=>v.actualKernelCall===true&&v.operation===fault.operation&&v.kind===fault.kind&&v.code===fault.code));
   if(fault.afterRename)assert.ok(r.events.some(v=>v.operation==='rename'&&v.completed===true&&v.code===null));
   assert.deepEqual(await businessState(),beforeDb);await effects();await fault.verify();
   if(fault.afterRename){await claims(backOutput);negativeOutput=await snap(backOutput)}
   assert.deepEqual(await snap(canary),canaryBefore);await cleanup(label+'-denied');
  }finally{await fault?.undo()}
  const afterFile=await positive();assert.equal(afterFile.sha256,beforeFile.sha256);
  if(negativeOutput)assert.deepEqual(afterFile,negativeOutput);
  assert.deepEqual(await businessState(),beforeDb);await effects();await fault.after?.();assert.deepEqual(await snap(canary),canaryBefore);
  await cleanup(label+'-recovered');
  observations.push({label,actualCli:true,uid:cliUid,gid:cliGid,positiveBeforeFault:true,
   nativeError:fault.code,operation:fault.operation,kind:fault.kind,filesystemInjection:fault.injected===true,
   denied:true,noFalseReady:true,zeroDatabaseEffects:true,sameKeyReceipt:true,sameCredentialIatExp:true,
   nativeRpcRecovery:true,outsideCanaryUnchanged:true,...(fault.afterRename?{completeOutputStillNotReady:true,recoveryPreservesOutputInode:true}:{})});
  check('volume-'+label+'-native-error-no-false-ready-and-same-key-native-recovery');
 };
 try{
  await fs.start();
  for(const type of ['intent','stage'])await round('enospc-'+type,async()=>{
   const shadows=await move(type==='intent'?[intent,backOutput]:[backOutput],'full-'+type),filler=await fill();
   return {operation:'write',kind:type,code:'ENOSPC',verify:async()=>{await shadows.verify();await absent(backOutput)},undo:filler.undo,after:shadows.remove};
  });
  await round('eacces-intent-open',async()=>{
   await chmod(intent,0o400);const before=await snap(intent);
   return {operation:'open',kind:'intent',code:'EACCES',verify:async()=>assert.deepEqual(await snap(intent),before),undo:()=>chmod(intent,0o600)};
  });
  await round('eacces-stage-create',async()=>{
   const shadow=await move([backOutput],'stage-create');await chmod('/backing/data',0o500);
   return {operation:'open',kind:'stage',code:'EACCES',verify:async()=>{await shadow.verify();await absent(stage);await absent(backOutput)},undo:()=>chmod('/backing/data',0o700),after:shadow.remove};
  });
  await round('eacces-rename',async()=>{
   const shadow=await move([backOutput],'permission-rename');
   return {operation:'rename',kind:'stage',code:'EACCES',
    run:{preload:beforeRenameObserver,onSpawn:async h=>{
     let barrier;await until(()=>{barrier=parse(h.output).find(v=>v.event==='installer_volume_barrier');if(h.exit&&!barrier)throw Error('VOLUME_CLI_NO_RENAME_BARRIER');return barrier},'volume-rename-barrier',30000);
     assert.equal(barrier.uid,10001);assert.equal(barrier.gid,10001);assert.equal(barrier.actualKernelCalls,true);
     await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'volume-rename-stopped',5000);
     await chmod('/backing/data',0o500);assert.equal(h.process.kill('SIGCONT'),true);
    }},
    verify:async()=>{await shadow.verify();await claims(stage);await absent(backOutput)},undo:()=>chmod('/backing/data',0o700),after:shadow.remove};
  });
  for(const [label,flag,kind,operation,shadowOutput,afterRename]of [
   ['eio-intent-fsync','fault-intent-sync','intent','fsync',false,false],
   ['eio-stage-fsync','fault-stage-sync','stage','fsync',true,false],
   ['eio-directory-before-output','fault-directory-before-output','directory','fsync',true,false],
   ['eio-directory-after-rename','fault-directory-after-output','directory','fsync',true,true],
   ['eio-rename','fault-rename','stage','rename',true,false]
  ])await round(label,async()=>{
   const shadow=shadowOutput?await move([backOutput],label):null,path='/fault-control/'+flag;
   await writeFile(path,'',{flag:'wx',mode:0o600});
   return {operation,kind,code:'EIO',injected:true,afterRename,
    verify:async()=>{await shadow?.verify();if(afterRename){await claims(backOutput);await absent(stage)}else if(shadowOutput)await absent(backOutput)},
    undo:()=>unlink(path),after:()=>shadow?.remove()};
  });
  await round('erofs-intent-open',async()=>{
   const before=await snap(backOutput);await fs.stop();await fs.start(true);
   return {operation:'open',kind:'intent',code:'EROFS',verify:async()=>assert.deepEqual(await snap(backOutput),before),undo:async()=>{await fs.stop();await fs.start()}};
  });
 }finally{
  for(const h of active){if(!h.exit)h.process.kill('SIGKILL');await h.done}
  await fs.stop();
 }
 assert.equal(observations.length,11);assert.equal(cleanups.length,33);await effects();
 const filesystemEvents=fs.observations();
 for(const [op,kind,error,injected]of [['fsync','intent',5,true],['fsync','stage',5,true],['fsync','directory',5,true],['rename','stage',5,true],['write','intent',28,false],['write','stage',28,false]])
  assert.ok(filesystemEvents.some(v=>v.operation===op&&v.kind===kind&&v.errno===error&&v.filesystemInjection===injected));
 return {verified:true,groups:['IF15'],cases:['FS07','FS08'],observations,cleanups,filesystemEvents,
  actualCliProcesses:true,actualPostgres:true,actualRest:true,actualKernelCalls:true,noNodeSyscallResultSubstitution:true,
  mountedFaultFilesystem:true,fuseEioInjection:true,hardwareDiskDurabilityVerified:false,positivePerFault:true,
  credentialIdPreserved:true,expiryPreserved:true,backingCapacityBytes:fs.backingCapacityBytes,
  fixturePreparationParentUid:0,productCliUid:10001,productCliGid:10001,filesystemUnmounted:true,
  runtimePackages:fs.runtimePackages,buildPackages:fs.buildPackages,runtimeMountReloadVerified:false};
}
