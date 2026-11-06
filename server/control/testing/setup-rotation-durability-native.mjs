// Actual product daemon, native PostgreSQL/REST and owned filesystem barriers.
// Preloads only observe real durable phases/syscalls; no synthetic RPC result.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,lstat,writeFile,chmod,chown} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {installerFilesystemBarrierPreload} from './setup-installer-fs-preload.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runSetupRotationDurabilityNativeChecks(c){
 const {config,json,text,child,until,businessState,check,root,db,names,seeded,maintenance,directory}=c;
 const checks=[],observations=[],cleanups=[];
 const verify=name=>{checks.push(name);check('rotation-durability-'+name)};
 const journal=join(root,'rotation-durability-journal');await mkdir(journal,{mode:0o700});
 const issuer=await json('rotation-durability-issuer.json',{...config,consumerId:'setup-credential-rotation',replicas:2});
 const policy={version:1,instanceId:'rotation-durability',installerConfigFile:issuer,journalDirectory:journal,
  ttlSeconds:180,overlapSeconds:10,rotateBeforeSeconds:120,intervalMs:1000};
 const policyFile=await json('rotation-durability-policy.json',policy);
 const spool=join(journal,policy.instanceId),pendingRoot=join(spool,'pending'),historyRoot=join(spool,'history','published');
 const output=config.publisher.outputFile;
 const canary=join(root,'rotation-durability-outside-output-canary');
 await writeFile(canary,'owned canary outside publication output\n',{flag:'wx',mode:0o600});await chown(canary,10001,10001);
 const snapshot=async path=>{const s=await lstat(path);assert.equal(s.isSymbolicLink(),false);
  return {sha256:sha(await readFile(path)),dev:s.dev,ino:s.ino,mode:s.mode&0o777,nlink:s.nlink,uid:s.uid,gid:s.gid,size:s.size}};
 const canaryBefore=await snapshot(canary);
 const events=h=>h.output.split('\n').slice(0,-1).flatMap(l=>{try{return [JSON.parse(l)]}catch{return []}});
 const launch=options=>child(policyFile,null,{rotation:true,...options});
 const finish=async h=>{await until(()=>h.exit,'rotation-durability-terminal',60000);assert.equal(h.identityError,undefined);return {exit:h.exit,rows:events(h)}};
 const stop=async h=>{assert.equal(h.process.kill('SIGTERM'),true);const r=await finish(h);
  assert.deepEqual(r.exit,{code:0,signal:null});assert.ok(r.rows.some(e=>e.type==='setup_rotation_stopped'));return r};
 const pending=async()=>{const ids=await readdir(pendingRoot);assert.equal(ids.length,1);
  const path=join(pendingRoot,ids[0]);return {key:ids[0],path,command:JSON.parse(await readFile(join(path,'command.json'),'utf8')),
   commandBytes:await readFile(join(path,'command.json'),'utf8'),contextBytes:await readFile(join(path,'context.json'),'utf8')};};
 const effect=async key=>(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.setup_recovery_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const committed=async key=>{const e=await effect(key);assert.equal(e.commands,1);assert.equal(e.audits,1);
  assert.equal(e.receipt.commandId,key);assert.equal((await db.query('SELECT 1 FROM private.setup_recovery_credentials WHERE id=$1',[e.receipt.credentialId])).rowCount,1);return e};
 const claims=async path=>{const v=JSON.parse(await readFile(path,'utf8'));return JSON.parse(Buffer.from(v.token.split('.')[1],'base64url'))};
 const verifyOutput=async receipt=>{const p=await claims(output);assert.equal(p.jti,receipt.credentialId);assert.equal(p.iat,receipt.iat);assert.equal(p.exp,receipt.exp);
  const s=await snapshot(output);assert.equal(s.mode,0o600);assert.equal(s.nlink,1);assert.equal(s.uid,10001);return s};
 const rpc=async()=>{const v=JSON.parse(await readFile(output,'utf8'));
  const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
   headers:{apikey:v.publishableKey,authorization:'Bearer '+v.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
   body:JSON.stringify({p_workspace_id:randomUUID()})});await r.text();assert.equal(r.status,200)};
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,
   'rotation-durability-sessions-'+label,15000);
  const b=await maintenance.connect(),d=await directory.connect();try{
   assert.equal((await b.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0].locked,true);
   assert.equal((await b.query('SELECT pg_advisory_unlock(727012) AS unlocked')).rows[0].unlocked,true);
   assert.equal((await d.query('SELECT pg_try_advisory_lock(727001) AS locked')).rows[0].locked,true);
   assert.equal((await d.query('SELECT pg_advisory_unlock(727001) AS unlocked')).rows[0].unlocked,true);
  }finally{b.release();d.release()}
  assert.deepEqual(await snapshot(canary),canaryBefore);
  cleanups.push({label,issuerObserverSessions:0,businessMutexFree:true,directoryMutexFree:true,outsideCanaryUnchanged:true});
 };
 const phasePreload=async(phase,{graceful=false}={})=>{
  const label=phase+(graceful?'-sigterm':'-sigkill');
  const marker=join(root,'durability-'+label+'-marker.json'),release=join(root,'durability-'+label+'-release');
  const method=['before_archive','archive_synced'].includes(phase)?'archive':'prepare';
  const preload=await text('durability-'+label+'-preload.mjs',`import {SetupRotationJournal} from '/repository/server/control/setup-rotation-journal.mjs';
import {writeFile,access} from 'node:fs/promises';import {setTimeout as delay} from 'node:timers/promises';
const original=SetupRotationJournal.prototype.${method};let held=false;
SetupRotationJournal.prototype.${method}=async function(...args){const observe=this.onPhase;
 this.onPhase=async name=>{await observe(name);if(name!==${JSON.stringify(phase)}||held)return;held=true;
  await writeFile(${JSON.stringify(marker)},JSON.stringify({event:'rotation_journal_durable_barrier',phase:name,pid:process.pid,uid:process.getuid(),gid:process.getgid()}),{flag:'wx',mode:0o600});
  ${graceful?`while(true){try{await access(${JSON.stringify(release)});break}catch{await delay(20)}}`:`process.kill(process.pid,'SIGSTOP');`}
 };try{return await original.apply(this,args)}finally{this.onPhase=observe}};`);
  return {preload,marker,release};
 };
 const awaitJournal=async(h,p,phase,{stopped=true}={})=>{
  let value;await until(async()=>{try{value=JSON.parse(await readFile(p.marker,'utf8'));return value.pid===h.process.pid}catch{if(h.exit)throw Error('ROTATION_DURABILITY_EXIT_BEFORE_JOURNAL_BARRIER');return false}},'durability-'+phase);
  assert.equal(value.phase,phase);assert.equal(value.uid,10001);assert.equal(value.gid,10001);
  if(stopped)await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'durability-proc-stopped-'+phase,5000);
  return value;
 };
 const kill=async(h,phase)=>{assert.equal(h.process.kill('SIGKILL'),true);const r=await finish(h);assert.deepEqual(r.exit,{code:null,signal:'SIGKILL'});
  assert.equal(r.rows.some(e=>e.action==='rotated'),false);await cleanup('killed-'+phase);return r};
 const waitDue=async label=>{
  let observed;await until(async()=>{observed=(await db.query(`SELECT clock_timestamp() AS observed_at,m.head_credential_id,
    c.expires_at,extract(epoch FROM c.expires_at-clock_timestamp()) AS remaining_seconds,
    NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials p WHERE p.id<>c.id AND p.revoked_at IS NULL
     AND p.expires_at>clock_timestamp() AND (p.retire_after IS NULL OR p.retire_after>clock_timestamp())) AS overlap_ended
    FROM private.setup_recovery_management m JOIN private.setup_recovery_credentials c ON c.id=m.head_credential_id WHERE m.singleton`)).rows[0];
   return observed&&observed.overlap_ended&&Number(observed.remaining_seconds)<=119&&Number(observed.remaining_seconds)>60;
  },'rotation-durability-real-db-due-'+label,75000);
  observations.push({phase:'due-'+label,observedAt:observed.observed_at.toISOString(),expiresAt:observed.expires_at.toISOString(),remainingSeconds:Number(observed.remaining_seconds),overlapEnded:true});
 };
 const recover=async(p,e,{archived=false,outputBefore=null}={})=>{
  const state=await businessState(),h=launch();
  await until(()=>events(h).some(r=>archived?r.action==='idle':r.action==='rotated'&&r.commandId===p.key)||h.exit,'rotation-durability-recovery');
  assert.ok(events(h).some(r=>archived?r.action==='idle':r.action==='rotated'&&r.commandId===p.key));await stop(h);
  assert.deepEqual(await businessState(),state);assert.deepEqual(await committed(p.key),e);
  assert.deepEqual(await readdir(pendingRoot),[]);
  assert.equal(await readFile(join(historyRoot,p.key,'command.json'),'utf8'),p.commandBytes);
  assert.equal(await readFile(join(historyRoot,p.key,'context.json'),'utf8'),p.contextBytes);
  const final=await verifyOutput(e.receipt);if(outputBefore)assert.deepEqual(final,outputBefore);await rpc();
  const idle=await finish(launch({once:true}));assert.deepEqual(idle.exit,{code:0,signal:null});assert.ok(idle.rows.some(r=>r.action==='idle'));
  assert.deepEqual(await businessState(),state);assert.deepEqual(await committed(p.key),e);assert.deepEqual(await snapshot(output),final);
  await cleanup('recovered-'+p.key);return final;
 };

 // The existing real issuer publishes the positive predecessor before faults.
 await rpc();await cleanup('seed-positive');verify('seed-positive-real-issuer-and-native-rpc');
 const stagePhase=await phasePreload('command_synced'),beforeStage=await businessState(),staged=launch({preload:stagePhase.preload});
 await awaitJournal(staged,stagePhase,'command_synced');assert.deepEqual(await readdir(pendingRoot),[]);
 const stages=(await readdir(spool)).filter(n=>n.startsWith('prepare-'));assert.equal(stages.length,1);
 const stage=join(spool,stages[0]),stageBytes=await readFile(join(stage,'command.json'),'utf8'),stageContext=await readFile(join(stage,'context.json'),'utf8');
 const abandoned=JSON.parse(stageBytes);assert.equal(abandoned.predecessorId,seeded.credentialId);
 assert.equal((await effect(abandoned.key)).commands,0);assert.deepEqual(await businessState(),beforeStage);
 await kill(staged,'command_synced');assert.equal(await readFile(join(stage,'command.json'),'utf8'),stageBytes);
 assert.equal(await readFile(join(stage,'context.json'),'utf8'),stageContext);
 verify('command-synced-sigkill-keeps-nondispatchable-stage-with-zero-db-effects');
 observations.push({phase:'command_synced',signal:'SIGKILL',procStopped:true,commandSha256:sha(stageBytes),contextSha256:sha(stageContext),dispatchable:false,dbEffects:0});

 const pendingTerm=await phasePreload('pending_synced',{graceful:true}),termBefore=await businessState(),term=launch({preload:pendingTerm.preload});
 await awaitJournal(term,pendingTerm,'pending_synced',{stopped:false});let p=await pending();assert.notEqual(p.key,abandoned.key);
 const termAt=Date.now();assert.equal(term.process.kill('SIGTERM'),true);
 await until(()=>events(term).some(r=>r.type==='setup_rotation_stopping'),'durability-pending-signal-observed');
 await writeFile(pendingTerm.release,'release\n',{flag:'wx',mode:0o644});await chmod(pendingTerm.release,0o644);
 const terminated=await finish(term);assert.deepEqual(terminated.exit,{code:0,signal:null});assert.ok(Date.now()-termAt<55000);
 assert.ok(terminated.rows.some(r=>r.action==='stopping'));assert.deepEqual(await businessState(),termBefore);
 assert.deepEqual(await pending(),p);assert.equal((await effect(p.key)).commands,0);await cleanup('pending_synced-sigterm');
 verify('pending-synced-sigterm-preserves-exact-command-and-zero-db-effects');
 observations.push({phase:'pending_synced',signal:'SIGTERM',elapsedMs:Date.now()-termAt,commandSha256:sha(p.commandBytes),contextSha256:sha(p.contextBytes),dbEffects:0});

 for(const [index,phase]of ['before_rename','after_rename','directory_synced','before_archive','archive_synced'].entries()){
  if(index){await waitDue(phase);await rpc();verify(phase+'-positive-native-rpc-and-real-db-due');}
  if(index===1){
   const pre=await phasePreload('pending_synced'),state=await businessState(),h=launch({preload:pre.preload});
   await awaitJournal(h,pre,'pending_synced');p=await pending();assert.deepEqual(await businessState(),state);assert.equal((await effect(p.key)).commands,0);
   await kill(h,'pending_synced');assert.deepEqual(await pending(),p);assert.deepEqual(await businessState(),state);
   verify('pending-synced-sigkill-preserves-exact-command-and-zero-db-effects');
   observations.push({phase:'pending_synced',signal:'SIGKILL',procStopped:true,commandSha256:sha(p.commandBytes),contextSha256:sha(p.contextBytes),dbEffects:0});
  }
  const outputPrior=await snapshot(output),before=await businessState();let preload,barrier;
  const publication=['before_rename','after_rename','directory_synced'].includes(phase);
  if(publication)preload=await text('durability-publication-'+phase+'-preload.mjs',installerFilesystemBarrierPreload({outputFile:output,phase}));
  else{barrier=await phasePreload(phase);preload=barrier.preload;}
  const h=launch({preload});let witness;
  if(publication){
   await until(()=>{witness=events(h).find(e=>e.event==='installer_cli_file_barrier'&&e.phase===phase);
    if(h.exit&&!witness)throw Error('ROTATION_DURABILITY_EXIT_BEFORE_PUBLICATION_BARRIER');return witness},'durability-publication-'+phase,30000);
   await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'durability-publication-proc-stopped',5000);
   assert.equal(witness.uid,10001);assert.equal(witness.gid,10001);assert.equal(witness.actualBuiltinCalls,true);
   assert.deepEqual(witness.observed,{intentSync:1,directorySync:phase==='directory_synced'?2:1,stageSync:1,rename:phase==='before_rename'?0:1});
  }else await awaitJournal(h,barrier,phase);
  const archived=phase==='archive_synced';
  if(archived){const ids=await readdir(historyRoot),fresh=ids.filter(k=>!observations.some(o=>o.commandId===k));assert.equal(fresh.length,1);
   const path=join(historyRoot,fresh[0]);p={key:fresh[0],path,command:JSON.parse(await readFile(join(path,'command.json'),'utf8')),
    commandBytes:await readFile(join(path,'command.json'),'utf8'),contextBytes:await readFile(join(path,'context.json'),'utf8')};
   assert.deepEqual(await readdir(pendingRoot),[]);
  }else p=await pending();
  const e=await committed(p.key),state=await businessState();
  assert.equal(e.receipt.predecessorId,p.command.predecessorId);
  assert.equal(state.credentials.length,before.credentials.length+1);assert.equal(state.management[0].version,before.management[0].version+1);
  let published=null;
  if(phase==='before_rename')assert.deepEqual(await snapshot(output),outputPrior);
  else published=await verifyOutput(e.receipt);
  if(publication){const intent=join(dirname(output),'.'+basename(output)+'.'+p.key+'.intent');
   const intentValue=JSON.parse(await readFile(intent,'utf8'));assert.equal(intentValue.commandId,p.key);
   if(phase==='before_rename'){const stagePath=join(dirname(output),'.'+basename(output)+'.'+p.key+'.stage'),v=await claims(stagePath);
    assert.equal(v.jti,e.receipt.credentialId);assert.equal(v.iat,e.receipt.iat);assert.equal(v.exp,e.receipt.exp);
   }
  }
  await kill(h,phase);assert.deepEqual(await businessState(),state);assert.deepEqual(await committed(p.key),e);
  if(!archived)assert.deepEqual(await pending(),p);if(published)assert.deepEqual(await snapshot(output),published);
  verify(phase+'-actual-daemon-sigkill-single-command-audit-credential-and-stable-files');
  const final=await recover(p,e,{archived,outputBefore:published});
  assert.equal((await effect(abandoned.key)).commands,0);assert.equal(await readFile(join(stage,'command.json'),'utf8'),stageBytes);
  verify(phase+'-restart-and-second-restart-keep-receipt-id-iat-exp-and-native-rpc');
  observations.push({phase,signal:'SIGKILL',procStopped:true,actualDaemon:true,actualBuiltinCalls:publication,observedSyscalls:witness?.observed??null,
   commandId:p.key,commandSha256:sha(p.commandBytes),contextSha256:sha(p.contextBytes),singleCommandAuditCredential:true,
   pendingArchived:archived,outputPublishedBeforeKill:!!published,outputSha256:final.sha256,sameReceiptRecovery:true,secondRestartIdle:true,nativeRpcVerified:true});
 }
 await cleanup('final');verify('all-sessions-mutexes-and-outside-canary-clean-before-fixture-cleanup');
 return {verified:true,checks,observations,cleanups,actualDaemonProcesses:true,actualPostgres:true,actualRest:true,
  journalCommandSyncKillVerified:true,journalPendingSyncTermAndKillVerified:true,
  daemonPublicationRenameAndDirectorySyncKillVerified:true,daemonArchiveBeforeAndAfterSyncKillVerified:true,
  abandonedStageNeverDispatched:true,immutableReceiptRecoveryVerified:true,
  fullFaultMatrixVerified:false,journalCorruptionAndDiskFaultsVerified:false,fullContentionMatrixVerified:false,
  crossDatabaseActorRevocationVerified:false,productAccepted:false};
}
