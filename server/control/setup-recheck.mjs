import {createHash,randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {ControlError,uuidPattern} from './errors.mjs';
import {requireCapability} from './admin.mjs';
import {exact} from './probe-secrets.mjs';
import {setupBackfillFingerprint,classifySetupBackfill} from './setup-backfill.mjs';
import {releaseAuthorizationContext} from './release-validation.mjs';
import {releaseAuthoritySelect,releaseAuthorityMatches} from './release-authority.mjs';
import {assertLiveSupportAuthority,durableSupportTransaction} from './support-authority.mjs';

const invalid=()=>new ControlError(400,'INVALID_WORKSPACE_RECHECK','Cần đăng ký, phiên bản, snapshot, mã lệnh và lý do hợp lệ.');
const stale=()=>new ControlError(409,'WORKSPACE_SNAPSHOT_CHANGED','Đăng ký đã thay đổi. Hãy tải lại chi tiết trước khi kiểm tra.');
const unknown=()=>new ControlError(404,'WORKSPACE_RECHECK_RESULT_UNKNOWN','Chưa xác định kết quả. Giữ nguyên mã lệnh và kiểm tra lại.');
const uuid=v=>typeof v==='string'&&uuidPattern.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function workspaceRecheckCommand(target,body,key){
  if(!uuid(target)||!uuid(key)||!exact(body,['expectedVersion','expectedSnapshotSha256','reason'])
    ||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||!digest(body.expectedSnapshotSha256)
    ||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000)throw invalid();
  const request={target:target.toLowerCase(),key:key.toLowerCase(),expectedVersion:body.expectedVersion,
    expectedSnapshotSha256:body.expectedSnapshotSha256,reason:body.reason.trim()};
  return {...request,payloadHash:createHash('sha256').update(JSON.stringify(request)).digest('hex')};
}
export function workspaceRecheckLookup(target,key,params=new URLSearchParams()){
  if(!uuid(target)||!uuid(key)||[...params].length)throw invalid();
  return {target:target.toLowerCase(),key:key.toLowerCase()};
}
export async function readWorkspaceRecheckSnapshot(client,id,clusterId){
  return (await client.query('SELECT roomqc_control.setup_backfill_snapshot_value($1,$2) AS snapshot',[id,clusterId])).rows[0]?.snapshot??null;
}
const outcomes=['queued','reused_job','running','activated','verified_active','waiting_owner','needs_review','unavailable'];
export function workspaceRecheckReceipt(value){
  if(!value||!uuid(value.commandId)||!uuid(value.requestKey)||!uuid(value.workspaceId)||!Number.isSafeInteger(value.routingVersion)||value.routingVersion<1
    ||!outcomes.includes(value.outcome)||typeof value.reasonCode!=='string'||!/^SETUP_[A-Z0-9_]{1,80}$/.test(value.reasonCode)
    ||typeof value.recordedAt!=='string'||!Number.isFinite(Date.parse(value.recordedAt))||value.status!=='succeeded'
    ||value.jobId!==null&&!uuid(value.jobId)||typeof value.clusterId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(value.clusterId))
    throw new ControlError(503,'WORKSPACE_RECHECK_RESULT_UNAVAILABLE','Kết quả chưa thể xác nhận. Giữ nguyên mã lệnh.');
  return Object.fromEntries(['commandId','requestKey','status','workspaceId','clusterId','routingVersion','outcome','reasonCode','jobId','recordedAt'].map(k=>[k,value[k]]));
}
async function observation(gateway,snapshot){
  if(!snapshot)return {status:'unavailable'};
  try{
    const timeout=AbortSignal.timeout(5000);let listener;
    const expired=new Promise(resolve=>{listener=()=>resolve({status:'unavailable'});timeout.addEventListener('abort',listener,{once:true})});
    try{return await Promise.race([gateway.binding({...snapshot.workspace,api_url:snapshot.cluster.api_url},{timeoutMs:5000})
      .then(r=>r===null?{status:'missing'}:{status:'present',receipt:r}).catch(()=>({status:'unavailable'})),expired])}
    finally{timeout.removeEventListener('abort',listener)}
  }catch{return {status:'unavailable'}}
}
export class WorkspaceRecheckStore{
  constructor(store){this.store=store;this.pool=store.pool;this.config=store.config}
  async release(client,snapshot,now){
    try{
      const {approval}=releaseAuthorizationContext(this.config,snapshot.cluster,{now});
      const row=(await client.query(releaseAuthoritySelect,[snapshot.cluster.id])).rows[0];
      // Writes hold727001 shared, so installer/exclusive authority mutations
      // cannot cross this transaction. Reconstruct the signed runtime binding;
      // stored approval identity alone is not deployment authorization.
      return releaseAuthorityMatches(row,approval);
    }catch{return false}
  }
  async authority(actor,authorize){
    requireCapability(actor,'support-reconcile',this.config);
    const current=await assertLiveSupportAuthority(actor,authorize);
    requireCapability(current,'support-reconcile',this.config);
    if(current.id!==actor.id||current.clusterId!==actor.clusterId)throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Phiên quản trị đã thay đổi.');
  }
  async lookup(actor,lookup,authorize,client=this.pool){
    await this.authority(actor,authorize);
    const row=(await client.query(`SELECT result FROM roomqc_control.workspace_recheck_commands
      WHERE actor_id=$1 AND authority_cluster_id=$2 AND operation='recheck' AND workspace_id=$3 AND idempotency_key=$4`,
      [actor.id,actor.clusterId,lookup.target,lookup.key])).rows[0];
    if(!row)throw unknown();await this.authority(actor,authorize);return workspaceRecheckReceipt(row.result);
  }
  async execute(actor,command,requestId,gateway,authorize){
    await this.authority(actor,authorize);
    // Replay BEFORE snapshot/remote access. A committed command is historical
    // evidence even after a worker changes state or the cluster is unavailable.
    const existing=await this.pool.query(`SELECT payload_hash,result FROM roomqc_control.workspace_recheck_commands
      WHERE actor_id=$1 AND authority_cluster_id=$2 AND operation='recheck' AND workspace_id=$3 AND idempotency_key=$4`,
      [actor.id,actor.clusterId,command.target,command.key]);
    if(existing.rows[0]){
      if(existing.rows[0].payload_hash!==command.payloadHash)throw new ControlError(409,'WORKSPACE_RECHECK_KEY_CONFLICT','Mã lệnh đã dùng với nội dung khác.');
      await this.authority(actor,authorize);return workspaceRecheckReceipt(existing.rows[0].result);
    }
    const w=(await this.pool.query('SELECT cluster_id FROM roomqc_control.workspaces WHERE id=$1',[command.target])).rows[0];
    const before=w?await readWorkspaceRecheckSnapshot(this.pool,command.target,w.cluster_id):null;
    const observationStarted=Date.now();
    // A stale preflight must still serialize behind an in-flight SAME key.
    // Otherwise its successful commit could be misreported as "not applied".
    const preflightMatches=before&&before.workspace.routing_version===command.expectedVersion
      &&setupBackfillFingerprint(before)===command.expectedSnapshotSha256;
    const observed=preflightMatches&&await this.release(this.pool,before,observationStarted)
      ?await observation(gateway,before):{status:'unavailable'};
    let commitFence=()=>{};
    return durableSupportTransaction(this.pool,actor,authorize,{kind:'recheck',operation:'recheck',acceptanceOperation:'recheck_workspace',
      target:command.target,key:command.key,payloadHash:command.payloadHash},{lookup:async client=>{
      await this.authority(actor,authorize);
      const replay=(await client.query(`SELECT payload_hash,result FROM roomqc_control.workspace_recheck_commands
        WHERE actor_id=$1 AND authority_cluster_id=$2 AND operation='recheck' AND workspace_id=$3 AND idempotency_key=$4`,
        [actor.id,actor.clusterId,command.target,command.key])).rows[0];
      if(replay){
        if(replay.payload_hash!==command.payloadHash)throw new ControlError(409,'WORKSPACE_RECHECK_KEY_CONFLICT','Mã lệnh đã dùng với nội dung khác.');
        await this.authority(actor,authorize);return workspaceRecheckReceipt(replay.result);
      }
      return null;
    },mutate:async client=>{
      const locked=(await client.query('SELECT id,cluster_id FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[command.target])).rows[0];
      if(!locked)throw new ControlError(404,'WORKSPACE_NOT_FOUND','Không tìm thấy đăng ký.');
      await client.query('SELECT id FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1 ORDER BY id FOR UPDATE',[command.target]);
      await client.query('SELECT id FROM roomqc_control.setup_dispatches WHERE workspace_id=$1 ORDER BY id FOR UPDATE',[command.target]);
      await client.query('SELECT id FROM roomqc_control.clusters WHERE id=$1 FOR SHARE',[locked.cluster_id]);
      const s=await readWorkspaceRecheckSnapshot(client,command.target,locked.cluster_id);
      if(!s||s.workspace.routing_version!==command.expectedVersion||setupBackfillFingerprint(s)!==command.expectedSnapshotSha256)throw stale();
      await this.authority(actor,authorize);
      const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      const releaseValid=await this.release(client,s,now.getTime());
      const fresh=now.getTime()-observationStarted>=0&&now.getTime()-observationStarted<5000;
      const {workspace,job,dispatch}=s,classification=classifySetupBackfill(s,releaseValid&&fresh?observed:{status:'unavailable'},{now:now.getTime()});
      let outcome='needs_review',reasonCode=classification.reason,jobId=job?.id??null;
      const validDispatch=dispatch&&dispatch.workspace_id===workspace.id&&dispatch.cluster_id===workspace.cluster_id
        &&dispatch.owner_id===workspace.owner_id&&dispatch.routing_version===workspace.routing_version;
      if(classification.group==='unavailable'){outcome='unavailable';reasonCode='SETUP_RECHECK_UNAVAILABLE'}
      else if(classification.group==='active_valid'){outcome='verified_active';reasonCode='SETUP_ACTIVE_VERIFIED'}
      else if(!['provisioning','active'].includes(workspace.status)||!validDispatch){reasonCode='SETUP_RECHECK_PROTECTED'}
      else if(['succeeded','cancelled'].includes(job?.state)){reasonCode='SETUP_JOB_TERMINAL_PROTECTED'}
      else if(['committed_pending','closed','dispatch_pending'].includes(classification.group)&&job?.state==='leased'&&Date.parse(job.lease_until)>now.getTime()){
        outcome='running';reasonCode='SETUP_LEASE_HELD'}
      else if(classification.group==='committed_pending'||classification.group==='closed'){
        // Local immutable dispatch proof AND a fresh matching receipt (or proven
        // closed with no contradictory receipt). Never infer closed from missing.
        outcome=classification.group==='committed_pending'?'activated':'waiting_owner';reasonCode=outcome==='activated'?'SETUP_COMMITTED_VERIFIED':'SETUP_CLOSED_VERIFIED';
        if(job?.state==='leased')await client.query(`UPDATE roomqc_control.setup_recovery_attempts SET outcome='lease_expired',error_code='SETUP_LEASE_EXPIRED',finished_at=clock_timestamp()
          WHERE job_id=$1 AND lease_token=$2 AND outcome='claimed'`,[job.id,job.lease_token]);
        if(!job){
          jobId=randomUUID();await client.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,dispatch_id,expected_routing_version,state,max_attempts,created_at,deadline_at)
            VALUES($1,$2,$3,$4,$5,3,$6,$6::timestamptz+interval '15 minutes')`,
            [jobId,workspace.id,dispatch.id,workspace.routing_version,outcome==='activated'?'succeeded':'waiting_owner',now]);
        }else await client.query(`UPDATE roomqc_control.provisioning_jobs SET state=$2,lease_token=NULL,lease_until=NULL,
          last_error_code=$3,updated_at=clock_timestamp() WHERE id=$1`,[job.id,outcome==='activated'?'succeeded':'waiting_owner',outcome==='activated'?null:'SETUP_DISPATCH_CLOSED']);
        if(outcome==='activated')await client.query(`UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3,expires_at=NULL,
          last_error_code=NULL,updated_at=clock_timestamp() WHERE id=$1`,[workspace.id,dispatch.tenant_id,dispatch.hotel_id]);
      }else if(classification.group==='dispatch_pending'&&workspace.status==='provisioning'&&dispatch.terminal_state===null){
        const usable=job&&['queued','retry','leased'].includes(job.state)&&job.attempts<job.max_attempts&&Date.parse(job.deadline_at)>now.getTime();
        if(usable){outcome='reused_job';reasonCode='SETUP_JOB_REUSED'}
        else{
          const used=(await client.query('SELECT job_id FROM roomqc_control.workspace_recheck_cycles WHERE workspace_id=$1 AND dispatch_id=$2',[workspace.id,dispatch.id])).rows[0];
          if(used){reasonCode='SETUP_RECHECK_BUDGET_EXHAUSTED'}
          else{
            if(job?.state==='leased')await client.query(`UPDATE roomqc_control.setup_recovery_attempts SET outcome='lease_expired',error_code='SETUP_LEASE_EXPIRED',finished_at=clock_timestamp()
              WHERE job_id=$1 AND lease_token=$2 AND outcome='claimed'`,[job.id,job.lease_token]);
            if(job&&!['succeeded','cancelled'].includes(job.state))await client.query(`UPDATE roomqc_control.provisioning_jobs SET state='cancelled',
              lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1`,[job.id]);
            jobId=randomUUID();
            await client.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,dispatch_id,expected_routing_version,max_attempts,created_at,deadline_at,next_attempt_at)
              VALUES($1,$2,$3,$4,3,$5,$5::timestamptz+interval '15 minutes',$5)`,[jobId,workspace.id,dispatch.id,workspace.routing_version,now]);
            outcome='queued';reasonCode='SETUP_RECHECK_QUEUED';
          }
        }
      }
      const result={commandId:randomUUID(),requestKey:command.key,status:'succeeded',workspaceId:workspace.id,clusterId:workspace.cluster_id,
        routingVersion:workspace.routing_version,outcome,reasonCode,jobId,recordedAt:now.toISOString()};
      await client.query(`INSERT INTO roomqc_control.workspace_recheck_commands(id,actor_id,authority_cluster_id,workspace_id,idempotency_key,payload_hash,reason,result)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[result.commandId,actor.id,actor.clusterId,workspace.id,command.key,command.payloadHash,command.reason,JSON.stringify(result)]);
      if(outcome==='queued')await client.query(`INSERT INTO roomqc_control.workspace_recheck_cycles(workspace_id,dispatch_id,job_id,previous_job_id,command_id,created_at,deadline_at)
        VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz+interval '15 minutes')`,[workspace.id,dispatch.id,jobId,job?.id??null,result.commandId,now]);
      await client.query(`INSERT INTO roomqc_control.workspace_recheck_events(command_id,workspace_id,actor_id,request_id,outcome,reason_code)
        VALUES($1,$2,$3,$4,$5,$6)`,[result.commandId,workspace.id,actor.id,requestId,outcome,reasonCode]);
      await client.query(`INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)`,[requestId,workspace.id,'setup_recheck_'+outcome]);
      await this.authority(actor,authorize);
      // The final check includes audit/trigger waits. Release and job budget
      // must still be valid when any new activation/recovery is committed.
      const finalFenceStarted=performance.now();
      const end=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
      const protectedOutcome=['activated','waiting_owner','queued','reused_job','running','verified_active'].includes(outcome);
      const expired=at=>at-now.getTime()>=5000||protectedOutcome
        &&(at>=Number(s.approval?.expires_at_ms)||at<Number(s.approval?.not_before_ms))
        ||['reused_job','running'].includes(outcome)&&at>=Date.parse(job.deadline_at)
        ||outcome==='running'&&at>=Date.parse(job.lease_until);
      if(expired(end)||protectedOutcome&&!await this.release(client,s,end))
        throw new ControlError(503,'WORKSPACE_RECHECK_FENCE_EXPIRED','Thời hạn đối soát đã thay đổi. Giữ nguyên mã lệnh để kiểm tra lại.');
      // Release reads can themselves wait. Observe authority again after them,
      // then account conservatively for all elapsed time without another DB or
      // remote await between this check and COMMIT. This is not a cross-DB lock.
      await this.authority(actor,authorize);
      if(expired(end+Math.ceil(performance.now()-finalFenceStarted)))
        throw new ControlError(503,'WORKSPACE_RECHECK_FENCE_EXPIRED','Thời hạn đối soát đã thay đổi. Giữ nguyên mã lệnh để kiểm tra lại.');
      commitFence=()=>{
        if(expired(end+Math.ceil(performance.now()-finalFenceStarted)))
          throw new ControlError(503,'WORKSPACE_RECHECK_FENCE_EXPIRED','Thời hạn đối soát đã thay đổi. Giữ nguyên mã lệnh để kiểm tra lại.');
      };return workspaceRecheckReceipt(result);
    },verifyCommit:()=>commitFence()});
  }
}
