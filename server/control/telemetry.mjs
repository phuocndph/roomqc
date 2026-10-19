import {randomUUID} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {normalizeSample,evaluateSample} from './health-policy.mjs';

const changed=(previous,next)=>previous?.metric_status!==next.status||JSON.stringify(previous?.reason_codes??[])!==JSON.stringify(next.reasonCodes);
const eventView=row=>row?{status:row.metric_status,observedAt:row.observed_at,generation:Number(row.source_generation),reasonCodes:row.reason_codes}:null;
export class HealthStore {
  // The caller owns a bounded pool using only roomqc_control_metrics privileges.
  constructor(pool,{clock=Date.now}={}){this.pool=pool;this.clock=clock}
  async record(clusterId,sample,requestId=randomUUID()){
    if(!/^[a-z][a-z0-9-]{1,39}$/.test(clusterId))throw new ControlError(400,'INVALID_CLUSTER','Mã cụm không hợp lệ.');
    const now=this.clock(),clean=normalizeSample(sample,now),client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
      const policy=(await client.query('SELECT thresholds,row_version FROM roomqc_control.cluster_policies WHERE cluster_id=$1',[clusterId])).rows[0];
      if(!policy)throw new ControlError(404,'CLUSTER_NOT_FOUND','Không tìm thấy cụm.');
      const previous=(await client.query('SELECT * FROM roomqc_control.cluster_health_current WHERE cluster_id=$1',[clusterId])).rows[0];
      if(previous&&Date.parse(clean.observedAt)<=previous.observed_at.getTime()){
        await client.query('COMMIT');return {accepted:false,reason:'SAMPLE_NOT_NEWER',generation:Number(previous.source_generation)};
      }
      const result=evaluateSample(clean,previous?.evaluator_state??{},policy.thresholds,Number(policy.row_version),now);
      const state={...result.state,probes:result.probes};
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
      await client.query('COMMIT');
      return {accepted:true,generation:Number(saved.source_generation),status:result.status,reasonCodes:result.reasonCodes,observedAt:clean.observedAt};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  async expireStale(requestId=randomUUID()){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
      const stale=(await client.query("SELECT * FROM roomqc_control.cluster_health_current WHERE valid_until<=now() AND metric_status<>'unknown' ORDER BY cluster_id")).rows;
      for(const previous of stale){
        const codes=[...new Set([...previous.reason_codes,'METRICS_STALE'])];
        const state={...previous.evaluator_state,blockedReasons:[...new Set([...(previous.evaluator_state.blockedReasons??[]),'METRICS_STALE'])]};
        const saved=(await client.query(`UPDATE roomqc_control.cluster_health_current SET metric_status='unknown',reason_codes=$2,evaluator_state=$3::jsonb,
          source_generation=greatest(nextval('roomqc_control.health_generation_seq'),source_generation+1) WHERE cluster_id=$1 RETURNING *`,[previous.cluster_id,codes,JSON.stringify(state)])).rows[0];
        await client.query('UPDATE roomqc_control.cluster_policies SET operator_reopen_required=true WHERE cluster_id=$1',[previous.cluster_id]);
        await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source,request_id)
          VALUES($1,'metrics_stale',$2::jsonb,$3::jsonb,'collector',$4)`,[previous.cluster_id,JSON.stringify(eventView(previous)),JSON.stringify(eventView(saved)),requestId]);
      }
      await client.query('COMMIT');return {expiredCount:stale.length};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
}
