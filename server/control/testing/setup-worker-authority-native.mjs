// Real worker processes, scoped HTTP RPC and two different databases. Every SQL
// preparation/fault below is confined to the exact-owned disposable diagnostic.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=15000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await sleep(20)}
  throw new Error('OWNED_WORKER_TIMEOUT_'+label);
}
export async function runSetupWorkerAuthorityNativeChecks({
  input,db,directory,database,role,password,cluster,binding,recoveryExpected,recoveryToken,
  seed,state,snapshot,dirSnapshot,provision,record
}){
  assert.match(input.run,/^[a-f0-9]{12}$/);
  assert.equal(database,'roomqc_setup_'+input.run);assert.equal(role,'setup_native_'+input.run);
  const children=new Set(),checks=[],witnesses=[],kills=[],events=[];
  const credentialId=JSON.parse(Buffer.from(recoveryToken.split('.')[1],'base64url')).jti;
  const credential=(await db.query('SELECT revoked_at FROM private.setup_recovery_credentials WHERE id=$1',[credentialId])).rows[0];
  assert.equal(credential?.revoked_at,null);
  const check=label=>{record('native-worker-authority-'+label);checks.push(label)};
  const witness=(label,value)=>{witnesses.push({label,...value});check(label)};
  const remote=async f=>(await db.query('SELECT to_jsonb(d) AS value FROM private.workspace_setup_dispatches d WHERE workspace_id=$1',
    [f.p.p_workspace_id])).rows[0]?.value??null;
  const job=async f=>(await directory.query('SELECT * FROM roomqc_control.provisioning_jobs WHERE id=$1',[f.job])).rows[0];
  const revoke=()=>db.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[credentialId]);
  const restore=()=>db.query('UPDATE private.setup_recovery_credentials SET revoked_at=NULL WHERE id=$1',[credentialId]);
  async function start({pause,leaseMs=22000}={}){
    const target=new URL('postgresql://db/'+database);target.username=role;target.password=password;
    const child=fork(new URL('./setup-worker-authority-child.mjs',import.meta.url),[],{
      execArgv:[],stdio:['ignore','ignore','pipe','ipc'],env:{PATH:process.env.PATH}});
    const handle={child,messages:[],exit:null};children.add(handle);
    child.stderr.on('data',()=>{});
    child.on('message',message=>{handle.messages.push(message);if(message.type==='worker_event')events.push(message.event)});
    child.on('error',()=>handle.messages.push({type:'failed'}));
    handle.finished=new Promise(resolve=>child.once('close',(code,signal)=>{
      handle.exit={code,signal};children.delete(handle);resolve(handle.exit);
    }));
    handle.wait=(type,phase)=>until(()=>{
      assert.ok(!handle.messages.some(m=>m.type==='failed'),'OWNED_WORKER_CHILD_'+type);
      const found=handle.messages.find(m=>m.type===type&&(!phase||m.phase===phase));
      assert.ok(found||!handle.exit,'OWNED_WORKER_EARLY_EXIT_'+type);return found;
    },type);
    child.send({run:input.run,databaseUrl:target.href,bindings:[binding],cluster,expected:recoveryExpected,
      publishableKey:input.publishableKey,token:recoveryToken,leaseMs,pause});
    return handle;
  }
  const resume=handle=>{assert.equal(handle.exit,null);handle.child.send({type:'release'})};
  async function done(handle,settled){
    await handle.wait('done');await handle.finished;assert.equal(handle.exit.code,0);
    if(settled!==undefined)assert.equal(handle.messages.find(m=>m.type==='settled')?.settled,settled);
  }
  async function kill(handle,label){
    assert.equal(handle.exit,null);assert.equal(handle.child.kill('SIGKILL'),true);
    assert.equal((await handle.finished).signal,'SIGKILL');kills.push({label,signal:'SIGKILL'});check(label);
  }
  async function expiry(f){
    await until(async()=>{const r=await directory.query(
      "SELECT state='leased' AND lease_until<=clock_timestamp() AS expired FROM roomqc_control.provisioning_jobs WHERE id=$1",[f.job]);
      return r.rows[0]?.expired;
    },'real-lease-expiry',10000);
    witness('database-clock-observes-lease-expiry',{realClock:true,forcedSqlExpiry:false});
  }
  async function terminalCounts(f,attempts){
    const r=(await directory.query(`SELECT
      (SELECT count(*)::int FROM roomqc_control.setup_dispatches WHERE workspace_id=$1) AS dispatches,
      (SELECT count(*)::int FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1) AS jobs,
      (SELECT count(*)::int FROM roomqc_control.setup_recovery_attempts WHERE job_id=$2) AS attempts,
      (SELECT count(*)::int FROM roomqc_control.attempts WHERE workspace_id=$1
        AND outcome IN ('setup_recovery_succeeded','setup_recovery_waiting_owner')) AS terminal_audits`,
      [f.p.p_workspace_id,f.job])).rows[0];
    assert.deepEqual(r,{dispatches:1,jobs:1,attempts,terminal_audits:1});
  }
  async function deleteOwnerSession(f){
    const removed=await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[f.owner.session,f.owner.id]);
    assert.equal(removed.rowCount,1);
  }
  try{
    // A claimed job cannot bypass the live remote credential or provision.
    const denied=await seed('authority-pre-rpc'),beforeDenied=await snapshot();
    const first=await start({pause:'after_claim'});await first.wait('barrier','after_claim');
    assert.equal((await job(denied)).state,'leased');assert.equal(await remote(denied),null);
    await revoke();resume(first);await done(first,true);
    const deniedRow=await state(denied);
    assert.equal(deniedRow.state,'needs_review');assert.equal(deniedRow.last_error_code,'RECOVERY_CREDENTIAL_DENIED');
    assert.equal(deniedRow.terminal_state,null);assert.equal(await remote(denied),null);
    assert.deepEqual(await snapshot(),beforeDenied);await restore();
    check('credential-revoked-after-claim-before-rpc-denies-with-zero-business-or-terminal-effects');

    // Service recovery only handles a dispatch already admitted by the owner.
    const ownerGone=await seed('authority-owner-before'),beforeOwner=await snapshot();
    await deleteOwnerSession(ownerGone);const closed=await start();await done(closed,true);
    assert.equal((await state(ownerGone)).state,'waiting_owner');assert.equal((await remote(ownerGone)).state,'closed');
    assert.deepEqual(await snapshot(),beforeOwner);await terminalCounts(ownerGone,1);
    const late=await provision(ownerGone.p);
    assert.ok([401,403].includes(late.status));assert.equal(late.data.code,'42501');
    assert.equal((await remote(ownerGone)).state,'closed');
    assert.deepEqual(await snapshot(),beforeOwner);
    check('owner-session-revoked-before-claim-can-only-close-existing-dispatch-without-provision');

    const committed=await seed('authority-owner-after'),result=await provision(committed.p);
    assert.equal(result.data.state,'committed');const beforeCommitted=await snapshot();
    const accepted=await start({pause:'after_claim'});await accepted.wait('barrier','after_claim');
    await deleteOwnerSession(committed);resume(accepted);await done(accepted,true);
    const active=await state(committed);
    assert.equal(active.status,'active');assert.equal(active.tenant_id,result.data.tenant_id);assert.equal(active.hotel_id,result.data.hotel_id);
    assert.deepEqual(await snapshot(),beforeCommitted);await terminalCounts(committed,1);
    check('owner-session-revoked-after-claim-recovers-only-existing-tenant-hotel-trial-and-outbox');

    // Observe the RPC holding credential SHARE locks and the actual revoker
    // blocked by that exact PostgreSQL backend, not a mocked gateway response.
    const inFlight=await seed('authority-inflight'),beforeInFlight=await snapshot();
    const holder=await db.connect(),revoker=await db.connect();let locked=false,revoking,trigger=false;
    try{
      assert.match(inFlight.p.p_workspace_id,/^[0-9a-f-]{36}$/);
      await db.query(`CREATE FUNCTION private.native_worker_authority_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.workspace_id='${inFlight.p.p_workspace_id}'::uuid THEN
          PERFORM pg_advisory_xact_lock(727031,1); END IF; RETURN NEW; END $$;
        REVOKE ALL ON FUNCTION private.native_worker_authority_barrier() FROM PUBLIC;
        CREATE TRIGGER native_worker_authority_barrier BEFORE INSERT ON private.workspace_setup_dispatches
          FOR EACH ROW EXECUTE FUNCTION private.native_worker_authority_barrier()`);
      trigger=true;await holder.query('SELECT pg_advisory_lock(727031,1)');locked=true;
      const flowing=await start();
      const rpcPid=await until(async()=>{const rows=(await db.query(
        "SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=727031 AND objid=1 AND NOT granted")).rows;
        assert.ok(rows.length<=1);return rows[0]?.pid;
      },'remote-rpc-barrier');
      const revokerPid=(await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      assert.notEqual(rpcPid,revokerPid);
      revoking=revoker.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[credentialId])
        .then(r=>({rows:r.rowCount}),e=>({error:e.code}));
      await until(async()=>(await db.query('SELECT $2::integer=ANY(pg_blocking_pids($1)) AS blocked',
        [revokerPid,rpcPid])).rows[0].blocked,'credential-revoker-blocked-by-rpc');
      witness('credential-revoker-really-waits-for-accepted-rpc-transaction',{rpcPid,revokerPid,actualPgBlocker:true});
      await holder.query('SELECT pg_advisory_unlock(727031,1)');locked=false;
      assert.deepEqual(await revoking,{rows:1});await done(flowing,true);
      assert.equal((await state(inFlight)).state,'waiting_owner');assert.equal((await remote(inFlight)).state,'closed');
      assert.deepEqual(await snapshot(),beforeInFlight);await terminalCounts(inFlight,1);
      check('rpc-accepted-before-credential-revoke-commits-one-existing-dispatch-proof');
      const subsequent=await seed('authority-after-revoke'),beforeNext=await snapshot();
      const next=await start();await done(next,true);
      assert.equal((await state(subsequent)).state,'needs_review');assert.equal(await remote(subsequent),null);
      assert.deepEqual(await snapshot(),beforeNext);
      check('same-revoked-credential-denies-subsequent-worker-rpc-without-terminal-effect');
    }finally{
      if(locked)await holder.query('SELECT pg_advisory_unlock(727031,1)');
      if(revoking)await revoking;
      holder.release();revoker.release();
      if(trigger)await db.query('DROP TRIGGER native_worker_authority_barrier ON private.workspace_setup_dispatches; DROP FUNCTION private.native_worker_authority_barrier()');
      await restore();
    }

    // Directory release withdrawal fences settle despite a committed RPC.
    const withdrawn=await seed('authority-withdraw'),withdrawnResult=await provision(withdrawn.p);
    assert.equal(withdrawnResult.data.state,'committed');const beforeWithdraw=await snapshot();
    const releaseState=(await directory.query('SELECT state FROM roomqc_control.release_authority WHERE cluster_id=$1',[cluster.id])).rows[0].state;
    const waiting=await start({pause:'before_settle',leaseMs:2500});await waiting.wait('barrier','before_settle');
    const proofBefore=await remote(withdrawn);assert.equal(proofBefore.state,'committed');
    try{
      await directory.query("UPDATE roomqc_control.release_authority SET state='withdrawn' WHERE cluster_id=$1",[cluster.id]);
      const beforeRefusal=await dirSnapshot();resume(waiting);await done(waiting,false);
      assert.deepEqual(await dirSnapshot(),beforeRefusal);assert.deepEqual(await snapshot(),beforeWithdraw);
      check('release-withdrawal-after-remote-commit-fences-directory-settlement-with-zero-effects');
    }finally{await directory.query('UPDATE roomqc_control.release_authority SET state=$2 WHERE cluster_id=$1',[cluster.id,releaseState])}
    await expiry(withdrawn);const recovery=await start();await done(recovery,true);
    assert.equal((await state(withdrawn)).tenant_id,withdrawnResult.data.tenant_id);
    assert.deepEqual(await remote(withdrawn),proofBefore);assert.deepEqual(await snapshot(),beforeWithdraw);
    await terminalCounts(withdrawn,2);check('release-restored-new-claim-recovers-original-proof-once');

    // Two OS processes, natural lease expiry, and a delayed old terminal result.
    for(const kind of ['closed','committed']){
      const f=await seed('authority-takeover-'+kind);
      const expected=kind==='committed'?await provision(f.p):null;
      if(expected)assert.equal(expected.data.state,'committed');
      const before=await snapshot(),old=await start({pause:'before_settle',leaseMs:2500});
      await old.wait('barrier','before_settle');const original=await job(f),proof=await remote(f);
      assert.equal(proof.state,kind);await expiry(f);
      const fresh=await start();assert.notEqual(old.child.pid,fresh.child.pid);await done(fresh,true);
      const current=await state(f),afterFresh=await dirSnapshot();
      assert.equal(current.state,kind==='closed'?'waiting_owner':'succeeded');
      if(expected){assert.equal(current.tenant_id,expected.data.tenant_id);assert.equal(current.hotel_id,expected.data.hotel_id)}
      resume(old);await done(old,false);
      assert.deepEqual(await dirSnapshot(),afterFresh);assert.deepEqual(await remote(f),proof);assert.deepEqual(await snapshot(),before);
      const attempts=(await directory.query('SELECT attempt,outcome FROM roomqc_control.setup_recovery_attempts WHERE job_id=$1 ORDER BY attempt',[f.job])).rows;
      assert.deepEqual(attempts,[{attempt:original.attempts,outcome:'lease_expired'},{attempt:original.attempts+1,outcome:current.state}]);
      await terminalCounts(f,2);
      witness('two-worker-natural-lease-takeover-fences-late-'+kind,{processes:2,realClock:true,lateSettled:false});
    }

    // Kill after terminal business proof, revoke the owner session, restart.
    const killed=await seed('authority-kill'),killedResult=await provision(killed.p);
    assert.equal(killedResult.data.state,'committed');const beforeKill=await snapshot();
    const doomed=await start({pause:'before_settle',leaseMs:2500});await doomed.wait('barrier','before_settle');
    const beforeKillProof=await remote(killed);await kill(doomed,'sigkill-after-business-proof-before-directory-settle');
    await deleteOwnerSession(killed);await expiry(killed);
    const restarted=await start();await done(restarted,true);
    assert.equal((await state(killed)).tenant_id,killedResult.data.tenant_id);
    assert.equal((await state(killed)).hotel_id,killedResult.data.hotel_id);
    assert.deepEqual(await remote(killed),beforeKillProof);assert.deepEqual(await snapshot(),beforeKill);
    await terminalCounts(killed,2);
    check('restart-after-kill-and-owner-revoke-activates-original-business-proof-once');
    const beforeIdle=await dirSnapshot(),idle=await start();await done(idle);
    assert.equal(idle.messages.some(m=>m.type==='claimed'),false);assert.deepEqual(await dirSnapshot(),beforeIdle);
    assert.deepEqual(await snapshot(),beforeKill);
    check('second-restart-idle-with-no-new-job-dispatch-trial-or-business-write');
    const activeSessions=(await directory.query(`SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name=$1 AND (state='active' OR state='idle in transaction')`,['roomqc-owned-worker-'+input.run])).rows[0].count;
    assert.equal(activeSessions,0);check('no-active-or-idle-in-transaction-worker-session-left');
    return {verified:true,checks,witnesses,kills,events,separateWorkerProcesses:true,actualScopedHttp:true,
      realLeaseExpiry:true,forcedSqlExpiry:false,ownerTokensInWorker:false,
      limits:['Directory dispatch/job and release authority are privileged owned fixtures, not public signup.',
        'Accepted-before-revoke scoped RPC can finish its existing proof; later calls deny. This is not atomic revocation across databases.',
        'Worker only closes or reads an existing dispatch; it cannot provision under owner authority.',
        'Fresh schema on one PostgreSQL host; not populated upgrade, full candidate, VPS, A/B, browser/Android or release acceptance.']};
  }finally{
    for(const h of children)if(!h.exit)h.child.kill('SIGKILL');
    await Promise.all([...children].map(h=>h.finished));await restore();
  }
}
