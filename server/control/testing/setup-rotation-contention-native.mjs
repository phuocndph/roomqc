// Actual nonroot daemon contenders. Barriers stop original journal methods;
// database rows/frames, publication, CAS and native RPC remain unmodified.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,lstat,writeFile,chown} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');

export async function runSetupRotationContentionNativeChecks(c){
 const {input,db,maintenance,directory,config,otherRaw,json,text,child,until,wire,businessState,check,root,names}=c;
 const checks=[],observations=[],cleanups=[],barriers=[];
 const verify=name=>{checks.push(name);check('rotation-contention-'+name)};
 const journal=join(root,'contention-journal');await mkdir(journal,{mode:0o700});
 const issuer=await json('contention-issuer.json',{...config,consumerId:'setup-credential-rotation',replicas:2});
 const peerIssuer=await json('contention-peer-issuer.json',{...otherRaw,consumerId:'setup-credential-rotation',replicas:2});
 const policy=async(instanceId,installerConfigFile)=>({instanceId,file:await json(instanceId+'.json',{
  version:1,instanceId,installerConfigFile,journalDirectory:journal,ttlSeconds:3600,overlapSeconds:10,
  rotateBeforeSeconds:3540,intervalMs:1000})});
 const shared=await policy('contention-shared',issuer),separateA=await policy('contention-separate-a',issuer),
  separateB=await policy('contention-separate-b',peerIssuer);
 const spool=p=>join(journal,p.instanceId),pendingRoot=p=>join(spool(p),'pending');
 const readRecord=async path=>({path,key:path.split('/').at(-1),commandBytes:await readFile(join(path,'command.json'),'utf8'),
  contextBytes:await readFile(join(path,'context.json'),'utf8')});
 const pending=async p=>(await readdir(pendingRoot(p))).sort().map(key=>join(pendingRoot(p),key));
 const record=async(p,key)=>readRecord(join(pendingRoot(p),key));
 const archived=async(p,key,outcome)=>readRecord(join(spool(p),'history',outcome,key));
 const sameRecord=(a,b)=>{assert.equal(a.commandBytes,b.commandBytes);assert.equal(a.contextBytes,b.contextBytes)};
 const events=h=>h.output.split('\n').filter(Boolean).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
 const launch=(p,preload)=>child(p.file,null,{rotation:true,once:true,...(preload?{preload}:{} )});
 const finish=async h=>{await until(()=>h.exit,'contention-terminal',65000);assert.equal(h.identityError,undefined);
  const rows=events(h);return {exit:h.exit,rows,last:rows.at(-1)}};
 const success=async(h,action)=>{const r=await finish(h);assert.deepEqual(r.exit,{code:0,signal:null});assert.equal(r.last.action,action);return r};
 const stopped=async(h,label)=>until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'contention-stopped-'+label,5000);
 const resume=h=>assert.equal(h.process.kill('SIGCONT'),true);
 const kill=async h=>{assert.equal(h.process.kill('SIGKILL'),true);assert.deepEqual((await finish(h)).exit,{code:null,signal:'SIGKILL'})};
 const snapshot=async path=>{const s=await lstat(path);assert.equal(s.isSymbolicLink(),false);return {
  sha256:sha(await readFile(path)),ino:s.ino,dev:s.dev,uid:s.uid,gid:s.gid,mode:s.mode&0o777,nlink:s.nlink}};
 const output=config.publisher.outputFile;
 const canary=join(root,'contention-outside-canary');await writeFile(canary,'owned contention canary\n',{flag:'wx',mode:0o600});await chown(canary,10001,10001);
 const canaryBefore=await snapshot(canary);
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',
   [[names.issuer,names.issuerOther,names.observer,names.observerOther]])).rowCount===0,'contention-sessions-'+label,15000);
  for(const [pool,key]of [[maintenance,727012],[directory,727001]]){const client=await pool.connect();try{
   assert.equal((await client.query('SELECT pg_try_advisory_lock($1) AS locked',[key])).rows[0].locked,true);
   assert.equal((await client.query('SELECT pg_advisory_unlock($1) AS unlocked',[key])).rows[0].unlocked,true);
  }finally{client.release()}}
  assert.deepEqual(await snapshot(canary),canaryBefore);
  cleanups.push({label,issuerObserverSessions:0,businessMutexFree:true,directoryMutexFree:true,outsideCanaryUnchanged:true});
 };
 const effect=async key=>(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.setup_recovery_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const committed=async key=>{const e=await effect(key);assert.equal(e.commands,1);assert.equal(e.audits,1);assert.equal(e.receipt.commandId,key);return e};
 const liveCount=async()=>{const n=(await db.query(`SELECT count(*)::int AS n FROM private.setup_recovery_credentials
  WHERE revoked_at IS NULL AND not_before<=clock_timestamp() AND expires_at>clock_timestamp()
  AND (retire_after IS NULL OR retire_after>clock_timestamp())`)).rows[0].n;assert(n>=1&&n<=2);return n};
 const rpc=async value=>{const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
  headers:{apikey:value.publishableKey,authorization:'Bearer '+value.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
  body:JSON.stringify({p_workspace_id:randomUUID()})});await r.text();return r.status};
 const outputProof=async receipt=>{const value=JSON.parse(await readFile(output,'utf8')),claims=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
  assert.equal(claims.jti,receipt.credentialId);assert.equal(claims.iat,receipt.iat);assert.equal(claims.exp,receipt.exp);
  assert.equal(await rpc(value),200);const proof=await snapshot(output);assert.equal(proof.uid,10001);assert.equal(proof.mode,0o600);assert.equal(proof.nlink,1);return proof};
 const waitDue=async label=>{let row;await until(async()=>{row=(await db.query(`SELECT clock_timestamp() AS observed_at,c.expires_at,
   extract(epoch FROM c.expires_at-clock_timestamp()) AS remaining_seconds,
   NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials p WHERE p.id<>c.id AND p.revoked_at IS NULL
    AND p.expires_at>clock_timestamp() AND (p.retire_after IS NULL OR p.retire_after>clock_timestamp())) AS overlap_ended
   FROM private.setup_recovery_management m JOIN private.setup_recovery_credentials c ON c.id=m.head_credential_id WHERE m.singleton`)).rows[0];
   return row&&row.overlap_ended&&Number(row.remaining_seconds)<=3539&&Number(row.remaining_seconds)>1200;
  },'contention-db-due-'+label,85000);
  observations.push({phase:'due-'+label,databaseObservedAt:row.observed_at.toISOString(),remainingSeconds:Number(row.remaining_seconds),overlapEnded:true});
 };
 // Only observation and SIGSTOP around real methods. No replacement return,
 // modified payload/clock, widened connection limit or bypassed fence.
 const instrument=async(label,phases)=>{
  const prefix=join(root,'contention-'+label);
  const preload=await text('contention-'+label+'-preload.mjs',`import {writeFile} from 'node:fs/promises';
import {SetupRotationJournal} from '/repository/server/control/setup-rotation-journal.mjs';
import {SetupCredentialRotator} from '/repository/server/control/setup-credential-rotation.mjs';
const phases=${JSON.stringify(phases)},prefix=${JSON.stringify(prefix)},seen=new Set();
async function observe(phase,command=null){if(!phases.includes(phase)||seen.has(phase))return;seen.add(phase);
 await writeFile(prefix+'-'+phase+'.json',JSON.stringify({phase,pid:process.pid,uid:process.getuid(),gid:process.getgid(),commandId:command?.key??null}),{flag:'wx',mode:0o600});
 process.kill(process.pid,'SIGSTOP');}
for(const method of ['prepare','archive']){const original=SetupRotationJournal.prototype[method];
 SetupRotationJournal.prototype[method]=async function(...args){const previous=this.onPhase;
  this.onPhase=async phase=>{await previous(phase);await observe(phase,method==='prepare'?args[1]:args[0].command)};
  try{return await original.apply(this,args)}finally{this.onPhase=previous}};}
const dispatch=SetupCredentialRotator.prototype.dispatch;
SetupCredentialRotator.prototype.dispatch=async function(p){await observe('dispatch',p.command);return dispatch.call(this,p)};`);
  return {preload,prefix};
 };
 const awaitPhase=async(h,probe,phase)=>{let v;await until(async()=>{try{v=JSON.parse(await readFile(probe.prefix+'-'+phase+'.json','utf8'));return v.pid===h.process.pid}catch{
   if(h.exit)throw Error('ROTATION_CONTENTION_EXIT_BEFORE_'+phase);return false}},'contention-phase-'+phase);
  await stopped(h,phase);assert.equal(v.phase,phase);assert.equal(v.uid,10001);assert.equal(v.gid,10001);barriers.push(v);return v;
 };
 const preparePair=async(a,b,label)=>{
  const before=await businessState(),proofs=await Promise.all(['a','b'].map(s=>instrument(label+'-'+s,['command_synced','pending_synced','dispatch'])));
  const first=launch(a,proofs[0].preload);await awaitPhase(first,proofs[0],'command_synced');
  const second=launch(b,proofs[1].preload);await awaitPhase(second,proofs[1],'command_synced');
  assert.deepEqual(await businessState(),before);
  // Both original check/prepare operations have observed the same empty spool
  // and live DB version before either pending directory becomes visible.
  resume(first);await awaitPhase(first,proofs[0],'pending_synced');
  resume(second);await awaitPhase(second,proofs[1],'pending_synced');
  resume(first);const af=await awaitPhase(first,proofs[0],'dispatch');
  resume(second);const bf=await awaitPhase(second,proofs[1],'dispatch');
  assert.deepEqual(await businessState(),before);
  return {first,second,af,bf,before};
 };
 const oneDelta=(before,after)=>{for(const key of ['credentials','commands','audit'])assert.equal(after[key].length,before[key].length+1,key);
  assert.equal(after.management[0].version,before.management[0].version+1);assert.deepEqual(after.authority,before.authority)};

 // Shared spool: active concurrent prepares (not idle probes), unknown commit,
 // concurrent replay and archive rename, plus disposition of the extra key.
 await waitDue('shared');
 const originalFile=JSON.parse(await readFile(output,'utf8')),sharedPair=await preparePair(shared,shared,'shared');
 assert.equal(sharedPair.af.commandId,sharedPair.bf.commandId);
 const keys=(await pending(shared)).map(p=>p.split('/').at(-1));assert.equal(keys.length,2);
 const winningKey=sharedPair.af.commandId,unusedKey=keys.find(k=>k!==winningKey);
 const win=await record(shared,winningKey),unused=await record(shared,unusedKey);
 assert.equal(JSON.parse(win.commandBytes).expectedVersion,JSON.parse(unused.commandBytes).expectedVersion);
 verify('shared-active-prepares-preserve-two-durable-keys-and-select-same-pending-command');
 const held=wire.arm('rotate','hold');resume(sharedPair.first);await until(()=>held.observed,'contention-shared-postcommit');assert.equal(held.idle,true);
 sharedPair.first.process.kill('SIGSTOP');await stopped(sharedPair.first,'shared-postcommit');
 const receipt=await committed(winningKey),committedState=await businessState();oneDelta(sharedPair.before,committedState);assert.equal(await liveCount(),2);
 resume(sharedPair.second);const refused=await finish(sharedPair.second);
 assert.equal(refused.exit.code,1);assert.equal(refused.last.action,'review');assert.equal(refused.last.code,'SETUP_INSTALLER_CONNECTION_LIMIT');
 assert.equal(refused.last.sameCommandRequired,true);assert.equal(refused.last.commandId,winningKey);
 assert.deepEqual(await businessState(),committedState);sameRecord(await record(shared,winningKey),win);sameRecord(await record(shared,unusedKey),unused);
 verify('shared-caller-connection-limit-keeps-unknown-command-and-adds-no-effects');
 await kill(sharedPair.first);held.release?.();await cleanup('shared-after-commit-kill');
 const pa=await instrument('shared-archive-a',['before_archive']),pb=await instrument('shared-archive-b',['before_archive']);
 const ra=launch(shared,pa.preload);await awaitPhase(ra,pa,'before_archive');const fileAfterPublish=await outputProof(receipt.receipt);
 const rb=launch(shared,pb.preload);await awaitPhase(rb,pb,'before_archive');assert.deepEqual(await snapshot(output),fileAfterPublish);
 assert.deepEqual(await businessState(),committedState);assert.deepEqual(await committed(winningKey),receipt);
 resume(ra);resume(rb);const archiveResults=await Promise.all([success(ra,'rotated'),success(rb,'rotated')]);
 assert(archiveResults.every(r=>r.last.commandId===winningKey));sameRecord(await archived(shared,winningKey,'published'),win);
 assert.deepEqual(await committed(winningKey),receipt);assert.deepEqual(await snapshot(output),fileAfterPublish);assert.deepEqual(await businessState(),committedState);
 verify('shared-two-live-replays-race-at-archive-with-one-receipt-and-unchanged-publication');
 const superseded=await success(launch(shared),'superseded');assert.equal(superseded.last.commandId,unusedKey);
 assert.equal(superseded.last.code,'SETUP_INSTALLER_VERSION_CONFLICT');sameRecord(await archived(shared,unusedKey,'superseded'),unused);
 assert.deepEqual(await effect(unusedKey),{commands:0,audits:0,receipt:null});assert.deepEqual(await pending(shared),[]);
 await success(launch(shared),'idle');assert.deepEqual(await businessState(),committedState);assert.deepEqual(await snapshot(output),fileAfterPublish);
 verify('shared-unselected-key-superseded-with-zero-db-effects-and-second-restart-idle');
 await cleanup('shared-complete');observations.push({scenario:'shared-active-journal',winner:winningKey,unusedKey,unknownOutcomeRetained:true,
  sameCallerContext:true,concurrentArchive:true,commandAuditCredentialDelta:1,liveCredentialsAtCommit:2,secondRestartIdle:true});

 // Separate journals/callers: once before commit while SQL waits on a real row,
 // then after commit with original PG frames withheld. No synthetic SQL result.
 for(const phase of ['precommit','postcommit']){
  await waitDue(phase);const oldFile=JSON.parse(await readFile(output,'utf8')),priorOutput=await snapshot(output);
  const pair=await preparePair(separateA,separateB,phase);assert.notEqual(pair.af.commandId,pair.bf.commandId);
  const a=await record(separateA,pair.af.commandId),b=await record(separateB,pair.bf.commandId);
  const ca=JSON.parse(a.commandBytes),cb=JSON.parse(b.commandBytes);assert.equal(ca.expectedVersion,cb.expectedVersion);assert.equal(ca.predecessorId,cb.predecessorId);
  let hold,lock;
  try{
   if(phase==='precommit'){
    lock=await maintenance.connect();await lock.query('BEGIN');await lock.query('SELECT version FROM private.setup_recovery_management WHERE singleton FOR UPDATE');
    resume(pair.first);await until(async()=>(await db.query(`SELECT 1 FROM pg_stat_activity WHERE usename=$1
     AND wait_event_type='Lock' AND query LIKE 'SELECT roomqc_setup_admin.rotate(%'`,[names.issuer])).rowCount===1,'contention-real-row-wait',20000);
    pair.first.process.kill('SIGSTOP');await stopped(pair.first,'real-row-wait');assert.deepEqual(await businessState(),pair.before);
   }else{
    hold=wire.arm('rotate','hold');resume(pair.first);await until(()=>hold.observed,'contention-separate-postcommit');assert.equal(hold.idle,true);
    pair.first.process.kill('SIGSTOP');await stopped(pair.first,'separate-postcommit');await committed(a.key);oneDelta(pair.before,await businessState());
   }
   const beforeLoser=await businessState();resume(pair.second);const loser=await finish(pair.second);
   assert.equal(loser.exit.code,1);assert.equal(loser.last.action,'review');assert.equal(loser.last.code,'SETUP_INSTALLER_BUSY');
   assert.equal(loser.last.sameCommandRequired,true);assert.equal(loser.last.commandId,b.key);
   assert.deepEqual(await businessState(),beforeLoser);sameRecord(await record(separateB,b.key),b);assert.deepEqual(await effect(b.key),{commands:0,audits:0,receipt:null});
   assert.deepEqual(await snapshot(output),priorOutput);
   verify('separate-'+phase+'-real-mutex-denies-peer-and-keeps-exact-pending');
   if(phase==='precommit'){
    await kill(pair.first);await lock.query('ROLLBACK');lock.release();lock=null;
    await cleanup(phase+'-winner-killed');
    // Dispatch may finish as its disconnected SQL backend sees the row unlock;
    // reconcile the actual committed outcome before replaying the same command.
    const observed=await effect(a.key);assert([0,1].includes(observed.commands));
    observations.push({phase:'precommit-after-unlock',observedCommands:observed.commands});
   }else{await kill(pair.first);hold.release?.();await cleanup(phase+'-winner-killed')}
  }finally{if(lock){await lock.query('ROLLBACK');lock.release()}}
  const beforeArchive=await instrument(phase+'-published',['before_archive']),recovery=launch(separateA,beforeArchive.preload);
  await awaitPhase(recovery,beforeArchive,'before_archive');const committedA=await committed(a.key),state=await businessState();oneDelta(pair.before,state);
  const published=await outputProof(committedA.receipt);assert.equal(await liveCount(),2);
  // The losing daemon replays its own request; DB version rejects it without
  // generating a second credential, even while the winner has not archived.
  const resolved=await success(launch(separateB),'superseded');assert.equal(resolved.last.commandId,b.key);assert.equal(resolved.last.code,'SETUP_INSTALLER_VERSION_CONFLICT');
  sameRecord(await archived(separateB,b.key,'superseded'),b);assert.deepEqual(await effect(b.key),{commands:0,audits:0,receipt:null});
  await success(launch(separateB),'idle');assert.deepEqual(await businessState(),state);assert.deepEqual(await snapshot(output),published);
  verify('separate-'+phase+'-cas-loser-superseded-while-winner-publication-awaits-archive');
  await kill(recovery);await cleanup(phase+'-published-kill');sameRecord(await record(separateA,a.key),a);
  await success(launch(separateA),'rotated');sameRecord(await archived(separateA,a.key,'published'),a);
  await success(launch(separateA),'idle');assert.deepEqual(await businessState(),state);assert.deepEqual(await committed(a.key),committedA);assert.deepEqual(await snapshot(output),published);
  assert.deepEqual(await pending(separateA),[]);assert.deepEqual(await pending(separateB),[]);
  await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS ended',[committedA.receipt.overlapDeadline])).rows[0].ended,'contention-overlap-ended',20000);
  assert.equal(await rpc(oldFile),403);assert.equal(await rpc(JSON.parse(await readFile(output,'utf8'))),200);assert.equal(await liveCount(),1);
  verify('separate-'+phase+'-published-kill-recovery-keeps-id-iat-exp-and-enforces-db-overlap');
  await cleanup(phase+'-complete');observations.push({scenario:'separate-'+phase,winner:a.key,loser:b.key,distinctCallerContexts:true,
   commandAuditCredentialDelta:1,loserEffects:0,liveCredentialsAtCommit:2,liveCredentialsAfterOverlap:1,sameReceiptRecovery:true,secondRestartIdle:true});
 }
 assert.equal(await rpc(originalFile),403);await cleanup('final');verify('sessions-mutexes-and-outside-canary-clean');
 const report={verified:true,checks,observations,barriers,cleanups,actualDaemonProcesses:true,actualPostgres:true,actualRest:true,
  sharedJournalActiveContentionVerified:true,separateJournalPrecommitContentionVerified:true,separateJournalPostcommitContentionVerified:true,
  sharedArchiveRaceVerified:true,immutableReceiptRecoveryVerified:true,dbOverlapVerified:true,
  fullFaultMatrixVerified:false,fullContentionMatrixVerified:false,crossDatabaseActorRevocationVerified:false,productAccepted:false};
 assert(!JSON.stringify(report).includes(input.jwtSecret));return report;
}
