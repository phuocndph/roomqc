// Genuine Auth/REST/HTTP and directory-role checks in an owned sandbox.
// Observed revoke-before-final-check windows are not a distributed commit fence.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runSupportBoundaryNativeChecks} from './setup-support-boundaries-native.mjs';
import {runSupportAcceptanceNativeChecks} from './setup-support-acceptance-native.mjs';
import {runSupportConsumptionNativeChecks} from './setup-support-consumption-native.mjs';

export async function runSupportAuthorityNativeChecks({db,directory,apiDirectory,database,apiRole,operator,other,cluster,request,snapshot,check,barrier,until,
 registrationInventory,registration,abandon,metadata,provision,account,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
 holdAcceptanceResponse,withSupportReplica,apiOrigin}){
 const path='/api/control/admin/clusters/'+cluster.id+'/commands';
 const state=async()=>Object.fromEntries(await Promise.all(['clusters','cluster_policies','control_commands','cluster_events'].map(async table=>
  [table,(await directory.query('SELECT to_jsonb(t) AS row FROM roomqc_control.'+table+' t ORDER BY to_jsonb(t)::text')).rows])));
 const command=async()=>({operation:'close_admission',expectedVersion:Number((await directory.query('SELECT row_version FROM roomqc_control.clusters WHERE id=$1',[cluster.id])).rows[0].row_version),
  reason:'Owned native support authority',payload:{}});
 const tokenLive=actor=>assert.ok(JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url')).exp*1000>Date.now()+10000,'JWT must still be unexpired at revocation');
 const observe=key=>until(async()=>(await directory.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
  WHERE a.datname=$1 AND a.usename=$2 AND l.locktype='advisory' AND l.objid=$3 AND NOT l.granted) AS waiting`,[database,apiRole,key])).rows[0].waiting,'support-authority-directory-barrier',4000);
 const accepted=await command(),acceptedKey=randomUUID();
 const positive=await request(path,{token:operator.token,body:accepted,key:acceptedKey});assert.equal(positive.status,200);
 const saved=await state(),replay=await request(path,{token:operator.token,body:accepted,key:acceptedKey});
 assert.equal(replay.data.commandId,positive.data.commandId);assert.deepEqual(await state(),saved);
 check('support-authority-real-http-positive-and-same-key-replay-one-effect');

 async function revokeCase({label,actor,key,audit,revoke,restore}){
  const before=await state();let holder,pending,denied,revoked=false,auditCreated=false,authoritySnapshot,afterDenied;
  try{
   if(audit){await directory.query(`CREATE FUNCTION roomqc_control.owned_support_authority_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
    BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(${key});RETURN NEW;END $$;
    CREATE TRIGGER owned_support_authority_barrier BEFORE INSERT ON roomqc_control.cluster_events
    FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_support_authority_barrier()`);auditCreated=true;}
   holder=await directory.connect();
   await holder.query('SELECT pg_advisory_lock($1)',[key]);
   pending=request(path,{token:actor.token,body:await command(),key:randomUUID()});
   await observe(key);barrier('support-authority-real-'+label+'-wait');tokenLive(actor);
   await revoke();revoked=true;authoritySnapshot=await snapshot();
   // Keep the original JWT. A new HTTP read must also observe the live denial.
   assert.ok([401,403].includes((await request('/api/control/admin/clusters',{token:actor.token})).status));
   check('support-authority-'+label+'-revoked-while-original-jwt-unexpired');
  }finally{
   if(holder){try{await holder.query('SELECT pg_advisory_unlock($1)',[key])}finally{holder.release()}}
   if(pending)denied=await pending;
   if(revoked)afterDenied=await snapshot();
   try{if(revoked&&restore)await restore()}finally{
    if(auditCreated)await directory.query('DROP TRIGGER owned_support_authority_barrier ON roomqc_control.cluster_events; DROP FUNCTION roomqc_control.owned_support_authority_barrier()');
   }
  }
  assert.ok([401,403].includes(denied?.status),'Original in-flight command must deny after revocation');
  assert.deepEqual(await state(),before);assert.deepEqual(afterDenied,authoritySnapshot,'Directory command must not change business rows after the explicit fixture Auth mutation');
  // Independent session can acquire the command mutex after the denied request.
  const probe=await directory.connect();try{
   assert.equal((await probe.query('SELECT pg_try_advisory_lock(727001) AS available')).rows[0].available,true);
  }finally{await probe.query('SELECT pg_advisory_unlock(727001)');probe.release()}
  check('support-authority-'+label+'-real-http-denied-zero-directory-business-effects-and-mutex-released');
 }
 await revokeCase({label:'account-lock-before-directory-lock',actor:operator,key:727001,audit:false,
  revoke:()=>db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[operator.id]),
  restore:()=>db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[operator.id])});
 await revokeCase({label:'role-revoke-during-audit',actor:other,key:738211,audit:true,
  revoke:()=>db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[other.id]),
  restore:()=>db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[other.id])});
 const boundaryCoverage=await runSupportBoundaryNativeChecks({db,directory,apiDirectory,database,apiRole,operator,other,cluster,request,snapshot,check,barrier,until,
  registrationInventory,registration,abandon,metadata,provision,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
  holdAcceptanceResponse,withSupportReplica,apiOrigin});
 const acceptanceComponent=await runSupportAcceptanceNativeChecks({db,other,cluster,check,barrier,until,account,metadata,provision,loseAcceptanceResponse});
 const commandConsumption=await runSupportConsumptionNativeChecks({db,directory,apiDirectory,database,apiRole,other,cluster,request,check,barrier,until,
  account,metadata,provision,loseAcceptanceResponse,loseControlResponse,restartSupportApi});
 await revokeCase({label:'session-delete-during-audit',actor:operator,key:738212,audit:true,
  revoke:()=>db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[operator.session,operator.id])});
 const lookup='/api/control/admin/clusters/'+cluster.id+'/command-result?operation=close_admission';
 assert.ok([401,403].includes((await request(lookup,{token:operator.token,key:acceptedKey})).status));
 check('support-authority-revoked-session-cannot-read-own-prior-receipt');
 const afterAuthorityFixtures=await snapshot();
 const recovery=await request(path,{token:other.token,body:await command(),key:randomUUID()});assert.equal(recovery.status,200);
 assert.deepEqual(await snapshot(),afterAuthorityFixtures);check('support-authority-still-active-operator-can-commit-after-denials');
 const sessions=(await directory.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND state<>\'idle\'',[database,apiRole])).rows[0].count;
 assert.equal(sessions,0);check('support-authority-no-active-or-idle-in-transaction-api-session-left');
 return {verified:true,scope:'support-authority-admin-mutations-and-late-result-reads',actualAuth:true,actualRest:true,actualHttp:true,actualDirectoryRuntimeRole:true,
  scenarios:3+boundaryCoverage.scenarios,unexpiredJwtRevocations:3+boundaryCoverage.scenarios,boundaryCoverage,acceptanceComponent,commandConsumption,protectedBusinessUnchangedByCommands:true,businessSnapshotTables:11,
  intentionalFixtureAuthorityMutations:'Owned profile lock/unlock, super_admin role removal/re-add and Auth session deletion; measured separately before the blocked command resumes.',
  limitations:['Auth and directory databases share a disposable PostgreSQL host.',
   'Integrated acceptance-before-revoke proof is scoped to exact admin cluster commands and the recorded handoff window; this is not a distributed transaction or an instantaneous stop of all writes.',
   'This scoped diagnostic does not close the cross-database revocation protocol, worker claim/RPC/settle races, R11/BG02, full-default/rebuild, staging or release acceptance.']};
}
