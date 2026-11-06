// Canonical Auth acceptance component, real RPC/roles/row locks. This is not
// directory consumption or a completed cross-database command protocol.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ClusterGateway} from '../cluster.mjs';
export async function runSupportAcceptanceNativeChecks({db,other,cluster,check,barrier,until,account,metadata,provision,loseAcceptanceResponse}){
 const gateway=new ClusterGateway({allowLocal:true,clusters:[cluster],supportClusterId:cluster.id,inventory:new Map([[cluster.id,cluster]])});
 const actor={...other,clusterId:cluster.id},audience=randomUUID();let checks=0;const scenarios=[];
 const mark=label=>{checks++;check('support-acceptance-'+label)};
 const scope=patch=>({attemptId:randomUUID(),audience,operation:'cluster_command',target:cluster.id,key:randomUUID().toUpperCase(),payloadHash:'a'.repeat(64),...patch});
 const accept=(a,s)=>gateway.acceptSupportCommand(a,a.token,s);
 const count=async a=>(await db.query('SELECT count(*)::integer AS n FROM private.platform_support_acceptances WHERE actor_id=$1',[a.id])).rows[0].n;
 const row=async id=>(await db.query('SELECT * FROM private.platform_support_acceptances WHERE id=$1',[id])).rows[0];
 const rpcArgs=s=>({p_attempt_id:s.attemptId,p_audience:s.audience,p_operation:s.operation,p_target:s.target,p_request_key:s.key,p_payload_sha256:s.payloadHash});
 const raw=(token,s)=>gateway.request(cluster,'/rest/v1/rpc/accept_platform_support_command',{token,body:rpcArgs(s),timeoutMs:5000});
 const waitRpc=predicate=>until(async()=>(await db.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity a LEFT JOIN pg_locks l ON l.pid=a.pid
  WHERE a.datname=current_database() AND a.state='active' AND a.query LIKE '%accept_platform_support_command%' AND ${predicate}) AS waiting`)).rows[0].waiting,
  'support-acceptance-owned-real-rpc-wait',1500);
 const createOperator=async label=>{const a=await account('acceptance-'+label);await provision(metadata(a));
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[a.id]);return {...a,clusterId:cluster.id}};
 const before=await count(actor),initial=scope();
 const receipts=await Promise.all([accept(actor,initial),accept(actor,initial),accept(actor,initial)]);
 assert.equal(new Set(receipts.map(r=>r.acceptanceId)).size,1);
 const immutable=({observedAtMs,...value})=>value;
 assert.deepEqual(immutable(receipts[0]),immutable(receipts[1]));assert.deepEqual(immutable(receipts[0]),immutable(receipts[2]));
 for(const r of receipts)assert.ok(r.observedAtMs>=r.acceptedAtMs&&r.observedAtMs<r.expiresAtMs);
 assert.equal(await count(actor),before+1);assert.equal(receipts[0].requestKey,initial.key);
 mark('concurrent-identical-attempt-one-durable-row-exact-key-and-unchanged-expiry');
 for(const patch of [{audience:randomUUID()},{operation:'register_cluster'},{target:'other-cluster'},{key:initial.key.toLowerCase()},{payloadHash:'b'.repeat(64)}])
  await assert.rejects(()=>accept(actor,{...initial,...patch}));
 assert.equal(await count(actor),before+1);mark('same-attempt-cannot-change-audience-operation-target-key-or-payload');
 for(const token of [cluster.publishableKey,cluster.serviceKey])await assert.rejects(()=>raw(token,scope()),error=>[401,403].includes(error.status));
 mark('anon-and-service-jwt-cannot-acquire-operator-acceptance');
 const owner=await account('acceptance-owner');await provision(metadata(owner));
 await db.query("UPDATE public.users SET is_super_admin=true WHERE id=$1",[owner.id]);
 await db.query(`UPDATE auth.users SET raw_user_meta_data=COALESCE(raw_user_meta_data,'{}'::jsonb)||'{"role":"super_admin","is_super_admin":true}'::jsonb WHERE id=$1`,[owner.id]);
 await assert.rejects(()=>accept({...owner,clusterId:cluster.id},scope()),{status:403});assert.equal(await count(owner),0);
 mark('owner-and-editable-metadata-or-profile-flag-do-not-grant-canonical-role');
 for(const [label,change,restore]of[
  ['account-lock',()=>db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]),()=>db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[actor.id])],
  ['inactive-profile',()=>db.query("UPDATE public.users SET status='inactive' WHERE id=$1",[actor.id]),()=>db.query("UPDATE public.users SET status='active' WHERE id=$1",[actor.id])],
  ['auth-ban',()=>db.query("UPDATE auth.users SET banned_until='2100-01-01' WHERE id=$1",[actor.id]),()=>db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[actor.id])],
  ['role-removed',()=>db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[actor.id]),()=>db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[actor.id])]
 ]){await change();try{await assert.rejects(()=>accept(actor,scope()),{status:403});assert.equal(await count(actor),before+1)}finally{await restore()}
  mark('live-'+label+'-denies-without-acceptance-row');}
 const acl=(await db.query(`SELECT has_schema_privilege('anon','roomqc_support','USAGE') AS anon_schema,
  has_schema_privilege('service_role','roomqc_support','USAGE') AS service_schema,
  has_table_privilege('authenticated','private.platform_support_acceptances','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS user_table,
  has_table_privilege('service_role','private.platform_support_acceptances','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS service_table,
  (SELECT prosecdef FROM pg_proc WHERE oid='public.accept_platform_support_command(uuid,uuid,text,text,text,text)'::regprocedure) AS public_definer,
  (SELECT prosecdef FROM pg_proc WHERE oid='roomqc_support.accept_command(uuid,uuid,text,text,text,text)'::regprocedure) AS internal_definer`)).rows[0];
 assert.deepEqual(acl,{anon_schema:false,service_schema:false,user_table:false,service_table:false,public_definer:false,internal_definer:true});
 mark('private-rls-table-no-user-service-access-and-public-wrapper-is-invoker');
 const saved=await row(receipts[0].acceptanceId);
 for(const sql of ['UPDATE private.platform_support_acceptances SET expires_at=expires_at+interval \'1 second\' WHERE id=$1',
  'DELETE FROM private.platform_support_acceptances WHERE id=$1'])await assert.rejects(()=>db.query(sql,[saved.id]),{code:'42501'});
 assert.deepEqual(await row(saved.id),saved);mark('durable-acceptance-is-append-only-without-auth-cascade');

 const revokedSql=(kind,a)=>kind==='profile'?['UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]]:
  kind==='role'?["DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[a.id]]:
  ['DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[a.session,a.id]];
 for(const kind of ['profile','role','session']){
  const a=await createOperator('before-'+kind),s=scope(),holder=await db.connect();let pending,committed=false;
  try{
   await holder.query('BEGIN');const [sql,args]=revokedSql(kind,a);await holder.query(sql,args);
   pending=accept(a,s).then(value=>({value}),error=>({error}));
   await waitRpc("a.wait_event_type='Lock'");barrier('support-acceptance-revoke-first-real-'+kind+'-row-wait');
   await holder.query('COMMIT');committed=true;
  }finally{try{if(!committed)await holder.query('ROLLBACK')}finally{holder.release()}if(pending)await pending}
  assert.equal((await pending).error?.status,403);assert.equal(await count(a),0);
  scenarios.push('revoke-first-'+kind);mark('revoke-first-'+kind+'-commit-denies-waiting-rpc-zero-rows');
 }
 for(const [index,kind]of ['profile','role','session'].entries()){
  const a=await createOperator('after-'+kind),s=scope(),key=738250+index;let holder,revoker,pending,revokePending,receipt,trigger=false;
  try{
   await db.query(`CREATE FUNCTION private.owned_support_acceptance_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
    CREATE TRIGGER owned_support_acceptance_wait BEFORE INSERT ON private.platform_support_acceptances
    FOR EACH ROW EXECUTE FUNCTION private.owned_support_acceptance_wait()`);trigger=true;
   holder=await db.connect();await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=accept(a,s).then(value=>({value}),error=>({error}));
   await waitRpc("l.locktype='advisory' AND NOT l.granted AND l.objid="+key);
   revoker=await db.connect();const pid=(await revoker.query('SELECT pg_backend_pid() AS id')).rows[0].id;
   const [sql,args]=revokedSql(kind,a);revokePending=revoker.query(sql,args);
   await until(async()=>(await db.query("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.waiting,
    'support-acceptance-revoker-row-lock-'+kind,1500);
   barrier('support-acceptance-accept-first-real-'+kind+'-revoker-waits-until-auth-commit');
  }finally{
   try{if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[key])}finally{holder.release()}}}
   finally{try{if(pending)receipt=await pending;if(revokePending)await revokePending}finally{
    revoker?.release();if(trigger)await db.query('DROP TRIGGER owned_support_acceptance_wait ON private.platform_support_acceptances; DROP FUNCTION private.owned_support_acceptance_wait()');
   }}
  }
  assert.equal(receipt.error,undefined);assert.equal(receipt.value.actorId,a.id);assert.equal(await count(a),1);
  const persisted=await row(receipt.value.acceptanceId);assert.equal(persisted.session_id,a.session);
  await assert.rejects(()=>accept(a,s),{status:403});await assert.rejects(()=>accept(a,scope()),{status:403});
  assert.deepEqual(await row(receipt.value.acceptanceId),persisted);assert.equal(await count(a),1);
  scenarios.push('accept-first-'+kind);mark('accepted-auth-commit-precedes-'+kind+'-revoke-and-survives-without-renewal-or-new-acceptance');
 }
 const lostScope=scope(),lost=await loseAcceptanceResponse(()=>accept(actor,lostScope));
 assert.equal(lost.error?.code,'CLUSTER_UNAVAILABLE');
 const durable=(await db.query('SELECT * FROM private.platform_support_acceptances WHERE actor_id=$1 AND attempt_id=$2',[actor.id,lostScope.attemptId])).rows[0];
 assert.ok(durable);const replay=await accept(actor,lostScope);assert.equal(replay.acceptanceId,durable.id);
 assert.equal(replay.acceptedAtMs,Math.floor(durable.accepted_at.getTime()));assert.equal(replay.expiresAtMs,Math.floor(durable.expires_at.getTime()));
 assert.equal(await count(actor),before+2);mark('real-response-loss-after-auth-commit-replays-one-original-row-id-and-expiry');
 await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[durable.expires_at])).rows[0].expired,'acceptance-real-db-expiry',6500);
 await assert.rejects(()=>accept(actor,lostScope));assert.deepEqual(await row(durable.id),durable);
 assert.equal(await count(actor),before+2);mark('real-expiry-does-not-renew-an-old-attempt-or-delete-its-history');
 const failed=scope();let failTrigger=false;
 try{
  await db.query(`CREATE FUNCTION private.owned_support_acceptance_fail() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
   BEGIN RAISE EXCEPTION 'OWNED_ACCEPTANCE_AUDIT_FAULT' USING ERRCODE='22012';END $$;
   CREATE TRIGGER owned_support_acceptance_fail BEFORE INSERT ON private.platform_support_acceptances
   FOR EACH ROW EXECUTE FUNCTION private.owned_support_acceptance_fail()`);failTrigger=true;
  await assert.rejects(()=>accept(actor,failed));assert.equal(await count(actor),before+2);
 }finally{if(failTrigger)await db.query('DROP TRIGGER owned_support_acceptance_fail ON private.platform_support_acceptances; DROP FUNCTION private.owned_support_acceptance_fail()')}
 assert.ok((await accept(actor,failed)).acceptanceId);assert.equal(await count(actor),before+3);
 mark('audit-failure-rolls-back-receipt-and-same-attempt-can-recover');
 const orphan=(await db.query(`SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database()
  AND query LIKE '%accept_platform_support_command%' AND pid<>pg_backend_pid() AND state<>'idle'`)).rows[0].n;
 assert.equal(orphan,0);mark('no-active-or-idle-transaction-rpc-left-after-faults');
 return {verified:true,scope:'auth-acceptance-component-only',checks,scenarios,actualAuth:true,actualPostgrest:true,actualRowLocks:true,
  actualResponseLossAfterCommit:true,actualExpiry:true,directoryConsumptionVerifiedByThisComponent:false,
  acceptancePoint:'Commit of the scoped Auth acceptance row while live Auth/profile/super_admin/session SHARE locks are held.',
  limitations:['This standalone component does not exercise directory consumption; integrated command evidence is recorded separately.',
   'An acceptance receipt is neither a bearer credential nor a directory command result.',
   'Fresh schema only; populated upgrade, full advisors review, end-to-end command consumption/restart/revocation, worker claim/RPC/settle and staging remain open.']};
}
