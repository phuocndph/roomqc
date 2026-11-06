// Real HTTP + Auth + PostgreSQL wait barriers, only inside the owned diagnostic.
// Temporary directory triggers/RLS locate a statement; no product debug hooks.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {alertTransaction,syncHealthAlerts} from '../alerts.mjs';
import {runSupportLegacyNativeChecks} from './setup-support-legacy-native.mjs';
import {runSupportReplicaNativeChecks} from './setup-support-replica-native.mjs';

export async function runSupportBoundaryNativeChecks({db,directory,apiDirectory,database,apiRole,other,cluster,request,snapshot,check,barrier,until,
 registrationInventory,registration,abandon,metadata,provision,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
 holdAcceptanceResponse,withSupportReplica,apiOrigin}){
 const actor=other,scenarios=[];
 const tables=['hosts','clusters','cluster_policies','control_commands','cluster_events','alerts','alert_events','alert_outbox','attempts',
  'support_actions','workspaces','setup_dispatches','provisioning_jobs','setup_recovery_attempts','workspace_recheck_commands','workspace_recheck_events','workspace_recheck_cycles'];
 const state=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,
  (await directory.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t ORDER BY to_jsonb(t)::text')).rows.map(r=>r.row)])));
 const post=(path,body,key=randomUUID())=>request(path,{token:actor.token,body,key});
 const get=(path,key)=>request(path,{token:actor.token,key});
 const clusterCommands='/api/control/admin/clusters/'+cluster.id+'/commands';
 const reopened=await post(clusterCommands,{operation:'open_admission',expectedVersion:Number((await directory.query(
  'SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),reason:'Owned boundary fixture restores admission after command revoke cases',payload:{}});
 assert.equal(reopened.status,200,'Previous authority cases intentionally closed admission; reopen through the real API for registration fixtures');
 assert.equal(reopened.data.result.admission.decision,'open');check('support-boundary-reopen-admission-through-http-before-reservation-fixtures');
 const deny=async({label,invoke,key,auditTable,relationTable,updateAudit=false,prepare,cleanup,failedSupportAudit=false})=>{
  const before=await state();let holder,pending,response,locked=false,trigger=false,prepared=false,businessAtRevoke,businessAfter;
  try{
   if(prepare){prepared=true;await prepare()}
   if(auditTable){
    assert.match(auditTable,/^[a-z_]+$/);
    await directory.query(`CREATE FUNCTION roomqc_control.owned_support_boundary_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
     BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
     CREATE TRIGGER owned_support_boundary_wait BEFORE ${updateAudit?'UPDATE':'INSERT'} ON roomqc_control.${auditTable}
     FOR EACH ROW ${updateAudit?"WHEN (NEW.outcome='reconciled') ":''}EXECUTE FUNCTION roomqc_control.owned_support_boundary_wait()`);trigger=true;
   }
   holder=await directory.connect();
   if(relationTable){assert.match(relationTable,/^[a-z_]+$/);await holder.query('BEGIN');await holder.query('LOCK TABLE roomqc_control.'+relationTable+' IN ACCESS EXCLUSIVE MODE')}
   else await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=invoke();
   await until(async()=>(await directory.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
    WHERE a.datname=$1 AND a.usename=$2 AND NOT l.granted AND ${relationTable?"l.relation=$3::regclass":"l.locktype='advisory' AND l.objid=$3"}) AS waiting`,
    [database,apiRole,relationTable?'roomqc_control.'+relationTable:key])).rows[0].waiting,'owned-boundary-'+label,4000);
   barrier('support-boundary-real-wait-'+label);
   assert.ok(JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url')).exp*1000>Date.now()+10000);
   await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);locked=true;
   businessAtRevoke=await snapshot();
   assert.ok([401,403].includes((await get('/api/control/admin/clusters')).status));
   check('support-boundary-live-auth-denies-before-unblocking-'+label);
  }finally{
   try{
    try{if(holder){try{if(relationTable)await holder.query('ROLLBACK');else await holder.query('SELECT pg_advisory_unlock($1)',[key])}finally{holder.release()}}}
    finally{if(pending)response=await pending}
    if(locked)businessAfter=await snapshot();
   }finally{
    try{if(locked)await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[actor.id])}finally{
     try{if(trigger)await directory.query('DROP TRIGGER owned_support_boundary_wait ON roomqc_control.'+auditTable+'; DROP FUNCTION roomqc_control.owned_support_boundary_wait()')}
     finally{if(prepared)await cleanup()}
    }
   }
  }
  assert.ok([401,403].includes(response?.status),'In-flight HTTP must deny '+label);
  const after=await state();
  if(failedSupportAudit){
   const previous=new Set(before.support_actions.map(row=>row.id)),created=after.support_actions.filter(row=>!previous.has(row.id));
   assert.equal(created.length,1);assert.equal(created[0].outcome,'failed');assert.equal(created[0].actor_id,actor.id);
   assert.equal(created[0].after_state,null);assert.ok(created[0].error_code);
   assert.deepEqual(after.support_actions.filter(row=>previous.has(row.id)),before.support_actions);
   after.support_actions=before.support_actions;
  }
  assert.deepEqual(after,before,'Denied boundary must not change directory data '+label);
  assert.deepEqual(businessAfter,businessAtRevoke,'Denied boundary must not add business effects '+label);
  scenarios.push(label);check('support-boundary-inflight-denied-directory-business-invariants-'+label);
 };

 const registrationBody=entry=>({id:entry.id,hostId:entry.hostId,backendKind:entry.backendKind,endpointRef:entry.id,
  credentialRef:entry.credentialRef,expectedVersion:1,reason:'Owned native register boundary'});
 const registered=await post('/api/control/admin/clusters/register',registrationBody(registrationInventory[0]));assert.equal(registered.status,200);
 assert.equal(registered.data.result.validationState,'pending');assert.notEqual(registered.data.result.admission.decision,'open');
 check('support-boundary-register-positive-remains-draft-without-trust-health');
 const registerKey=randomUUID(),register=()=>post('/api/control/admin/clusters/register',registrationBody(registrationInventory[1]),registerKey);
 await deny({label:'register-during-final-audit',invoke:register,key:738230,auditTable:'cluster_events'});
 assert.equal((await register()).status,200);check('support-boundary-register-same-key-after-denial-one-effect');

 await alertTransaction(directory,c=>syncHealthAlerts(c,cluster.id,{reasonCodes:['CPU_CRITICAL','DISK_CRITICAL'],sourceGeneration:1},randomUUID()),{lock:true});
 const alerts=(await directory.query("SELECT id,type,row_version FROM roomqc_control.alerts WHERE type IN('CPU_CRITICAL','DISK_CRITICAL') AND resolved_at IS NULL ORDER BY type")).rows;
 assert.equal(alerts.length,2);
 const alertPath=id=>'/api/control/admin/alerts/'+id;
 const firstAlertKey=randomUUID(),ackBody={expectedVersion:1,reason:'Owned native acknowledgement'};
 assert.equal((await post(alertPath(alerts[0].id)+'/acknowledge',ackBody,firstAlertKey)).status,200);
 const alertKey=randomUUID(),ack=()=>post(alertPath(alerts[1].id)+'/acknowledge',ackBody,alertKey);
 await deny({label:'alert-ack-during-outbox',invoke:ack,key:738231,auditTable:'alert_outbox'});
 assert.equal((await ack()).status,200);check('support-boundary-alert-ack-same-key-after-denial-one-effect');

 const legacy=await registration('legacy-support');
 const provisioned=await provision(metadata(legacy.owner,{p_workspace_id:legacy.workspace.id}));assert.equal(provisioned.data.state,'committed');
 // Explicit populated legacy fixture: no dispatch/job; actual remote receipt
 // came from the real RPC. New signup/recheck below is created through HTTP.
 await directory.query("UPDATE roomqc_control.workspaces SET owner_id=$2,status='provisioning',expires_at=NULL WHERE id=$1",[legacy.workspace.id,legacy.owner.id]);
 const reconcileBody={query:legacy.workspace.slug,workspaceId:legacy.workspace.id,routingVersion:1,reason:'Owned legacy receipt reconcile'};
 const reconcileKey=randomUUID(),reconcile=()=>post('/api/control/support/reconcile',reconcileBody,reconcileKey);
 await deny({label:'legacy-reconcile-during-final-audit',invoke:reconcile,key:738232,auditTable:'support_actions',updateAudit:true,failedSupportAudit:true});
 const reconciled=await reconcile();assert.equal(reconciled.status,200);assert.equal(reconciled.data.workspace.status,'active');
 check('support-boundary-legacy-reconcile-recovers-with-one-binding-and-durable-failed-attempt');
 const legacyRecovery=await runSupportLegacyNativeChecks({db,directory,other,legacy,body:reconcileBody,apiOrigin,request,check,barrier,until,
  loseAcceptanceResponse,loseControlResponse,restartSupportApi});

 const item=await registration('boundary-recheck');await abandon(item,'before');
 const recheckPath='/api/control/admin/workspaces/'+item.workspace.id;
 const recheckBody=async()=>{const detail=await get(recheckPath);assert.equal(detail.status,200);
  return {expectedVersion:detail.data.recheck.routingVersion,expectedSnapshotSha256:detail.data.recheck.snapshotSha256,reason:'Owned native recheck boundary'}};
 const recheckKey=randomUUID(),recheckInput=await recheckBody(),recheck=()=>post(recheckPath+'/recheck',recheckInput,recheckKey);
 await deny({label:'recheck-during-event',invoke:recheck,key:738233,auditTable:'workspace_recheck_events'});
 const rechecked=await recheck();assert.ok([200,202].includes(rechecked.status));assert.equal(rechecked.data.outcome,'reused_job');
 check('support-boundary-recheck-same-key-after-denial-does-not-create-another-job');

 const finalInput=await recheckBody(),finalKey=randomUUID(),finalLock=738234;
 const rlsBefore=(await directory.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='roomqc_control.release_approvals'::regclass")).rows[0];
 assert.deepEqual(rlsBefore,{relrowsecurity:false,relforcerowsecurity:false});
 await deny({label:'recheck-during-final-release-query',invoke:()=>post(recheckPath+'/recheck',finalInput,finalKey),key:finalLock,
  prepare:()=>directory.query(`CREATE FUNCTION roomqc_control.owned_final_release_wait() RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
   BEGIN IF pg_catalog.current_setting('roomqc.owned_recheck_audited',true)='true' THEN PERFORM pg_catalog.pg_advisory_xact_lock(${finalLock});END IF;RETURN true;END $$;
   CREATE FUNCTION roomqc_control.owned_mark_recheck_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN PERFORM pg_catalog.set_config('roomqc.owned_recheck_audited','true',true);RETURN NEW;END $$;
   CREATE TRIGGER owned_mark_recheck_audit BEFORE INSERT ON roomqc_control.workspace_recheck_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_mark_recheck_audit();
   ALTER TABLE roomqc_control.release_approvals ENABLE ROW LEVEL SECURITY;
   CREATE POLICY owned_final_release_wait ON roomqc_control.release_approvals FOR SELECT TO ${apiRole} USING(roomqc_control.owned_final_release_wait())`),
  cleanup:()=>directory.query(`DROP POLICY IF EXISTS owned_final_release_wait ON roomqc_control.release_approvals;
   ALTER TABLE roomqc_control.release_approvals DISABLE ROW LEVEL SECURITY;
   DROP TRIGGER IF EXISTS owned_mark_recheck_audit ON roomqc_control.workspace_recheck_events;
   DROP FUNCTION IF EXISTS roomqc_control.owned_mark_recheck_audit();DROP FUNCTION IF EXISTS roomqc_control.owned_final_release_wait()`)});
 assert.ok([200,202].includes((await post(recheckPath+'/recheck',finalInput,finalKey)).status));
 check('support-boundary-final-release-query-cleanup-and-positive-recovery');

 const replicaRecovery=await runSupportReplicaNativeChecks({db,directory,apiDirectory,database,apiRole,actor,cluster,legacy,recheckItem:item,
  registrationInventory,request,check,barrier,until,snapshot,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
  holdAcceptanceResponse,withSupportReplica});

 const clusterPath='/api/control/admin/clusters/'+cluster.id,commandKey=randomUUID();
 const body={operation:'close_admission',expectedVersion:Number((await directory.query('SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),
  reason:'Owned result/read authority boundary',payload:{}};
 assert.equal((await post(clusterPath+'/commands',body,commandKey)).status,200);
 const reads=[
  ['command-result',()=>get(clusterPath+'/command-result?operation=close_admission',commandKey),'control_commands'],
  ['command-replay',()=>post(clusterPath+'/commands',body,commandKey),'control_commands'],
  ['alert-result',()=>get(alertPath(alerts[0].id)+'/acknowledgement-result',firstAlertKey),'control_commands'],
  ['recheck-result',()=>get(recheckPath+'/recheck-result',recheckKey),'workspace_recheck_commands'],
  ['admin-list',()=>get('/api/control/admin/clusters?limit=25'),'clusters'],
  ['support-reconcile-result',()=>get('/api/control/support/reconcile-result?workspaceId='+legacy.workspace.id,reconcileKey),'support_actions'],
  ['support-lookup',()=>post('/api/control/support/lookup',{query:legacy.workspace.slug}),'support_actions']
 ];
 for(const [label,invoke,table] of reads){assert.equal((await invoke()).status,200);await deny({label:'read-'+label,invoke,relationTable:table});
  assert.equal((await invoke()).status,200);check('support-boundary-read-positive-after-unlock-'+label);}
 const sessions=(await directory.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state<>'idle'",[database,apiRole])).rows[0].count;
 assert.equal(sessions,0);check('support-boundary-no-active-or-idle-in-transaction-api-session-left');
 return {verified:true,legacyRecovery,replicaRecovery,scenarios:scenarios.length,labels:scenarios,mutators:['register','alert_ack','legacy_support_reconcile','recheck'],
  reads:['command-result','command-replay','alert-result','recheck-result','admin-list','support-reconcile-result','support-lookup'],
  finalReleaseBarrier:'Owned temporary directory RLS/trigger pauses the real last release query after audit; removed before database cleanup.',
  legacyFixture:'HTTP reservation plus SQL legacy directory state with real business RPC receipt; not a new signup E2E claim.',
  deniedSupportAudit:'One durable failed support attempt is allowed; no binding/job/command/business effect.',
  registrationFixture:'Two approved draft inventory entries only; no second independent backend or live health/trust proof.'};
}
