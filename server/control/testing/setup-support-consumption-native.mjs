// Actual canonical Auth RPC -> original directory transaction. Owned fixture
// barriers/SQL faults, real HTTP and the directory API LOGIN; no authorizer double.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runSupportConsumptionNativeChecks({db,directory,apiDirectory,database,apiRole,other,cluster,request,check,barrier,until,
 account,metadata,provision,loseAcceptanceResponse,loseControlResponse,restartSupportApi}){
 let checks=0;const scenarios=[];
 const mark=label=>{checks++;check('support-consumption-'+label)};
 const path='/api/control/admin/clusters/'+cluster.id+'/commands';
 const body=async()=>({operation:'close_admission',expectedVersion:Number((await directory.query(
  'SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),reason:'Owned Auth directory consumption',payload:{}});
 const state=async()=>Object.fromEntries(await Promise.all(['clusters','cluster_policies','control_commands','cluster_events','support_command_acceptances']
  .map(async table=>[table,(await directory.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t ORDER BY to_jsonb(t)::text')).rows])));
 const authRows=async(actor,key)=>(await db.query('SELECT * FROM private.platform_support_acceptances WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows;
 const consumption=async commandId=>(await directory.query('SELECT * FROM roomqc_control.support_command_acceptances WHERE control_command_id=$1',[commandId])).rows;
 const operator=async label=>{const a=await account('consumption-'+label);await provision(metadata(a));
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[a.id]);return a};
 async function verify(actor,key,result,expectedAuthRows=1){
  const rows=await consumption(result.data.commandId),accepted=await authRows(actor,key);assert.equal(rows.length,1);assert.equal(accepted.length,expectedAuthRows);
  const c=rows[0],a=accepted.find(a=>a.id===c.acceptance_id);assert.ok(a);assert.equal(c.acceptance_id,a.id);assert.equal(c.actor_id,a.actor_id);assert.equal(c.session_id,a.session_id);
  assert.equal(c.attempt_id,a.attempt_id);assert.equal(c.audience,a.audience);assert.equal(c.operation,a.operation);assert.equal(c.target,a.target);
  assert.equal(c.request_key,key);assert.equal(c.payload_hash,a.payload_sha256);assert.equal(c.authority_cluster_id,cluster.id);
  assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.cluster_events WHERE command_id=$1',[result.data.commandId])).rows[0].n,1);
  return c;
 }
 async function journal(actor,key){
  const intent=(await directory.query('SELECT * FROM roomqc_control.support_command_intents WHERE actor_id=$1 AND request_key=$2',[actor.id,key])).rows;
  assert.equal(intent.length,1);
  const rounds=(await directory.query('SELECT * FROM roomqc_control.support_command_attempts WHERE intent_id=$1 ORDER BY generation',[intent[0].id])).rows;
  const closures=(await directory.query('SELECT * FROM roomqc_control.support_attempt_closures WHERE intent_id=$1 ORDER BY generation',[intent[0].id])).rows;
  const results=(await directory.query('SELECT * FROM roomqc_control.support_intent_results WHERE intent_id=$1',[intent[0].id])).rows;
  return {intent:intent[0],rounds,closures,results};
 }
 assert.equal((await apiDirectory.query('SELECT current_user AS name')).rows[0].name,apiRole);
 const command=await body(),key=randomUUID().toUpperCase(),positive=await request(path,{token:other.token,body:command,key});assert.equal(positive.status,200);
 const saved=await verify(other,key,positive),beforeReplay=await state();
 for(let i=0;i<3;i++){const replay=await request(path,{token:other.token,body:command,key});assert.equal(replay.status,200);assert.equal(replay.data.commandId,positive.data.commandId)}
 assert.deepEqual(await state(),beforeReplay);assert.equal((await authRows(other,key)).length,1);
 mark('real-api-login-command-joins-canonical-auth-receipt-and-replay-one-effect');

 for(const sql of ['UPDATE roomqc_control.support_command_acceptances SET target=target','DELETE FROM roomqc_control.support_command_acceptances',
  'TRUNCATE roomqc_control.support_command_acceptances','UPDATE roomqc_control.support_authority_identity SET audience=audience',
  'INSERT INTO roomqc_control.support_authority_identity(singleton) VALUES(true)'])await assert.rejects(()=>apiDirectory.query(sql),{code:'42501'});
 const columns=['acceptance_id','protocol_version','audience','actor_id','authority_cluster_id','session_id','attempt_id','operation','target','request_key','payload_hash',
  'accepted_at_ms','observed_at_ms','expires_at_ms','control_command_id'];
 const insert=patch=>{const value={...saved,...patch};return apiDirectory.query('INSERT INTO roomqc_control.support_command_acceptances ('+columns.join(',')+') VALUES ('+
  columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(k=>value[k]))};
 await assert.rejects(()=>insert({}),{code:'23505'});
 // An adopted command rejects a different attempt at the journal fence before
 // the duplicate-parent UNIQUE constraint. Exact original reuse above still
 // reaches23505; neither path may append a second receipt.
 await assert.rejects(()=>insert({acceptance_id:randomUUID(),attempt_id:randomUUID()}),{code:'42501',message:'SUPPORT_INTENT_ATTEMPT_FENCED'});
 for(const patch of [{actor_id:randomUUID()},{target:'wrong-owned-target'},{request_key:key.toLowerCase()},{payload_hash:'f'.repeat(64)}])
  await assert.rejects(()=>insert({acceptance_id:randomUUID(),attempt_id:randomUUID(),...patch}),{code:'42501'});
 // An unconsumed parent inside a rolled-back API-role transaction avoids a
 // duplicate-parent UNIQUE error masking the audience foreign-key check.
 await apiDirectory.query('BEGIN');
 try{
  const parent=randomUUID(),requestKey=randomUUID();
  await apiDirectory.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,
   idempotency_key,payload_hash,expected_version,reason,status,result,finished_at)
   SELECT $1,actor_id,authority_cluster_id,operation,target_id,$2,payload_hash,expected_version,reason,status,result,finished_at
   FROM roomqc_control.control_commands WHERE id=$3`,[parent,requestKey,saved.control_command_id]);
  await assert.rejects(()=>insert({acceptance_id:randomUUID(),attempt_id:randomUUID(),control_command_id:parent,request_key:requestKey,audience:randomUUID()}),{code:'23503'});
 }finally{await apiDirectory.query('ROLLBACK')}
 assert.deepEqual(await state(),beforeReplay);
 mark('actual-api-role-denies-history-and-identity-writes-reuse-cross-parent-and-scope-mismatch');

 const lostKey=randomUUID(),lostBody=await body(),beforeLoss=await state();
 const lost=await loseAcceptanceResponse(()=>request(path,{token:other.token,body:lostBody,key:lostKey}));
 assert.equal(lost.value?.status,503);assert.deepEqual(await state(),beforeLoss);const orphan=(await authRows(other,lostKey));assert.equal(orphan.length,1);
 const recovered=await request(path,{token:other.token,body:lostBody,key:lostKey});assert.equal(recovered.status,200);
 const consumed=await verify(other,lostKey,recovered);assert.equal(consumed.acceptance_id,orphan[0].id);
 mark('real-auth-postcommit-response-loss-rolls-back-directory-and-valid-same-key-retry-consumes-original-receipt');

 let fault=false;const faultKey=randomUUID(),faultBody=await body(),beforeFault=await state();
 try{
  await directory.query(`CREATE FUNCTION roomqc_control.owned_consumption_fail() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN RAISE EXCEPTION 'OWNED_CONSUMPTION_FAULT' USING ERRCODE='22012';END $$;
   CREATE TRIGGER owned_consumption_fail BEFORE INSERT ON roomqc_control.support_command_acceptances
   FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_consumption_fail()`);fault=true;
  const failed=await request(path,{token:other.token,body:faultBody,key:faultKey});
  assert.equal(failed.status,503);assert.equal(failed.data.error,'CONTROL_UNAVAILABLE');assert.deepEqual(await state(),beforeFault);
  assert.equal((await authRows(other,faultKey)).length,1);
 }finally{if(fault)await directory.query('DROP TRIGGER owned_consumption_fail ON roomqc_control.support_command_acceptances; DROP FUNCTION roomqc_control.owned_consumption_fail()')}
 const retry=await request(path,{token:other.token,body:faultBody,key:faultKey});assert.equal(retry.status,200);await verify(other,faultKey,retry);
 mark('actual-consumption-sql-fault-rolls-back-effect-command-audit-and-valid-retry-uses-one-auth-row');

 async function blocked(label,actor,key,act){
  let holder,pending,result,trigger=false;
  try{
   await directory.query(`CREATE FUNCTION roomqc_control.owned_consumption_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
    CREATE TRIGGER owned_consumption_wait BEFORE INSERT ON roomqc_control.support_command_acceptances
    FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_consumption_wait()`);trigger=true;
   holder=await directory.connect();await holder.query('SELECT pg_advisory_lock($1)',[key]);
   const requestKey=randomUUID(),input=await body();pending=request(path,{token:actor.token,body:input,key:requestKey});
   await until(async()=>(await directory.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
    WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted) AS waiting`,[database,apiRole,key])).rows[0].waiting,
    'consumption-'+label+'-actual-api-lock',3500);
   barrier('support-consumption-'+label+'-actual-directory-insert-wait');
   const receipts=await authRows(actor,requestKey);assert.equal(receipts.length,1);
   assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.support_command_acceptances WHERE acceptance_id=$1',[receipts[0].id])).rows[0].n,0);
   await act({actor,requestKey,input,receipt:receipts[0]});
   result={actor,requestKey,input};
  }finally{
   if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[key])}finally{holder.release()}}
   try{if(pending){const outcome=await pending;if(result)result.outcome=outcome}}finally{
    if(trigger)await directory.query('DROP TRIGGER owned_consumption_wait ON roomqc_control.support_command_acceptances; DROP FUNCTION roomqc_control.owned_consumption_wait()');
   }
  }return result;
 }
 for(const [index,kind]of ['profile','role','session'].entries()){
  const actor=await operator('accept-first-'+kind);
  const result=await blocked('accept-first-'+kind,actor,738301+index,async()=>{
   assert.ok(JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url')).exp*1000>Date.now()+10000);
   if(kind==='profile')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);
   else if(kind==='role')await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[actor.id]);
   else await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[actor.session,actor.id]);
   assert.ok([401,403].includes((await request('/api/control/admin/clusters',{token:actor.token})).status));
  });
  assert.equal(result.outcome.status,200,'Exact command accepted before revocation must be allowed within the original handoff window');
  await verify(actor,result.requestKey,result.outcome);const after=await state();
  const lookup='/api/control/admin/clusters/'+cluster.id+'/command-result?operation=close_admission';
  const deniedLookup=await request(lookup,{token:actor.token,key:result.requestKey});
  assert.ok([401,403].includes(deniedLookup.status),JSON.stringify({kind,phase:'result',status:deniedLookup.status,error:deniedLookup.data?.error}));
  const deniedReplay=await request(path,{token:actor.token,body:result.input,key:result.requestKey});
  assert.ok([401,403].includes(deniedReplay.status),JSON.stringify({kind,phase:'replay',status:deniedReplay.status,error:deniedReplay.data?.error}));
  const deniedNew=await request(path,{token:actor.token,body:await body(),key:randomUUID()});
  assert.ok([401,403].includes(deniedNew.status),JSON.stringify({kind,phase:'new',status:deniedNew.status,error:deniedNew.data?.error}));
  assert.deepEqual(await state(),after);scenarios.push('accept-before-'+kind+'-revoke');
  mark('accept-before-'+kind+'-revoke-completes-original-only-new-commands-replay-and-result-reads-denied');
 }
 const expiring=await operator('session-expiry');await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '3 seconds' WHERE id=$1",[expiring.session]);
 const beforeExpiry=await state();
 const expired=await blocked('canonical-expiry-before-consumption',expiring,738305,async({receipt})=>{
  await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[receipt.expires_at])).rows[0].expired,'consumption-canonical-db-expiry',3500);
 });
 assert.equal(expired.outcome.status,403);assert.equal(expired.outcome.data.error,'CLUSTER_REQUEST_FAILED');assert.deepEqual(await state(),beforeExpiry);
 const expiredJournal=await journal(expiring,expired.requestKey);assert.equal(expiredJournal.rounds.length,1);assert.equal(expiredJournal.results.length,0);
 mark('real-canonical-session-expiry-rolls-back-and-current-authority-denies-new-recovery-round');

 // Exact original key/body survives Auth response loss, canonical expiry and
 // an actual API SIGKILL. No fake expiry/receipt/provider in this scenario.
 const recoveryKey=randomUUID(),recoveryBody=await body(),beforeRecovery=await state();
 const lostRecovery=await loseAcceptanceResponse(()=>request(path,{token:other.token,body:recoveryBody,key:recoveryKey}));
 assert.equal(lostRecovery.value.status,503);assert.deepEqual(await state(),beforeRecovery);
 const oldAcceptance=(await authRows(other,recoveryKey));assert.equal(oldAcceptance.length,1);
 const initial=await journal(other,recoveryKey);assert.equal(initial.rounds.length,1);assert.equal(initial.results.length,0);
 assert.equal(initial.rounds[0].attempt_id,oldAcceptance[0].attempt_id);
 const changed=await request(path,{token:other.token,key:recoveryKey,body:{...recoveryBody,reason:'Different content for original key'}});
 assert.equal(changed.status,409);assert.equal(changed.data.error,'IDEMPOTENCY_CONFLICT');assert.equal((await authRows(other,recoveryKey)).length,1);
 await restartSupportApi('api-SIGKILL-after-auth-commit-before-expired-command-recovery');
 await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[oldAcceptance[0].expires_at])).rows[0].expired,
  'recovery-original-acceptance-actual-canonical-expiry',7000);
 barrier('support-recovery-canonical-expired-original-receipt-observed');
 const recoveredMany=await Promise.all(Array.from({length:8},()=>request(path,{token:other.token,body:recoveryBody,key:recoveryKey})));
 for(const result of recoveredMany)assert.equal(result.status,200,'Real expired-command recovery must finish, not remain permanently expired');
 assert.equal(new Set(recoveredMany.map(r=>r.data.commandId)).size,1);
 const recoveredValue=recoveredMany[0],newConsumption=await verify(other,recoveryKey,recoveredValue,2),afterRecovery=await journal(other,recoveryKey);
 assert.equal(afterRecovery.intent.id,initial.intent.id);assert.equal(afterRecovery.intent.request_key,recoveryKey);
 assert.deepEqual(afterRecovery.rounds[0],initial.rounds[0]);assert.equal(afterRecovery.rounds.length,2);assert.equal(afterRecovery.closures.length,1);
 assert.equal(afterRecovery.rounds[1].previous_generation,0);assert.equal(afterRecovery.results.length,1);assert.equal(afterRecovery.results[0].generation,1);
 assert.equal(afterRecovery.results[0].acceptance_id,newConsumption.acceptance_id);
 assert.deepEqual((await authRows(other,recoveryKey)).find(a=>a.id===oldAcceptance[0].id),oldAcceptance[0]);
 const committed=await state();const stable=await request(path,{token:other.token,body:recoveryBody,key:recoveryKey});
 assert.equal(stable.data.commandId,recoveredValue.data.commandId);assert.deepEqual(await state(),committed);
 assert.equal((await authRows(other,recoveryKey)).length,2);
 mark('expired-auth-orphan-sigkill-eight-real-http-retries-one-linked-recovery-round-one-effect-and-immutable-old-receipt');

 const commitLossKey=randomUUID(),commitLossBody=await body();
 const dropped=await loseControlResponse(path,()=>request(path,{token:other.token,body:commitLossBody,key:commitLossKey}));
 assert.equal(dropped.networkError,true);
 const committedLoss=(await directory.query('SELECT id FROM roomqc_control.control_commands WHERE actor_id=$1 AND idempotency_key=$2',[other.id,commitLossKey])).rows;
 assert.equal(committedLoss.length,1);const beforeLossReplay=await state(),committedJournal=await journal(other,commitLossKey);
 assert.equal(committedJournal.rounds.length,1);assert.equal(committedJournal.results.length,1);
 await restartSupportApi('api-SIGKILL-after-directory-commit-and-lost-client-response');
 const readLoss=await request('/api/control/admin/clusters/'+cluster.id+'/command-result?operation=close_admission',{token:other.token,key:commitLossKey});
 assert.equal(readLoss.status,200);assert.equal(readLoss.data.commandId,committedLoss[0].id);
 const replayLoss=await request(path,{token:other.token,body:commitLossBody,key:commitLossKey});
 assert.equal(replayLoss.status,200);assert.equal(replayLoss.data.commandId,committedLoss[0].id);
 assert.deepEqual(await state(),beforeLossReplay);assert.deepEqual(await journal(other,commitLossKey),committedJournal);
 assert.equal((await authRows(other,commitLossKey)).length,1);
 mark('real-directory-postcommit-http-response-loss-sigkill-result-and-replay-do-not-request-a-new-acceptance');

 const deniedRecovery=await operator('recovery-revoked'),deniedKey=randomUUID(),deniedBody=await body(),beforeDeniedRecovery=await state();
 const deniedLoss=await loseAcceptanceResponse(()=>request(path,{token:deniedRecovery.token,body:deniedBody,key:deniedKey}));
 assert.equal(deniedLoss.value.status,503);const deniedJournal=await journal(deniedRecovery,deniedKey);
 await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[deniedRecovery.id]);
 const deniedRetry=await request(path,{token:deniedRecovery.token,body:deniedBody,key:deniedKey});
 assert.equal(deniedRetry.status,403);assert.deepEqual(await journal(deniedRecovery,deniedKey),deniedJournal);
 assert.equal((await authRows(deniedRecovery,deniedKey)).length,1);assert.deepEqual(await state(),beforeDeniedRecovery);
 mark('real-role-revocation-after-auth-orphan-denies-a-recovery-generation-with-zero-effects');
 assert.equal((await directory.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state<>'idle'",[database,apiRole])).rows[0].n,0);
 mark('no-active-or-idle-transaction-api-session-after-consumption-faults');
 return {verified:true,scope:'native-admin-cluster-command-acceptance-consumption',checks,scenarios,actualAuth:true,actualHttp:true,actualDirectoryApiLogin:true,
  actualResponseLoss:true,actualSqlRollback:true,actualCanonicalExpiry:true,syntheticAcceptanceProvider:false,
  durableRecovery:{verified:true,originalKeyPreserved:true,canonicalExpiry:true,apiSigkill:true,concurrentHttpRetries:8,
   oldAcceptanceImmutable:true,oneLinkedRound:true,committedResultReadWithoutReexecution:true,currentAuthorityRequired:true,
   scope:'cluster-close-admission; other mutation families still require fault/recovery native coverage'},
  semantics:'Only the exact command accepted before revocation may complete during its original handoff window; current authority is required for new commands and result/replay reads.',
  limitations:['Fresh business587/directory21 only; not a populated business upgrade.',
   'Directory constraints trust the runtime verified gateway; the DB is not a cryptographic verifier of an arbitrary receipt.',
   'Durable expired recovery here is cluster-command only; legacy reconcile replay, other mutation families, independent two-API-process expiry and worker claim/RPC/settle require separate proof.',
   'This is local diagnostic evidence, not R11/BG02/product acceptance, independent A/B, staging or full-default/rebuild.']};
}
