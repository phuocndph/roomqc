// Synthetic directory-only fixtures. Never use these against a business backend.
import {randomUUID,randomBytes} from 'node:crypto';
import {registryConfiguration} from './registry.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {probeBinding,validateProbeBundle} from './probe-credentials.mjs';
import {ProbeKeyring} from './probe-secrets.mjs';
import {syntheticBundle,syntheticRelease} from './probe-test-fixtures.mjs';
import {ReleaseValidationCatalog} from './release-validation.mjs';
import {healthProofProjection} from './health-evidence.mjs';
import {fixtureReleaseTrust,fixtureReleaseContext,fixtureReleaseApproval,seedFixtureReleaseAuthority} from './release-test-fixtures.mjs';
import {releaseApprovalIdentity} from './release-authority.mjs';

export const fixtureCluster={id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'fixture-public',
  serviceKey:'fixture-server-only',vapidPublicKey:'fixture-vapid',maxWorkspaces:99};
export const fixtureManifestHash='a'.repeat(64);
const fixtureMetrics={cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,
  dataDiskFreeBytes:100*1024**3,dataDiskTotalBytes:200*1024**3,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100};
export const fixtureTarget=id=>({clusterId:id,hostId:id,environment:'local',measurementScope:'docker-desktop-vm',dbConnectionBudget:100,
  dataMounts:[{id:'database',mountpoint:'/fixture/database',device:'/dev/sda1',fstype:'ext4'}]});
export function fixtureConfig(databaseUrl,clusters=[fixtureCluster]){
  const inventory=clusters.map(c=>({id:c.id,hostId:c.id,hostName:c.id,environment:'local',backendKind:'self_hosted',
    url:c.url,internalUrl:c.internalUrl,approvedAddresses:c.approvedAddresses,credentialRef:c.id,releaseId:'fixture-v3',schemaManifestHash:fixtureManifestHash,frontendReady:true,telemetryTarget:fixtureTarget(c.id)}));
  return {databaseUrl,emailKey:'isolated-test-'.repeat(4),clusters,poolMax:4,publicOrigin:'http://localhost:8082',
    host:'127.0.0.1',port:0,allowLocal:true,supportClusterId:clusters[0].id,
    releaseValidation:new ReleaseValidationCatalog({version:2,entries:clusters.map(c=>({inventoryRef:c.id,
      approval:fixtureReleaseApproval(fixtureReleaseContext(c,{...syntheticRelease,clusterId:c.id})),
      credential:{...syntheticBundle().credential,publishableKey:c.publishableKey}}))},{trust:fixtureReleaseTrust}),
    ...registryConfiguration({ROOMQC_CONTROL_INVENTORY:JSON.stringify(inventory)},clusters,true)};
}
export async function seedOperationalCluster(pool,id='cluster-a',{limit=99,probeSeed=true,approvalSeed=true,cluster:target}={}){
  const endpoint=row=>({id,url:row.api_url,credentialRef:row.credential_ref,inventoryRef:row.inventory_ref,
    internalUrl:target?.internalUrl,approvedAddresses:target?.approvedAddresses});
  await pool.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local') ON CONFLICT(id) DO NOTHING",[id]);
  await pool.query(`UPDATE roomqc_control.clusters SET host_id=id,validation_state='valid',release_id='fixture-v3',
    schema_manifest_hash=$2,frontend_ready=true,inventory_ref=id WHERE id=$1`,[id,fixtureManifestHash]);
  const fingerprint=telemetryTargetFingerprint(fixtureTarget(id));
  await pool.query('UPDATE roomqc_control.clusters SET telemetry_target_fingerprint=$2,telemetry_target_definition=$3::jsonb WHERE id=$1',
    [id,fingerprint,JSON.stringify(fixtureTarget(id))]);
  // Fixture alone fast-forwards approval time; real binding always uses DB clock.
  await pool.query('ALTER TABLE roomqc_control.clusters DISABLE TRIGGER invalidate_telemetry_target');
  await pool.query("UPDATE roomqc_control.clusters SET telemetry_target_bound_at=now()-interval '1 hour' WHERE id=$1",[id]);
  await pool.query('ALTER TABLE roomqc_control.clusters ENABLE TRIGGER invalidate_telemetry_target');
  if(approvalSeed&&(await pool.query("SELECT to_regclass('roomqc_control.release_authority') IS NOT NULL AS available")).rows[0].available){
    const row=(await pool.query('SELECT api_url,credential_ref,inventory_ref FROM roomqc_control.clusters WHERE id=$1',[id])).rows[0];
    await seedFixtureReleaseAuthority(pool,fixtureReleaseContext(endpoint(row),{...syntheticRelease,clusterId:id}));
  }
  await pool.query(`UPDATE roomqc_control.cluster_policies SET tenant_limit=$2,manual_closed=false,
    operator_reopen_required=false WHERE cluster_id=$1`,[id,limit]);
  let proof=null;
  if(probeSeed){
    const row=(await pool.query('SELECT api_url,credential_ref,inventory_ref,telemetry_target_version FROM roomqc_control.clusters WHERE id=$1',[id])).rows[0];
    const binding=probeBinding(endpoint(row),{...syntheticRelease,clusterId:id});
    const bundle=syntheticBundle(),clean=validateProbeBundle(bundle),keyring=new ProbeKeyring({activeKeyId:'fixture-key',keys:new Map([['fixture-key',randomBytes(32)]])});
    const envelope=keyring.seal(bundle,{clusterId:id,credentialRef:binding.credentialRef,bindingHash:binding.bindingHash,revision:1});
    await pool.query(`INSERT INTO roomqc_control.probe_credentials(cluster_id,credential_ref,binding_hash,revision,state,envelope,
      auth_user_id,auth_session_id,auth_expires_at,probe_expires_at) VALUES($1,$2,$3,1,'ready',$4::jsonb,$5,$6,$7,$8)`,
      [id,binding.credentialRef,binding.bindingHash,JSON.stringify(envelope),bundle.auth.userId,bundle.auth.sessionId,clean.authExpiresAt,clean.probeExpiresAt]);
    const approvalContext=fixtureReleaseContext(endpoint(row),{...syntheticRelease,clusterId:id});
    const approval=fixtureReleaseTrust.verify(fixtureReleaseApproval(approvalContext),approvalContext);
    proof=healthProofProjection({binding,releaseApproval:releaseApprovalIdentity(approval),credentialRevision:1,policyVersion:1,targetFingerprint:fingerprint,
      targetVersion:Number(row.telemetry_target_version),checkedAt:new Date().toISOString()});
  }
  await pool.query(`INSERT INTO roomqc_control.cluster_health_current(cluster_id,source_generation,observed_at,valid_until,
    metric_status,normalized_values,evaluator_state) VALUES($1,1,now(),now()+interval '120 seconds','healthy',$2::jsonb,
    jsonb_build_object('policyVersion',1,'sampleSchemaVersion',2,'targetFingerprint',$3::text,'blockedReasons','[]'::jsonb,'probeEvidence',$4::jsonb))`,[id,JSON.stringify(fixtureMetrics),fingerprint,JSON.stringify(proof)]);
  await pool.query(`INSERT INTO roomqc_control.backup_runs(id,cluster_id,scope,backup_id,manifest_hash,
    completed_at,verification_state,restore_test_at) VALUES($1,$2,'bundle',$3,$4,now(),'verified',now())`,
    [randomUUID(),id,'fixture-backup-'+randomUUID(),fixtureManifestHash]);
}
