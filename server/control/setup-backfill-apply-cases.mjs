import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrateDirectory,migrationManifest,importInitialRegistry} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {SetupWorkerStore} from './setup-worker-store.mjs';
import {setupBackfillFingerprint,classifySetupBackfill,SetupBackfillScanner} from './setup-backfill.mjs';
import {SetupBackfillApplier,setupBackfillCommandKey} from './setup-backfill-apply.mjs';

export function registerSetupBackfillApplyCases({dbtest,database,config,cluster,pools,run,password}){
  let sequence=0;
  async function fixture(){
    const n=++sequence,{pool,url}=await database('setup_apply_'+n);
    await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
    const role='setup_apply_'+run+'_'+n;
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_runtime`);
    const runtimeUrl=new URL(url);runtimeUrl.username=role;
    const runtime=new pg.Pool({connectionString:runtimeUrl.href,max:3,statement_timeout:8000,lock_timeout:6000});pools.push(runtime);
    const expected=(await runtime.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
      current_database() AS "databaseName",current_user::text AS role FROM pg_catalog.pg_control_system() s
      JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
    const binding=(await pool.query(`SELECT a.cluster_id AS "clusterId",a.approval_id AS "approvalId",a.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_approvals a
      JOIN roomqc_control.release_authority r ON r.approval_id=a.approval_id JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows[0];
    const receipts=new Map();let closeCalls=0,hook=null;
    const gateway={binding:{clusterId:cluster.id,url:cluster.url},receipt:async w=>{
      if(hook)await hook(w);const value=receipts.get(w.id);if(value instanceof Error)throw value;return value??null;
    },close:async()=>{closeCalls++;throw new Error('Apply cannot close')}};
    const options={expected,bindings:[binding],gateways:[[cluster.id,gateway]]},store=new SetupBackfillApplier(runtime,options);
    const api=new ControlStore({...config(url),setupDispatchEnabled:true});pools.push(api.pool);
    async function workspace(label){
      const user={id:randomUUID(),session_id:randomUUID(),email:label+'@example.invalid',email_confirmed_at:new Date().toISOString()};
      const reserved=await api.reserve({slug:'apply-'+label,email:user.email,displayName:'Private owner '+label},randomUUID());
      const begun=await api.setup.begin(reserved,user,{hotelName:'Private hotel '+label,totalRooms:3},randomUUID());
      return {workspace:begun.workspace,dispatch:begun.dispatch,user};
    }
    const receipt=f=>({workspace_id:f.workspace.id,owner_id:f.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()});
    async function terminal(f,state='committed'){
      const r=receipt(f);await pool.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state=$2,tenant_id=$3,hotel_id=$4,
        settled_at=clock_timestamp() WHERE id=$1`,[f.dispatch.id,state,state==='committed'?r.tenant_id:null,state==='committed'?r.hotel_id:null]);
      if(state==='committed')receipts.set(f.workspace.id,r);return r;
    }
    async function command(f){
      const snapshot=await store.snapshot(f.workspace.id,cluster.id);
      const value=receipts.get(f.workspace.id);const observation=value instanceof Error?{status:'unavailable'}
        :value?{status:'present',receipt:value}:{status:'missing'};
      return {key:setupBackfillCommandKey(randomUUID(),f.workspace.id),reportSha256:'a'.repeat(64),item:{workspaceId:f.workspace.id,clusterId:cluster.id,
        routingVersion:snapshot.workspace.routing_version,snapshotSha256:setupBackfillFingerprint(snapshot),group:classifySetupBackfill(snapshot,observation).group}};
    }
    const snapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','attempts','setup_recovery_attempts','setup_backfill_commands']
      .map(async t=>[t,(await pool.query(`SELECT * FROM roomqc_control.${t} ORDER BY ${t==='setup_recovery_attempts'?'job_id,attempt':t==='setup_backfill_commands'?'caller,command_id':'id'}`)).rows])));
    return {pool,runtime,role,expected,binding,store,options,api,workspace,receipt,terminal,command,snapshot,receipts,
      hook:fn=>{hook=fn},closeCalls:()=>closeCalls};
  }

  dbtest('T12 setup backfill apply: runtime has exactly two RPCs, reader stays read-only and excess privileges fail readiness',async()=>{
    const f=await fixture();await f.store.readiness();
    assert.deepEqual((await f.runtime.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='roomqc_control' AND has_function_privilege(current_user,p.oid,'EXECUTE') ORDER BY 1`)).rows.map(r=>r.proname),
      ['apply_setup_backfill','read_setup_backfill_snapshot']);
    for(const sql of ['SELECT * FROM roomqc_control.workspaces','SELECT owner_id FROM roomqc_control.workspaces',
      'SELECT * FROM roomqc_control.setup_backfill_commands','DELETE FROM roomqc_control.provisioning_jobs',
      "UPDATE roomqc_control.workspaces SET status='expired'",'SET ROLE roomqc_control_backfill_writer',
      "SELECT roomqc_control.setup_backfill_snapshot_value(NULL,'cluster-a')"])
      await assert.rejects(()=>f.runtime.query(sql),{code:'42501'});
    const readerRole='setup_apply_reader_'+run;
    await f.pool.query(`CREATE ROLE ${readerRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_reader`);
    const url=new URL(f.api.pool.options.connectionString);url.username=readerRole;
    const reader=new pg.Pool({connectionString:url.href,max:1});pools.push(reader);
    await assert.rejects(()=>reader.query("SELECT roomqc_control.read_setup_backfill_snapshot(NULL,'cluster-a')"),{code:'42501'});
    const scanner=new SetupBackfillScanner(reader,{...f.options,expected:{...f.expected,role:readerRole}});await scanner.scan();
    await f.pool.query(`GRANT SELECT(owner_id) ON roomqc_control.workspaces TO ${f.role}`);
    await assert.rejects(()=>f.store.readiness(),{code:'SETUP_BACKFILL_APPLY_PRIVILEGES'});
    await f.pool.query(`REVOKE SELECT(owner_id) ON roomqc_control.workspaces FROM ${f.role}`);
    await assert.rejects(()=>new SetupBackfillApplier(f.runtime,{...f.options,expected:{...f.expected,databaseOid:'1'}}).readiness(),{code:'SETUP_BACKFILL_APPLY_UNAVAILABLE'});
    await f.store.readiness();
  });

  dbtest('T12 setup backfill apply: all seven classifications keep effects bounded and terminal proof alone can reconcile directory',async()=>{
    const f=await fixture(),seen=[];
    for(const [label,prepare,expectedGroup,expectedOutcome]of[
      ['active',async w=>{const r=await f.terminal(w);await f.pool.query("UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3 WHERE id=$1",[w.workspace.id,r.tenant_id,r.hotel_id]);await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET state='succeeded' WHERE workspace_id=$1",[w.workspace.id])},'active_valid','no_op'],
      ['committed',w=>f.terminal(w),'committed_pending','activated'],
      ['pending',async w=>{f.receipts.set(w.workspace.id,f.receipt(w))},'dispatch_pending','reused_job'],
      ['closed',w=>f.terminal(w,'closed'),'closed','waiting_owner'],
      ['legacy',w=>f.pool.query("UPDATE roomqc_control.workspaces SET status='suspended' WHERE id=$1",[w.workspace.id]),'legacy_unknown','manual_review'],
      ['conflict',async w=>{f.receipts.set(w.workspace.id,{...f.receipt(w),owner_id:randomUUID()})},'conflict','conflict'],
      ['unavailable',async w=>{f.receipts.set(w.workspace.id,new Error('private provider error'))},'unavailable','unavailable']
    ]){
      const w=await f.workspace(label);await prepare(w);const command=await f.command(w);seen.push(command.item.group);
      assert.equal(command.item.group,expectedGroup);const before=(await f.snapshot());
      const result=await f.store.apply(command);assert.equal(result.outcome,expectedOutcome);
      const after=await f.snapshot();assert.deepEqual(after.setup_dispatches,before.setup_dispatches);
      if(!['activated','waiting_owner'].includes(result.outcome)){
        assert.deepEqual(after.workspaces,before.workspaces);assert.deepEqual(after.provisioning_jobs,before.provisioning_jobs);
      }
      assert.equal(after.setup_backfill_commands.length,before.setup_backfill_commands.length+1);
      assert.equal(after.attempts.length,before.attempts.length+1);
      const serialized=JSON.stringify(result)+JSON.stringify(after.setup_backfill_commands);
      assert.ok(!serialized.includes(w.user.id));assert.ok(!serialized.includes(w.user.email));assert.ok(!serialized.includes('Private hotel'));
    }
    assert.equal(new Set(seen).size,7);assert.equal(f.closeCalls(),0);
  });

  dbtest('T12 setup backfill apply: a microsecond change during remote read fails SQL CAS without changing job or workspace',async()=>{
    const f=await fixture(),w=await f.workspace('microsecond');await f.terminal(w);
    await f.pool.query("UPDATE roomqc_control.workspaces SET updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=$1",[w.workspace.id]);
    const command=await f.command(w);let changed=false;
    f.hook(async()=>{if(!changed){changed=true;await f.pool.query("UPDATE roomqc_control.workspaces SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1",[w.workspace.id])}});
    const result=await f.store.apply(command);assert.equal(result.outcome,'skipped_stale');
    const after=await f.snapshot();assert.equal(after.workspaces[0].status,'provisioning');assert.equal(after.provisioning_jobs[0].state,'queued');
    f.hook(null);assert.deepEqual(await f.store.apply(command),result);assert.equal((await f.snapshot()).setup_backfill_commands.length,1);
  });

  dbtest('T12 setup backfill apply: concurrent replay, changed payload and reopening a client preserve one durable command and activation',async()=>{
    const f=await fixture(),w=await f.workspace('replay');await f.terminal(w);const command=await f.command(w);
    const results=await Promise.all(Array.from({length:4},()=>f.store.apply(command)));results.forEach(r=>assert.deepEqual(r,results[0]));
    assert.equal(results[0].outcome,'activated');const before=await f.snapshot();
    const reopened=new SetupBackfillApplier(f.runtime,f.options);assert.deepEqual(await reopened.apply(command),results[0]);
    await assert.rejects(()=>reopened.apply({...command,reportSha256:'b'.repeat(64)}),{code:'SETUP_BACKFILL_KEY_CONFLICT'});
    assert.deepEqual(await f.snapshot(),before);assert.equal(before.setup_backfill_commands.length,1);
    assert.equal(before.attempts.filter(a=>a.outcome==='setup_backfill_activated').length,1);
    await assert.rejects(()=>f.pool.query('DELETE FROM roomqc_control.setup_backfill_commands'),{code:'23514'});
    await assert.rejects(()=>f.pool.query("UPDATE roomqc_control.setup_backfill_commands SET report_sha256=$1",['b'.repeat(64)]),{code:'23514'});
  });

  dbtest('T12 setup backfill apply: held leases remain untouched and expired claimed attempts are never fabricated as worker success',async()=>{
    const f=await fixture(),w=await f.workspace('lease');const worker=new SetupWorkerStore(f.pool,{bindings:[f.binding]});
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET next_attempt_at=clock_timestamp()-interval '1 second'");
    const claim=await worker.claim();assert.ok(claim);let command=await f.command(w),before=await f.snapshot();
    assert.equal((await f.store.apply(command)).outcome,'skipped_busy');let after=await f.snapshot();
    for(const table of ['workspaces','provisioning_jobs','setup_recovery_attempts'])assert.deepEqual(after[table],before[table]);
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second'");await f.terminal(w);
    command=await f.command(w);before=await f.snapshot();assert.equal((await f.store.apply(command)).outcome,'activated');after=await f.snapshot();
    assert.equal(after.provisioning_jobs[0].attempts,1);assert.equal(after.provisioning_jobs[0].state,'succeeded');
    assert.equal(after.provisioning_jobs[0].deadline_at.getTime(),before.provisioning_jobs[0].deadline_at.getTime());
    assert.equal(after.setup_recovery_attempts[0].outcome,'lease_expired');assert.equal(after.setup_recovery_attempts.length,1);
    assert.equal((await worker.settle(claim,{outcome:'retry',code:'SETUP_BUSY'})).settled,false);
  });

  dbtest('T12 setup backfill apply: two operator logins share no receipts and only one can activate the reviewed snapshot',async()=>{
    const f=await fixture(),w=await f.workspace('operators');await f.terminal(w);const command=await f.command(w);
    const otherRole='setup_apply_other_'+run;
    await f.pool.query(`CREATE ROLE ${otherRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_runtime`);
    const url=new URL(f.api.pool.options.connectionString);url.username=otherRole;
    const otherPool=new pg.Pool({connectionString:url.href,max:1});pools.push(otherPool);
    const other=new SetupBackfillApplier(otherPool,{...f.options,expected:{...f.expected,role:otherRole}});
    let arrived=0,release;const both=new Promise(resolve=>{release=resolve});
    f.hook(async()=>{if(++arrived===2)release();await both});
    const results=await Promise.all([f.store.apply(command),other.apply(command)]);f.hook(null);
    assert.deepEqual(results.map(r=>r.outcome).sort(),['activated','skipped_stale']);
    const after=await f.snapshot();assert.equal(after.setup_backfill_commands.length,2);
    assert.equal(new Set(after.setup_backfill_commands.map(r=>r.caller)).size,2);
    assert.equal(after.attempts.filter(a=>a.outcome==='setup_backfill_activated').length,1);
    assert.deepEqual(await f.store.apply(command),results[0]);assert.deepEqual(await other.apply(command),results[1]);
  });

  dbtest('T12 setup backfill apply: exhausted, overdue and terminal jobs keep their original budget and history',async()=>{
    const f=await fixture();
    for(const [label,sql]of[
      ['exhausted','attempts=8'],['overdue',"created_at=clock_timestamp()-interval '2 days',deadline_at=clock_timestamp()-interval '1 day'"],
      ['review',"state='needs_review'"],['cancelled',"state='cancelled'"],['succeeded',"state='succeeded'"]
    ]){
      const w=await f.workspace(label);await f.terminal(w);await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET '+sql+' WHERE workspace_id=$1',[w.workspace.id]);
      const command=await f.command(w),before=await f.snapshot();assert.equal((await f.store.apply(command)).outcome,'manual_review');
      const after=await f.snapshot();for(const table of ['workspaces','provisioning_jobs','setup_recovery_attempts'])assert.deepEqual(after[table],before[table]);
    }
    assert.equal(f.closeCalls(),0);
  });

  dbtest('T12 setup backfill apply: pending orphan uses original dispatch deadline and never guesses closed from a missing receipt',async()=>{
    const f=await fixture(),w=await f.workspace('orphan');
    await f.pool.query('DELETE FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1',[w.workspace.id]);
    const command=await f.command(w);assert.equal(command.item.group,'dispatch_pending');const result=await f.store.apply(command);
    assert.equal(result.outcome,'queued');const state=await f.snapshot();assert.equal(state.provisioning_jobs.length,1);
    assert.equal(state.provisioning_jobs[0].deadline_at-state.provisioning_jobs[0].created_at,86400000);
    assert.equal(state.provisioning_jobs[0].created_at.getTime(),state.setup_dispatches[0].created_at.getTime());
    assert.equal(state.setup_dispatches[0].terminal_state,null);assert.equal(state.workspaces[0].status,'provisioning');
    assert.deepEqual(await f.store.apply(command),result);assert.equal(f.closeCalls(),0);
    const misleading=await f.workspace('spoof');const spoof=await f.command(misleading);spoof.item.group='committed_pending';
    assert.equal((await f.store.apply(spoof)).outcome,'manual_review');
  });

  dbtest('T12 setup backfill apply: command, job and audit faults roll back together and the same key can recover',async()=>{
    const f=await fixture();let index=0;
    for(const [table,timing,condition]of[
      ['setup_backfill_commands','INSERT','true'],['provisioning_jobs','UPDATE',"NEW.state='succeeded'"],['attempts','INSERT',"NEW.outcome='setup_backfill_activated'"]
    ]){
      const w=await f.workspace('fault-'+(++index));await f.terminal(w);const command=await f.command(w);
      await f.pool.query(`CREATE FUNCTION roomqc_control.fixture_apply_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
        BEGIN IF ${condition} THEN RAISE EXCEPTION 'owned fixture fault';END IF;RETURN NEW;END $$;
        REVOKE ALL ON FUNCTION roomqc_control.fixture_apply_fault() FROM PUBLIC;
        CREATE TRIGGER fixture_apply_fault BEFORE ${timing} ON roomqc_control.${table} FOR EACH ROW EXECUTE FUNCTION roomqc_control.fixture_apply_fault()`);
      const before=await f.snapshot();await assert.rejects(()=>f.store.apply(command),{code:'SETUP_BACKFILL_APPLY_UNAVAILABLE'});assert.deepEqual(await f.snapshot(),before);
      await f.pool.query(`DROP TRIGGER fixture_apply_fault ON roomqc_control.${table};DROP FUNCTION roomqc_control.fixture_apply_fault()`);
      assert.equal((await f.store.apply(command)).outcome,'activated');
    }
  });

  dbtest('T12 setup backfill apply: deadline expiry in a blocked final audit rolls back activation, command and audit',async()=>{
    const f=await fixture(),w=await f.workspace('expiry');await f.terminal(w);
    await f.pool.query("UPDATE roomqc_control.provisioning_jobs SET deadline_at=clock_timestamp()+interval '2 seconds' WHERE workspace_id=$1",[w.workspace.id]);
    const command=await f.command(w),before=await f.snapshot(),key=737117;
    await f.pool.query(`CREATE FUNCTION roomqc_control.fixture_apply_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN IF NEW.outcome='setup_backfill_activated' THEN PERFORM pg_catalog.pg_advisory_xact_lock(${key});END IF;RETURN NEW;END $$;
      REVOKE ALL ON FUNCTION roomqc_control.fixture_apply_barrier() FROM PUBLIC;
      CREATE TRIGGER fixture_apply_barrier BEFORE INSERT ON roomqc_control.attempts FOR EACH ROW EXECUTE FUNCTION roomqc_control.fixture_apply_barrier()`);
    const blocker=await f.pool.connect();await blocker.query('SELECT pg_advisory_lock($1)',[key]);let pending;
    try{
      pending=f.store.apply(command);let entered=false;
      for(let i=0;i<200;i++){
        if((await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted) AS entered",[key])).rows[0].entered){entered=true;break}
        await new Promise(r=>setTimeout(r,10));
      }
      assert.equal(entered,true);
      while(!(await f.pool.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[before.provisioning_jobs[0].deadline_at])).rows[0].expired)
        await new Promise(r=>setTimeout(r,20));
    }finally{await blocker.query('SELECT pg_advisory_unlock($1)',[key]);blocker.release()}
    assert.equal((await pending).outcome,'retry_later');assert.deepEqual(await f.snapshot(),before);
  });

  dbtest('T12 setup backfill apply: populated 0016 to 0017 upgrade preserves history under two migrators and rerun',async()=>{
    const {pool}=await database('setup_apply_upgrade'),manifest=await migrationManifest();
    const temp=await mkdtemp(join(tmpdir(),'roomqc-apply-upgrade-'));assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep+'roomqc-apply-upgrade-'));
    try{
      const location=pathToFileURL(temp+sep);for(const m of manifest.slice(0,16))await writeFile(join(temp,m.version),m.sql);
      await migrateDirectory(pool,{location});await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
      const id=randomUUID(),owner=randomUUID(),dispatch=randomUUID();
      await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status)
        VALUES($1,'apply-upgrade','Owned fixture','owned-upgrade',$2,$3,'provisioning')`,[id,cluster.id,owner]);
      await pool.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
        VALUES($1,$2,$3,$4,1,$5)`,[dispatch,id,cluster.id,owner,'c'.repeat(64)]);
      await pool.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,state,attempts,expected_routing_version,dispatch_id)
        VALUES($1,$2,'needs_review',8,1,$3)`,[randomUUID(),id,dispatch]);
      await pool.query(`INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,'owned_upgrade_history')`,[randomUUID(),id]);
      const snap=async()=>Object.fromEntries(await Promise.all(['workspaces','setup_dispatches','provisioning_jobs','attempts'].map(async t=>[t,(await pool.query('SELECT * FROM roomqc_control.'+t+' ORDER BY id')).rows])));
      const before=await snap(),history=(await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows;
      await writeFile(join(temp,manifest[16].version),manifest[16].sql);
      const results=await Promise.all([migrateDirectory(pool,{location}),migrateDirectory(pool,{location})]);assert.equal(results.flatMap(r=>r.applied).length,1);
      assert.deepEqual(await snap(),before);assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version LIMIT 16')).rows,history);
      assert.deepEqual((await migrateDirectory(pool,{location})).applied,[]);
    }finally{assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep+'roomqc-apply-upgrade-'));await rm(temp,{recursive:true,force:true})}
  });

  dbtest('T12 setup backfill apply: release expiry during final audit rolls back every write without hiding unrelated DB errors',async()=>{
    const f=await fixture(),w=await f.workspace('release-expiry');await f.terminal(w);
    // This owned SQL fixture deliberately shortens the stored authority expiry;
    // signed release/installer validation is exercised separately by native runs.
    await f.pool.query("UPDATE roomqc_control.release_approvals SET expires_at_ms=extract(epoch FROM clock_timestamp()+interval '2 seconds')*1000");
    const expires=(await f.pool.query('SELECT expires_at_ms FROM roomqc_control.release_approvals')).rows[0].expires_at_ms;
    const command=await f.command(w),before=await f.snapshot(),key=737118;
    await f.pool.query(`CREATE FUNCTION roomqc_control.fixture_release_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN IF NEW.outcome='setup_backfill_activated' THEN PERFORM pg_catalog.pg_advisory_xact_lock(${key});END IF;RETURN NEW;END $$;
      REVOKE ALL ON FUNCTION roomqc_control.fixture_release_barrier() FROM PUBLIC;
      CREATE TRIGGER fixture_release_barrier BEFORE INSERT ON roomqc_control.attempts FOR EACH ROW EXECUTE FUNCTION roomqc_control.fixture_release_barrier()`);
    const blocker=await f.pool.connect();await blocker.query('SELECT pg_advisory_lock($1)',[key]);let pending;
    try{
      pending=f.store.apply(command);let entered=false;
      for(let i=0;i<200;i++){
        if((await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted) AS entered",[key])).rows[0].entered){entered=true;break}
        await new Promise(r=>setTimeout(r,10));
      }
      assert.equal(entered,true);
      while(!(await f.pool.query('SELECT extract(epoch FROM clock_timestamp())*1000 >= $1::numeric AS expired',[expires])).rows[0].expired)
        await new Promise(r=>setTimeout(r,20));
    }finally{await blocker.query('SELECT pg_advisory_unlock($1)',[key]);blocker.release()}
    assert.equal((await pending).outcome,'retry_later');assert.deepEqual(await f.snapshot(),before);
  });
}
