import {randomUUID} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {normalizeSample,evaluateSample} from './health-policy.mjs';
import {validateTelemetryTarget,telemetryTargetFingerprint} from './telemetry-source.mjs';

const changed=(previous,next)=>previous?.metric_status!==next.status||JSON.stringify(previous?.reason_codes??[])!==JSON.stringify(next.reasonCodes);
const eventView=row=>row?{status:row.metric_status,observedAt:row.observed_at,generation:Number(row.source_generation),reasonCodes:row.reason_codes}:null;
export class HealthStore {
  // The caller owns a bounded pool using only roomqc_control_metrics privileges.
  constructor(pool,{clock=Date.now,transactionTimeoutMs=8000}={}){
    if(!Number.isInteger(transactionTimeoutMs)||transactionTimeoutMs<10||transactionTimeoutMs>10000)throw new ControlError(400,'INVALID_HEALTH_STORE','Giới hạn giao dịch giám sát không hợp lệ.');
    this.pool=pool;this.clock=clock;this.transactionTimeoutMs=transactionTimeoutMs;
  }
  async transaction(run){
    const client=await this.pool.connect();let expired=false;
    // Closing the actual connection cancels SQL and rolls back on the server;
    // do not merely race a promise and let a late transaction commit afterwards.
    const timer=setTimeout(()=>{expired=true;client.release(true)},this.transactionTimeoutMs);
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
      const result=await run(client);await client.query('COMMIT');return result;
    }catch(error){
      if(!expired)await client.query('ROLLBACK');
      if(expired)throw new ControlError(503,'HEALTH_DATABASE_TIMEOUT','Giao dịch giám sát vượt thời gian cho phép.');
      throw error;
    }finally{clearTimeout(timer);if(!expired)client.release()}
  }
  async assertTarget(input){
    const target=validateTelemetryTarget(input),fingerprint=telemetryTargetFingerprint(target);
    const result=await this.pool.query('SELECT telemetry_target_fingerprint FROM roomqc_control.clusters WHERE id=$1',[target.clusterId]);
    if(result.rows[0]?.telemetry_target_fingerprint!==fingerprint)throw new ControlError(409,'TELEMETRY_TARGET_MISMATCH','Nguồn đo không khớp cấu hình đang được duyệt.');
    return {fingerprint};
  }
  async readiness(){
    const {rows}=await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR NOT pg_has_role(current_user,'roomqc_control_metrics','USAGE')
      OR has_schema_privilege(current_user,'roomqc_control','CREATE')
      OR has_table_privilege(current_user,'roomqc_control.workspaces','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.clusters','INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.schema_migrations','INSERT,UPDATE,DELETE') AS excessive
      FROM pg_roles r WHERE r.rolname=current_user`);
    if(rows[0]?.excessive!==false)throw new ControlError(503,'METRICS_RUNTIME_PRIVILEGES','Worker cần tài khoản database giám sát riêng.');
    const {verifyHistory,migrationManifest}=await import('./migrate.mjs');
    const manifest=await migrationManifest();
    if(await verifyHistory(this.pool,manifest)!==manifest.length)throw new ControlError(503,'CONTROL_SCHEMA_PENDING','Database điều phối chưa nâng cấp đầy đủ.');
    return {schemaVersion:manifest.at(-1).version};
  }
  async record(clusterId,sample,requestId=randomUUID()){
    if(!/^[a-z][a-z0-9-]{1,39}$/.test(clusterId))throw new ControlError(400,'INVALID_CLUSTER','Mã cụm không hợp lệ.');
    const now=this.clock(),clean=normalizeSample(sample,now);
    return this.transaction(async client=>{
      const policy=(await client.query('SELECT thresholds,row_version FROM roomqc_control.cluster_policies WHERE cluster_id=$1',[clusterId])).rows[0];
      if(!policy)throw new ControlError(404,'CLUSTER_NOT_FOUND','Không tìm thấy cụm.');
      const target=(await client.query(`SELECT telemetry_target_fingerprint,telemetry_target_definition,
        $2::timestamptz>=telemetry_target_bound_at AS sample_after_binding FROM roomqc_control.clusters WHERE id=$1`,[clusterId,clean.observedAt])).rows[0];
      if(clean.schemaVersion!==2||!target?.telemetry_target_fingerprint||clean.targetFingerprint!==target.telemetry_target_fingerprint){
        throw new ControlError(409,'TELEMETRY_TARGET_MISMATCH','Số đo không thuộc nguồn đang được duyệt.');
      }
      const definition=validateTelemetryTarget(target.telemetry_target_definition);
      if(definition.clusterId!==clusterId||telemetryTargetFingerprint(definition)!==target.telemetry_target_fingerprint
        ||clean.measurementScope!==definition.measurementScope||clean.metrics.dbConnectionBudget!==definition.dbConnectionBudget
        ||JSON.stringify([...clean.requiredMountIds].sort())!==JSON.stringify(definition.dataMounts.map(m=>m.id).sort())){
        throw new ControlError(409,'TELEMETRY_TARGET_MISMATCH','Số đo không khớp phạm vi, ổ dữ liệu hoặc budget đã duyệt.');
      }
      if(target.sample_after_binding!==true)throw new ControlError(409,'TELEMETRY_SAMPLE_BEFORE_BINDING','Cần số đo mới sau khi duyệt nguồn.');
      const previous=(await client.query('SELECT * FROM roomqc_control.cluster_health_current WHERE cluster_id=$1',[clusterId])).rows[0];
      if(previous&&Date.parse(clean.observedAt)<=previous.observed_at.getTime()){
        return {accepted:false,reason:'SAMPLE_NOT_NEWER',generation:Number(previous.source_generation)};
      }
      const result=evaluateSample(clean,previous?.evaluator_state??{},policy.thresholds,Number(policy.row_version),now);
      const state={...result.state,probes:result.probes,...(result.dataDisks?{schemaVersion:2,dataDisks:result.dataDisks,requiredMountIds:result.requiredMountIds}:{})};
      const saved=(await client.query(`INSERT INTO roomqc_control.cluster_health_current(cluster_id,source_generation,observed_at,
        received_at,valid_until,metric_status,normalized_values,reason_codes,evaluator_state)
        VALUES($1,nextval('roomqc_control.health_generation_seq'),$2,now(),$2::timestamptz+interval '120 seconds',$3,$4::jsonb,$5,$6::jsonb)
        ON CONFLICT(cluster_id) DO UPDATE SET source_generation=greatest(EXCLUDED.source_generation,roomqc_control.cluster_health_current.source_generation+1),observed_at=EXCLUDED.observed_at,
          received_at=EXCLUDED.received_at,valid_until=EXCLUDED.valid_until,metric_status=EXCLUDED.metric_status,
          normalized_values=EXCLUDED.normalized_values,reason_codes=EXCLUDED.reason_codes,evaluator_state=EXCLUDED.evaluator_state RETURNING *`,
        [clusterId,clean.observedAt,result.status,JSON.stringify(result.metrics),result.reasonCodes,JSON.stringify(state)])).rows[0];
      if(result.state.blockedReasons.length)await client.query('UPDATE roomqc_control.cluster_policies SET operator_reopen_required=true WHERE cluster_id=$1',[clusterId]);
      if(changed(previous,result))await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
        VALUES($1,'health_changed',$2::jsonb,$3::jsonb,'collector',$4)`,[clusterId,JSON.stringify(eventView(previous)),JSON.stringify(eventView(saved)),requestId]);
      return {accepted:true,generation:Number(saved.source_generation),status:result.status,reasonCodes:result.reasonCodes,observedAt:clean.observedAt};
    });
  }
  async expireStale(requestId=randomUUID()){
    return this.transaction(async client=>{
      const stale=(await client.query("SELECT * FROM roomqc_control.cluster_health_current WHERE valid_until<=now() AND metric_status<>'unknown' ORDER BY cluster_id LIMIT 100")).rows;
      for(const previous of stale){
        const codes=[...new Set([...previous.reason_codes,'METRICS_STALE'])];
        const state={...previous.evaluator_state,blockedReasons:[...new Set([...(previous.evaluator_state.blockedReasons??[]),'METRICS_STALE'])]};
        const saved=(await client.query(`UPDATE roomqc_control.cluster_health_current SET metric_status='unknown',reason_codes=$2,evaluator_state=$3::jsonb,
          source_generation=greatest(nextval('roomqc_control.health_generation_seq'),source_generation+1) WHERE cluster_id=$1 RETURNING *`,[previous.cluster_id,codes,JSON.stringify(state)])).rows[0];
        await client.query('UPDATE roomqc_control.cluster_policies SET operator_reopen_required=true WHERE cluster_id=$1',[previous.cluster_id]);
        await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
          VALUES($1,'metrics_stale',$2::jsonb,$3::jsonb,'collector',$4)`,[previous.cluster_id,JSON.stringify(eventView(previous)),JSON.stringify(eventView(saved)),requestId]);
      }
      return {expiredCount:stale.length};
    });
  }
}
