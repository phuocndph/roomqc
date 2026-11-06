import {randomUUID} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {DeploymentJournal} from './deployment-journal.mjs';
import {executeReleasePlan} from './vps-deploy.mjs';
import {advanceDeploymentPhase} from './deployment-readiness.mjs';

export const deploymentJobStates=Object.freeze(['queued','running','succeeded','failed','needs_review']);
const time=value=>value instanceof Date?value.toISOString():value??null;
export const deploymentSpecView=row=>({id:row.id,clusterId:row.cluster_id,hostId:row.host_id,environment:row.environment,
  releaseId:row.release_id,composeSha256:row.compose_sha256,executionSha256:row.execution_sha256,expiresAt:time(row.expires_at),createdAt:time(row.created_at)});
export const deploymentJobView=row=>({id:row.id,commandId:row.command_id,specId:row.spec_id,clusterId:row.cluster_id,
  runId:row.run_id,state:row.state,errorCode:row.error_code,releaseId:row.release_id,
  createdAt:time(row.created_at),updatedAt:time(row.updated_at),finishedAt:time(row.finished_at)});
const fail=code=>Object.assign(new Error(code),{code});
const safeCode=value=>/^[A-Z][A-Z0-9_]{1,119}$/.test(value??'')?value:'DEPLOYMENT_EXECUTOR_FAILED';

export async function enqueueDeployment(client,command,commandId){
  const spec=(await client.query(`SELECT * FROM roomqc_control.deployment_specs WHERE id=$1 AND cluster_id=$2
    AND execution_sha256=$3 AND expires_at>clock_timestamp()`,[command.payload.specId,command.targetId,command.payload.executionSha256])).rows[0];
  if(!spec)throw new ControlError(409,'DEPLOYMENT_SPEC_UNAVAILABLE','Bản triển khai đã thay đổi hoặc hết hạn. Hãy tải lại danh sách.');
  try{
    await client.query(`INSERT INTO roomqc_control.deployment_jobs(id,command_id,spec_id,cluster_id) VALUES($1,$2,$3,$4)`,
    [randomUUID(),commandId,spec.id,command.targetId]);
  }catch(error){
    if(['23505','42501'].includes(error.code))throw new ControlError(409,'DEPLOYMENT_QUEUE_BLOCKED','Cần đóng nhận khách, kiểm tra máy và giải quyết lượt triển khai trước.');
    throw error;
  }
}

/** A claimed job is never returned to queued. Its run is reserved atomically
 * with the claim, before the worker can even attempt a remote mutation. */
export class DeploymentQueue {
  constructor(pool,{leaseSeconds=120}={}){
    if(!Number.isInteger(leaseSeconds)||leaseSeconds<30||leaseSeconds>600)throw fail('DEPLOYMENT_LEASE_INVALID');
    this.pool=pool;this.leaseSeconds=leaseSeconds;
  }
  async claim(){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const job=(await client.query(`SELECT j.*,s.host_id,s.environment,s.release_id,s.compose_sha256,s.execution_sha256,s.endpoint_fingerprint,s.expires_at
        FROM roomqc_control.deployment_jobs j JOIN roomqc_control.deployment_specs s ON s.id=j.spec_id
        WHERE j.state='queued' ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1`)).rows[0];
      if(!job){await client.query('COMMIT');return null}
      const target=(await client.query(`SELECT c.host_id,h.status,p.manual_closed FROM roomqc_control.clusters c
        JOIN roomqc_control.hosts h ON h.id=c.host_id JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id
        WHERE c.id=$1`,[job.cluster_id])).rows[0];
      const current=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at;
      if(job.expires_at<=current||!target||target.host_id!==job.host_id||target.status!=='active'||!target.manual_closed){
        await client.query(`UPDATE roomqc_control.deployment_jobs SET state='failed',finished_at=clock_timestamp(),
          error_code='DEPLOYMENT_TARGET_NOT_READY' WHERE id=$1`,[job.id]);await client.query('COMMIT');return {skipped:true,id:job.id};
      }
      const plan={kind:'roomqc-vps-release-plan',clusterId:job.cluster_id,hostId:job.host_id,environment:job.environment,
        releaseId:job.release_id,compose:{sha256:job.compose_sha256},specId:job.spec_id};
      // Unique unresolved-run index also fences CLI/operator races.
      let runId;
      await client.query('SAVEPOINT reserve_run');
      try{runId=await new DeploymentJournal(client).begin(plan)}catch(error){
        if(error.code!=='DEPLOYMENT_CLUSTER_UNRESOLVED')throw error;
        await client.query('ROLLBACK TO SAVEPOINT reserve_run');
        await client.query(`UPDATE roomqc_control.deployment_jobs SET state='failed',finished_at=clock_timestamp(),
          error_code='DEPLOYMENT_CLUSTER_UNRESOLVED' WHERE id=$1`,[job.id]);await client.query('COMMIT');return {skipped:true,id:job.id};
      }
      const token=randomUUID();
      await client.query(`UPDATE roomqc_control.deployment_jobs SET state='running',run_id=$2,lease_token=$3,
        lease_until=clock_timestamp()+$4*interval '1 second' WHERE id=$1`,[job.id,runId,token,this.leaseSeconds]);
      await client.query('COMMIT');return {...job,run_id:runId,lease_token:token};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  }
  async renew(job){
    const result=await this.pool.query(`UPDATE roomqc_control.deployment_jobs j SET lease_until=clock_timestamp()+$3*interval '1 second'
      WHERE j.id=$1 AND j.state='running' AND j.lease_token=$2 AND j.lease_until>clock_timestamp()
      AND EXISTS(SELECT 1 FROM roomqc_control.clusters c JOIN roomqc_control.hosts h ON h.id=c.host_id
        JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id WHERE c.id=j.cluster_id AND c.host_id=$4
        AND h.status='active' AND p.manual_closed=true) RETURNING j.id`,[job.id,job.lease_token,this.leaseSeconds,job.host_id]);
    if(result.rowCount!==1)throw fail('DEPLOYMENT_LEASE_LOST');
  }
  async settle(){
    // Observation only: no remote command is retried, including on lease expiry.
    const result=await this.pool.query(`UPDATE roomqc_control.deployment_jobs j SET
      state=CASE WHEN r.state='deployed' OR x.outcome='candidate_healthy' THEN 'succeeded'
        WHEN r.state IN('blocked','not_started','rolled_back') OR x.outcome IN('previous_healthy','empty') THEN 'failed' ELSE 'needs_review' END,
      error_code=CASE WHEN r.state='running' AND x.id IS NULL THEN 'DEPLOYMENT_EXECUTOR_INTERRUPTED' ELSE r.error_code END,
      lease_token=NULL,lease_until=NULL,
      finished_at=CASE WHEN r.state IN('deployed','blocked','not_started','rolled_back') OR x.id IS NOT NULL THEN clock_timestamp() ELSE NULL END
      FROM roomqc_control.deployment_runs r LEFT JOIN roomqc_control.deployment_resolutions x ON x.id=r.reconciliation_id
      WHERE j.run_id=r.id AND ((j.state='running' AND (j.lease_until<=clock_timestamp() OR r.state<>'running' OR x.id IS NOT NULL))
        OR (j.state='needs_review' AND (r.state IN('deployed','blocked','not_started','rolled_back') OR x.id IS NOT NULL))) RETURNING j.id,j.state`);
    return result.rows;
  }
}

export async function executeDeploymentJob(queue,prepare){
  await queue.settle();
  const job=await queue.claim();if(!job||job.skipped)return job;
  const journal=new DeploymentJournal(queue.pool);let started=false,heartbeatError=null,heartbeat=Promise.resolve(),timer;
  try{
    // Keep the claim alive during bounded preflight as well as remote execution.
    timer=setInterval(()=>{heartbeat=heartbeat.then(()=>queue.renew(job)).catch(error=>{heartbeatError=error})},10000);timer.unref();
    const {plan,remote}=await prepare(job);
    if(plan.clusterId!==job.cluster_id||plan.hostId!==job.host_id||plan.environment!==job.environment
      ||plan.releaseId!==job.release_id||plan.compose?.sha256!==job.compose_sha256)throw fail('DEPLOYMENT_SPEC_CHANGED');
    await queue.renew(job);if(heartbeatError)throw heartbeatError;
    started=true;
    const result=await executeReleasePlan({...plan,journalRunId:job.run_id},{remote,onPhase:async phase=>{
      if(heartbeatError)throw heartbeatError;await queue.renew(job);await advanceDeploymentPhase(queue.pool,job.run_id,phase);
    }});
    clearInterval(timer);await heartbeat;
    await journal.finish(job.run_id,result);
  }catch(error){
    clearInterval(timer);await heartbeat;
    // A failure after mutation starts remains fenced until remote reconciliation.
    await journal.finish(job.run_id,{status:started?'outcome_unknown':'not_started',errorCode:safeCode(error.code)}).catch(()=>{});
  }finally{clearInterval(timer)}
  await queue.settle();
  return {id:job.id,runId:job.run_id};
}
