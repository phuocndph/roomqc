import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {admissionDecision,policyThresholds} from './health-policy.mjs';
import {resolveCredential,hostPreflightReady} from './registry.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {clusterCommandOperations,commandReceipt} from './command-results.mjs';
import {assertReleaseValidation,releaseAuthorizationContext} from './release-validation.mjs';
import {probeBinding} from './probe-credentials.mjs';
import {assertReleaseAuthority,releaseAuthorityMatches} from './release-authority.mjs';
import {assertLiveSupportAuthority,durableSupportTransaction} from './support-authority.mjs';
import {enqueueDeployment} from './deployment-queue.mjs';

const capabilities=new Set(['platform-read','infra-operate','support-reconcile']);
export function requireCapability(actor,capability,config){
  if(!capabilities.has(capability)||!uuidPattern.test(actor?.id||'')||actor.clusterId!==config.supportClusterId){
    throw new ControlError(403,'ADMIN_PERMISSION_REQUIRED','Tài khoản không có quyền thực hiện thao tác quản trị này.');
  }
  // supportActor RPC admits only live platform super-admins in v1. This map is
  // server-owned; no capability or role from a request/JWT user_metadata is used.
}
function exact(value,fields){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>fields.includes(k))}
const stable=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(stable):Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]))):value;
export function clusterCommand(body,key,targetId){
  if(!uuidPattern.test(key||'')||!exact(body,['operation','expectedVersion','reason','payload'])||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1
    ||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000||!exact(body.payload,body.operation==='update_policy'?['tenantLimit','thresholds','reopenMode']:body.operation==='bind_telemetry_target'?['targetFingerprint']:body.operation==='queue_deployment'?['specId','executionSha256']:[])
    ||!clusterCommandOperations.includes(body.operation)){
    throw new ControlError(400,'INVALID_COMMAND','Yêu cầu cần mã lệnh ổn định, phiên bản, lý do và nội dung hợp lệ.');
  }
  let payload={};
  if(body.operation==='queue_deployment'){
    if(!uuidPattern.test(body.payload.specId??'')||!/^[a-f0-9]{64}$/.test(body.payload.executionSha256??''))
      throw new ControlError(400,'INVALID_COMMAND','Cần bản triển khai đã được duyệt.');
    payload={specId:body.payload.specId,executionSha256:body.payload.executionSha256};
  }
  if(body.operation==='bind_telemetry_target'){
    if(typeof body.payload.targetFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(body.payload.targetFingerprint))throw new ControlError(400,'INVALID_TELEMETRY_TARGET','Nguồn đo chưa được duyệt.');
    payload={targetFingerprint:body.payload.targetFingerprint};
  }
  if(body.operation==='update_policy'){
    if(!Number.isSafeInteger(body.payload.tenantLimit)||body.payload.tenantLimit<1||body.payload.tenantLimit>1000000
      ||(body.payload.reopenMode!==undefined&&!['manual','automatic'].includes(body.payload.reopenMode)))throw new ControlError(400,'INVALID_POLICY','Hạn mức hoặc chế độ khôi phục không hợp lệ.');
    // Automatic reopening remains gated for pilot; it needs its own rollout evidence.
    if(body.payload.reopenMode==='automatic')throw new ControlError(409,'AUTOMATIC_REOPEN_DISABLED','Pilot yêu cầu quản trị xác nhận mở lại nhận khách.');
    payload={tenantLimit:body.payload.tenantLimit,...(body.payload.thresholds===undefined?{}:{thresholds:policyThresholds(body.payload.thresholds)}),...(body.payload.reopenMode?{reopenMode:body.payload.reopenMode}:{})};
  }
  const command={operation:body.operation,expectedVersion:body.expectedVersion,reason:body.reason.trim(),payload,targetId,key};
  return {...command,payloadHash:createHash('sha256').update(JSON.stringify(stable(command))).digest('hex')};
}

export const clusterSelect=`SELECT c.*,p.tenant_limit,p.thresholds,p.manual_closed,p.operator_reopen_required,p.row_version AS policy_version,
  p.reopen_mode,h.observed_at AS health_observed_at,h.valid_until AS health_valid_until,h.received_at,h.metric_status,h.normalized_values,
  h.reason_codes,h.source_generation,h.evaluator_state,
  hs.status AS host_status,
  q.credential_ref AS probe_credential_ref,q.binding_hash AS probe_binding_hash,q.revision AS probe_revision,q.state AS probe_state,
  q.auth_expires_at AS probe_auth_expires_at,q.probe_expires_at,
  floor(extract(epoch FROM clock_timestamp())*1000) AS directory_now_ms,
  to_jsonb(ra)||jsonb_build_object('authority_epoch',r.epoch,'authority_state',r.state,
    'authority_key_revoked',EXISTS(SELECT 1 FROM roomqc_control.release_key_revocations k WHERE k.key_fingerprint=ra.key_fingerprint),
    'authority_now_ms',extract(epoch FROM clock_timestamp())*1000) AS release_authority,
  (SELECT count(*)::integer FROM roomqc_control.workspaces w WHERE w.cluster_id=c.id AND w.status<>'expired') AS allocated_count,
  b.completed_at AS backup_completed_at,b.restore_test_at AS backup_restore_test_at,b.manifest_hash AS backup_manifest_hash
  FROM roomqc_control.clusters c JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id
  LEFT JOIN roomqc_control.hosts hs ON hs.id=c.host_id
  LEFT JOIN roomqc_control.cluster_health_current h ON h.cluster_id=c.id
  LEFT JOIN roomqc_control.probe_credentials q ON q.cluster_id=c.id
  LEFT JOIN roomqc_control.release_authority r ON r.cluster_id=c.id
  LEFT JOIN roomqc_control.release_approvals ra ON ra.approval_id=r.approval_id
  LEFT JOIN LATERAL(SELECT completed_at,restore_test_at,manifest_hash FROM roomqc_control.backup_runs WHERE cluster_id=c.id
    AND scope='bundle' AND verification_state='verified' ORDER BY completed_at DESC NULLS LAST LIMIT 1)b ON true`;
export function withCredential(config,row){
  let configured=true;try{resolveCredential(config,row)}catch{configured=false}
  const entry=config.inventory?.get(row.inventory_ref||row.id);
  let probeExpectedBindingHash=null;
  let releaseAuthorityCurrent=false;
  try{
    const {expected,approval}=releaseAuthorizationContext(config,row,{now:Number(row.directory_now_ms??Date.now())});
    releaseAuthorityCurrent=releaseAuthorityMatches(row.release_authority,approval);
    if(entry.hostId===row.host_id&&expected.releaseId===entry.releaseId&&expected.schemaManifestHash===entry.schemaManifestHash){
      probeExpectedBindingHash=probeBinding(resolveCredential(config,row),expected).bindingHash;
    }
  }catch{}
  return {...row,release_authority_current:releaseAuthorityCurrent,probe_expected_binding_hash:probeExpectedBindingHash,credential_configured:configured,release_compatible:!!entry?.releaseId&&entry.releaseId===row.release_id&&entry.schemaManifestHash===row.schema_manifest_hash,
    frontend_current:entry?.frontendReady===true,
    telemetry_inventory_matches:!!entry?.telemetryTarget&&telemetryTargetFingerprint(entry.telemetryTarget)===row.telemetry_target_fingerprint};
}
export function publicCluster(row,config,options){
  const value=withCredential(config,row),admission=admissionDecision(value,options);
  const stale=!Number.isFinite(Date.parse(row.health_valid_until))||Date.parse(row.health_valid_until)<=(options?.now??Date.now());
  const invalidHealth=admission.reasonCodes.filter(code=>['METRICS_TARGET_UNCONFIGURED','METRICS_TARGET_CONFIGURATION_CHANGED',
    'METRICS_TARGET_CHANGED','METRICS_POLICY_CHANGED','METRICS_UNVERIFIED','METRICS_STALE',
    'HEALTH_PROOF_UNVERIFIED','HEALTH_PROOF_CHANGED','HEALTH_PROOF_EXPIRED'].includes(code));
  return {id:row.id,status:row.status,rowVersion:Number(row.row_version),validationState:row.validation_state,hostId:row.host_id,
    hostStatus:row.host_status??null,backendKind:row.backend_kind,tenantLimit:row.tenant_limit,allocatedCount:row.allocated_count,credentialConfigured:value.credential_configured,
    releaseId:row.release_id,admission,health:row.health_observed_at?{status:stale||invalidHealth.length?'unknown':row.metric_status,observedAt:row.health_observed_at,receivedAt:row.received_at,
      validUntil:row.health_valid_until,generation:Number(row.source_generation),metrics:row.normalized_values,
      schemaVersion:row.evaluator_state?.sampleSchemaVersion??1,measurementScope:row.evaluator_state?.measurementScope??null,
      dataDisks:row.evaluator_state?.dataDisks?.map(({id,freeBytes,totalBytes,inodeFreePercent})=>({id,freeBytes,totalBytes,inodeFreePercent}))??null,
      reasonCodes:[...new Set([...(row.reason_codes??[]),...invalidHealth,...(stale?['METRICS_STALE']:[])])]}:null};
}

export class AdminDirectory {
  constructor(store){this.store=store;this.pool=store.pool;this.config=store.config}
  async cluster(id,client=this.pool){
    const {rows}=await client.query(clusterSelect+' WHERE c.id=$1',[id]);
    if(!rows[0])throw new ControlError(404,'CLUSTER_NOT_FOUND','Không tìm thấy cụm.');return withCredential(this.config,rows[0]);
  }
  async replay(actor,command,client=this.pool){
    const {rows}=await client.query(`SELECT id,payload_hash,status,result FROM roomqc_control.control_commands
      WHERE actor_id=$1 AND operation=$2 AND idempotency_key=$3`,[actor.id,command.operation,command.key]);
    if(!rows[0])return null;
    if(rows[0].payload_hash!==command.payloadHash)throw new ControlError(409,'IDEMPOTENCY_CONFLICT','Mã lệnh đã được dùng cho nội dung khác.');
    if(rows[0].status!=='succeeded')throw new ControlError(409,'COMMAND_IN_PROGRESS','Lệnh đang được đối soát. Vui lòng kiểm tra lại.');
    return {...rows[0].result,commandId:rows[0].id};
  }
  async commandResult(actor,lookup){
    requireCapability(actor,'platform-read',this.config);
    // Read the primary pool, without locks, retries, audit writes or mutations.
    // Missing can also mean an original transaction is not committed yet.
    const {rows}=await this.pool.query(`SELECT id,status,result,finished_at FROM roomqc_control.control_commands
      WHERE actor_id=$1 AND authority_cluster_id=$2 AND target_id=$3 AND operation=$4 AND idempotency_key=$5`,
    [actor.id,actor.clusterId,lookup.targetId,lookup.operation,lookup.key]);
    if(!rows[0])throw new ControlError(404,'COMMAND_RESULT_UNKNOWN','Chưa xác định kết quả lệnh. Giữ nguyên mã lệnh và kiểm tra lại.');
    return commandReceipt(rows[0],lookup.targetId);
  }
  async execute(actor,command,requestId,validation,authorize){
    requireCapability(actor,'infra-operate',this.config);
    await assertLiveSupportAuthority(actor,authorize);
    return durableSupportTransaction(this.pool,actor,authorize,{kind:'control',operation:command.operation,
      acceptanceOperation:'cluster_command',target:command.targetId,key:command.key,payloadHash:command.payloadHash},{
      lookup:client=>this.replay(actor,command,client),mutate:async client=>{
      const before=await this.cluster(command.targetId,client);
      if(Number(before.row_version)!==command.expectedVersion)throw new ControlError(409,'VERSION_CONFLICT','Cấu hình đã thay đổi. Hãy tải lại trước khi thực hiện.');
      const commandId=randomUUID();
      await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,payload_hash,expected_version,reason,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'started')`,[commandId,actor.id,actor.clusterId,command.operation,command.targetId,command.key,command.payloadHash,command.expectedVersion,command.reason]);
      switch(command.operation){
        case 'queue_deployment':await enqueueDeployment(client,command,commandId);break;
        case 'bind_telemetry_target':{
          const entry=this.config.inventory?.get(before.inventory_ref||before.id),target=entry?.telemetryTarget;
          if(!target||target.clusterId!==before.id||target.hostId!==entry.hostId||entry.hostId!==before.host_id||target.environment!==entry.environment
            ||telemetryTargetFingerprint(target)!==command.payload.targetFingerprint){
            throw new ControlError(409,'TELEMETRY_TARGET_NOT_APPROVED','Nguồn đo đã thay đổi hoặc chưa có trong cấu hình được duyệt.');
          }
          await client.query('UPDATE roomqc_control.clusters SET telemetry_target_fingerprint=$2,telemetry_target_definition=$3::jsonb WHERE id=$1',
            [before.id,command.payload.targetFingerprint,JSON.stringify(target)]);
          break;
        }
        case 'close_admission':
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        case 'open_admission':{
          if((await client.query("SELECT id FROM roomqc_control.deployment_jobs WHERE cluster_id=$1 AND state IN('queued','running','needs_review') LIMIT 1",[before.id])).rowCount)
            throw new ControlError(409,'ADMISSION_BLOCKED','Cụm còn công việc triển khai cần hoàn tất hoặc đối soát.');
          const gate=admissionDecision(before,{ignoreManual:true,ignoreReopen:true});
          if(gate.decision!=='open')throw new ControlError(409,'ADMISSION_BLOCKED','Cụm chưa đủ điều kiện nhận khách: '+gate.reasonCodes.join(', '));
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=false,operator_reopen_required=false,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        }
        case 'set_draining':
          await client.query("UPDATE roomqc_control.clusters SET status='draining',maintenance_reason=$2 WHERE id=$1",[before.id,command.reason]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        case 'set_serving':
          await client.query("UPDATE roomqc_control.clusters SET status='active',maintenance_reason=$2 WHERE id=$1",[before.id,command.reason]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        case 'set_host_maintenance':{
          if(!before.host_id)throw new ControlError(409,'HOST_UNLINKED','Cụm chưa liên kết máy chủ.');
          const changed=await client.query("UPDATE roomqc_control.hosts SET status='maintenance',row_version=row_version+1 WHERE id=$1 AND status='active'",[before.host_id]);
          if(!changed.rowCount)throw new ControlError(409,'HOST_STATE_CHANGED','Trạng thái máy chủ đã thay đổi. Hãy tải lại trước khi thao tác.');
          await client.query("UPDATE roomqc_control.clusters SET status='draining',maintenance_reason=$2 WHERE id=$1",[before.id,command.reason]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        }
        case 'set_host_active':{
          if(!before.host_id)throw new ControlError(409,'HOST_UNLINKED','Cụm chưa liên kết máy chủ.');
          const changed=await client.query("UPDATE roomqc_control.hosts SET status='active',row_version=row_version+1 WHERE id=$1 AND status='maintenance'",[before.host_id]);
          if(!changed.rowCount)throw new ControlError(409,'HOST_STATE_CHANGED','Trạng thái máy chủ đã thay đổi. Hãy tải lại trước khi thao tác.');
          await client.query("UPDATE roomqc_control.clusters SET status='active',maintenance_reason=$2 WHERE id=$1",[before.id,command.reason]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        }
        case 'update_policy':{
          await client.query(`UPDATE roomqc_control.cluster_policies SET tenant_limit=$2,thresholds=coalesce($3::jsonb,thresholds),
            reopen_mode=coalesce($4,reopen_mode),row_version=row_version+1,manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1`,
          [before.id,command.payload.tenantLimit,command.payload.thresholds?JSON.stringify(command.payload.thresholds):null,command.payload.reopenMode??null]);
          await client.query('UPDATE roomqc_control.clusters SET max_workspaces=$2 WHERE id=$1',[before.id,command.payload.tenantLimit]);break;
        }
        case 'validate':{
          const time=(await client.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000) AS now_ms')).rows[0];
          const context=assertReleaseValidation(this.config,before,validation,{now:Number(time.now_ms)});
          await assertReleaseAuthority(client,context.approval);
          // Trusted server result only, never body.validation or a browser-supplied URL.
          await client.query(`UPDATE roomqc_control.clusters SET validation_state='valid',validated_at=now(),release_id=$2,schema_manifest_hash=$3,
            frontend_ready=$4,publishable_key=$5,vapid_public_key=$6,validation_manifest=$7::jsonb WHERE id=$1`,
          [before.id,validation.releaseId,validation.schemaManifestHash,validation.frontendReady,validation.publishableKey,validation.vapidPublicKey,JSON.stringify(validation.manifest)]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true WHERE cluster_id=$1',[before.id]);break;
        }
      }
      await client.query('UPDATE roomqc_control.clusters SET row_version=row_version+1 WHERE id=$1',[before.id]);
      const after=await this.cluster(before.id,client),result={status:'succeeded',targetVersion:Number(after.row_version),result:publicCluster(after,this.config)};
      const binding=row=>({fingerprint:row.telemetry_target_fingerprint??null,version:Number(row.telemetry_target_version),boundAt:row.telemetry_target_bound_at??null});
      const beforeAudit={...publicCluster(before,this.config),...(command.operation==='bind_telemetry_target'?{telemetryBinding:binding(before)}:{})};
      const afterAudit={...result.result,...(command.operation==='bind_telemetry_target'?{telemetryBinding:binding(after)}:{})};
      await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,actor_id,source,request_id,command_id)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5,'admin',$6,$7)`,[before.id,command.operation,JSON.stringify(beforeAudit),JSON.stringify(afterAudit),actor.id,requestId,commandId]);
      await client.query("UPDATE roomqc_control.control_commands SET status='succeeded',result=$2::jsonb,finished_at=now() WHERE id=$1",[commandId,JSON.stringify(result)]);
      return {...result,commandId};
    }});
  }
  async register(actor,body,key,requestId,authorize){
    requireCapability(actor,'infra-operate',this.config);
    await assertLiveSupportAuthority(actor,authorize);
    if(!uuidPattern.test(key||'')||!exact(body,['id','hostId','backendKind','endpointRef','credentialRef','expectedVersion','reason'])
      ||!(/^[a-z][a-z0-9-]{1,39}$/).test(body.id)||body.expectedVersion!==1||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000){
      throw new ControlError(400,'INVALID_COMMAND','Thông tin đăng ký cụm không hợp lệ.');
    }
    const entry=this.config.inventory?.get(body.endpointRef);
    if(!entry||body.hostId!==entry.hostId||body.backendKind!==entry.backendKind||body.credentialRef!==entry.credentialRef){
      throw new ControlError(400,'INVENTORY_REQUIRED','Chỉ chọn máy, endpoint và tham chiếu credential đã được cấu hình trên server.');
    }
    if(entry.environment!=='local'&&!hostPreflightReady(entry.preflight))
      throw new ControlError(409,'HOST_PREFLIGHT_REQUIRED','Máy chủ chưa có preflight SSH hợp lệ trong 24 giờ qua hoặc chưa đủ tài nguyên để triển khai.');
    const payloadHash=createHash('sha256').update(JSON.stringify(stable({...body,reason:body.reason.trim(),key}))).digest('hex');
    const command={operation:'register_cluster',key,payloadHash};
    return durableSupportTransaction(this.pool,actor,authorize,{kind:'control',operation:'register_cluster',
      acceptanceOperation:'register_cluster',target:body.id,key,payloadHash},{
      lookup:client=>this.replay(actor,command,client),mutate:async client=>{
      const conflict=await client.query('SELECT id FROM roomqc_control.clusters WHERE id=$1 OR host_id=$2',[body.id,entry.hostId]);
      if(conflict.rowCount)throw new ControlError(409,'CLUSTER_ALREADY_REGISTERED','Cụm hoặc máy đã được đăng ký.');
      const creds=this.config.credentials.get(entry.credentialRef);
      await client.query(`INSERT INTO roomqc_control.hosts(id,name,region,provider_label,environment)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[entry.hostId,entry.hostName||entry.hostId,entry.region??null,entry.providerLabel??null,entry.environment]);
      await client.query(`INSERT INTO roomqc_control.clusters(id,api_url,publishable_key,vapid_public_key,max_workspaces,host_id,backend_kind,credential_ref,inventory_ref)
        VALUES($1,$2,$3,$4,1,$5,$6,$7,$8)`,[body.id,entry.url,creds?.publishableKey||'',creds?.vapidPublicKey||'',entry.hostId,entry.backendKind,entry.credentialRef,entry.id]);
      await client.query('INSERT INTO roomqc_control.cluster_policies(cluster_id,tenant_limit) VALUES($1,1)',[body.id]);
      const result={status:'succeeded',targetVersion:1,result:publicCluster(await this.cluster(body.id,client),this.config)},commandId=randomUUID();
      await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,payload_hash,expected_version,reason,status,result,finished_at)
        VALUES($1,$2,$3,'register_cluster',$4,$5,$6,1,$7,'succeeded',$8::jsonb,now())`,[commandId,actor.id,actor.clusterId,body.id,key,payloadHash,body.reason.trim(),JSON.stringify(result)]);
      await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,after_state,actor_id,source,request_id,command_id)
        VALUES($1,'register_cluster',$2::jsonb,$3,'admin',$4,$5)`,[body.id,JSON.stringify(result.result),actor.id,requestId,commandId]);
      return {...result,commandId};
    }});
  }
}
