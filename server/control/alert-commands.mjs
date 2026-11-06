import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {requireCapability} from './admin.mjs';
import {alertView,emitAlertEvent} from './alerts.mjs';
import {durableSupportTransaction} from './support-authority.mjs';
const uuid=value=>typeof value==='string'&&uuidPattern.test(value);
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function alertCommandReceipt(row,target){
  const value=row?.result?.result,version=row?.result?.targetVersion;
  if(!uuid(row?.id)||row.status!=='succeeded'||!row.finished_at||!Number.isFinite(Date.parse(row.finished_at))
    ||row.result?.status!=='succeeded'||!Number.isSafeInteger(version)||version!==Number(row.expected_version)+1
    ||value?.id!==target||value?.rowVersion!==version||!date(value?.openedAt)||!date(value?.lastSeenAt)
    ||!date(value?.acknowledgedAt)||value?.acknowledgedBy!==row.actor_id||!uuid(value?.acknowledgedBy)||value?.resolvedAt!==null
    ||typeof value?.resourceId!=='string'||!value.resourceId||value.resourceId.length>200
    ||typeof value?.type!=='string'||!value.type||value.type.length>120||!['warning','critical'].includes(value?.severity))
    throw new ControlError(409,'ALERT_COMMAND_PENDING','Lệnh chưa có kết quả được xác nhận.');
  return {commandId:row.id,status:'succeeded',targetVersion:version,result:Object.fromEntries(
    ['id','resourceId','type','severity','openedAt','lastSeenAt','acknowledgedAt','acknowledgedBy','resolvedAt','rowVersion'].map(key=>[key,value[key]]))};
}
export function alertAcknowledgement(target,body,key){
  if(!uuid(target)||!uuid(key)||!body||typeof body!=='object'||Array.isArray(body)
    ||Object.keys(body).some(key=>!['expectedVersion','reason'].includes(key))||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1
    ||typeof body.reason!=='string'||body.reason.trim().length<5||body.reason.trim().length>1000)
    throw new ControlError(400,'INVALID_ALERT_COMMAND','Cần mã cảnh báo, mã lệnh, phiên bản và lý do hợp lệ.');
  const command={target:target.toLowerCase(),key:key.toLowerCase(),expectedVersion:body.expectedVersion,reason:body.reason.trim()};
  return {...command,payloadHash:createHash('sha256').update(JSON.stringify(command)).digest('hex')};
}
export class AlertCommands {
  constructor(store){this.pool=store.pool;this.config=store.config}
  async result(actor,target,key,client=this.pool){
    requireCapability(actor,'platform-read',this.config);
    if(!uuid(target)||!uuid(key))throw new ControlError(400,'INVALID_ALERT_COMMAND','Mã lệnh không hợp lệ.');
    target=target.toLowerCase();key=key.toLowerCase();
    const row=(await client.query(`SELECT id,actor_id,expected_version,finished_at,status,result FROM roomqc_control.control_commands
      WHERE actor_id=$1 AND authority_cluster_id=$2 AND operation='acknowledge_alert' AND target_id=$3 AND idempotency_key=$4`,[actor.id,actor.clusterId,target,key])).rows[0];
    if(!row)throw new ControlError(404,'ALERT_COMMAND_RESULT_UNKNOWN','Chưa xác định kết quả. Giữ nguyên mã lệnh và kiểm tra lại.');
    return alertCommandReceipt(row,target);
  }
  async acknowledge(actor,command,requestId,authorize){
    requireCapability(actor,'infra-operate',this.config);
    return durableSupportTransaction(this.pool,actor,authorize,{kind:'control',operation:'acknowledge_alert',
      acceptanceOperation:'acknowledge_alert',target:command.target,key:command.key,payloadHash:command.payloadHash},{lookup:async client=>{
      const existing=(await client.query("SELECT payload_hash FROM roomqc_control.control_commands WHERE actor_id=$1 AND operation='acknowledge_alert' AND idempotency_key=$2",[actor.id,command.key])).rows[0];
      if(existing){
        if(existing.payload_hash!==command.payloadHash)throw new ControlError(409,'IDEMPOTENCY_CONFLICT','Mã lệnh đã dùng cho nội dung khác.');
        return this.result(actor,command.target,command.key,client);
      }
      return null;
    },mutate:async client=>{
      const before=(await client.query('SELECT * FROM roomqc_control.alerts WHERE id=$1 FOR UPDATE',[command.target])).rows[0];
      if(!before)throw new ControlError(404,'ALERT_NOT_FOUND','Không tìm thấy cảnh báo.');
      if(Number(before.row_version)!==command.expectedVersion)throw new ControlError(409,'VERSION_CONFLICT','Cảnh báo đã thay đổi. Hãy tải lại.');
      if(before.resolved_at||before.acknowledged_at)throw new ControlError(409,'ALERT_ALREADY_HANDLED','Cảnh báo đã được nhận xử lý hoặc kết thúc.');
      const commandId=randomUUID();
      await client.query(`INSERT INTO roomqc_control.control_commands(id,actor_id,authority_cluster_id,operation,target_id,
        idempotency_key,payload_hash,expected_version,reason,status) VALUES($1,$2,$3,'acknowledge_alert',$4,$5,$6,$7,$8,'started')`,
      [commandId,actor.id,actor.clusterId,command.target,command.key,command.payloadHash,command.expectedVersion,command.reason]);
      const after=(await client.query(`UPDATE roomqc_control.alerts SET acknowledged_by=$2,acknowledged_at=clock_timestamp(),
        row_version=row_version+1 WHERE id=$1 RETURNING *`,[before.id,actor.id])).rows[0];
      await emitAlertEvent(client,after,'acknowledged',{requestId,actorId:actor.id,commandId});
      const result={status:'succeeded',targetVersion:Number(after.row_version),result:alertView(after)};
      await client.query("UPDATE roomqc_control.control_commands SET status='succeeded',result=$2::jsonb,finished_at=clock_timestamp() WHERE id=$1",[commandId,JSON.stringify(result)]);
      return {commandId,...result};
    }});
  }
}
