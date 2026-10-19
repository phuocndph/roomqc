// Synthetic directory-only fixtures. Never use these against a business backend.
import {randomUUID} from 'node:crypto';
import {registryConfiguration} from './registry.mjs';

export const fixtureCluster={id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'fixture-public',
  serviceKey:'fixture-server-only',vapidPublicKey:'fixture-vapid',maxWorkspaces:99};
export const fixtureManifestHash='a'.repeat(64);
const fixtureMetrics={cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,
  dataDiskFreeBytes:100*1024**3,dataDiskTotalBytes:200*1024**3,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100};
export function fixtureConfig(databaseUrl,clusters=[fixtureCluster]){
  const inventory=clusters.map(c=>({id:c.id,hostId:c.id,hostName:c.id,environment:'local',backendKind:'self_hosted',
    url:c.url,credentialRef:c.id,releaseId:'fixture-v3',schemaManifestHash:fixtureManifestHash,frontendReady:true}));
  return {databaseUrl,emailKey:'isolated-test-'.repeat(4),clusters,poolMax:4,publicOrigin:'http://localhost:8082',
    host:'127.0.0.1',port:0,allowLocal:true,supportClusterId:clusters[0].id,
    ...registryConfiguration({ROOMQC_CONTROL_INVENTORY:JSON.stringify(inventory)},clusters,true)};
}
export async function seedOperationalCluster(pool,id='cluster-a',{limit=99}={}){
  await pool.query(`UPDATE roomqc_control.clusters SET validation_state='valid',release_id='fixture-v3',
    schema_manifest_hash=$2,frontend_ready=true,inventory_ref=id WHERE id=$1`,[id,fixtureManifestHash]);
  await pool.query(`UPDATE roomqc_control.cluster_policies SET tenant_limit=$2,manual_closed=false,
    operator_reopen_required=false WHERE cluster_id=$1`,[id,limit]);
  await pool.query(`INSERT INTO roomqc_control.cluster_health_current(cluster_id,source_generation,observed_at,valid_until,
    metric_status,normalized_values,evaluator_state) VALUES($1,1,now(),now()+interval '120 seconds','healthy',$2::jsonb,
    jsonb_build_object('policyVersion',1,'blockedReasons','[]'::jsonb))`,[id,JSON.stringify(fixtureMetrics)]);
  await pool.query(`INSERT INTO roomqc_control.backup_runs(id,cluster_id,scope,backup_id,manifest_hash,
    completed_at,verification_state,restore_test_at) VALUES($1,$2,'bundle',$3,$4,now(),'verified',now())`,
    [randomUUID(),id,'fixture-backup-'+randomUUID(),fixtureManifestHash]);
}
