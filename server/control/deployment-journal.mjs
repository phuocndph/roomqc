import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {deploymentRuntimeConfiguration,deploymentRuntimeReadiness} from './deployment-runtime.mjs';
import {executeReleasePlan} from './vps-deploy.mjs';
import {evidenceHash} from './deployment-reconciliation.mjs';
import {uuidPattern} from './errors.mjs';

export const deploymentStates=Object.freeze(['running','blocked','not_started','deployed','rolled_back','rollback_failed','outcome_unknown']);
export const deploymentPhases=Object.freeze(['preflight','stage_release','validate_compose','start_release','health_gate','commit_release']);
const invalid=code=>Object.assign(new Error(code),{code});
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,119}$/.test(value)?value:null;
const timestamp=value=>value instanceof Date?value.toISOString():value??null;
export function resolutionView(row){return row?{id:row.id,outcome:row.outcome,currentReleaseId:row.current_release_id,
  evidenceSha256:row.evidence_sha256,observedAt:timestamp(row.observed_at),recordedAt:timestamp(row.recorded_at)}:null}
export function deploymentView(row){
  // No Compose source, shell, address, credentials or arbitrary exception text.
  return {id:row.id,clusterId:row.cluster_id,hostId:row.host_id,environment:row.environment,releaseId:row.release_id,
    composeSha256:row.compose_sha256,state:row.state,phase:deploymentPhases[row.phase_index],errorCode:code(row.error_code),
    createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at),finishedAt:timestamp(row.finished_at),resolution:resolutionView(row.resolution),
    lastGate:row.gate?{phase:deploymentPhases[row.gate.phase_index],mode:row.gate.evidence.mode,decision:row.gate.evidence.decision,
      reasons:row.gate.evidence.reasons,observedAt:row.gate.evidence.observedAt,approvalId:row.gate.evidence.approvalId,
      backupId:row.gate.evidence.backupId,schemaManifestHash:row.gate.evidence.schemaManifestHash}:null};
}
export class DeploymentJournal {
  constructor(pool){this.pool=pool}
  async advance(id,phase){const {advanceDeploymentPhase}=await import('./deployment-readiness.mjs');return advanceDeploymentPhase(this.pool,id,phase)}
  async begin(plan){
    if(plan?.kind!=='roomqc-vps-release-plan'||!/^[a-f0-9]{64}$/.test(plan.compose?.sha256??''))throw invalid('DEPLOYMENT_PLAN_INVALID');
    const id=randomUUID();
    try{
      const result=await this.pool.query(`INSERT INTO roomqc_control.deployment_runs
        (id,cluster_id,host_id,environment,release_id,compose_sha256,state,spec_id)
        SELECT $1,c.id,h.id,h.environment,$4,$5,'running',$7 FROM roomqc_control.clusters c
        JOIN roomqc_control.hosts h ON h.id=c.host_id
        WHERE c.id=$2 AND h.id=$3 AND h.environment=$6 RETURNING id`,
      [id,plan.clusterId,plan.hostId,plan.releaseId,plan.compose.sha256,plan.environment,plan.specId??null]);
      if(result.rowCount!==1)throw invalid('DEPLOYMENT_TARGET_UNREGISTERED');
      return id;
    }catch(error){if(error.code==='23505')throw invalid('DEPLOYMENT_CLUSTER_UNRESOLVED');throw error}
  }
  async phase(id,phase){
    const index=deploymentPhases.indexOf(phase);
    if(index<1)throw invalid('DEPLOYMENT_PHASE_INVALID');
    const result=await this.pool.query(`UPDATE roomqc_control.deployment_runs SET phase_index=$2
      WHERE id=$1 AND state='running' AND reconciliation_id IS NULL AND phase_index=$2-1 RETURNING id`,[id,index]);
    if(result.rowCount!==1)throw invalid('DEPLOYMENT_JOURNAL_CONFLICT');
  }
  async finish(id,result){
    if(!deploymentStates.includes(result?.status)||result.status==='running')throw invalid('DEPLOYMENT_RESULT_INVALID');
    const saved=await this.pool.query(`UPDATE roomqc_control.deployment_runs
      SET state=$2,error_code=$3,finished_at=clock_timestamp() WHERE id=$1 AND state='running' AND reconciliation_id IS NULL RETURNING id`,
    [id,result.status,code(result.errorCode)]);
    if(saved.rowCount!==1)throw invalid('DEPLOYMENT_JOURNAL_CONFLICT');
  }
  async read(id){
    if(!uuidPattern.test(id??''))throw invalid('DEPLOYMENT_RECONCILIATION_INVALID');
    const result=await this.pool.query(`SELECT d.*,d.updated_at::text AS version,row_to_json(r) AS resolution
      FROM roomqc_control.deployment_runs d LEFT JOIN roomqc_control.deployment_resolutions r ON r.id=d.reconciliation_id WHERE d.id=$1`,[id]);
    if(!result.rowCount)throw invalid('DEPLOYMENT_RUN_NOT_FOUND');
    return {...result.rows[0],resolution:resolutionView(result.rows[0].resolution)};
  }
  async resolve(row,proof){
    const {evidenceSha256,...evidence}=proof??{};
    if(!proof||evidenceHash(evidence)!==evidenceSha256||proof.runId!==row.id||proof.clusterId!==row.cluster_id||proof.hostId!==row.host_id
      ||proof.environment!==row.environment||proof.releaseId!==row.release_id||proof.composeSha256!==row.compose_sha256)
      throw invalid('DEPLOYMENT_RECONCILIATION_PROOF_INVALID');
    try{
      const saved=await this.pool.query(`INSERT INTO roomqc_control.deployment_resolutions
        (id,run_id,expected_version,outcome,current_release_id,evidence_sha256,observed_at,evidence)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [randomUUID(),row.id,row.version,proof.outcome,proof.currentRelease,evidenceSha256,proof.observedAt,JSON.stringify(evidence)]);
      return resolutionView(saved.rows[0]);
    }catch(error){if(['40001','23505'].includes(error.code))throw invalid('DEPLOYMENT_RESOLUTION_CONFLICT');throw error}
  }
}

/** Persist intent before any remote mutation. A failed receipt never permits a rerun. */
export async function executeJournaledRelease(plan,{journal,remote,onReserved}={}){
  const id=await journal.begin(plan);
  try{await onReserved?.(id)}catch{
    await journal.finish(id,{status:'not_started',errorCode:'DEPLOYMENT_OUTPUT_UNAVAILABLE'});
    throw invalid('DEPLOYMENT_OUTPUT_UNAVAILABLE');
  }
  const result=await executeReleasePlan({...plan,journalRunId:id},{remote,onPhase:phase=>journal.advance?journal.advance(id,phase):journal.phase(id,phase)});
  try{await journal.finish(id,result)}catch{throw invalid('DEPLOYMENT_RECEIPT_UNCONFIRMED')}
  return {runId:id,...result};
}

export async function openDeploymentJournal(env=process.env){
  const config=await deploymentRuntimeConfiguration(env);
  const pool=new pg.Pool({connectionString:config.databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000,
    application_name:'roomqc-deployment-journal'});
  pool.on('error',()=>{});
  try{
    const readiness=await deploymentRuntimeReadiness(pool,config);
    return {journal:new DeploymentJournal(pool),readiness,resources:config.resources,close:()=>pool.end()};
  }catch(error){await pool.end().catch(()=>{});throw error}
}
