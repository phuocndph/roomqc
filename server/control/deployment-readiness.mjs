import {randomUUID} from 'node:crypto';
import {DeploymentJournal,deploymentPhases} from './deployment-journal.mjs';

const fail=code=>Object.assign(new Error(code),{code});
export async function advanceDeploymentPhase(pool,runId,phase){
  const index=deploymentPhases.indexOf(phase);if(index<1)throw fail('DEPLOYMENT_PHASE_INVALID');
  const client=await pool.connect();let evidence;
  try{
    await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(727001)');
    evidence=(await client.query('SELECT roomqc_control.deployment_readiness($1) AS value',[runId])).rows[0].value;
    await client.query(`INSERT INTO roomqc_control.deployment_gate_checks(id,run_id,phase_index,evidence) VALUES($1,$2,$3,$4::jsonb)`,
    [randomUUID(),runId,index,JSON.stringify(evidence)]);
    if(evidence.decision==='ready')await new DeploymentJournal(client).phase(runId,phase);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
  if(evidence.decision!=='ready')throw fail(evidence.reasons[0]??'DEPLOYMENT_GATE_BLOCKED');
  return evidence;
}
export function deploymentGateView(row){
  if(!row)return null;const value=row.evidence;
  return {phase:deploymentPhases[row.phase_index],mode:value.mode,decision:value.decision,reasons:value.reasons,
    observedAt:value.observedAt,approvalId:value.approvalId,backupId:value.backupId,schemaManifestHash:value.schemaManifestHash};
}
