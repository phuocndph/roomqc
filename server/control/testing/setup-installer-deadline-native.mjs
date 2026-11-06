// Real CLI/session/server deadlines against exact-owned disposable targets.
// Only original PG frames are delayed. No fabricated SQL/filesystem outcome.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,lstat} from 'node:fs/promises';
import {join} from 'node:path';

export async function runInstallerDeadlineFaults(c){
 const {db,maintenance,directory,config,issuerConfig,issue,base,json,child,until,wire,businessState,names,check,root,checkFile}=c;
 const observations=[],cleanups=[];
 const outputUnchanged=async()=>readFile(config.publisher.outputFile,'utf8');
 const originalOutput=await outputUnchanged();
 const execute=async(configFile,commandFile,observe=async()=>{})=>{
  const startedAt=Date.now(),connectionOffset=wire.connections.length,h=child(configFile,commandFile);
  await observe(h);await until(()=>h.exit,'deadline-cli-terminal',65000);
  let value;try{value=JSON.parse(h.output.trim())}catch{throw new Error('INSTALLER_DEADLINE_CLI_OUTPUT_INVALID')}
  return {exit:h.exit,value,elapsedMs:Date.now()-startedAt,connections:wire.connections.slice(connectionOffset)};
 };
 const denied=(r,operation,key)=>{
  assert.equal(r.exit.code,1);assert.equal(r.exit.signal,null);assert.equal(r.value.ok,false);
  assert.notEqual(r.value.filePublished,true);assert.notEqual(r.value.nativeRpcVerified,true);
  if(key)assert.deepEqual(r.value.recovery,{operation,key,sameCommandRequired:true});
 };
 const absent=async p=>assert.rejects(()=>lstat(p),{code:'ENOENT'});
 const cleanup=async(label,r)=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,
   'deadline-'+label+'-sessions-ended',15000);
  await until(()=>r.connections.every(x=>x.closedAt!==null),'deadline-'+label+'-sockets-ended',5000);
  const b=await maintenance.connect(),d=await directory.connect();
  try{
   assert.equal((await b.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0].locked,true);
   assert.equal((await b.query('SELECT pg_advisory_unlock(727012) AS unlocked')).rows[0].unlocked,true);
   assert.equal((await d.query('SELECT pg_try_advisory_lock(727001) AS locked')).rows[0].locked,true);
   assert.equal((await d.query('SELECT pg_advisory_unlock(727001) AS unlocked')).rows[0].unlocked,true);
  }finally{b.release();d.release()}
  wire.reset();cleanups.push({label,sessionsEnded:true,proxySocketsEnded:true,businessMutexFree:true,directoryExclusiveFree:true});
  check('deadline-'+label+'-releases-sessions-sockets-and-both-independent-mutexes');
 };
 const outputConfig=async label=>{
  const directoryName=join(root,'deadline-'+label);await mkdir(directoryName,{mode:0o700});
  const raw={...config,publisher:{...config.publisher,outputFile:join(directoryName,'credential.json')}};
  return {raw,file:await json('deadline-'+label+'-config.json',raw)};
 };
 const effects=async key=>{
  const result=(await db.query('SELECT result FROM private.setup_recovery_commands WHERE key=$1',[key])).rows[0]?.result;
  assert.ok(result?.credentialId);
  const counts=(await db.query(`SELECT
   (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
   (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
   (SELECT count(*)::int FROM private.setup_recovery_credentials WHERE id=$2) AS credentials`,[key,result.credentialId])).rows[0];
  assert.deepEqual(counts,{commands:1,audits:1,credentials:1});return result;
 };
 const newIssue=async label=>{
  await until(async()=>(await db.query(`SELECT NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials c
   JOIN private.setup_recovery_management m ON m.singleton WHERE c.id<>m.head_credential_id AND c.revoked_at IS NULL
    AND c.expires_at>clock_timestamp() AND (c.retire_after IS NULL OR c.retire_after>clock_timestamp())) AS ready`)).rows[0].ready,
   'deadline-'+label+'-overlap-ended',15000);
  const head=(await db.query('SELECT version,head_credential_id FROM private.setup_recovery_management WHERE singleton')).rows[0];
  const command={...issue,...base('issue',Number(head.version)),predecessorId:head.head_credential_id,ttlSeconds:300};
  return {command,file:await json('deadline-'+label+'-issue.json',command),output:await outputConfig(label)};
 };
 const before=await businessState(),handshake=wire.holdNextHandshake();
 const connect=await execute(issuerConfig,checkFile,async()=>{
  await until(()=>handshake.observed,'deadline-real-authentication-frame',10000);
 });
 denied(connect);assert.ok(connect.elapsedMs>=3500&&connect.elapsedMs<12000);
 assert.equal(handshake.firstFrameType,'R');assert.deepEqual(await businessState(),before);assert.equal(await outputUnchanged(),originalOutput);
 observations.push({case:'DL01',actualHandshakeHeld:true,elapsedMs:connect.elapsedMs,businessUnchanged:true,outputUnchanged:true});
 check('deadline-connect-holds-real-authentication-frame-and-terminates-before-effects');await cleanup('connect',connect);

 const preflight=wire.arm('preflight','hold'),query=await execute(issuerConfig,checkFile);
 denied(query);assert.ok(preflight.observed&&preflight.idle);assert.ok(query.elapsedMs>=3500&&query.elapsedMs<12000);
 assert.deepEqual(await businessState(),before);assert.equal(await outputUnchanged(),originalOutput);
 observations.push({case:'DL02',actualReadOnlyResponseHeld:true,elapsedMs:query.elapsedMs,businessUnchanged:true,outputUnchanged:true});
 check('deadline-readonly-preflight-query-timeout-has-zero-business-or-file-effects');await cleanup('preflight',query);

 const attempt=await newIssue('mutation'),command=attempt.command,commandFile=attempt.file,target=attempt.output;
 const mutationBefore=await businessState(),blocker=await maintenance.connect();let locked;
 try{
  await blocker.query('BEGIN');await blocker.query('SELECT version FROM private.setup_recovery_management WHERE singleton FOR UPDATE');
  locked=await execute(target.file,commandFile,async()=>{
   await until(async()=>(await db.query(`SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event_type='Lock'
    AND query LIKE 'SELECT roomqc_setup_admin.issue(%'`,[names.issuer])).rowCount>0,'deadline-real-row-lock',15000);
  });
 }finally{await blocker.query('ROLLBACK');blocker.release()}
 denied(locked,'issue',command.key);assert.equal(locked.value.code,'SETUP_INSTALLER_OUTCOME_UNKNOWN');
 const lockError=locked.connections.flatMap(x=>x.errors).find(e=>e.code==='55P03');
 assert.ok(lockError&&lockError.elapsedMs>=800&&lockError.elapsedMs<3000);
 await cleanup('lock',locked);assert.deepEqual(await businessState(),mutationBefore);await absent(target.raw.publisher.outputFile);
 observations.push({case:'DL03',actualLockWait:true,serverSqlState:'55P03',serverElapsedMs:lockError.elapsedMs,allManagementStateRolledBack:true});
 check('deadline-real-server-lock-timeout-rolls-back-and-retains-original-issue-key');

 const witness=async()=>{const r=(await maintenance.query('SELECT last_value::text,is_called FROM private.installer_native_fault_witness')).rows[0];
  return r.is_called?Number(r.last_value):0};
 const witnessBefore=await witness();let statement;
 await maintenance.query("INSERT INTO private.installer_native_fault_flags(command_key,phase) VALUES($1,'statement')",[command.key]);
 try{
  statement=await execute(target.file,commandFile,async()=>{
   await until(async()=>(await db.query(`SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND wait_event='PgSleep'
    AND query LIKE 'SELECT roomqc_setup_admin.issue(%'`,[names.issuer])).rowCount>0,'deadline-real-server-sleep',15000);
  });
 }finally{await maintenance.query('DELETE FROM private.installer_native_fault_flags WHERE command_key=$1',[command.key])}
 denied(statement,'issue',command.key);assert.equal(statement.value.code,'SETUP_INSTALLER_OUTCOME_UNKNOWN');
 const statementError=statement.connections.flatMap(x=>x.errors).find(e=>e.code==='57014');
 assert.ok(statementError&&statementError.elapsedMs>=2700&&statementError.elapsedMs<4000);
 await cleanup('statement',statement);assert.equal(await witness(),witnessBefore+1);
 assert.deepEqual(await businessState(),mutationBefore);await absent(target.raw.publisher.outputFile);
 observations.push({case:'DL04',priorMutationsWitnessed:true,actualServerSleep:true,serverSqlState:'57014',serverElapsedMs:statementError.elapsedMs,allManagementStateRolledBack:true});
 check('deadline-real-statement-timeout-after-mutations-rolls-back-command-audit-credential-and-predecessor');

 const mutation=wire.arm('issue','hold'),lost=await execute(target.file,commandFile);
 denied(lost,'issue',command.key);assert.equal(lost.value.code,'SETUP_INSTALLER_OUTCOME_UNKNOWN');assert.ok(mutation.observed&&mutation.idle);
 await cleanup('committed-response',lost);const committed=await effects(command.key),committedState=await businessState();
 await absent(target.raw.publisher.outputFile);assert.equal(committedState.credentials.length,mutationBefore.credentials.length+1);
 observations.push({case:'DL05',actualCommittedResponseHeld:true,elapsedMs:lost.elapsedMs,singleCommandAuditCredential:true,outputAbsent:true});
 check('deadline-issue-query-timeout-after-commit-keeps-one-receipt-and-no-new-output');
 const recovered=await execute(target.file,commandFile);assert.equal(recovered.exit.code,0);assert.equal(recovered.value.nativeRpcVerified,true);
 assert.equal(recovered.value.credentialId,committed.credentialId);assert.deepEqual(await businessState(),committedState);
 const recoveredOutput=await readFile(target.raw.publisher.outputFile,'utf8');await cleanup('committed-replay',recovered);
 const replay=await execute(target.file,commandFile);assert.equal(replay.exit.code,0);assert.deepEqual(await businessState(),committedState);
 assert.equal(await readFile(target.raw.publisher.outputFile,'utf8'),recoveredOutput);await cleanup('exact-replay',replay);
 check('deadline-lock-statement-and-response-faults-recover-same-key-once-with-exact-file-and-expiry');

 const publishFile=await json('deadline-publish.json',{version:1,operation:'publish',key:command.key});
 for(const phase of ['before-receipt','after-rename']){
  const output=await outputConfig(phase);
  const held=phase==='before-receipt'?wire.arm('receipt','hold'):
   wire.arm('preflight','hold',{when:()=>existsSync(output.raw.publisher.outputFile)});
  const failed=await execute(output.file,publishFile);denied(failed,'publish',command.key);assert.ok(held.observed&&held.idle);
  await cleanup('publication-'+phase,failed);assert.deepEqual(await businessState(),committedState);
  let exactFile=null;
  if(phase==='before-receipt')await absent(output.raw.publisher.outputFile);
  else{
   exactFile=await readFile(output.raw.publisher.outputFile,'utf8');
   const value=JSON.parse(exactFile),claims=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
   assert.equal(claims.jti,committed.credentialId);assert.equal(claims.iat,committed.iat);assert.equal(claims.exp,committed.exp);
  }
  observations.push({case:'DL06',phase,actualResponseHeld:true,elapsedMs:failed.elapsedMs,outputPresent:phase==='after-rename',
   noFalseVerifiedSuccess:true,businessUnchanged:true});
  check('deadline-publication-'+phase+'-distinguishes-durable-db-and-file-without-false-ready');
  const resume=await execute(output.file,publishFile);assert.equal(resume.exit.code,0);assert.equal(resume.value.nativeRpcVerified,true);
  assert.equal(resume.value.credentialId,committed.credentialId);assert.deepEqual(await businessState(),committedState);
  if(exactFile!==null)assert.equal(await readFile(output.raw.publisher.outputFile,'utf8'),exactFile);
  await cleanup('publication-'+phase+'-replay',resume);
  check('deadline-publication-'+phase+'-replay-uses-original-receipt-without-extending-expiry');
 }

 const overall=await newIssue('overall'),overallBefore=await businessState(),delayed=wire.arm('issue','delay-after-commit',{delayMs:1500});
 const expired=await execute(overall.output.file,overall.file);denied(expired,'issue',overall.command.key);
 assert.ok(delayed.observed&&delayed.idle&&delayed.plan);const plan=delayed.plan;
 assert.ok(expired.elapsedMs>=44000&&expired.elapsedMs<55000);
 assert.ok(plan.responses.length>=20);assert.ok(plan.responses.some(r=>!r.forwarded));
 assert.ok(plan.responses.every(r=>r.serverElapsedMs!==null&&r.serverElapsedMs<3000&&r.scheduledDelayMs===1500));
 assert.ok(plan.responses.filter(r=>r.forwarded).every(r=>r.forwardElapsedMs>=1400&&r.forwardElapsedMs<3500));
 const forwarded=plan.responses.filter(r=>r.forwarded);
 assert.ok(forwarded.every(r=>r.clientQueryElapsedMs>0&&r.clientQueryElapsedMs<4000));
 await cleanup('overall',expired);
 const connectionLifetimes=expired.connections.map(r=>r.closedAt-r.connectedAt);
 assert.equal(connectionLifetimes.length,2);assert.ok(connectionLifetimes.every(ms=>ms>=43000&&ms<50000));
 assert.ok(expired.connections.every(r=>r.errors.length===0));
 const pending=plan.disconnects.filter(r=>r.queryPending);
 assert.ok(pending.length>0&&pending.every(r=>r.queryAgeMs!==null&&r.queryAgeMs>=0&&r.queryAgeMs<4000));
 const overallReceipt=await effects(overall.command.key),overallCommitted=await businessState();
 assert.equal(overallCommitted.credentials.length,overallBefore.credentials.length+1);
 observations.push({case:'DL07',actualCommittedResponseDelay:true,elapsedMs:expired.elapsedMs,connectionLifetimesMs:connectionLifetimes,
  responseCount:plan.responses.length,forwardedResponses:forwarded.length,maxForwardedQueryElapsedMs:Math.max(...forwarded.map(r=>r.clientQueryElapsedMs)),
  individualQueryBelowTimeout:true,pendingQueryAgeMs:pending.map(r=>r.queryAgeMs),responses:plan.responses,
  singleCommandAuditCredential:true,noFalseVerifiedSuccess:true,outputPresent:existsSync(overall.output.raw.publisher.outputFile)});
 check('deadline-real-45-second-session-timer-aborts-after-commit-while-each-query-remains-below-four-seconds');
 const overallRecovered=await execute(overall.output.file,overall.file);assert.equal(overallRecovered.exit.code,0);
 assert.equal(overallRecovered.value.nativeRpcVerified,true);assert.equal(overallRecovered.value.credentialId,overallReceipt.credentialId);
 assert.deepEqual(await businessState(),overallCommitted);await cleanup('overall-replay',overallRecovered);
 check('deadline-overall-expiry-recovers-original-command-key-and-credential-without-extra-effects');
 assert.equal(await outputUnchanged(),originalOutput);
 return {verified:true,groups:['IF11'],actualCliProcesses:true,actualPostgresFrames:true,serverSqlStatesVerified:true,
  rollbackWitnessVerified:true,overallTimerVerified:true,sameCommandRecovery:true,singleCommandAuditCredential:true,
  observations,cleanups,queryTimeoutMs:4000,connectTimeoutMs:4000,statementTimeoutMs:3000,lockTimeoutMs:1000,sessionTimeoutMs:45000,
  overallTimerStartsAfterConfigurationRead:true,noProductTimeoutsChanged:true};
}
