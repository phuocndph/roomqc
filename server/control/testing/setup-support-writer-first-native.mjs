// Exact-owned diagnostic. Real HTTP writers hold the production consumption
// fence; an independent API-role SQL closure competes without the namespace
// advisory lock. This is not an assertion about every historical binary.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runSupportWriterFirstNativeChecks({db,directory,apiDirectory,database,apiRole,actor,
 factory,journal,verify,check,barrier,until,requestPrimary,requestReplica,restartSupportApi}){
 let sequence=0,last;const cases=[];
 const waiting=lock=>until(async()=>(await directory.query(`SELECT a.pid,a.query FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
  WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted`,
 [database,apiRole,lock])).rows[0],'writer-first-gate-'+lock,3500);
 const blockedBy=(pid,exclude=[])=>until(async()=>(await directory.query(`SELECT a.pid,a.query FROM pg_stat_activity a
  WHERE a.datname=$1 AND a.usename=$2 AND a.pid<>$3 AND NOT(a.pid=ANY($4::integer[]))
   AND a.wait_event_type='Lock' AND $3=ANY(pg_catalog.pg_blocking_pids(a.pid))`,
 [database,apiRole,pid,exclude])).rows[0],'writer-first-contender-'+pid,3500);
 const result=async(fixture,key,winner)=>{
  for(const invoke of [requestPrimary,requestReplica]){
   const replay=await invoke(fixture.path,{token:actor.token,body:fixture.body,key});
   assert.ok([200,202].includes(replay.status),fixture.operation+': '+replay.data?.error);
   assert.equal(replay.data.commandId,winner.data.commandId);
   const found=await invoke(fixture.resultPath,{token:actor.token,key});
   assert.equal(found.status,200);assert.equal(found.cache,'no-store');assert.equal(found.data.commandId,winner.data.commandId);
  }
 };
 const closeProbe=async intent=>{
  const client=await apiDirectory.connect();let released=false;
  try{
   await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='5s'");
   const pid=Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   // No namespace/global advisory lock: the row fence must protect the guard
   // even from a protocol writer that does not understand the coordinator.
   const pending=client.query(`INSERT INTO roomqc_control.support_attempt_closures(intent_id,generation,reason)
    VALUES($1,0,'acceptance_expired_no_effect')`,[intent.id]).then(()=>({inserted:true}),error=>({code:error.code,message:error.message}));
   return {pid,pending,finish:async()=>{if(released)return;released=true;await pending;try{await client.query('ROLLBACK')}finally{client.release()}}};
  }catch(error){try{await client.query('ROLLBACK')}finally{client.release()}throw error}
 };
 for(const family of ['execute','register','alert','recheck','legacy'])for(const outcome of ['commit','rollback']){
  const fixture=await factory(family,'writer-'+outcome),key=randomUUID(),lock=738700+sequence++;
  let holder,installed=false,first,second,probe,firstResponse,secondResponse,before,writerPid,probePid,contenderPid;
  try{
   await directory.query(`CREATE FUNCTION roomqc_control.owned_writer_first_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN IF EXISTS(SELECT 1 FROM roomqc_control.support_command_intents WHERE id=NEW.intent_id AND request_key='${key}') THEN
     PERFORM pg_catalog.pg_advisory_xact_lock(${lock});
     ${outcome==='rollback'?"RAISE EXCEPTION 'OWNED_WRITER_FIRST_ROLLBACK' USING ERRCODE='22012';":''}
    END IF;RETURN NEW;END $$;
    CREATE TRIGGER zz_owned_writer_first_wait BEFORE INSERT ON roomqc_control.support_intent_results FOR EACH ROW
     EXECUTE FUNCTION roomqc_control.owned_writer_first_wait()`);installed=true;
   const triggers=(await directory.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='roomqc_control.support_intent_results'::regclass
    AND NOT tgisinternal ORDER BY tgname`)).rows.map(r=>r.tgname);
   assert(triggers.indexOf('support_result_insert')>=0&&triggers.indexOf('support_result_insert')<triggers.indexOf('zz_owned_writer_first_wait'));
   holder=await directory.connect();await holder.query('SELECT pg_advisory_lock($1)',[lock]);
   first=requestPrimary(fixture.path,{token:actor.token,body:fixture.body,key});
   const writer=await waiting(lock);writerPid=writer.pid;assert(writer.query.includes('INSERT INTO roomqc_control.support_intent_results'));
   before=await journal(key,fixture);assert.equal(before.rounds.length,1);assert.equal(before.auth.length,1);
   assert.equal(before.results.length,0);assert.equal(before.consumed.length,0);assert.equal(before.closures.length,0);
   assert.equal(before.parents.filter(p=>fixture.kind!=='support'||p.outcome==='reconciled').length,0);
   probe=await closeProbe(before.intent);probePid=probe.pid;
   const closure=await blockedBy(writer.pid);assert.equal(closure.pid,probe.pid);
   assert(closure.query.includes('INSERT INTO roomqc_control.support_attempt_closures'));
   barrier('support-writer-first-'+family+'-'+outcome+'-real-consumer-holds-intent-before-independent-closure');
   if(outcome==='commit'){
    second=requestReplica(fixture.path,{token:actor.token,body:fixture.body,key});
    const contender=await blockedBy(writer.pid,[probe.pid]);contenderPid=contender.pid;
    // Legacy action creation serializes on the actual workspace before it
    // enters the coordinator. Do not mistake this valid earlier row wait for
    // a missing namespace fence; the blocker must still be this exact writer.
    assert(family==='legacy'
     ?contender.query.includes('roomqc_control.workspaces')&&contender.query.includes('FOR UPDATE')
     :contender.query.includes('pg_advisory_lock'),JSON.stringify({family,query:contender.query}));
    barrier('support-writer-first-'+family+'-commit-other-api-waits-on-original-key');
   }
   assert.deepEqual(await journal(key,fixture),before,'No consumption/effect/result may be visible while the first writer is uncommitted');
  }finally{
   if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[lock])}finally{holder.release()}}
   try{
    if(probe){try{
     const observed=await probe.pending;
     assert.deepEqual(observed,outcome==='commit'?{code:'42501',message:'SUPPORT_INTENT_EFFECT_ALREADY_COMMITTED'}:{inserted:true});
    }finally{await probe.finish()}}
    if(first)firstResponse=await first;if(second)secondResponse=await second;
   }finally{
    if(installed)await directory.query('DROP TRIGGER zz_owned_writer_first_wait ON roomqc_control.support_intent_results; DROP FUNCTION roomqc_control.owned_writer_first_wait()');
   }
  }
  if(outcome==='commit'){
   for(const response of [firstResponse,secondResponse])assert.ok([200,202].includes(response.status),family+': '+response.data?.error);
   assert.equal(firstResponse.data.commandId,secondResponse.data.commandId);
   const saved=await verify(key,fixture,1,firstResponse);
   assert.deepEqual(saved.rounds,before.rounds);assert.deepEqual(saved.auth,before.auth);
   await result(fixture,key,firstResponse);assert.deepEqual(await journal(key,fixture),saved);
  }else{
   assert.equal(firstResponse.status,503);
   const rolledBack=await journal(key,fixture);assert.equal(rolledBack.results.length,0);assert.equal(rolledBack.consumed.length,0);
   assert.equal(rolledBack.closures.length,0,'The independent closure probe must roll its diagnostic INSERT back');
   assert.equal(rolledBack.parents.filter(p=>fixture.kind!=='support'||p.outcome==='reconciled').length,0);
   await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[before.auth[0].expires_at])).rows[0].expired,
    family+'-writer-rollback-canonical-expiry',7000);
   barrier('support-writer-first-'+family+'-rollback-actual-canonical-expiry');
   const recovered=await Promise.all([requestPrimary(fixture.path,{token:actor.token,body:fixture.body,key}),
    requestReplica(fixture.path,{token:actor.token,body:fixture.body,key})]);
   for(const response of recovered)assert.ok([200,202].includes(response.status),family+': '+response.data?.error);
   assert.equal(recovered[0].data.commandId,recovered[1].data.commandId);
   const saved=await verify(key,fixture,2,recovered[0]);assert.deepEqual(saved.rounds[0],before.rounds[0]);
   assert.deepEqual(saved.auth.find(a=>a.id===before.auth[0].id),before.auth[0]);
   await result(fixture,key,recovered[0]);assert.deepEqual(await journal(key,fixture),saved);
  }
  check('support-writer-first-'+family+'-'+outcome+'-guard-observes-actual-terminal-and-one-effect');
  cases.push({family,scenario:'writer-first',outcome,writerPid,probePid,...(contenderPid?{contenderPid}:{}),
   actualHttpWriter:true,actualAuthReceipt:true,rowFenceWitness:true,guardAfterConsumer:true,
   ...(outcome==='commit'?{contenderFence:family==='legacy'?'workspace-row-before-coordinator':'original-command-namespace'}:{}),
   independentClosure:outcome==='commit'?'denied-after-effect-commit':'allowed-after-effect-rollback-and-probe-rolled-back',
   actualCanonicalExpiry:outcome==='rollback',oneEffect:true,immutableOriginalReceipt:true});
 }
 for(const family of ['execute','register','alert','recheck','legacy'])for(const payload of ['same','conflict']){
  const fixture=await factory(family,'initial-'+payload),key=randomUUID(),lock=738700+sequence++;
  let holder,installed=false,first,second,responses,leaderPid,contenderPid,earlyConflict=false;
  try{
   await directory.query(`CREATE FUNCTION roomqc_control.owned_initial_intent_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${lock});RETURN NEW;END $$;
    CREATE TRIGGER owned_initial_intent_wait BEFORE INSERT ON roomqc_control.support_command_intents FOR EACH ROW
     WHEN (NEW.request_key='${key}') EXECUTE FUNCTION roomqc_control.owned_initial_intent_wait()`);installed=true;
   holder=await directory.connect();await holder.query('SELECT pg_advisory_lock($1)',[lock]);
   first=requestPrimary(fixture.path,{token:actor.token,body:fixture.body,key});
   const leader=await waiting(lock);leaderPid=leader.pid;assert(leader.query.includes('INSERT INTO roomqc_control.support_command_intents'));
   const originalState=async()=>({intents:(await directory.query('SELECT * FROM roomqc_control.support_command_intents WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows,
    auth:(await db.query('SELECT * FROM private.platform_support_acceptances WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows});
   assert.deepEqual(await originalState(),{intents:[],auth:[]});
   second=requestReplica(fixture.path,{token:actor.token,body:payload==='same'?fixture.body:{...fixture.body,reason:fixture.body.reason+' changed'},key});
   if(family==='legacy'&&payload==='conflict'){
    // startSupportAction already has the durable original payload binding.
    // It must reject a changed payload without waiting for publication of an
    // intent. The primary remains paused and neither Auth nor intent exists.
    const denied=await second;assert.equal(denied.status,409);assert.equal(denied.data.error,'IDEMPOTENCY_CONFLICT');
    assert.equal((await waiting(lock)).pid,leader.pid);earlyConflict=true;
   }else{
    const contender=await blockedBy(leader.pid);contenderPid=contender.pid;assert(contender.query.includes('pg_advisory_lock'));
   }
   assert.deepEqual(await originalState(),{intents:[],auth:[]});
   barrier('support-initial-intent-'+family+'-'+payload+(earlyConflict?'-changed-payload-denied-before-original-publication':'-two-live-api-sessions-before-original-publication'));
  }finally{
   if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[lock])}finally{holder.release()}}
   try{responses=await Promise.all([first,second].filter(Boolean))}finally{
    if(installed)await directory.query('DROP TRIGGER owned_initial_intent_wait ON roomqc_control.support_command_intents; DROP FUNCTION roomqc_control.owned_initial_intent_wait()');
   }
  }
  assert.equal(responses.length,2);assert.ok([200,202].includes(responses[0].status),family+': '+responses[0].data?.error);
  if(payload==='same'){assert.ok([200,202].includes(responses[1].status));assert.equal(responses[0].data.commandId,responses[1].data.commandId)}
  else {
   assert.equal(responses[1].status,409);
   // Recheck exposes its existing operation-specific conflict contract; it
   // must not be renamed or accepted as a generic503 just to fit this matrix.
   assert.equal(responses[1].data.error,family==='recheck'?'WORKSPACE_RECHECK_KEY_CONFLICT':'IDEMPOTENCY_CONFLICT');
  }
  const saved=await verify(key,fixture,1,responses[0]);await result(fixture,key,responses[0]);
  assert.deepEqual(await journal(key,fixture),saved);
  last={fixture,key,saved,response:responses[0]};
  check('support-initial-intent-'+family+'-'+payload+'-one-original-one-auth-one-effect');
  cases.push({family,scenario:'initial-intent',payload,leaderPid,...(contenderPid?{contenderPid}:{}),twoApiWaitWitness:!earlyConflict,
   earlyPayloadConflictDeniedBeforeIntent:earlyConflict,
   unpublishedIntentInvisible:true,noAuthBeforeOriginalPublication:true,oneIntent:true,oneGeneration:true,oneEffect:true,
   changedPayloadDenied:payload==='conflict',...(payload==='conflict'?{conflictCode:responses[1].data.error}:{})});
 }
 // This matrix adds a distinct group of legitimate traffic to the existing
 // revocation suite. Keep production's fixed120/min limiter intact; finish
 // this group with a graceful restart and witness its durable result before
 // the next independent group starts. No in-flight command is interrupted.
 await restartSupportApi('api-graceful-restart-after-writer-first-before-independent-revocation-suite',{graceful:true});
 await result(last.fixture,last.key,last.response);assert.deepEqual(await journal(last.key,last.fixture),last.saved);
 check('support-writer-first-last-result-survives-graceful-api-restart');
 return {verified:true,checks:cases.length,cases,postMatrixGracefulRestart:true,postRestartResultPreserved:true,
  actualLinuxApiProcesses:2,apiPoolMaxPerProcess:1,actualAuth:true,actualHttp:true,
  limits:['The first writer is the current API, paused after the real consumption/result guard. The competing closure is an API-role SQL probe without the coordinator advisory fence; this is not an old deployed image or proof of every legacy service.',
   'Rollback uses a scoped SQL trigger exception in the actual writer transaction; expiry is observed on canonical Auth before recovery. It is not process death or a physical host fault.',
   'Fresh owned business587/directory21 on one PostgreSQL host; not full-default/rebuild, security signoff, VPS, A/B, load, DR or product acceptance.']};
}
