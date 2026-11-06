import {createHash,randomUUID} from 'node:crypto';
import {ControlError} from './errors.mjs';

export async function alertTransaction(pool,run,{lock=false,timeoutMs=8000}={}){
  const client=await pool.connect();let expired=false;
  const timer=setTimeout(()=>{expired=true;client.release(true)},timeoutMs);
  try{
    await client.query('BEGIN');if(lock)await client.query('SELECT pg_advisory_xact_lock(727001)');
    const result=await run(client);await client.query('COMMIT');return result;
  }catch(error){
    if(!expired)await client.query('ROLLBACK');
    if(expired)throw new ControlError(503,'ALERT_DATABASE_TIMEOUT','Giao dịch cảnh báo vượt thời gian cho phép.');
    throw error;
  }finally{clearTimeout(timer);if(!expired)client.release()}
}

const severities=Object.freeze(Object.fromEntries([
  ['CPU_CRITICAL','critical'],['MEMORY_CRITICAL','critical'],['DISK_CRITICAL','critical'],['INODE_CRITICAL','critical'],
  ['DB_CONNECTIONS_CRITICAL','critical'],['BACKEND_UNREACHABLE','critical'],['METRICS_STALE','critical'],
  ['CPU_HIGH','warning'],['MEMORY_LOW','warning'],['DISK_LOW','warning'],['INODE_LOW','warning'],
  ['DB_CONNECTIONS_HIGH','warning'],['BACKEND_PROBE_FAILED','warning'],
]));
const timestamp=value=>value instanceof Date?value.toISOString():value??null;
export function alertView(row){return {id:row.id,resourceId:row.resource_id,type:row.type,severity:row.severity,
  openedAt:timestamp(row.opened_at),lastSeenAt:timestamp(row.last_seen_at),acknowledgedAt:timestamp(row.acknowledged_at),
  acknowledgedBy:row.acknowledged_by??null,resolvedAt:timestamp(row.resolved_at),rowVersion:Number(row.row_version)}};

/** Caller owns the transaction and the shared health/admission advisory lock. */
export async function emitAlertEvent(client,row,transition,{requestId,actorId=null,commandId=null,generation=null}){
  const eventId=randomUUID(),deliveryId=randomUUID();
  const event=(await client.query(`INSERT INTO roomqc_control.alert_events(id,alert_id,resource_id,cluster_id,transition,actor_id,request_id,
    command_id,health_generation,alert_version) VALUES($1,$2,$3,(SELECT id FROM roomqc_control.clusters WHERE id=$3),$4,$5,$6,$7,$8,$9) RETURNING created_at`,
  [eventId,row.id,row.resource_id,transition,actorId,requestId,commandId,generation,row.row_version])).rows[0];
  const payload={version:1,deliveryId,eventId,alertId:row.id,resourceId:row.resource_id,type:row.type,severity:row.severity,
    transition,occurredAt:timestamp(event.created_at),rowVersion:Number(row.row_version)};
  await client.query('INSERT INTO roomqc_control.alert_outbox(id,event_id,payload) VALUES($1,$2,$3::jsonb)',
    [deliveryId,eventId,JSON.stringify(payload)]);
  return {eventId,deliveryId};
}

export async function syncHealthAlerts(client,clusterId,{reasonCodes,sourceGeneration},requestId){
  const desired=[...new Set(reasonCodes)].filter(code=>Object.hasOwn(severities,code));
  const open=(await client.query("SELECT * FROM roomqc_control.alerts WHERE resource_id=$1 AND origin='health' AND resolved_at IS NULL ORDER BY id FOR UPDATE",[clusterId])).rows;
  for(const code of desired){
    const existing=open.find(row=>row.type===code);
    if(existing){await client.query('UPDATE roomqc_control.alerts SET last_seen_at=clock_timestamp() WHERE id=$1',[existing.id]);continue}
    const predecessor=(await client.query("SELECT id FROM roomqc_control.alerts WHERE resource_id=$1 AND type=$2 AND origin='health' ORDER BY opened_at DESC,id DESC LIMIT 1",[clusterId,code])).rows[0];
    const fingerprint=createHash('sha256').update('health\0'+clusterId+'\0'+code).digest('hex');
    const row=(await client.query(`INSERT INTO roomqc_control.alerts(id,fingerprint,resource_id,type,severity,origin,predecessor_id)
      VALUES($1,$2,$3,$4,$5,'health',$6) RETURNING *`,[randomUUID(),fingerprint,clusterId,code,severities[code],predecessor?.id??null])).rows[0];
    await emitAlertEvent(client,row,'opened',{requestId,generation:sourceGeneration});
  }
  for(const previous of open)if(!desired.includes(previous.type)){
    const row=(await client.query('UPDATE roomqc_control.alerts SET resolved_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1 RETURNING *',[previous.id])).rows[0];
    await emitAlertEvent(client,row,'resolved',{requestId,generation:sourceGeneration});
  }
}
