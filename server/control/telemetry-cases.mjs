import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {HealthStore} from './telemetry.mjs';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from './test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {clusterCommand,publicCluster} from './admin.mjs';

function sample(at,metrics={}){return {observedAt:new Date(at).toISOString(),metrics:{cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,
  dataDiskFreeBytes:100*1024**3,dataDiskTotalBytes:200*1024**3,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100,...metrics},
  probes:{auth:true,rest:true,storage:true,realtime:true,functions:true}}}
export function registerTelemetryCases({dbtest,database,password,cluster}){
  async function fixture(name){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
    await seedOperationalCluster(pool);await pool.query('DELETE FROM roomqc_control.cluster_health_current');
    await pool.query(`CREATE ROLE ${name}_metrics LOGIN PASSWORD '${password}' IN ROLE roomqc_control_metrics;
      CREATE ROLE ${name}_api LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const metricsUrl=new URL(url);metricsUrl.username=name+'_metrics';const metricsPool=new pg.Pool({connectionString:metricsUrl.href,max:3});
    const apiUrl=new URL(url);apiUrl.username=name+'_api';const api=new ControlStore(fixtureConfig(apiUrl.href,[cluster]));
    return {pool,metricsPool,api};
  }
  dbtest('health snapshot: runtime metrics role persists warmup across process restarts and cannot approve reopening',async()=>{
    const {pool,metricsPool,api}=await fixture('health_restart');
    try{
      const now=Date.now();let clock=now-300000,writer=new HealthStore(metricsPool,{clock:()=>clock});
      for(let i=0;i<=10;i++){
        clock=now-300000+i*30000;
        if(i===5)writer=new HealthStore(metricsPool,{clock:()=>clock});
        const result=await writer.record('cluster-a',sample(clock));assert.equal(result.accepted,true);
      }
      const snapshot=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];assert.equal(snapshot.metric_status,'healthy');
      assert.equal(snapshot.evaluator_state.warming,false);assert.deepEqual(snapshot.evaluator_state.probes,sample(now).probes);
      await assert.rejects(()=>metricsPool.query('UPDATE roomqc_control.cluster_policies SET operator_reopen_required=false'),{code:'42501'});
      await assert.rejects(()=>metricsPool.query('UPDATE roomqc_control.cluster_policies SET manual_closed=false'),{code:'42501'});
      const result=await api.admin.execute({id:randomUUID(),clusterId:'cluster-a'},clusterCommand({operation:'open_admission',expectedVersion:1,
        reason:'Verified metrics recovered in isolated test',payload:{}},randomUUID(),'cluster-a'),randomUUID());
      assert.equal(result.result.admission.decision,'open');
    }finally{await metricsPool.end();await api.close()}
  });
  dbtest('health snapshot: duplicate/older samples cannot overwrite newer state or generations, including concurrent collectors',async()=>{
    const {pool,metricsPool,api}=await fixture('health_ordering');
    try{
      const now=Date.now(),writer=new HealthStore(metricsPool);
      const initial=await writer.record('cluster-a',sample(now-1000));
      // A restored/legacy snapshot may have a generation ahead of the new sequence.
      await pool.query('UPDATE roomqc_control.cluster_health_current SET source_generation=1000');initial.generation=1000;
      for(const at of [now-1000,now-2000])assert.deepEqual(await writer.record('cluster-a',sample(at)),{accepted:false,reason:'SAMPLE_NOT_NEWER',generation:initial.generation});
      const lock=await pool.connect();await lock.query('SELECT pg_advisory_lock(727001)');
      const results=Promise.all([writer.record('cluster-a',sample(now)),new HealthStore(metricsPool).record('cluster-a',sample(now+1))]);
      let waiting=false;
      try{
        for(let i=0;i<100;i++){
          const count=(await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())")).rows[0].count;
          if(Number(count)>=2){waiting=true;break}await new Promise(resolve=>setTimeout(resolve,10));
        }
      }finally{await lock.query('SELECT pg_advisory_unlock(727001)');lock.release()}
      await results;assert.equal(waiting,true);
      const snapshot=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];
      assert.equal(snapshot.observed_at.getTime(),now+1);assert.ok(Number(snapshot.source_generation)>initial.generation);
    }finally{await metricsPool.end();await api.close()}
  });
  dbtest('health snapshot: stale transition is durable and idempotent; a fresh sample needs warmup again',async()=>{
    const {pool,metricsPool,api}=await fixture('health_stale');
    try{
      const writer=new HealthStore(metricsPool),now=Date.now();await writer.record('cluster-a',sample(now));
      await pool.query(`UPDATE roomqc_control.cluster_health_current SET observed_at=now()-interval '5 minutes',valid_until=now()-interval '1 second',
        evaluator_state=jsonb_set(evaluator_state,'{lastObservedAt}',to_jsonb((extract(epoch from now()-interval '5 minutes')*1000)::bigint))`);
      assert.equal((await writer.expireStale()).expiredCount,1);assert.equal((await writer.expireStale()).expiredCount,0);
      const state=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];assert.equal(state.metric_status,'unknown');assert.ok(state.reason_codes.includes('METRICS_STALE'));
      assert.equal((await pool.query("SELECT count(*) FROM roomqc_control.cluster_events WHERE type='metrics_stale'")).rows[0].count,'1');
      const result=await writer.record('cluster-a',sample(Date.now()));assert.ok(result.reasonCodes.includes('METRICS_WARMING'));
      assert.equal((await pool.query('SELECT operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0].operator_reopen_required,true);
    }finally{await metricsPool.end();await api.close()}
  });
  dbtest('health snapshot: failed transition audit rolls back snapshot and operator latch atomically',async()=>{
    const {pool,metricsPool,api}=await fixture('health_atomic');
    try{
      await pool.query(`CREATE FUNCTION roomqc_control.reject_health_event() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Isolated health audit failure'; END $$;
        CREATE TRIGGER reject_health_event BEFORE INSERT ON roomqc_control.cluster_events FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_health_event()`);
      await assert.rejects(()=>new HealthStore(metricsPool).record('cluster-a',sample(Date.now(),{dataDiskFreeBytes:1024})),{code:'P0001'});
      assert.equal((await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rowCount,0);
      assert.equal((await pool.query('SELECT operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0].operator_reopen_required,false);
    }finally{await metricsPool.end();await api.close()}
  });
  dbtest('multi-mount health: metrics role persists v2 identity/disks through restarts; storage critical blocks only new allocation',async()=>{
    const {pool,metricsPool,api}=await fixture('health_multi');
    try{
      const now=Date.now();let clock=now-300000,writer=new HealthStore(metricsPool,{clock:()=>clock});
      const v2=(at,storageFree=60*1024**3)=>({...sample(at),schemaVersion:2,targetFingerprint:'c'.repeat(64),measurementScope:'docker-desktop-vm',
        requiredMountIds:['database','storage'],dataDisks:[{id:'database',freeBytes:100*1024**3,totalBytes:200*1024**3,inodeFreePercent:80},
          {id:'storage',freeBytes:storageFree,totalBytes:120*1024**3,inodeFreePercent:80}]});
      for(let i=0;i<=10;i++){
        clock=now-300000+i*30000;if(i===5)writer=new HealthStore(metricsPool,{clock:()=>clock});await writer.record('cluster-a',v2(clock));
      }
      // Warmup latches operator approval; healthy metrics must never clear it.
      await api.admin.execute({id:randomUUID(),clusterId:'cluster-a'},clusterCommand({operation:'open_admission',expectedVersion:1,
        reason:'Approve warm metrics in isolated multi-mount test',payload:{}},randomUUID(),'cluster-a'),randomUUID());
      const active=await api.reserve({slug:'existing-health-client',email:'existing@example.invalid',displayName:'Existing fixture'},randomUUID());
      await pool.query("UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3,owner_id=$4 WHERE id=$1",[active.id,randomUUID(),randomUUID(),randomUUID()]);
      const before=(await pool.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1',[active.id])).rows[0];
      clock=now+1;await new HealthStore(metricsPool,{clock:()=>clock}).record('cluster-a',v2(clock,9*1024**3));
      const saved=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];
      assert.equal(saved.evaluator_state.targetFingerprint,'c'.repeat(64));assert.equal(saved.evaluator_state.dataDisks[1].freeBytes,9*1024**3);
      assert.equal(saved.evaluator_state.measurementScope,'docker-desktop-vm');assert.deepEqual(Object.keys(saved.evaluator_state.affectedMounts),['storage']);
      assert.ok(saved.reason_codes.includes('DISK_CRITICAL'));
      const dto=publicCluster(await api.admin.cluster('cluster-a'),api.config,{now:clock});
      assert.equal(dto.health.schemaVersion,2);assert.equal(dto.health.measurementScope,'docker-desktop-vm');assert.equal(dto.health.dataDisks.length,2);
      assert.equal(dto.admission.decision,'blocked');await assert.rejects(()=>api.reserve({slug:'blocked-health-client',email:'new@example.invalid',displayName:'New fixture'},randomUUID()),{code:'NO_CAPACITY'});
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1',[active.id])).rows[0],before);
      const stale=publicCluster(await api.admin.cluster('cluster-a'),api.config,{now:clock+120000});assert.equal(stale.health.status,'unknown');
      assert.equal(stale.health.dataDisks[1].freeBytes,9*1024**3,'Old values remain visible, never relabeled healthy');
      await assert.rejects(()=>metricsPool.query('UPDATE roomqc_control.cluster_policies SET operator_reopen_required=false'),{code:'42501'});
    }finally{await metricsPool.end();await api.close()}
  });
  dbtest('multi-mount health: rejected samples do not advance generation and target changes reset persisted warmup/recovery',async()=>{
    const {pool,metricsPool,api}=await fixture('health_target');
    try{
      const now=Date.now();let clock=now-300000;const writer=new HealthStore(metricsPool,{clock:()=>clock});
      const v2=at=>({...sample(at),schemaVersion:2,targetFingerprint:'c'.repeat(64),measurementScope:'linux-host',requiredMountIds:['database'],
        dataDisks:[{id:'database',freeBytes:100*1024**3,totalBytes:200*1024**3,inodeFreePercent:80}]});
      for(let i=0;i<=10;i++){clock=now-300000+i*30000;await writer.record('cluster-a',v2(clock))}
      const before=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];assert.equal(before.metric_status,'healthy');
      clock=now+1;await assert.rejects(()=>writer.record('cluster-a',{...v2(clock),requiredMountIds:['missing']}),{code:'INVALID_DISKS'});
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0],before);
      const changed=await new HealthStore(metricsPool,{clock:()=>clock}).record('cluster-a',{...v2(clock),targetFingerprint:'d'.repeat(64)});
      assert.ok(changed.reasonCodes.includes('METRICS_WARMING'));
      const after=(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows[0];
      assert.equal(after.evaluator_state.recoverySince,clock);assert.equal(after.evaluator_state.firstValidAt,clock);
      assert.equal(after.evaluator_state.targetFingerprint,'d'.repeat(64));assert.ok(Number(after.source_generation)>Number(before.source_generation));
    }finally{await metricsPool.end();await api.close()}
  });
}
