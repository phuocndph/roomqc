// Exact-owned diagnostic: real API/Auth recovery paused AFTER the SQL guard,
// before closure/generation publication. The SQL writer is an explicit protocol
// probe using a genuine captured receipt, not an old application binary.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runSupportPublicationNativeChecks({db,directory,apiDirectory,database,apiRole,actor,
 factory,journal,verify,check,barrier,until,loseAcceptanceResponse,restartSupportApi,
 requestPrimary,requestReplica,processes}){
 let checks=0,sequence=0;const cases=[];
 const mark=label=>{checks++;check('support-publication-'+label)};
 const waitingOnGate=lock=>until(async()=>(await directory.query(`SELECT a.pid,a.query FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
  WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted`,[database,apiRole,lock])).rows[0],
  'publication-gate-'+lock,3500);
 const blockedBy=(pid,exclude=[])=>until(async()=>(await directory.query(`SELECT a.pid,a.query FROM pg_stat_activity a
  WHERE a.datname=$1 AND a.usename=$2 AND a.pid<>$3 AND NOT(a.pid=ANY($4::integer[])) AND a.wait_event_type='Lock'
   AND $3=ANY(pg_catalog.pg_blocking_pids(a.pid))`,[database,apiRole,pid,exclude])).rows[0],
  'publication-blocked-by-'+pid,3500);
 const receiptColumns=['acceptance_id','protocol_version','audience','actor_id','authority_cluster_id','session_id','attempt_id',
  'operation','target','request_key','payload_hash','accepted_at_ms','observed_at_ms','expires_at_ms'];
 const receiptValues=(a,intent)=>[a.acceptanceId,a.protocolVersion,a.audience,a.actorId,intent.authority_cluster_id,a.sessionId,a.attemptId,
  a.operation,a.target,a.requestKey,a.payloadSha256,a.acceptedAtMs,a.observedAtMs,a.expiresAtMs];
 const parentInfo=kind=>kind==='control'?{table:'control_commands',column:'control_command_id'}:
  kind==='recheck'?{table:'workspace_recheck_commands',column:'recheck_command_id'}:{table:'support_actions',column:'support_action_id'};
 const insertReceipt=(client,fixture,intent,receipt,parent)=>{
  const {column}=parentInfo(fixture.kind),columns=[...receiptColumns,column],values=[...receiptValues(receipt,intent),parent];
  return client.query('INSERT INTO roomqc_control.support_command_acceptances ('+columns.join(',')+') VALUES ('+
   values.map((_,i)=>'$'+(i+1)).join(',')+')',values);
 };
 async function oldProtocolProbe(fixture,orphan,receipt){
  const {table}=parentInfo(fixture.kind),intent=orphan.intent;
  const filter=fixture.kind==='support'?"outcome='reconciled'":'operation=$2';
  const args=fixture.kind==='support'?[actor.id]:[actor.id,fixture.operation];
  const template=(await directory.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t WHERE actor_id=$1 AND '+filter+
   ' ORDER BY created_at DESC LIMIT 1',args)).rows[0]?.row;assert(template,'A previously verified successful family command is required');
  const id=randomUUID(),row={...template,id,actor_id:actor.id,authority_cluster_id:intent.authority_cluster_id,payload_hash:intent.payload_hash};
  if(fixture.kind==='control')Object.assign(row,{operation:intent.operation,target_id:intent.target,idempotency_key:intent.request_key});
  else if(fixture.kind==='recheck')Object.assign(row,{workspace_id:intent.target,idempotency_key:intent.request_key});
  else Object.assign(row,{workspace_id:intent.target,command_key:intent.request_key,request_id:randomUUID()});
  const client=await apiDirectory.connect();let finished=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='5s'");
   const pid=Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   await client.query('INSERT INTO roomqc_control.'+table+' SELECT * FROM jsonb_populate_record(NULL::roomqc_control.'+table+',$1::jsonb)',[JSON.stringify(row)]);
   // Deliberately omit the current namespace advisory fence: this probes the
   // database fence against a late writer with the original canonical receipt.
   const pending=insertReceipt(client,fixture,intent,receipt,id).then(()=>({unexpectedSuccess:true}),error=>({code:error.code,message:error.message}));
   return {pid,pending,finish:async()=>{if(finished)return;finished=true;await pending;try{await client.query('ROLLBACK')}finally{client.release()}}};
  }catch(error){try{await client.query('ROLLBACK')}finally{client.release()}throw error}
 }
 for(const family of ['execute','register','alert','recheck','legacy'])for(const stage of ['closure','generation'])for(const outcome of ['commit','kill']){
  const mode='pub-'+stage[0]+'-'+outcome,fixture=await factory(family,mode),key=randomUUID(),lock=738420+sequence++;
  const lost=await loseAcceptanceResponse(()=>requestPrimary(fixture.path,{token:actor.token,body:fixture.body,key}));
  assert.equal(lost.value.status,503);const receipt=lost.acceptance,orphan=await journal(key,fixture);
  assert.equal(orphan.rounds.length,1);assert.equal(orphan.auth.length,1);assert.equal(orphan.results.length,0);assert.equal(orphan.consumed.length,0);
  assert.equal(receipt.acceptanceId,orphan.auth[0].id);assert.equal(receipt.attemptId,orphan.rounds[0].attempt_id);
  await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[orphan.auth[0].expires_at])).rows[0].expired,
   family+'-'+mode+'-canonical-expiry',7000);
  barrier('support-publication-'+family+'-'+mode+'-canonical-expiry');
  const table=stage==='closure'?'support_attempt_closures':'support_command_attempts',guard=stage==='closure'?'support_closure_insert':'support_attempt_insert';
  let installed=false,holder,first,second,probe,responses,leaderPid,contenderPid,oldWriterPid,successorGate=false,originalGateReleased=false;
  try{
   // PostgreSQL fires same-kind triggers alphabetically. zz_ sorts AFTER the
   // actual guard, so a witnessed pause proves the no-effect/generation check
   // has run while the parent intent row remains locked in this transaction.
   await directory.query(`CREATE FUNCTION roomqc_control.owned_publication_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${lock});RETURN NEW;END $$;
    CREATE TRIGGER zz_owned_publication_wait BEFORE INSERT ON roomqc_control.${table} FOR EACH ROW
     WHEN (NEW.intent_id='${orphan.intent.id}'::uuid AND NEW.generation=${stage==='closure'?0:1})
     EXECUTE FUNCTION roomqc_control.owned_publication_wait()`);installed=true;
   const names=(await directory.query(`SELECT tgname FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname`,['roomqc_control.'+table])).rows.map(r=>r.tgname);
   assert(names.indexOf(guard)>=0&&names.indexOf(guard)<names.indexOf('zz_owned_publication_wait'));
   holder=await directory.connect();await holder.query('SELECT pg_advisory_lock($1)',[lock]);
   first=requestPrimary(fixture.path,{token:actor.token,body:fixture.body,key});
   const leader=await waitingOnGate(lock);leaderPid=leader.pid;assert(leader.query.includes('INSERT INTO roomqc_control.'+table));
   assert.deepEqual(await journal(key,fixture),orphan,'Closure and successor must not be visible before the publishing transaction commits');
   second=requestReplica(fixture.path,{token:actor.token,body:fixture.body,key});
   const contender=await blockedBy(leader.pid);contenderPid=contender.pid;assert(contender.query.includes('pg_advisory_lock'));
   barrier('support-publication-'+family+'-'+mode+'-two-api-backends-before-'+stage+'-publication');
   if(outcome==='commit'){
    probe=await oldProtocolProbe(fixture,orphan,receipt);oldWriterPid=probe.pid;
    const old=await blockedBy(leader.pid,[contender.pid]);assert.equal(old.pid,probe.pid);
    assert(old.query.includes('INSERT INTO roomqc_control.support_command_acceptances'));
    barrier('support-publication-'+family+'-'+stage+'-original-receipt-sql-writer-blocked-after-real-guard');
   }else{
    // A killed client can leave its blocked PG backend alive until the query
    // returns. Keep the successor on a DIFFERENT owned gate, then let the old
    // query return and observe its actual rollback/disconnection. Otherwise a
    // second observation of the first gate could mistake the old backend for
    // the successor, or waiting for it could expire the contender's deadline.
    await holder.query('SELECT pg_advisory_lock($1)',[lock+100]);successorGate=true;
    await directory.query(`CREATE OR REPLACE FUNCTION roomqc_control.owned_publication_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
     BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${lock+100});RETURN NEW;END $$`);
    const before=processes();await restartSupportApi('api-SIGKILL-'+family+'-before-'+stage+'-publication');
    const after=processes();assert.notEqual(after.primary,before.primary);assert.equal(after.secondary,before.secondary);
    assert.deepEqual(await journal(key,fixture),orphan,'Killed client does not imply its blocked PostgreSQL transaction is already gone');
    await holder.query('SELECT pg_advisory_unlock($1)',[lock]);originalGateReleased=true;
    const recovered=await waitingOnGate(lock+100);assert.equal(recovered.pid,contender.pid);assert.notEqual(recovered.pid,leader.pid);
    await until(async()=>(await directory.query('SELECT NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND pid=$2) AS gone',
     [database,leader.pid])).rows[0].gone,'publication-original-pg-backend-gone-'+family+'-'+stage,3500);
    assert.deepEqual(await journal(key,fixture),orphan,'SIGKILL must roll back unpublished closure and successor');
    barrier('support-publication-'+family+'-'+stage+'-successor-after-kill-rechecks-unpublished-generation');
   }
  }finally{
   if(holder){try{
    if(!originalGateReleased)await holder.query('SELECT pg_advisory_unlock($1)',[lock]);
    if(successorGate)await holder.query('SELECT pg_advisory_unlock($1)',[lock+100]);
   }finally{holder.release()}}
   try{
    // The rejected old writer must roll its uncommitted parent back before
    // the winning API can acquire the same command-key unique index entry.
    if(probe){try{assert.deepEqual(await probe.pending,{code:'42501',message:'SUPPORT_INTENT_ATTEMPT_FENCED'})}finally{await probe.finish()}}
    responses=await Promise.all([first,second].filter(Boolean));
   }finally{
    if(installed)await directory.query('DROP TRIGGER zz_owned_publication_wait ON roomqc_control.'+table+'; DROP FUNCTION roomqc_control.owned_publication_wait()');
   }
  }
  assert.equal(responses.length,2);const winner=responses[1];assert.ok([200,202].includes(winner.status),family+' '+mode+': '+winner.data?.error);
  if(outcome==='commit'){assert.ok([200,202].includes(responses[0].status));assert.equal(responses[0].data.commandId,winner.data.commandId)}
  else assert(responses[0].networkError||responses[0].status===503,'Killed API must not report a committed result');
  const saved=await verify(key,fixture,2,winner);assert.deepEqual(saved.rounds[0],orphan.rounds[0]);
  assert.deepEqual(saved.auth.find(a=>a.id===orphan.auth[0].id),orphan.auth[0]);assert.equal(saved.rounds[1].previous_generation,0);
  // After publication, even a direct API-role INSERT with the actual old
  // receipt must fail at the journal fence, before duplicate-parent checks.
  await assert.rejects(()=>insertReceipt(apiDirectory,fixture,saved.intent,receipt,saved.parents[0].id),
   {code:'42501',message:'SUPPORT_INTENT_ATTEMPT_FENCED'});
  for(const invoke of [requestPrimary,requestReplica]){
   const replay=await invoke(fixture.path,{token:actor.token,body:fixture.body,key});assert.equal(replay.data.commandId,winner.data.commandId);
   const result=await invoke(fixture.resultPath,{token:actor.token,key});assert.equal(result.status,200);assert.equal(result.cache,'no-store');
   assert.equal(result.data.commandId,winner.data.commandId);
  }
  assert.deepEqual(await journal(key,fixture),saved);
  assert.equal((await directory.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state<>'idle'",[database,apiRole])).rows[0].n,0);
  mark(family+'-'+mode+'-one-linked-generation-one-effect-old-receipt-fenced');
  cases.push({family,stage,outcome,leaderPid,contenderPid,...(oldWriterPid?{oldWriterPid}:{}),twoApiWaitWitness:true,
   guardBeforeBarrier:true,unpublishedStateInvisible:true,originalReceiptImmutable:true,oneSuccessor:true,oneEffect:true,
   oldSqlWriterWaitedAndDenied:outcome==='commit',lateOldReceiptDenied:true,actualSigkill:outcome==='kill'});
 }
 return {verified:true,checks,cases,actualLinuxApiProcesses:2,apiPoolMaxPerProcess:1,actualAuth:true,actualHttp:true,
  actualCanonicalExpiry:true,actualDbContention:true,publicationStages:['after-no-effect-guard-before-closure','after-generation-guard-before-attempt-insert'],
  limits:['The old writer is an explicit SQL protocol probe with a genuine captured receipt and a fixture parent; not an old application binary or gateway handoff test.',
   'Old-writer-first commit/rollback, simultaneous initial intent creation and operational fencing of incompatible binaries remain separate requirements.',
   'Fresh business587/directory21 on one owned PostgreSQL host; not full-default/rebuild, VPS, A/B, load, DR or product acceptance.']};
}
