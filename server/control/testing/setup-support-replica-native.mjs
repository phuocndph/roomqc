// Two independent Linux API processes, real canonical Auth and SQL fences.
// Only the surrounding exact-owned sandbox may call this diagnostic.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alertTransaction,syncHealthAlerts} from '../alerts.mjs';
import {runSupportPublicationNativeChecks} from './setup-support-publication-native.mjs';
import {runSupportWriterFirstNativeChecks} from './setup-support-writer-first-native.mjs';

export async function runSupportReplicaNativeChecks({db,directory,apiDirectory,database,apiRole,actor,cluster,legacy,recheckItem,
 registrationInventory,request,check,barrier,until,snapshot,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
 holdAcceptanceResponse,withSupportReplica}){
 let checks=0,generation=100;const families=[];
 const mark=label=>{checks++;check('support-replicas-'+label)};
 const token=actor.token;
 const clusterBody=async()=>({operation:'close_admission',expectedVersion:Number((await directory.query(
  'SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),reason:'Owned two API recovery',payload:{}});
 const factory=async(family,mode)=>{
  if(family==='execute')return {kind:'control',operation:'close_admission',path:'/api/control/admin/clusters/'+cluster.id+'/commands',
   body:await clusterBody(),resultPath:'/api/control/admin/clusters/'+cluster.id+'/command-result?operation=close_admission'};
  if(family==='register'){
   const entry=registrationInventory.find(e=>e.id==='native-register-replica-'+mode);assert(entry);
   return {kind:'control',operation:'register_cluster',path:'/api/control/admin/clusters/register',
    body:{id:entry.id,hostId:entry.hostId,backendKind:entry.backendKind,endpointRef:entry.id,credentialRef:entry.credentialRef,
     expectedVersion:1,reason:'Owned two API register '+mode},
    resultPath:'/api/control/admin/clusters/'+entry.id+'/command-result?operation=register_cluster'};
  }
  if(family==='alert'){
   // A new alert episode per scenario; never reset acknowledgement history.
   await alertTransaction(directory,c=>syncHealthAlerts(c,cluster.id,{reasonCodes:[],sourceGeneration:generation++},randomUUID()),{lock:true});
   await alertTransaction(directory,c=>syncHealthAlerts(c,cluster.id,{reasonCodes:['CPU_CRITICAL'],sourceGeneration:generation++},randomUUID()),{lock:true});
   const alert=(await directory.query("SELECT id,row_version FROM roomqc_control.alerts WHERE resource_id=$1 AND type='CPU_CRITICAL' AND resolved_at IS NULL",[cluster.id])).rows;
   assert.equal(alert.length,1);const target=alert[0];
   return {kind:'control',operation:'acknowledge_alert',path:'/api/control/admin/alerts/'+target.id+'/acknowledge',
    body:{expectedVersion:Number(target.row_version),reason:'Owned two API alert '+mode},resultPath:'/api/control/admin/alerts/'+target.id+'/acknowledgement-result'};
  }
  if(family==='recheck'){
   const path='/api/control/admin/workspaces/'+recheckItem.workspace.id;
   const detail=await request(path,{token});assert.equal(detail.status,200);
   return {kind:'recheck',operation:'recheck',path:path+'/recheck',body:{expectedVersion:detail.data.recheck.routingVersion,
    expectedSnapshotSha256:detail.data.recheck.snapshotSha256,reason:'Owned two API recheck '+mode},resultPath:path+'/recheck-result'};
  }
  assert.equal(family,'legacy');return {kind:'support',operation:'reconcile',path:'/api/control/support/reconcile',
   body:{query:legacy.workspace.slug,workspaceId:legacy.workspace.id,routingVersion:1,reason:'Owned two API legacy '+mode},
   resultPath:'/api/control/support/reconcile-result?workspaceId='+legacy.workspace.id};
 };
 const auth=async key=>(await db.query('SELECT * FROM private.platform_support_acceptances WHERE actor_id=$1 AND request_key=$2 ORDER BY accepted_at,id',[actor.id,key])).rows;
 const journal=async(key,fixture)=>{
  const intents=(await directory.query('SELECT * FROM roomqc_control.support_command_intents WHERE actor_id=$1 AND request_key=$2 AND kind=$3 AND operation=$4',
   [actor.id,key,fixture.kind,fixture.operation])).rows;assert.equal(intents.length,1);
  const intent=intents[0],rows=async table=>(await directory.query('SELECT * FROM roomqc_control.'+table+' WHERE intent_id=$1 ORDER BY generation',[intent.id])).rows;
  const rounds=await rows('support_command_attempts'),closures=await rows('support_attempt_closures'),results=await rows('support_intent_results');
  let parents;
  if(fixture.kind==='support')parents=(await directory.query('SELECT * FROM roomqc_control.support_actions WHERE actor_id=$1 AND command_key=$2',[actor.id,key])).rows;
  else if(fixture.kind==='recheck')parents=(await directory.query('SELECT * FROM roomqc_control.workspace_recheck_commands WHERE actor_id=$1 AND idempotency_key=$2',[actor.id,key])).rows;
  else parents=(await directory.query('SELECT * FROM roomqc_control.control_commands WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3',[actor.id,fixture.operation,key])).rows;
  const column={control:'control_command_id',support:'support_action_id',recheck:'recheck_command_id'}[fixture.kind];
  const consumed=(await directory.query('SELECT * FROM roomqc_control.support_command_acceptances WHERE '+column+'=ANY($1::uuid[])',[parents.map(p=>p.id)])).rows;
  return {intent,rounds,closures,results,parents,consumed,auth:await auth(key)};
 };
 const verify=async(key,fixture,expectedRounds,response)=>{
  const saved=await journal(key,fixture);assert.equal(saved.rounds.length,expectedRounds);assert.equal(saved.closures.length,expectedRounds-1);
  assert.equal(saved.auth.length,expectedRounds);assert.equal(saved.results.length,1);assert.equal(saved.parents.length,1);assert.equal(saved.consumed.length,1);
  assert.equal(saved.parents[0].id,response.data.commandId);assert.equal(saved.consumed[0].acceptance_id,saved.results[0].acceptance_id);
  assert.equal(saved.results[0].generation,expectedRounds-1);assert.equal(saved.consumed[0].request_key,key);
  const accepted=saved.auth.find(a=>a.id===saved.consumed[0].acceptance_id);assert(accepted);
  assert.equal(accepted.attempt_id,saved.rounds.at(-1).attempt_id);assert.equal(accepted.payload_sha256,saved.intent.payload_hash);
  if(fixture.kind==='support')assert.equal(saved.parents[0].outcome,'reconciled');
  else {
   const table=fixture.kind==='recheck'?'workspace_recheck_events':fixture.operation==='acknowledge_alert'?'alert_events':'cluster_events';
   assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.'+table+' WHERE command_id=$1',[saved.parents[0].id])).rows[0].n,1);
   if(fixture.operation==='acknowledge_alert')assert.equal((await directory.query('SELECT count(*)::int AS n FROM roomqc_control.alert_outbox o JOIN roomqc_control.alert_events e ON e.id=o.event_id WHERE e.command_id=$1',[saved.parents[0].id])).rows[0].n,1);
  }
  return saved;
 };
 return withSupportReplica(async({requestPrimary,requestReplica,processes})=>{
  const p=processes();assert(p.primaryAlive&&p.secondaryAlive);assert.notEqual(p.primary,p.secondary);
  const businessBefore=await snapshot();mark('two-live-independent-api-processes-share-directory-with-pool-max-one');
  for(const [index,family] of ['execute','register','alert','recheck','legacy'].entries()){
   const expired=await factory(family,'expired'),key=randomUUID();
   let orphan;
   await holdAcceptanceResponse(()=>requestPrimary(expired.path,{token,body:expired.body,key}),async(pending,releaseLate)=>{
    // The response is held after a genuine canonical Auth commit until the
    // original API deadline rolls its effect transaction back.
    const failed=await pending;assert.equal(failed.status,503);
    orphan=await journal(key,expired);assert.equal(orphan.auth.length,1);assert.equal(orphan.rounds.length,1);assert.equal(orphan.results.length,0);
    assert.equal(orphan.consumed.length,0);if(expired.kind!=='support')assert.equal(orphan.parents.length,0);
    await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[orphan.auth[0].expires_at])).rows[0].expired,
     'replica-canonical-expiry-'+family,7000);barrier('support-replicas-'+family+'-actual-canonical-expiry');
    await restartSupportApi('api-SIGKILL-before-'+family+'-two-process-recovery');
    const live=processes();assert(live.primaryAlive&&live.secondaryAlive);assert.notEqual(live.primary,live.secondary);
    const lock=738360+index;let holder,trigger=false,first,second,responses;
    try{
     await directory.query(`CREATE FUNCTION roomqc_control.owned_replica_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${lock});RETURN NEW;END $$;
      CREATE TRIGGER owned_replica_wait BEFORE INSERT ON roomqc_control.support_command_acceptances FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_replica_wait()`);trigger=true;
     holder=await directory.connect();await holder.query('SELECT pg_advisory_lock($1)',[lock]);
     first=requestPrimary(expired.path,{token,body:expired.body,key});
     const leader=await until(async()=>(await directory.query(`SELECT a.pid FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted`,[database,apiRole,lock])).rows[0],
      'replica-leader-wait-'+family,3500);
     second=requestReplica(expired.path,{token,body:expired.body,key});
     const contender=await until(async()=>(await directory.query(`SELECT a.pid FROM pg_stat_activity a
      WHERE a.datname=$1 AND a.usename=$2 AND a.pid<>$3 AND a.wait_event_type='Lock'
       AND $3=ANY(pg_catalog.pg_blocking_pids(a.pid))`,[database,apiRole,leader.pid])).rows[0],
      'replica-contender-wait-'+family,3500);
     assert.notEqual(leader.pid,contender.pid);barrier('support-replicas-'+family+'-distinct-db-sessions-contend-on-original-command');
    }finally{
     if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[lock])}finally{holder.release()}}
     try{responses=await Promise.all([first,second].filter(Boolean))}finally{
      if(trigger)await directory.query('DROP TRIGGER owned_replica_wait ON roomqc_control.support_command_acceptances; DROP FUNCTION roomqc_control.owned_replica_wait()');
     }
    }
    assert.equal(responses.length,2);for(const response of responses)assert.ok([200,202].includes(response.status),family+':'+response.data?.error);
    assert.equal(responses[0].data.commandId,responses[1].data.commandId);
    const saved=await verify(key,expired,2,responses[0]);assert.deepEqual(saved.rounds[0],orphan.rounds[0]);
    assert.equal(saved.rounds[1].previous_generation,0);assert.deepEqual(saved.auth.find(a=>a.id===orphan.auth[0].id),orphan.auth[0]);
    // Let the obsolete upstream response finish only after generation1 won.
    // It cannot rewrite the already committed action/result/history.
    releaseLate();
    const replay=await requestReplica(expired.path,{token,body:expired.body,key});assert.equal(replay.data.commandId,responses[0].data.commandId);
    const result=await requestPrimary(expired.resultPath,{token,key});assert.equal(result.status,200);assert.equal(result.cache,'no-store');
    assert.equal(result.data.commandId,responses[0].data.commandId);assert.deepEqual(await journal(key,expired),saved);
   });
   mark(family+'-expired-orphan-two-api-contention-one-linked-generation-and-late-response-fenced');

   const committed=await factory(family,'commit'),commitKey=randomUUID();
   const loss=await loseControlResponse(committed.path,()=>requestPrimary(committed.path,{token,body:committed.body,key:commitKey}));assert.equal(loss.networkError,true);
   const committedState=await journal(commitKey,committed);assert.equal(committedState.parents.length,1);
   const found=await requestReplica(committed.resultPath,{token,key:commitKey});assert.equal(found.status,200);assert.equal(found.data.commandId,committedState.parents[0].id);
   const both=await Promise.all([requestPrimary(committed.path,{token,body:committed.body,key:commitKey}),requestReplica(committed.path,{token,body:committed.body,key:commitKey})]);
   for(const response of both)assert.equal(response.data.commandId,found.data.commandId);
   await verify(commitKey,committed,1,both[0]);assert.deepEqual(await journal(commitKey,committed),committedState);
   mark(family+'-lost-committed-response-other-api-result-and-replay-without-new-acceptance');

   const denied=await factory(family,'revoked'),deniedKey=randomUUID();
   const deniedLoss=await loseAcceptanceResponse(()=>requestPrimary(denied.path,{token,body:denied.body,key:deniedKey}));assert.equal(deniedLoss.value.status,503);
   const beforeDenied=await journal(deniedKey,denied);
   const roleRows=(await db.query("SELECT to_jsonb(r) AS row FROM public.user_roles r WHERE user_id=$1 AND role='super_admin'",[actor.id])).rows;
   assert.equal(roleRows.length,1);
   assert.equal((await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[actor.id])).rowCount,1);
   try{
    const outcomes=await Promise.all([requestPrimary(denied.path,{token,body:denied.body,key:deniedKey}),requestReplica(denied.path,{token,body:denied.body,key:deniedKey}),
     requestReplica(denied.resultPath,{token,key:deniedKey})]);
    for(const response of outcomes)assert.ok([401,403].includes(response.status));assert.deepEqual(await journal(deniedKey,denied),beforeDenied);
   }finally{
    // Restore the exact owned fixture row, including UUID and microsecond time.
    // A fresh default row would invalidate the full business snapshot check.
    await db.query('INSERT INTO public.user_roles SELECT * FROM jsonb_populate_record(NULL::public.user_roles,$1::jsonb)',[JSON.stringify(roleRows[0].row)]);
   }
   mark(family+'-canonical-role-revoke-denies-both-api-recovery-and-result-with-unchanged-journal');
   families.push({family,expiredRecovery:true,twoProcessSqlContention:true,lateOriginalResponse:true,commitLossReplay:true,currentAuthorityDenial:true});
  }
  const publication=await runSupportPublicationNativeChecks({db,directory,apiDirectory,database,apiRole,actor,factory,journal,verify,check,barrier,until,
   loseAcceptanceResponse,restartSupportApi,requestPrimary,requestReplica,processes});
  const writerFirst=await runSupportWriterFirstNativeChecks({db,directory,apiDirectory,database,apiRole,actor,factory,journal,verify,check,barrier,until,
   requestPrimary,requestReplica,restartSupportApi});
  assert.deepEqual(await snapshot(),businessBefore,'Control/support commands must not create another tenant/hotel/trial or mutate business rows');
  assert.equal((await directory.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state<>'idle'",[database,apiRole])).rows[0].n,0);
  mark('all-family-business-snapshot-unchanged-and-no-active-api-transaction');
  return {verified:true,checks,families,publication,writerFirst,actualLinuxApiProcesses:2,apiPoolMaxPerProcess:1,actualAuth:true,actualHttp:true,
   actualCanonicalExpiry:true,actualDbContention:true,oldAcceptanceImmutable:true,
   limitations:['Fresh business587/directory21 on one owned PostgreSQL host; not populated upgrade, A/B or VPS.',
    'Late HTTP replies and current-protocol API processes are covered; old application/protocol writer compatibility remains open.',
    'No worker claim/RPC/business-commit/directory-settle proof, full-default/rebuild or product acceptance.']};
 });
}
