// Real product daemon/CLI, separate directory DB and native SQL/PostgREST.
// Barriers observe original execution; no synthetic server response or signer.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function runSetupRotationNativeChecks({input,db,config,otherRaw,seeded,issue,base,json,text,child,run,until,wire,businessState,check,root,installerConfig,names}){
 const checks=[],kills=[],timeline=[];
 const verify=(name,ok=true)=>{check('rotation-'+name,ok);checks.push(name)};
 const journal=join(root,'rotation-journal');await mkdir(journal,{mode:0o700});
 const rotationConfig=await json('rotation-issuer.json',{...config,consumerId:'setup-credential-rotation',replicas:2});
 const peerConfig=await json('rotation-peer-issuer.json',{...otherRaw,consumerId:'setup-credential-rotation',replicas:2});
 const policy={version:1,instanceId:'rotation-a',installerConfigFile:rotationConfig,journalDirectory:journal,
  ttlSeconds:180,overlapSeconds:10,rotateBeforeSeconds:120,intervalMs:1000};
 const policyFile=await json('rotation-a.json',policy),peerPolicy=await json('rotation-b.json',{...policy,instanceId:'rotation-b',installerConfigFile:peerConfig});
 const launch=(file,options={})=>child(file,null,{rotation:true,once:true,...options});
 const finish=async h=>{await until(()=>h.exit,'rotation-process',65000);assert.equal(h.identityError,undefined);
  const rows=h.output.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));return {exit:h.exit,rows,last:rows.at(-1)}};
 const events=h=>h.output.split('\n').slice(0,-1).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
 const pending=async()=>{
  const dir=join(journal,'rotation-a','pending'),ids=await readdir(dir);assert.equal(ids.length,1);
  return JSON.parse(await readFile(join(dir,ids[0],'command.json'),'utf8'));
 };
 const effect=async key=>(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.setup_recovery_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const rpc=async credential=>{
  const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
   headers:{apikey:credential.publishableKey,authorization:'Bearer '+credential.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
   body:JSON.stringify({p_workspace_id:randomUUID()})});await r.text();return r.status;
 };
 const originalFile=JSON.parse(await readFile(config.publisher.outputFile,'utf8'));
 assert.equal(await rpc(originalFile),200);
 // Pause exactly after durable prepare, before the daemon can call installer.
 const marker=join(root,'rotation-before-dispatch.json');
 const preload=await text('rotation-prepare-preload.mjs',`import {SetupRotationJournal} from '/repository/server/control/setup-rotation-journal.mjs';
import {writeFile} from 'node:fs/promises';
const original=SetupRotationJournal.prototype.prepare;
SetupRotationJournal.prototype.prepare=async function(...args){const p=await original.apply(this,args);
 await writeFile(${JSON.stringify(marker)},JSON.stringify({phase:'durable-before-dispatch',pid:process.pid}),{flag:'wx',mode:0o600});
 process.kill(process.pid,'SIGSTOP');return p};`);
 const before=await businessState(),first=launch(policyFile,{preload});
 await until(async()=>{try{return /^State:\s+T/m.test(await readFile('/proc/'+first.process.pid+'/status','utf8'))&&JSON.parse(await readFile(marker,'utf8')).pid===first.process.pid}catch{return false}},'rotation-pre-dispatch-barrier');
 const command=await pending();assert.equal(command.predecessorId,seeded.credentialId);
 assert.deepEqual(await businessState(),before);assert.equal((await effect(command.key)).commands,0);
 first.process.kill('SIGKILL');assert.equal((await finish(first)).exit.signal,'SIGKILL');kills.push('durable-before-dispatch');
 verify('real-nonroot-daemon-killed-after-durable-prepare-has-zero-db-effects');
 // Restart the actual daemon. Hold only original PG frames after COMMIT.
 const held=wire.arm('rotate','hold'),second=launch(policyFile);
 await until(()=>held.observed,'rotation-postcommit-barrier');assert.equal(held.idle,true);
 second.process.kill('SIGSTOP');await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+second.process.pid+'/status','utf8')),'rotation-postcommit-stopped');
 const committed=await effect(command.key);assert.equal(committed.commands,1);assert.equal(committed.audits,1);
 assert.equal(committed.receipt.predecessorId,seeded.credentialId);
 const committedState=await businessState(),contender=await finish(launch(peerPolicy));
 assert.equal(contender.exit.code,1);assert.equal(contender.last.action,'review');
 assert.equal(contender.last.code,'SETUP_INSTALLER_BUSY');assert.deepEqual(await businessState(),committedState);
 verify('two-real-daemon-processes-contend-on-one-target-before-extra-effects');
 second.process.kill('SIGKILL');assert.equal((await finish(second)).exit.signal,'SIGKILL');held.release?.();kills.push('commit-before-response');
 await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.issuer])).rowCount===0,'rotation-session-released');
 const replay=await finish(launch(policyFile));assert.equal(replay.exit.code,0);assert.equal(replay.last.action,'rotated');
 const after=await effect(command.key);assert.equal(after.commands,1);assert.equal(after.audits,1);assert.deepEqual(after.receipt,committed.receipt);
 assert.deepEqual(await pending().catch(()=>null),null);
 assert.deepEqual(JSON.parse(await readFile(join(journal,'rotation-a','history','published',command.key,'command.json'),'utf8')),command);
 const liveFile=JSON.parse(await readFile(config.publisher.outputFile,'utf8'));
 assert.equal(liveFile.credentialId,undefined);assert.equal(await rpc(liveFile),200);
 verify('restart-replays-original-caller-key-body-with-unchanged-id-iat-exp-and-one-audit');
 // Two processes sharing the exact same spool must not invent another command.
 const stable=await businessState(),shared=await Promise.all([finish(launch(policyFile)),finish(launch(policyFile))]);
 assert.ok(shared.some(r=>r.exit.code===0&&r.last.action==='idle'));
 assert.deepEqual(await businessState(),stable);
 verify('shared-journal-two-processes-do-not-overwrite-command-or-issue-again');
 const negative={...issue,...base('issue',committed.receipt.version),predecessorId:null};
 const negativeResult=await run(rotationConfig,await json('rotation-no-bootstrap.json',negative));
 assert.equal(negativeResult.exit.code,1);assert.equal(negativeResult.value.code,'SETUP_INSTALLER_PREDECESSOR_CONFLICT');
 assert.deepEqual(await businessState(),stable);verify('automatic-rpc-cannot-bootstrap-a-new-head');
 const cutoff=committed.receipt.overlapDeadline;
 await until(async()=>{
  const r=(await db.query('SELECT clock_timestamp() AS now,clock_timestamp()>=$1::timestamptz AS passed',[cutoff])).rows[0];
  if(r.passed){timeline.push({phase:'predecessor-overlap-ended',databaseObservedAt:r.now.toISOString(),cutoff});return true}return false;
 },'rotation-overlap-ended',20000);
 assert.equal(await rpc(originalFile),403);assert.equal(await rpc(liveFile),200);
 verify('old-key-rejected-after-db-overlap-with-all-daemons-stopped');
 // No process is left running to expire the head: native DB enforcement owns it.
 await until(async()=>{
  const r=(await db.query('SELECT clock_timestamp() AS now,clock_timestamp()>=to_timestamp($1) AS passed',[committed.receipt.exp])).rows[0];
  if(r.passed){timeline.push({phase:'head-expired',databaseObservedAt:r.now.toISOString(),expiryEpoch:committed.receipt.exp});return true}return false;
 },'rotation-head-expired-with-daemons-stopped',190000);
 assert.equal(await rpc(liveFile),403);
 const expiredState=await businessState(),expired=await finish(launch(policyFile));
 assert.equal(expired.last.action,'review');assert.equal(expired.last.reasonCode,'CREDENTIAL_EXPIRED');assert.deepEqual(await businessState(),expiredState);
 // Direct automatic RPC must also reject, even if a stale intent existed.
 const expiredCommand={...issue,...base('issue',committed.receipt.version),predecessorId:committed.receipt.credentialId};
 const expiredIssue=await run(rotationConfig,await json('rotation-expired-head.json',expiredCommand));
 assert.equal(expiredIssue.value.code,'SETUP_INSTALLER_ROTATION_HEAD_UNREADY');assert.deepEqual(await businessState(),expiredState);
 verify('expired-head-is-not-revived-by-daemon-or-stale-automatic-command');
 // Manual installer recovery remains explicit and separately attributable.
 const manual=await run(await json('manual-recovery-issuer.json',config),await json('manual-recovery-command.json',expiredCommand));
 assert.equal(manual.exit.code,0);
 let current=(await effect(expiredCommand.key)).receipt;
 // Run the periodic product entrypoint, not --once. Two actual connection
 // deadlines trigger its real timers/backoff, followed by positive recovery.
 const firstHandshake=wire.holdNextHandshake(),periodic=launch(policyFile,{once:false});
 await until(()=>firstHandshake.observed,'periodic-first-handshake');
 await until(()=>events(periodic).filter(e=>e.action==='review').length===1,'periodic-first-review');
 const firstReviewAt=Date.now(),secondHandshake=wire.holdNextHandshake();firstHandshake.release();
 await until(()=>secondHandshake.observed,'periodic-second-handshake');
 assert.ok(secondHandshake.connectedAt-firstReviewAt>=900,'Periodic retry must wait after first failure');
 await until(()=>events(periodic).filter(e=>e.action==='review').length===2,'periodic-second-review');
 const secondReviewAt=Date.now();secondHandshake.release();
 // The manually recovered head has120 seconds. It is due immediately, so a
 // real periodic retry must issue once and then settle into idle cycles.
 await until(()=>events(periodic).some(e=>e.action==='rotated'),'periodic-positive-recovery',30000);
 const recoveredCycle=events(periodic).find(e=>e.action==='rotated'),periodicEffect=await effect(recoveredCycle.commandId);
 assert.equal(periodicEffect.commands,1);assert.equal(periodicEffect.audits,1);
 current=periodicEffect.receipt;
 const startedAfterSecond=wire.connections.find(c=>c.connectedAt>=secondReviewAt);
 assert.ok(startedAfterSecond&&startedAfterSecond.connectedAt-secondReviewAt>=1900,'Second retry uses increasing backoff');
 await until(()=>events(periodic).filter(e=>e.action==='idle').length>=2,'periodic-idle-timer-cycles');
 periodic.process.kill('SIGTERM');
 const stopped=await finish(periodic);assert.equal(stopped.exit.code,0);assert.equal(stopped.exit.signal,null);
 assert.equal(stopped.rows.filter(e=>e.action==='rotated').length,1);
 assert.equal(stopped.last.type,'setup_rotation_stopped');
 const afterStop=await effect(current.commandId);assert.deepEqual(afterStop.receipt,current);assert.equal(afterStop.commands,1);
 timeline.push({phase:'periodic-real-retry',firstRetryObservedMs:secondHandshake.connectedAt-firstReviewAt,
  secondRetryObservedMs:startedAfterSecond.connectedAt-secondReviewAt,idleCycles:stopped.rows.filter(e=>e.action==='idle').length});
 verify('periodic-real-timers-backoff-and-native-recovery-issue-once');
 verify('periodic-idle-cycles-and-sigterm-exit-without-new-tick');
 // Wait until this live head is due using DB time, then SIGTERM while original
 // server frames are held after COMMIT. No synthetic result or client clock.
 await until(async()=>{
  const r=(await db.query('SELECT clock_timestamp() AS now,to_timestamp($1)-clock_timestamp()<=interval \'120 seconds\' AS due',[current.exp])).rows[0];
  if(r.due){timeline.push({phase:'head-due-for-graceful-drain',databaseObservedAt:r.now.toISOString()});return true}return false;
 },'periodic-next-head-due',65000);
 const drainingReply=wire.arm('rotate','hold'),draining=launch(policyFile,{once:false});
 await until(()=>drainingReply.observed,'periodic-drain-after-commit');assert.equal(drainingReply.idle,true);
 draining.process.kill('SIGTERM');await until(()=>events(draining).some(e=>e.type==='setup_rotation_stopping'),'periodic-stop-ack');
 assert.equal(draining.exit,null);const drainCommand=await pending(),drainEffect=await effect(drainCommand.key);
 assert.equal(drainEffect.commands,1);assert.equal(drainEffect.audits,1);
 const drainStarted=Date.now();drainingReply.release();
 const drained=await finish(draining);assert.equal(drained.exit.code,0);assert.equal(drained.exit.signal,null);
 assert.equal(drained.rows.filter(e=>e.type==='setup_rotation_cycle').length,1);
 assert.equal(drained.rows.find(e=>e.type==='setup_rotation_cycle').action,'rotated');
 assert.equal(drained.last.type,'setup_rotation_stopped');
 const drainedEffect=await effect(drainCommand.key);assert.deepEqual(drainedEffect,drainEffect);
 current=drainedEffect.receipt;assert.deepEqual(await pending().catch(()=>null),null);
 timeline.push({phase:'graceful-inflight-drain',afterReplyReleaseMs:Date.now()-drainStarted,terminalExitCode:drained.exit.code});
 await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.issuer])).rowCount===0,'periodic-sessions-closed');
 verify('sigterm-after-real-commit-drains-publication-and-archives-same-receipt-before-exit');
 const revoke={...base('revoke',current.version),credentialId:current.credentialId};
 assert.equal((await run(installerConfig,await json('rotation-revoke.json',revoke))).exit.code,0);
 const revokedState=await businessState(),revoked=await finish(launch(policyFile));
 assert.equal(revoked.last.reasonCode,'CREDENTIAL_REVOKED');assert.deepEqual(await businessState(),revokedState);
 const revokedIssue=await run(rotationConfig,await json('rotation-revoked-head.json',{...expiredCommand,key:randomUUID(),requestId:randomUUID(),expectedVersion:current.version+1,predecessorId:current.credentialId}));
 assert.equal(revokedIssue.value.code,'SETUP_INSTALLER_ROTATION_HEAD_UNREADY');assert.deepEqual(await businessState(),revokedState);
 verify('revoked-head-never-revives-through-automatic-path');
 const report={verified:true,checks,kills,timeline,actualDaemonProcesses:true,periodicDaemonVerified:true,
  actualRetryBackoffVerified:true,gracefulShutdownIdleVerified:true,gracefulShutdownInflightVerified:true,actualPostgres:true,actualRest:true,
  automaticReadyHeadFenceVerified:true,fixtureSignersOnly:true,readOnlyRuntimeMountVerified:false,crossDatabaseActorRevocationVerified:false,productAccepted:false};
 assert.ok(!JSON.stringify(report).includes(input.jwtSecret));assert.equal((await lstat(journal)).isSymbolicLink(),false);
 return report;
}
