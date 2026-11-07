import {fixtureAdminExecute} from './support-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {fixtureConfig,fixtureTarget,seedOperationalCluster} from './test-fixtures.mjs';
import {SyntheticHealthStore as HealthStore,syntheticHealthEvidence} from './health-test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {clusterCommand,publicCluster} from './admin.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {HealthWorker} from './workers/health-worker.mjs';

const actor={id:randomUUID(),clusterId:'cluster-a'};
function sample(target,at=Date.now()){
  const disks=target.dataMounts.map(m=>({id:m.id,freeBytes:100*1024**3,totalBytes:200*1024**3,inodeFreePercent:80}));
  return {schemaVersion:2,targetFingerprint:telemetryTargetFingerprint(target),measurementScope:target.measurementScope,
    observedAt:new Date(at).toISOString(),requiredMountIds:disks.map(d=>d.id),dataDisks:disks,
    metrics:{cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,
      dataDiskFreeBytes:disks[0].freeBytes,dataDiskTotalBytes:disks[0].totalBytes,dataDiskInodeFreePercent:80,
      dbConnectionsUsed:10,dbConnectionBudget:target.dbConnectionBudget},
    probes:{auth:true,rest:true,storage:true,realtime:true,functions:true}};
}
const bind=(target,version=1,key=randomUUID())=>clusterCommand({operation:'bind_telemetry_target',expectedVersion:version,
  reason:'Approve isolated telemetry measurement target',payload:{targetFingerprint:telemetryTargetFingerprint(target)}},key,'cluster-a');

export function registerTelemetryBindingCases({dbtest,database,password,cluster}){
  async function fixture(name){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
    await pool.query(`CREATE ROLE ${name}_metrics LOGIN PASSWORD '${password}' IN ROLE roomqc_control_metrics;
      CREATE ROLE ${name}_api LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const metricsUrl=new URL(url);metricsUrl.username=name+'_metrics';
    const metrics=new pg.Pool({connectionString:metricsUrl.href,max:3,connectionTimeoutMillis:3000,statement_timeout:8000});
    const apiUrl=new URL(url);apiUrl.username=name+'_api';const api=new ControlStore(fixtureConfig(apiUrl.href,[cluster]));
    return {pool,api,metrics,writer:new HealthStore(metrics)};
  }
  async function state(pool){
    const tables=['clusters','cluster_policies','cluster_health_current','control_commands','cluster_events'];
    return Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await pool.query(`SELECT * FROM roomqc_control.${table}`)).rows])));
  }
  dbtest('target binding: inventory change immediately hides healthy label and blocks new allocation; approval invalidates old evidence atomically',async()=>{
    const {pool,api,metrics,writer}=await fixture('binding_invalidate');
    try{
      const active=await api.reserve({slug:'binding-existing',email:'existing@example.invalid',displayName:'Existing fixture'},randomUUID());
      await pool.query("UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3,owner_id=$4 WHERE id=$1",
        [active.id,randomUUID(),randomUUID(),randomUUID()]);
      const workspace=(await pool.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1',[active.id])).rows[0];
      const before=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];
      const target={...fixtureTarget('cluster-a'),dbConnectionBudget:101};api.config.inventory.get('cluster-a').telemetryTarget=target;
      const unapproved=publicCluster(await api.admin.cluster('cluster-a'),api.config);
      assert.equal(unapproved.health.status,'unknown');assert.ok(unapproved.health.reasonCodes.includes('METRICS_TARGET_CONFIGURATION_CHANGED'));
      await assert.rejects(()=>api.reserve({slug:'binding-new',email:'new@example.invalid',displayName:'New fixture'},randomUUID()),{code:'NO_CAPACITY'});
      const command=bind(target),receipts=await Promise.all(Array.from({length:5},()=>fixtureAdminExecute(api.admin,actor,command,randomUUID())));
      assert.equal(new Set(receipts.map(r=>r.commandId)).size,1);assert.equal(receipts[0].targetVersion,2);
      const after=await state(pool),c=after.clusters[0],h=after.cluster_health_current[0],p=after.cluster_policies[0];
      assert.equal(Number(c.telemetry_target_version),2);assert.deepEqual(c.telemetry_target_definition,target);
      assert.equal(h.metric_status,'unknown');assert.ok(Number(h.source_generation)>Number(before.source_generation));assert.deepEqual(h.evaluator_state,{});
      assert.equal(p.manual_closed,true);assert.equal(p.operator_reopen_required,true);assert.equal(after.control_commands.length,1);assert.equal(after.cluster_events.length,1);
      assert.equal(after.cluster_events[0].command_id,receipts[0].commandId);assert.equal(after.cluster_events[0].type,'bind_telemetry_target');
      assert.equal(after.cluster_events[0].before_state.telemetryBinding.fingerprint,telemetryTargetFingerprint(fixtureTarget('cluster-a')));
      assert.equal(after.cluster_events[0].after_state.telemetryBinding.fingerprint,telemetryTargetFingerprint(target));
      assert.equal(after.cluster_events[0].after_state.telemetryBinding.version,2);
      assert.ok(!JSON.stringify(after.cluster_events).includes('/fixture/database'));
      await assert.rejects(()=>writer.assertTarget(fixtureTarget('cluster-a')),{code:'TELEMETRY_TARGET_MISMATCH'});
      await assert.rejects(()=>writer.record('cluster-a',sample(fixtureTarget('cluster-a'),Date.now()+10)),{code:'TELEMETRY_TARGET_MISMATCH'});
      const fresh=sample(target,Date.now()+20),result=await writer.record('cluster-a',fresh);
      assert.ok(result.reasonCodes.includes('METRICS_WARMING'));assert.equal((await api.admin.cluster('cluster-a')).manual_closed,true);
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1',[active.id])).rows[0],workspace);
    }finally{await metrics.end();await api.close()}
  });
  dbtest('target binding: matching fingerprint cannot omit approved disks or substitute scope and DB budget',async()=>{
    const {pool,api,metrics,writer}=await fixture('binding_shape');
    try{
      const target=fixtureTarget('cluster-a'),before=await state(pool);
      for(const change of [s=>{s.measurementScope='linux-host'},s=>{s.metrics.dbConnectionBudget=1000},
        s=>{s.requiredMountIds=['unapproved'];s.dataDisks[0].id='unapproved'}]){
        const value=sample(target,Date.now()+10);change(value);
        await assert.rejects(()=>writer.record('cluster-a',value),{code:'TELEMETRY_TARGET_MISMATCH'});
        assert.deepEqual(await state(pool),before);
      }
      const multiple={...target,dataMounts:[...target.dataMounts,{id:'storage',mountpoint:'/fixture/storage',device:'/dev/sdb1',fstype:'xfs'}]};
      api.config.inventory.get('cluster-a').telemetryTarget=multiple;await fixtureAdminExecute(api.admin,actor,bind(multiple),randomUUID());
      const missing=sample(target,Date.now()+20);missing.targetFingerprint=telemetryTargetFingerprint(multiple);
      await assert.rejects(()=>writer.record('cluster-a',missing),{code:'TELEMETRY_TARGET_MISMATCH'});
      assert.ok((await writer.record('cluster-a',sample(multiple,Date.now()+30))).reasonCodes.includes('METRICS_WARMING'));
    }finally{await metrics.end();await api.close()}
  });
  dbtest('target binding: audit failure rolls back approved identity, snapshot, close latch, version and command receipt together',async()=>{
    const {pool,api,metrics}=await fixture('binding_atomic');
    try{
      const target={...fixtureTarget('cluster-a'),dbConnectionBudget:101};api.config.inventory.get('cluster-a').telemetryTarget=target;
      await pool.query(`CREATE FUNCTION roomqc_control.reject_binding_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Isolated binding audit failure'; END $$;
        CREATE TRIGGER reject_binding_audit BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_binding_audit()`);
      const before=await state(pool),command=bind(target);
      await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,command,randomUUID()),{code:'P0001'});assert.deepEqual(await state(pool),before);
      await pool.query('DROP TRIGGER reject_binding_audit ON roomqc_control.cluster_events');
      assert.equal((await fixtureAdminExecute(api.admin,actor,command,randomUUID())).targetVersion,2);
    }finally{await metrics.end();await api.close()}
  });
  dbtest('target binding: authority, expected version and exact inventory are required; rejected commands leave no receipt',async()=>{
    const {pool,api,metrics}=await fixture('binding_authority');
    try{
      const original=fixtureTarget('cluster-a'),target={...original,dbConnectionBudget:101},before=await state(pool);
      await assert.rejects(()=>fixtureAdminExecute(api.admin,{...actor,clusterId:'client-chosen'},bind(original),randomUUID()),{code:'ADMIN_PERMISSION_REQUIRED'});
      await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,bind(target),randomUUID()),{code:'TELEMETRY_TARGET_NOT_APPROVED'});
      api.config.inventory.get('cluster-a').telemetryTarget=target;
      await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,bind(target,2),randomUUID()),{code:'VERSION_CONFLICT'});
      for(const field of ['clusterId','hostId','environment']){
        const invalid={...target,[field]:field==='environment'?'staging':'other-target'};
        if(field==='environment')invalid.measurementScope='linux-host';
        api.config.inventory.get('cluster-a').telemetryTarget=invalid;
        await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,bind(invalid),randomUUID()),{code:'TELEMETRY_TARGET_NOT_APPROVED'});
      }
      const entry=api.config.inventory.get('cluster-a');entry.hostId='different-host';entry.telemetryTarget={...target,hostId:entry.hostId};
      await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,bind(entry.telemetryTarget),randomUUID()),{code:'TELEMETRY_TARGET_NOT_APPROVED'});
      entry.hostId='cluster-a';
      assert.deepEqual(await state(pool),before);
      api.config.inventory.get('cluster-a').telemetryTarget=target;const command=bind(target);await fixtureAdminExecute(api.admin,actor,command,randomUUID());
      await assert.rejects(()=>fixtureAdminExecute(api.admin,actor,bind(target,2,command.key),randomUUID()),{code:'IDEMPOTENCY_CONFLICT'});
    }finally{await metrics.end();await api.close()}
  });
  dbtest('target binding: metrics cannot change identity or call privileged trigger; same-target approval cannot forge its DB timestamp or version',async()=>{
    const {pool,api,metrics,writer}=await fixture('binding_privileges');
    try{
      assert.equal((await writer.readiness()).schemaVersion,(await migrationManifest()).at(-1).version);
      for(const sql of ["UPDATE roomqc_control.clusters SET telemetry_target_fingerprint=repeat('d',64)",
        'UPDATE roomqc_control.clusters SET telemetry_target_definition=telemetry_target_definition',
        'UPDATE roomqc_control.clusters SET telemetry_target_bound_at=now(),telemetry_target_version=100',
        'SELECT roomqc_control.invalidate_telemetry_target()',
        'ALTER TABLE roomqc_control.clusters DISABLE TRIGGER invalidate_telemetry_target',
        'UPDATE roomqc_control.cluster_policies SET manual_closed=false,operator_reopen_required=false']){
        await assert.rejects(()=>metrics.query(sql),{code:'42501'});
      }
      await assert.rejects(()=>api.pool.query('SELECT roomqc_control.invalidate_telemetry_target()'),{code:'42501'});
      await assert.rejects(()=>api.pool.query("UPDATE roomqc_control.cluster_health_current SET metric_status='healthy'"),{code:'42501'});
      const before=(await pool.query('SELECT * FROM roomqc_control.clusters')).rows[0];
      await api.pool.query("UPDATE roomqc_control.clusters SET telemetry_target_bound_at=now()-interval '1 year',telemetry_target_version=100");
      const preserved=(await pool.query('SELECT * FROM roomqc_control.clusters')).rows[0];assert.deepEqual(preserved,before);
      await fixtureAdminExecute(api.admin,actor,bind(fixtureTarget('cluster-a')),randomUUID());
      const same=(await pool.query('SELECT * FROM roomqc_control.clusters')).rows[0];
      assert.equal(same.telemetry_target_bound_at.getTime(),before.telemetry_target_bound_at.getTime());assert.equal(same.telemetry_target_version,before.telemetry_target_version);
      assert.equal((await api.admin.cluster('cluster-a')).metric_status,'healthy');
      await assert.rejects(()=>api.pool.query('UPDATE roomqc_control.clusters SET telemetry_target_fingerprint=NULL,telemetry_target_definition=NULL'),{code:'23514'});
      await assert.rejects(()=>api.pool.query("UPDATE roomqc_control.clusters SET telemetry_target_definition=jsonb_set(telemetry_target_definition,'{dbConnectionBudget}','101')"),{code:'23514'});
    }finally{await metrics.end();await api.close()}
  });
  dbtest('target binding: returning to a previous target rejects its pre-approval sample and never inherits its old recovery window',async()=>{
    const {pool,api,metrics,writer}=await fixture('binding_return');
    try{
      const original=fixtureTarget('cluster-a'),other={...original,dbConnectionBudget:101},old=sample(original,Date.now());
      api.config.inventory.get('cluster-a').telemetryTarget=other;await fixtureAdminExecute(api.admin,actor,bind(other),randomUUID());
      api.config.inventory.get('cluster-a').telemetryTarget=original;await fixtureAdminExecute(api.admin,actor,bind(original,2),randomUUID());
      await assert.rejects(()=>writer.record('cluster-a',old),{code:'TELEMETRY_SAMPLE_BEFORE_BINDING'});
      const at=Date.now()+20,result=await writer.record('cluster-a',sample(original,at));assert.ok(result.reasonCodes.includes('METRICS_WARMING'));
      const state=(await pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(state.firstValidAt,at);assert.equal(state.recoverySince,at);
      assert.equal((await api.admin.cluster('cluster-a')).operator_reopen_required,true);
    }finally{await metrics.end();await api.close()}
  });
  dbtest('two actual health workers: target approval during collection rejects the old in-flight source and starts new-target warmup',async()=>{
    const {pool,api,metrics,writer}=await fixture('binding_workers');
    let collected,release;
    const started=new Promise(resolve=>{collected=resolve}),hold=new Promise(resolve=>{release=resolve});
    const original=fixtureTarget('cluster-a'),next={...original,dbConnectionBudget:101};
    const probe=async target=>({probes:sample(target).probes,evidence:await syntheticHealthEvidence(metrics)});
    const first=new HealthWorker({store:writer,targets:[original],probe,
      sourceFor:()=>({collect:async()=>{collected();await hold;return sample(original,Date.now()+10)}})});
    const second=new HealthWorker({store:new HealthStore(metrics),targets:[next],probe,
      sourceFor:()=>({collect:async()=>sample(next,Date.now()+20)})});
    try{
      const pending=first.tick();await started;
      api.config.inventory.get('cluster-a').telemetryTarget=next;await fixtureAdminExecute(api.admin,actor,bind(next),randomUUID());
      release();await Promise.all([pending,second.tick()]);
      assert.equal(first.status().lastErrorCode,'TELEMETRY_TARGET_MISMATCH');assert.equal(first.status().targetsSucceeded,0);
      assert.equal(second.status().targetsSucceeded,1);
      const health=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];
      assert.equal(health.evaluator_state.targetFingerprint,telemetryTargetFingerprint(next));assert.ok(health.reason_codes.includes('METRICS_WARMING'));
      assert.equal((await api.admin.cluster('cluster-a')).manual_closed,true);
    }finally{release();await first.shutdown();await second.shutdown();await metrics.end();await api.close()}
  });
  dbtest('metrics transaction deadline cancels a real blocked connection; releasing the lock cannot commit a late snapshot',async()=>{
    const {pool,api,metrics}=await fixture('binding_db_deadline');
    const blocker=await pool.connect();await blocker.query('SELECT pg_advisory_lock(727001)');
    try{
      const before=await state(pool),writer=new HealthStore(metrics,{transactionTimeoutMs:100});
      await assert.rejects(()=>writer.record('cluster-a',sample(fixtureTarget('cluster-a'),Date.now()+10)),{code:'HEALTH_DATABASE_TIMEOUT'});
      await blocker.query('SELECT pg_advisory_unlock(727001)');
      // Force a subsequent successful round trip after the old socket was closed.
      await metrics.query('SELECT 1');assert.deepEqual(await state(pool),before);
      assert.equal((await writer.record('cluster-a',sample(fixtureTarget('cluster-a'),Date.now()+20))).accepted,true);
    }finally{await blocker.query('SELECT pg_advisory_unlock(727001)');blocker.release();await metrics.end();await api.close()}
  });
  dbtest('worker stale sweep persists despite a hung source; metrics credential outage closes readiness and recovers without opening admission',async()=>{
    const name='binding_worker_outage',{pool,api,metrics,writer}=await fixture(name);
    const worker=new HealthWorker({store:writer,targets:[fixtureTarget('cluster-a')],targetTimeoutMs:50,
      probe:async target=>({probes:sample(target).probes,evidence:await syntheticHealthEvidence(metrics)}),sourceFor:()=>({collect:()=>new Promise(()=>{})})});
    try{
      await pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=now()-interval '121 seconds',valid_until=now()-interval '1 second'");
      await worker.tick();assert.equal(worker.status().sweepSucceeded,true);assert.equal(worker.status().lastErrorCode,'HEALTH_TARGET_TIMEOUT');
      assert.equal((await pool.query('SELECT metric_status FROM roomqc_control.cluster_health_current')).rows[0].metric_status,'unknown');
      // Operate only on the isolated fixture's exact login, not on any tenant DB.
      await pool.query(`ALTER ROLE ${name}_metrics NOLOGIN`);
      metrics.on('error',()=>{});
      await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename=$1 AND pid<>pg_backend_pid()',[name+'_metrics']);
      await worker.tick();assert.equal(worker.status().ready,false);assert.equal(worker.status().sweepSucceeded,false);
      await pool.query(`ALTER ROLE ${name}_metrics LOGIN`);
      await worker.tick();assert.equal(worker.status().sweepSucceeded,true);assert.equal(worker.status().ready,false);
      const row=await api.admin.cluster('cluster-a');assert.equal(row.operator_reopen_required,true);assert.notEqual(publicCluster(row,api.config).admission.decision,'open');
    }finally{await worker.shutdown();await metrics.end();await api.close()}
  });
}
