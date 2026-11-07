import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ControlStore} from './store.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {SetupWorkerStore} from './setup-worker-store.mjs';
import {SetupWorker,createSetupReconciler} from './workers/setup-worker.mjs';

export function registerSetupWorkerCases({dbtest,database,config,cluster,pools,run,password}){
  let number=0;
  async function fixture(options={}){
    const {pool,url}=await database('setup_worker_'+(++number));
    await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
    const apiRole='setup_worker_api_'+run+'_'+number,runtimeRole='setup_worker_runtime_'+run+'_'+number;
    await pool.query(`CREATE ROLE ${apiRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    await pool.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_setup_runtime`);
    const apiUrl=new URL(url);apiUrl.username=apiRole;
    const api=new ControlStore({...config(apiUrl.href),setupDispatchEnabled:true});pools.push(api.pool);
    const runtimeUrl=new URL(url);runtimeUrl.username=runtimeRole;
    const runtimePool=new pg.Pool({connectionString:runtimeUrl.href,max:2,statement_timeout:8000,lock_timeout:6000});pools.push(runtimePool);
    const binding=(await pool.query(`SELECT a.cluster_id AS "clusterId",a.approval_id AS "approvalId",a.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_approvals a
      JOIN roomqc_control.release_authority r ON r.approval_id=a.approval_id
      JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows[0];
    const store=new SetupWorkerStore(runtimePool,{bindings:[binding],...options});
    const user={id:randomUUID(),session_id:randomUUID(),email:'worker-'+number+'@example.invalid',email_confirmed_at:new Date().toISOString()};
    const workspace=await api.reserve({slug:'worker-fixture',email:user.email,displayName:'Owned worker fixture'},randomUUID());
    const begun=await api.setup.begin(workspace,user,{hotelName:'Owned worker hotel',totalRooms:10},randomUUID());
    const due=()=>pool.query("UPDATE roomqc_control.provisioning_jobs SET next_attempt_at=clock_timestamp()-interval '1 second'");await due();
    const receipt=(state='committed')=>({dispatch_id:begun.dispatch.id,workspace_id:workspace.id,owner_id:user.id,
      routing_version:1,payload_sha256:begun.dispatch.payload_sha256,state,success:state==='committed',
      tenant_id:state==='committed'?randomUUID():null,hotel_id:state==='committed'?randomUUID():null});
    const snapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','setup_recovery_attempts','attempts']
      .map(async t=>[t,(await pool.query('SELECT * FROM roomqc_control.'+t+' ORDER BY '+(t==='setup_recovery_attempts'?'job_id,attempt':'id'))).rows])));
    const rows=async()=>({job:(await pool.query('SELECT * FROM roomqc_control.provisioning_jobs')).rows[0],
      workspace:(await pool.query('SELECT * FROM roomqc_control.workspaces')).rows[0],
      dispatch:(await pool.query('SELECT * FROM roomqc_control.setup_dispatches')).rows[0],
      history:(await pool.query('SELECT * FROM roomqc_control.setup_recovery_attempts ORDER BY attempt')).rows});
    return {pool,api,store,user,workspace,begun,due,receipt,snapshot,rows,runtimeRole,runtimePool,binding};
  }
  async function waitForLock(pool,key){
    for(let i=0;i<200;i++){
      if(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted",[key])).rows[0].count)>0)return;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error('Owned worker barrier was not reached');
  }
  async function auditBarrier(f,outcome,key){
    await f.pool.query(`CREATE FUNCTION roomqc_control.worker_fixture_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN IF NEW.outcome='${outcome}' THEN PERFORM pg_catalog.pg_advisory_xact_lock(${key}); END IF; RETURN NEW; END $$;
      CREATE TRIGGER worker_fixture_barrier BEFORE INSERT ON roomqc_control.attempts FOR EACH ROW
      EXECUTE FUNCTION roomqc_control.worker_fixture_barrier()`);
    const blocker=await f.pool.connect();await blocker.query('SELECT pg_advisory_lock($1)',[key]);
    return {entered:()=>waitForLock(f.pool,key),release:async()=>{await blocker.query('SELECT pg_advisory_unlock($1)',[key]);blocker.release()}};
  }

  dbtest('T12 setup worker: dedicated role has two RPCs and cannot read or directly mutate application tables',async()=>{
    const f=await fixture();await f.store.readiness();
    const functions=(await f.runtimePool.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='roomqc_control' AND has_function_privilege(current_user,p.oid,'EXECUTE') ORDER BY 1`)).rows;
    assert.deepEqual(functions.map(r=>r.proname),['claim_setup_recovery','settle_setup_recovery']);
    for(const query of ['SELECT * FROM roomqc_control.workspaces','SELECT * FROM roomqc_control.provisioning_jobs',
      'SELECT * FROM roomqc_control.setup_dispatches','SELECT * FROM roomqc_control.setup_recovery_attempts',
      "UPDATE roomqc_control.workspaces SET status='expired'",'DELETE FROM roomqc_control.provisioning_jobs',
      "UPDATE roomqc_control.schema_migrations SET checksum='rewritten'"])
      await assert.rejects(()=>f.runtimePool.query(query),{code:'42501'});
    await assert.rejects(()=>new SetupWorkerStore(f.pool,{bindings:[f.binding]}).readiness(),{code:'SETUP_RUNTIME_PRIVILEGES'});
    await f.pool.query(`GRANT SELECT(owner_id) ON roomqc_control.workspaces TO ${f.runtimeRole}`);
    await assert.rejects(()=>f.store.readiness(),{code:'SETUP_RUNTIME_PRIVILEGES'});
    await f.pool.query(`REVOKE SELECT(owner_id) ON roomqc_control.workspaces FROM ${f.runtimeRole}`);await f.store.readiness();
    await assert.rejects(()=>f.api.pool.query("SELECT roomqc_control.claim_setup_recovery(60000,'[]'::jsonb)"),{code:'42501'});
  });

  dbtest('T12 setup worker: two workers claim once, fence synchronous replies and atomically activate one result',async()=>{
    const f=await fixture(),claims=(await Promise.all([f.store.claim(),f.store.claim()])).filter(Boolean);assert.equal(claims.length,1);
    const c=claims[0],result=f.receipt();assert.equal(c.attempt,1);assert.equal(c.workspace.owner_id,f.user.id);
    assert.ok(!JSON.stringify(c).includes(f.user.email));assert.ok(!JSON.stringify(c).includes(f.user.session_id));
    await assert.rejects(()=>f.api.setup.settle(f.begun.workspace,f.begun.dispatch,result,randomUUID()),{code:'SETUP_DISPATCH_CHANGED'});
    assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:result}),{settled:true,state:'succeeded'});
    const after=await f.snapshot();assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:result}),{settled:false});
    assert.deepEqual(await f.snapshot(),after);const r=await f.rows();assert.equal(r.workspace.tenant_id,result.tenant_id);
    assert.equal(r.job.state,'succeeded');assert.equal(r.dispatch.terminal_state,'committed');assert.equal(r.history[0].outcome,'succeeded');
    assert.equal(after.attempts.filter(r=>r.outcome==='setup_recovery_succeeded').length,1);
  });

  dbtest('T12 setup worker: expired lease takeover preserves history and rejects a late terminal response without writes',async()=>{
    const f=await fixture(),old=await f.store.claim(),result=f.receipt();
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second'");
    const fresh=await f.store.claim();assert.notEqual(fresh.token,old.token);assert.equal(fresh.attempt,2);
    const before=await f.snapshot();assert.deepEqual(await f.store.settle(old,{outcome:'terminal',receipt:result}),{settled:false});
    assert.deepEqual(await f.snapshot(),before);
    assert.deepEqual(await f.store.settle(fresh,{outcome:'terminal',receipt:result}),{settled:true,state:'succeeded'});
    assert.deepEqual((await f.rows()).history.map(a=>a.outcome),['lease_expired','succeeded']);
  });

  dbtest('T12 setup worker: closed proof permits owner correction and never creates a replacement dispatch itself',async()=>{
    const f=await fixture(),c=await f.store.claim();
    assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:f.receipt('closed')}),{settled:true,state:'waiting_owner'});
    const r=await f.rows();assert.equal(r.workspace.status,'provisioning');assert.equal(r.workspace.tenant_id,null);
    assert.equal(r.dispatch.terminal_state,'closed');assert.equal(await f.store.claim(),null);
    assert.equal((await f.snapshot()).setup_dispatches.length,1);
    const next=await f.api.setup.begin(f.begun.workspace,f.user,{hotelName:'Owner corrected hotel'},randomUUID());
    assert.equal(next.started,true);assert.notEqual(next.dispatch.id,c.dispatch.id);
    assert.equal((await f.snapshot()).setup_dispatches.length,2);
  });

  dbtest('T12 setup worker: wrong receipt, changed owner/routing/URL and invalid tokens cannot settle',async()=>{
    const f=await fixture(),c=await f.store.claim(),result=f.receipt(),before=await f.snapshot();
    for(const patch of [{workspace_id:randomUUID()},{owner_id:randomUUID()},{dispatch_id:randomUUID()},
      {routing_version:2},{payload_sha256:'b'.repeat(64)},{success:false},{tenant_id:null},{state:'busy'}]){
      await assert.rejects(()=>f.store.settle(c,{outcome:'terminal',receipt:{...result,...patch}}),{code:'22023'});
      assert.deepEqual(await f.snapshot(),before);
    }
    assert.deepEqual(await f.store.settle({...c,token:randomUUID()},{outcome:'terminal',receipt:result}),{settled:false});
    const mutations=[['UPDATE roomqc_control.workspaces SET owner_id=$1',[randomUUID()],'UPDATE roomqc_control.workspaces SET owner_id=$1',[f.user.id]],
      ['UPDATE roomqc_control.workspaces SET routing_version=2',[],'UPDATE roomqc_control.workspaces SET routing_version=1',[]],
      ["UPDATE roomqc_control.clusters SET api_url='http://127.0.0.1:54322'",[], 'UPDATE roomqc_control.clusters SET api_url=$1',[cluster.url]]];
    for(const [change,args,restore,restoreArgs] of mutations){
      await f.pool.query(change,args);const changed=await f.snapshot();
      assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:result}),{settled:false});
      assert.deepEqual(await f.snapshot(),changed);await f.pool.query(restore,restoreArgs);
    }
    assert.equal((await f.store.settle(c,{outcome:'terminal',receipt:result})).settled,true);
  });

  dbtest('T12 setup worker: audit, job and attempt-journal faults roll back all terminal changes and allow safe retry',async()=>{
    const f=await fixture(),c=await f.store.claim(),result=f.receipt(),before=await f.snapshot();
    for(const table of ['attempts','provisioning_jobs','setup_recovery_attempts']){
      const operation=table==='attempts'?'INSERT':'UPDATE';
      await f.pool.query(`CREATE FUNCTION roomqc_control.worker_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'OWNED_SETUP_WORKER_FAULT'; END $$;
        CREATE TRIGGER worker_fixture_fault BEFORE ${operation} ON roomqc_control.${table}
        FOR EACH ROW EXECUTE FUNCTION roomqc_control.worker_fixture_fault()`);
      try{await assert.rejects(()=>f.store.settle(c,{outcome:'terminal',receipt:result}));assert.deepEqual(await f.snapshot(),before)}
      finally{await f.pool.query(`DROP TRIGGER worker_fixture_fault ON roomqc_control.${table}; DROP FUNCTION roomqc_control.worker_fixture_fault()`)}
    }
    assert.equal((await f.store.settle(c,{outcome:'terminal',receipt:result})).settled,true);
  });

  dbtest('T12 setup worker: expiry while blocked in final audit rolls back activation, dispatch, job and journal',async()=>{
    const f=await fixture({leaseMs:1500}),c=await f.store.claim(),result=f.receipt(),before=await f.snapshot();
    const gate=await auditBarrier(f,'setup_recovery_succeeded',737115);let pending;
    try{
      pending=f.store.settle(c,{outcome:'terminal',receipt:result});await gate.entered();
      while(!(await f.pool.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[c.leaseUntil])).rows[0].expired)
        await new Promise(r=>setTimeout(r,20));
    }finally{await gate.release()}
    assert.deepEqual(await pending,{settled:false});assert.deepEqual(await f.snapshot(),before);
  });

  dbtest('T12 setup worker: expiry while claiming rolls back the lease and claim audit',async()=>{
    const f=await fixture({leaseMs:100}),before=await f.snapshot(),gate=await auditBarrier(f,'setup_recovery_claimed',737116);let pending;
    try{pending=f.store.claim();await gate.entered();await f.pool.query('SELECT pg_sleep(0.2)')}
    finally{await gate.release()}
    assert.equal(await pending,null);assert.deepEqual(await f.snapshot(),before);
  });

  dbtest('T12 setup worker: SKIP LOCKED skips an occupied workspace and rechecks lease after a job lock wait',async()=>{
    const f=await fixture(),blocker=await f.pool.connect();await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM roomqc_control.workspaces FOR UPDATE');
    try{assert.equal(await f.store.claim(),null)}finally{await blocker.query('ROLLBACK');blocker.release()}
    const c=await f.store.claim(),result=f.receipt(),before=await f.snapshot();
    const gate=await f.pool.connect();await gate.query('BEGIN');await gate.query('SELECT id FROM roomqc_control.provisioning_jobs FOR UPDATE');
    let pending;
    try{
      pending=f.store.settle(c,{outcome:'terminal',receipt:result});
      await gate.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second'");
    }finally{await gate.query('COMMIT');gate.release()}
    assert.deepEqual(await pending,{settled:false});
    const after=await f.snapshot();assert.equal(after.workspaces[0].status,'provisioning');assert.equal(after.setup_dispatches[0].terminal_state,null);
    assert.deepEqual(after.setup_recovery_attempts,before.setup_recovery_attempts);assert.deepEqual(after.attempts,before.attempts);
  });

  dbtest('T12 setup worker: retry uses bounded jitter and stops at attempt/deadline limits without provisioning',async()=>{
    const f=await fixture({retryBaseMs:1000}),c=await f.store.claim();
    assert.deepEqual(await f.store.settle(c,{outcome:'retry',code:'SETUP_BUSY'}),{settled:true,state:'retry'});
    let r=await f.rows(),delay=r.job.next_attempt_at-r.job.updated_at;assert.ok(delay>=499&&delay<=1001);
    assert.equal(await f.store.claim(),null);
    await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET max_attempts=1');await f.due();
    const exhausted=await f.store.claim();assert.equal(exhausted.code,'SETUP_ATTEMPTS_EXHAUSTED');
    assert.equal((await f.rows()).job.state,'needs_review');assert.equal((await f.rows()).dispatch.terminal_state,null);
    const deadline=await fixture();
    await deadline.pool.query("UPDATE roomqc_control.provisioning_jobs SET created_at=clock_timestamp()-interval '2 days',deadline_at=clock_timestamp()-interval '1 day'");
    assert.equal((await deadline.store.claim()).code,'SETUP_DEADLINE_EXCEEDED');
    assert.equal((await deadline.rows()).job.attempts,0);assert.equal((await deadline.rows()).history.length,0);
  });

  dbtest('T12 setup worker: legacy missing dispatch and changed binding are retained for manual review',async()=>{
    const f=await fixture();await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET dispatch_id=NULL');
    assert.equal((await f.store.claim()).code,'SETUP_DISPATCH_MISSING');assert.equal((await f.rows()).job.state,'needs_review');
    const changed=await fixture();await changed.pool.query('UPDATE roomqc_control.workspaces SET routing_version=2');
    assert.equal((await changed.store.claim()).code,'SETUP_IDENTITY_CHANGED');assert.equal((await changed.rows()).workspace.status,'provisioning');
    assert.equal((await changed.rows()).history.length,0);assert.equal((await changed.rows()).dispatch.terminal_state,null);
  });

  dbtest('T12 setup worker: release withdrawal, key revocation and credential-reference drift fence claim and settlement',async()=>{
    const f=await fixture(),c=await f.store.claim(),result=f.receipt();
    for(const change of ["UPDATE roomqc_control.release_authority SET state='withdrawn'",
      "UPDATE roomqc_control.clusters SET credential_ref='different-ref'"]){
      await f.pool.query(change);const before=await f.snapshot();
      assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:result}),{settled:false});assert.deepEqual(await f.snapshot(),before);
      await f.pool.query("UPDATE roomqc_control.release_authority SET state='active'");
      await f.pool.query('UPDATE roomqc_control.clusters SET credential_ref=$1',[cluster.id]);
    }
    const key=(await f.pool.query('SELECT key_fingerprint FROM roomqc_control.release_approvals')).rows[0].key_fingerprint;
    // Use the real installer command boundary, not an UPDATE bypass.
    const {ReleaseApprovalStore}=await import('./release-authority.mjs');
    const {fixtureReleaseTrust}=await import('./release-test-fixtures.mjs');
    await new ReleaseApprovalStore(f.pool,fixtureReleaseTrust).withdrawKey(key,{expectedVersion:0,key:randomUUID(),requestId:randomUUID(),reason:'Owned worker revocation test'});
    const before=await f.snapshot();assert.deepEqual(await f.store.settle(c,{outcome:'terminal',receipt:result}),{settled:false});
    assert.deepEqual(await f.snapshot(),before);
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second'");
    assert.equal((await f.store.claim()).code,'SETUP_RELEASE_CHANGED');assert.equal((await f.rows()).job.state,'needs_review');
  });

  dbtest('T12 setup worker: actual loop recovers interrupted claims and handles busy then committed using an explicit remote double',async()=>{
    const f=await fixture();await f.store.claim();
    // Simulate process death after claim: no settlement, durable lease is left.
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second'");
    const result=f.receipt();let calls=0;
    const reconcile=createSetupReconciler(new Map([[cluster.id,{binding:{clusterId:cluster.id,url:cluster.url},close:async()=>{
      calls++;return calls===1?{...result,state:'busy',success:false,tenant_id:null,hotel_id:null}:result}}]]));
    const events=[],worker=new SetupWorker({store:f.store,reconcile,concurrency:2,onEvent:e=>events.push(e)});
    await worker.tick();assert.equal((await f.rows()).job.state,'retry');await f.due();await worker.tick();
    assert.equal((await f.rows()).workspace.status,'active');assert.equal(calls,2);
    assert.deepEqual((await f.rows()).history.map(a=>a.outcome),['lease_expired','retry','succeeded']);
    assert.ok(!JSON.stringify(events).includes(result.payload_sha256));assert.ok(!JSON.stringify(events).includes(f.user.id));
    await worker.shutdown();
  });
}
