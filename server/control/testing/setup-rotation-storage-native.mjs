// Real daemon/journal/DB/REST on an exact-owned mounted filesystem.
// FUSE supplies EIO through kernel calls, not by replacing Node results.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,lstat,writeFile,chmod,chown,rename,unlink,link} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createInstallerFaultFilesystem} from './setup-installer-faultfs-runtime.mjs';
import {rotationStorageObserverPreload} from './setup-rotation-storage-preload.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runSetupRotationStorageNativeChecks(c){
 const {input,config,json,text,child,until,businessState,check,root,db,names,maintenance,directory}=c;
 const checks=[],observations=[],cleanups=[],active=new Set();
 const verify=name=>{checks.push(name);check('rotation-storage-'+name)};
 const fs=await createInstallerFaultFilesystem(input.faultFilesystem);
 const journal='/faults/journal',instance='rotation-storage',spool=join(journal,instance);
 const pendingRoot=join(spool,'pending'),historyRoot=join(spool,'history','published');
 const backing=p=>{assert(p.startsWith('/faults/'));return '/backing/data/'+p.slice('/faults/'.length)};
 const output=config.publisher.outputFile;
 const issuer=await json('rotation-storage-issuer.json',{...config,consumerId:'setup-credential-rotation',replicas:2});
 const policy={version:1,instanceId:instance,installerConfigFile:issuer,journalDirectory:journal,
  ttlSeconds:3600,overlapSeconds:10,rotateBeforeSeconds:3540,intervalMs:1000};
 const policyFile=await json('rotation-storage-policy.json',policy);
 const observer=await text('rotation-storage-observer-preload.mjs',rotationStorageObserverPreload());
 const events=h=>h.output.split('\n').slice(0,-1).flatMap(l=>{try{return [JSON.parse(l)]}catch{return []}});
 const launch=options=>{const h=child(policyFile,null,{rotation:true,preload:observer,...options});active.add(h);return h};
 const finish=async h=>{await until(()=>h.exit,'rotation-storage-terminal',60000);assert.equal(h.identityError,undefined);active.delete(h);return {exit:h.exit,events:events(h)}};
 const stop=async h=>{assert.equal(h.process.kill('SIGTERM'),true);const r=await finish(h);assert.deepEqual(r.exit,{code:0,signal:null});
  assert(r.events.some(e=>e.type==='setup_rotation_stopped'));return r};
 const snapshot=async p=>{const s=await lstat(p);assert.equal(s.isSymbolicLink(),false);return {
  sha256:sha(await readFile(p)),ino:s.ino,dev:s.dev,uid:s.uid,gid:s.gid,mode:s.mode&0o777,nlink:s.nlink,size:s.size}};
 const canary=join(root,'rotation-storage-outside-canary');
 await writeFile(canary,'owned rotation storage outside canary\n',{flag:'wx',mode:0o600});await chown(canary,10001,10001);
 const canaryBefore=await snapshot(canary);
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,'rotation-storage-sessions-'+label,15000);
  for(const [pool,id]of [[maintenance,727012],[directory,727001]]){const client=await pool.connect();try{
   assert.equal((await client.query('SELECT pg_try_advisory_lock($1) AS locked',[id])).rows[0].locked,true);
   assert.equal((await client.query('SELECT pg_advisory_unlock($1) AS unlocked',[id])).rows[0].unlocked,true);
  }finally{client.release()}}
  assert.deepEqual(await snapshot(canary),canaryBefore);
  cleanups.push({label,issuerObserverSessions:0,businessMutexFree:true,directoryMutexFree:true,outsideCanaryUnchanged:true});
 };
 const record=async p=>({key:p.split('/').at(-1),path:p,commandBytes:await readFile(join(p,'command.json'),'utf8'),contextBytes:await readFile(join(p,'context.json'),'utf8')});
 const pending=async()=>{const ids=await readdir(pendingRoot);assert.equal(ids.length,1);return record(join(pendingRoot,ids[0]))};
 const effect=async key=>(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.setup_recovery_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const committed=async key=>{const e=await effect(key);assert.equal(e.commands,1);assert.equal(e.audits,1);
  assert.equal(e.receipt.commandId,key);assert.equal((await db.query('SELECT 1 FROM private.setup_recovery_credentials WHERE id=$1',[e.receipt.credentialId])).rowCount,1);return e};
 const outputProof=async receipt=>{const s=await snapshot(output),v=JSON.parse(await readFile(output,'utf8'));
  const claims=JSON.parse(Buffer.from(v.token.split('.')[1],'base64url'));
  if(receipt){assert.equal(claims.jti,receipt.credentialId);assert.equal(claims.iat,receipt.iat);assert.equal(claims.exp,receipt.exp)}
  assert.equal(s.uid,10001);assert.equal(s.mode,0o600);assert.equal(s.nlink,1);
  const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
   headers:{apikey:v.publishableKey,authorization:'Bearer '+v.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
   body:JSON.stringify({p_workspace_id:randomUUID()})});await r.text();assert.equal(r.status,200);return s;
 };
 const cycle=async(options={})=>{const h=launch(options);await until(()=>events(h).some(e=>e.type==='setup_rotation_cycle')||h.exit,'rotation-storage-cycle');
  const row=events(h).find(e=>e.type==='setup_rotation_cycle');assert(row,'ROTATION_STORAGE_NO_CYCLE');const terminal=await stop(h);
  const state=terminal.events.find(e=>e.event==='rotation_storage_observation'&&e.type==='rotator_state');
  assert(state,'ROTATION_STORAGE_STATE_NOT_OBSERVED');return {row,state,events:terminal.events,exit:terminal.exit};
 };
 const waitDue=async label=>{let o;await until(async()=>{o=(await db.query(`SELECT clock_timestamp() AS observed_at,c.expires_at,
  extract(epoch FROM c.expires_at-clock_timestamp()) AS remaining_seconds,
  NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials p WHERE p.id<>c.id AND p.revoked_at IS NULL
   AND p.expires_at>clock_timestamp() AND (p.retire_after IS NULL OR p.retire_after>clock_timestamp())) AS overlap_ended
  FROM private.setup_recovery_management m JOIN private.setup_recovery_credentials c ON c.id=m.head_credential_id WHERE m.singleton`)).rows[0];
  return o&&o.overlap_ended&&Number(o.remaining_seconds)<=3539&&Number(o.remaining_seconds)>1200;
 },'rotation-storage-real-db-due-'+label,85000);
  observations.push({phase:'due-'+label,dbObservedAt:o.observed_at.toISOString(),expiresAt:o.expires_at.toISOString(),remainingSeconds:Number(o.remaining_seconds),overlapEnded:true});
 };
 const recover=async({original=null,archived=false,before,expectedReceipt=null,label})=>{
  const r=await cycle();assert.equal(r.row.action,archived?'idle':'rotated');assert.equal(r.state.ready,true);
  if(original)assert.equal(archived?original.key:r.row.commandId,original.key);
  const key=original?.key??r.row.commandId,e=await committed(key),after=await businessState();
  if(expectedReceipt){assert.deepEqual(e,expectedReceipt);assert.deepEqual(after,before)}
  else{assert.equal(after.credentials.length,before.credentials.length+1);assert.equal(after.commands.length,before.commands.length+1);assert.equal(after.audit.length,before.audit.length+1)}
  assert.deepEqual(await readdir(pendingRoot),[]);const history=await record(join(historyRoot,key));
  if(original){assert.equal(history.commandBytes,original.commandBytes);assert.equal(history.contextBytes,original.contextBytes)}
  const out=await outputProof(e.receipt),idle=await cycle();assert.equal(idle.row.action,'idle');assert.equal(idle.state.ready,true);
  assert.deepEqual(await businessState(),after);assert.deepEqual(await committed(key),e);assert.deepEqual(await snapshot(output),out);
  await cleanup(label+'-recovery');return {history,e,output:out};
 };
 let barrierNumber=0;
 const stoppedPending=async({prepare=false}={})=>{
  const label=String(++barrierNumber),marker=join(root,'storage-pending-'+label+'.json'),release=join(root,'storage-release-'+label);
  let preload=rotationStorageObserverPreload({pendingMarker:marker,pendingRelease:release});
  if(prepare)preload=rotationStorageObserverPreload()+`\nconst prepare=SetupRotationJournal.prototype.prepare;let held=false;
SetupRotationJournal.prototype.prepare=async function(...args){const observe=this.onPhase;this.onPhase=async phase=>{await observe(phase);
 if(phase==='pending_synced'&&!held){held=true;await fs.promises.writeFile(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,uid:process.getuid(),gid:process.getgid(),pendingSynced:true}),{flag:'wx',mode:0o600});
 while(true){try{await fs.promises.access(${JSON.stringify(release)});break}catch{await delay(20)}}}};
 try{return await prepare.apply(this,args)}finally{this.onPhase=observe}};`;
  const pre=await text('rotation-storage-pending-'+label+'-preload.mjs',preload),h=launch({preload:pre});let witness;
  await until(async()=>{try{witness=JSON.parse(await readFile(marker,'utf8'));return witness.pid===h.process.pid}catch{if(h.exit)throw Error('STORAGE_PENDING_BARRIER_NOT_REACHED');return false}},'storage-pending-barrier');
  assert.equal(witness.uid,10001);assert.equal(witness.gid,10001);const p=await pending();
  assert.equal(h.process.kill('SIGTERM'),true);await until(()=>events(h).some(e=>e.type==='setup_rotation_stopping'),'storage-stop-observed');
  await writeFile(release,'release\n',{flag:'wx',mode:0o644});await chmod(release,0o644);
  const r=await finish(h);assert.deepEqual(r.exit,{code:0,signal:null});assert(!r.events.some(e=>e.action==='rotated'));
  assert.deepEqual(await pending(),p);return p;
 };
 try{
  await fs.start();await mkdir(journal,{mode:0o700});await chown(journal,10001,10001);
  await outputProof();await cleanup('seed');verify('seed-native-rpc-real-credential');
  const beforeCorruption=await businessState(),p=await stoppedPending({prepare:true});
  assert.equal((await effect(p.key)).commands,0);assert.deepEqual(await businessState(),beforeCorruption);
  await cleanup('durable-pending');verify('durable-pending-sigterm-before-dispatch');
  const command=join(p.path,'command.json'),context=join(p.path,'context.json');
  const rewrite=async(path,bytes)=>{await writeFile(path,bytes);await chmod(path,0o600);await chown(path,10001,10001)};
  const changeJson=async(path,fn)=>{const old=await readFile(path,'utf8'),v=JSON.parse(old);fn(v);await rewrite(path,JSON.stringify(v)+'\n');return ()=>rewrite(path,old)};
  const variants=[
   ['JC01-missing-command',async()=>{const shadow='/backing/shadows/missing-command';await rename(backing(command),shadow);return ()=>rename(shadow,backing(command))}],
   ['JC02-missing-context',async()=>{const shadow='/backing/shadows/missing-context';await rename(backing(context),shadow);return ()=>rename(shadow,backing(context))}],
   ['JC03-partial-command',async()=>{await rewrite(command,'{"version":');return ()=>rewrite(command,p.commandBytes)}],
   ['JC04-partial-context',async()=>{await rewrite(context,'{"version":');return ()=>rewrite(context,p.contextBytes)}],
   ['JC05-command-hash-mismatch',()=>changeJson(command,v=>v.reason+=' changed')],
   ['JC06-configuration-binding-mismatch',()=>changeJson(context,v=>v.context.configurationSha256='0'.repeat(64))],
   ['JC07-context-command-hash-mismatch',()=>changeJson(context,v=>v.commandSha256='0'.repeat(64))],
   ['JC08-unexpected-entry',async()=>{const extra=join(p.path,'unexpected.json');await writeFile(extra,'{}\n',{flag:'wx',mode:0o600});await chown(extra,10001,10001);return ()=>unlink(extra)}],
   ['JC09-hardlink',async()=>{const target='/backing/shadows/command-hardlink';await link(backing(command),target);assert.equal((await lstat(command)).nlink,2);return ()=>unlink(target)}],
   ['JC10-unreadable-mode',async()=>{await chmod(command,0o000);assert.equal((await lstat(command)).mode&0o777,0);return ()=>chmod(command,0o600)}],
  ];
  for(const [label,mutate]of variants){
   assert.deepEqual(await stoppedPending(),p);const baseline=await businessState();let undo;
   const forensic=async()=>{const rows=[];for(const n of await readdir(p.path)){const file=join(p.path,n),s=await lstat(file);
    rows.push({name:n,mode:s.mode&0o777,uid:s.uid,nlink:s.nlink,sha256:sha(await readFile(backing(file)))});}return rows.sort((a,b)=>a.name.localeCompare(b.name))};
   try{undo=await mutate();const before=await forensic(),r=await cycle();assert.equal(r.row.action,'review');assert.equal(r.state.ready,false);
    assert.equal(r.row.code,'SETUP_ROTATION_JOURNAL_INVALID');assert.deepEqual(await forensic(),before);assert.deepEqual(await businessState(),baseline);
    assert.equal((await effect(p.key)).commands,0);await cleanup(label+'-denied');
    observations.push({label,actualDaemon:true,positiveBefore:true,denied:true,noFalseReady:true,noDispatch:true,zeroDatabaseEffects:true,forensicUnchanged:true});
   }finally{await undo?.()}
   assert.deepEqual(await stoppedPending(),p);assert.deepEqual(await businessState(),baseline);await cleanup(label+'-restored');verify(label+'-fail-closed-and-exact-pending-restored');
  }
  const corruptRecovery=await recover({original:p,before:beforeCorruption,label:'corruption'});
  verify('all-corruptions-recover-same-key-receipt-and-second-restart-idle');
  observations.push({label:'corruption-recovery',commandId:p.key,commandSha256:sha(p.commandBytes),contextSha256:sha(p.contextBytes),immutableReceipt:true,nativeRpc:true,secondRestartIdle:true});
  const ioCases=[
   ['JI01-command-write','fault-journal-command-write','write','journal_command','before_pending'],
   ['JI02-command-sync','fault-journal-command-sync','fsync','journal_command','before_pending'],
   ['JI03-context-sync','fault-journal-context-sync','fsync','journal_context','before_pending'],
   ['JI04-prepare-sync','fault-journal-prepare-sync','fsync','journal_prepare','before_pending'],
   ['JI05-pending-rename','fault-journal-pending-rename','rename','journal_prepare','before_pending'],
   ['JI06-pending-sync','fault-journal-pending-sync','fsync','journal_pending','pending'],
   ['JI07-archive-rename','fault-journal-archive-rename','rename','journal_pending','committed_pending'],
   ['JI08-archive-sync','fault-journal-archive-sync','fsync','journal_archive','archived'],
  ];
  for(const [label,flag,operation,kind,phase]of ioCases){
   await waitDue(label);await outputProof();await cleanup(label+'-positive');const before=await businessState(),oldHistory=await readdir(historyRoot);
   const fault='/fault-control/'+flag,startIndex=fs.observations().length;let original=null,receipt=null,negativeState,negativeOutput;
   await writeFile(fault,'',{flag:'wx',mode:0o600});
   try{const r=await cycle();assert.equal(r.row.action,'review');assert.equal(r.state.ready,false);assert(!r.events.some(e=>e.action==='rotated'));
    assert(r.events.some(e=>e.event==='rotation_storage_observation'&&e.type==='syscall'&&e.actualKernelCall&&e.operation===operation&&e.kind===kind&&e.code==='EIO'),'STORAGE_NO_KERNEL_ERROR_'+label);
    assert(fs.observations().slice(startIndex).some(e=>e.operation===operation&&e.kind===kind&&e.errno===5&&e.filesystemInjection),'STORAGE_NO_FUSE_ERROR_'+label);
    negativeState=await businessState();
    if(phase==='before_pending'){
     assert.deepEqual(await readdir(pendingRoot),[]);assert.deepEqual(negativeState,before);
    }else if(phase==='pending'){
     original=await pending();assert.deepEqual(negativeState,before);assert.equal((await effect(original.key)).commands,0);
    }else{
     if(phase==='archived'){const fresh=(await readdir(historyRoot)).filter(k=>!oldHistory.includes(k));assert.equal(fresh.length,1);original=await record(join(historyRoot,fresh[0]));assert.deepEqual(await readdir(pendingRoot),[])}
     else original=await pending();
     receipt=await committed(original.key);assert.equal(negativeState.credentials.length,before.credentials.length+1);negativeOutput=await outputProof(receipt.receipt);
    }
    await cleanup(label+'-denied');
   }finally{await unlink(fault)}
   const recovered=await recover({original,archived:phase==='archived',before:receipt?negativeState:before,expectedReceipt:receipt,label});
   if(negativeOutput)assert.deepEqual(recovered.output,negativeOutput);
   verify(label+'-native-eio-fail-closed-and-receipt-safe-recovery');
   observations.push({label,phase,operation,kind,nativeError:'EIO',actualDaemon:true,actualKernelCall:true,fuseWitness:true,positiveBefore:true,
    noFalseReady:true,commandId:recovered.history.key,samePendingRequired:phase!=='before_pending',sameReceiptRecovery:true,nativeRpc:true,secondRestartIdle:true});
  }
  assert.equal(corruptRecovery.e.commands,1);await cleanup('final');verify('all-session-mutex-canary-checks-before-fixture-cleanup');
 }finally{
  for(const h of active){if(!h.exit)h.process.kill('SIGKILL');await h.done}
  await fs.stop();
 }
 return {verified:true,checks,observations,cleanups,filesystemEvents:fs.observations(),
  corruptionVariants:10,nativeIoVariants:8,actualDaemonProcesses:true,actualPostgres:true,actualRest:true,
  actualKernelCalls:true,noNodeSyscallResultSubstitution:true,mountedFaultFilesystem:true,fuseEioInjection:true,
  corruptionAndEightEioPointsVerified:true,filesystemUnmounted:true,immutableReceiptRecoveryVerified:true,
  backingCapacityBytes:fs.backingCapacityBytes,runtimePackages:fs.runtimePackages,buildPackages:fs.buildPackages,
  hardwareDiskDurabilityVerified:false,fullFaultMatrixVerified:false,fullContentionMatrixVerified:false,
  crossDatabaseActorRevocationVerified:false,productAccepted:false};
}
