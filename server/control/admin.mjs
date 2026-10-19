import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {admissionDecision,policyThresholds} from './health-policy.mjs';
import {resolveCredential} from './registry.mjs';

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
    ||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000||!exact(body.payload,body.operation==='update_policy'?['tenantLimit','thresholds','reopenMode']:[])
    ||!['close_admission','open_admission','set_draining','set_serving','update_policy','validate'].includes(body.operation)){
    throw new ControlError(400,'INVALID_COMMAND','Yêu cầu cần mã lệnh ổn định, phiên bản, lý do và nội dung hợp lệ.');
  }
  let payload={};
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
  (SELECT count(*)::integer FROM roomqc_control.workspaces w WHERE w.cluster_id=c.id AND w.status<>'expired') AS allocated_count,
  b.completed_at AS backup_completed_at,b.restore_test_at AS backup_restore_test_at,b.manifest_hash AS backup_manifest_hash
  FROM roomqc_control.clusters c JOIN roomqc_control.cluster_policies p ON p.cluster_id=c.id
  LEFT JOIN roomqc_control.cluster_health_current h ON h.cluster_id=c.id
  LEFT JOIN LATERAL(SELECT completed_at,restore_test_at,manifest_hash FROM roomqc_control.backup_runs WHERE cluster_id=c.id
    AND scope='bundle' AND verification_state='verified' ORDER BY completed_at DESC NULLS LAST LIMIT 1)b ON true`;
export function withCredential(config,row){
  let configured=true;try{resolveCredential(config,row)}catch{configured=false}
  const entry=config.inventory?.get(row.inventory_ref||row.id);
  return {...row,credential_configured:configured,release_compatible:!!entry?.releaseId&&entry.releaseId===row.release_id&&entry.schemaManifestHash===row.schema_manifest_hash,
    frontend_current:entry?.frontendReady===true};
}
export function publicCluster(row,config,options){
  const value=withCredential(config,row),admission=admissionDecision(value,options);
  const stale=!Number.isFinite(Date.parse(row.health_valid_until))||Date.parse(row.health_valid_until)<=(options?.now??Date.now());
  return {id:row.id,status:row.status,rowVersion:Number(row.row_version),validationState:row.validation_state,hostId:row.host_id,
    backendKind:row.backend_kind,tenantLimit:row.tenant_limit,allocatedCount:row.allocated_count,credentialConfigured:value.credential_configured,
    releaseId:row.release_id,admission,health:row.health_observed_at?{status:stale?'unknown':row.metric_status,observedAt:row.health_observed_at,receivedAt:row.received_at,
      validUntil:row.health_valid_until,generation:Number(row.source_generation),metrics:row.normalized_values,
      reasonCodes:[...new Set([...(row.reason_codes??[]),...(stale?['METRICS_STALE']:[])])]}:null};
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
  async execute(actor,command,requestId,validation){
    requireCapability(actor,'infra-operate',this.config);
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
      const replay=await this.replay(actor,command,client);
      if(replay){await client.query('COMMIT');return replay}
      const before=await this.cluster(command.targetId,client);
      if(Number(before.row_version)!==command.expectedVersion)throw new ControlError(409,'VERSION_CONFLICT','Cấu hình đã thay đổi. Hãy tải lại trước khi thực hiện.');
      const commandId=randomUUID();
      await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,idempotency_key,payload_hash,expected_version,reason,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'started')`,[commandId,actor.id,actor.clusterId,command.operation,command.targetId,command.key,command.payloadHash,command.expectedVersion,command.reason]);
      switch(command.operation){
        case 'close_admission':
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,updated_at=now() WHERE cluster_id=$1',[before.id]);break;
        case 'open_admission':{
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
        case 'update_policy':{
          await client.query(`UPDATE roomqc_control.cluster_policies SET tenant_limit=$2,thresholds=coalesce($3::jsonb,thresholds),
            reopen_mode=coalesce($4,reopen_mode),row_version=row_version+1,manual_closed=true,operator_reopen_required=true,updated_at=now() WHERE cluster_id=$1`,
          [before.id,command.payload.tenantLimit,command.payload.thresholds?JSON.stringify(command.payload.thresholds):null,command.payload.reopenMode??null]);
          await client.query('UPDATE roomqc_control.clusters SET max_workspaces=$2 WHERE id=$1',[before.id,command.payload.tenantLimit]);break;
        }
        case 'validate':{
          if(!validation||validation.inventoryRef!==before.inventory_ref)throw new ControlError(409,'VALIDATION_REQUIRED','Cần kiểm tra cụm từ inventory được duyệt.');
          // Trusted server result only, never body.validation or a browser-supplied URL.
          await client.query(`UPDATE roomqc_control.clusters SET validation_state='valid',validated_at=now(),release_id=$2,schema_manifest_hash=$3,
            frontend_ready=$4,publishable_key=$5,vapid_public_key=$6,validation_manifest=$7::jsonb WHERE id=$1`,
          [before.id,validation.releaseId,validation.schemaManifestHash,validation.frontendReady,validation.publishableKey,validation.vapidPublicKey,JSON.stringify(validation.manifest)]);
          await client.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true,operator_reopen_required=true WHERE cluster_id=$1',[before.id]);break;
        }
      }
      await client.query('UPDATE roomqc_control.clusters SET row_version=row_version+1 WHERE id=$1',[before.id]);
      const after=await this.cluster(before.id,client),result={status:'succeeded',targetVersion:Number(after.row_version),result:publicCluster(after,this.config)};
      await client.query(`INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,actor_id,source,request_id,command_id)
        VALUES($1,$2,$3::jsonb,$4::jsonb,$5,'admin',$6,$7)`,[before.id,command.operation,JSON.stringify(publicCluster(before,this.config)),JSON.stringify(result.result),actor.id,requestId,commandId]);
      await client.query("UPDATE roomqc_control.control_commands SET status='succeeded',result=$2::jsonb,finished_at=now() WHERE id=$1",[commandId,JSON.stringify(result)]);
      await client.query('COMMIT');return {...result,commandId};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
  async register(actor,body,key,requestId){
    requireCapability(actor,'infra-operate',this.config);
    if(!uuidPattern.test(key||'')||!exact(body,['id','hostId','backendKind','endpointRef','credentialRef','expectedVersion','reason'])
      ||!(/^[a-z][a-z0-9-]{1,39}$/).test(body.id)||body.expectedVersion!==1||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000){
      throw new ControlError(400,'INVALID_COMMAND','Thông tin đăng ký cụm không hợp lệ.');
    }
    const entry=this.config.inventory?.get(body.endpointRef);
    if(!entry||body.hostId!==entry.hostId||body.backendKind!==entry.backendKind||body.credentialRef!==entry.credentialRef){
      throw new ControlError(400,'INVENTORY_REQUIRED','Chỉ chọn máy, endpoint và tham chiếu credential đã được cấu hình trên server.');
    }
    const payloadHash=createHash('sha256').update(JSON.stringify(stable({...body,reason:body.reason.trim(),key}))).digest('hex');
    const command={operation:'register_cluster',key,payloadHash};
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
      const replay=await this.replay(actor,command,client);if(replay){await client.query('COMMIT');return replay}
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
      await client.query('COMMIT');return {...result,commandId};
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }
}
