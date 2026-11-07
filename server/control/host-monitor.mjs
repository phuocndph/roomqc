import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {addressKind,normalizeAddress} from './safe-http.mjs';
import {readHostInventoryDocument} from './host-inventory.mjs';

const invalid=code=>Object.assign(new Error(code),{code});
const exact=(value,required,optional=[])=>value&&typeof value==='object'&&!Array.isArray(value)
  &&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>[...required,...optional].includes(key));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value)&&value.trim()===value;
export function validateHostMonitorTargets(raw,{allowLocal=false}={}){
  if(!exact(raw,['version','hosts'])||raw.version!==1||!Array.isArray(raw.hosts)||raw.hosts.length<1||raw.hosts.length>100)
    throw invalid('HOST_MONITOR_CONFIG_INVALID');
  const ids=new Set(),addresses=new Set();
  return raw.hosts.map(target=>{
    if(!exact(target,['id','name','environment','providerLabel','region','ssh'])
      ||!(/^[a-z][a-z0-9-]{1,63}$/).test(target.id)||ids.has(target.id)||!text(target.name)
      ||!['staging','production',...(allowLocal===true?['local']:[])].includes(target.environment)||!text(target.providerLabel)
      ||target.region!==null&&!text(target.region)||!exact(target.ssh,['host','user'],['identityFile'])
      ||typeof target.ssh.host!=='string'||isIP(target.ssh.host)!==4||addressKind(normalizeAddress(target.ssh.host))!=='public'
      ||addresses.has(target.ssh.host)||!(/^[a-z_][a-z0-9_-]{0,31}$/).test(target.ssh.user)
      ||target.ssh.identityFile!==undefined&&(typeof target.ssh.identityFile!=='string'||!isAbsolute(target.ssh.identityFile)))
      throw invalid('HOST_MONITOR_TARGET_INVALID');
    ids.add(target.id);addresses.add(target.ssh.host);
    return structuredClone(target);
  });
}
export async function loadHostMonitorTargets(file,options){return validateHostMonitorTargets(await readHostInventoryDocument(file),options)}
export const hostTargetFingerprint=target=>createHash('sha256').update(JSON.stringify({id:target.id,environment:target.environment,
  host:target.ssh.host,user:target.ssh.user})).digest('hex');

export function validateHostObservation(target,facts,{now=Date.now(),allowLocal=false}={}){
  validateHostMonitorTargets({version:1,hosts:[target]},{allowLocal});
  const positive=value=>Number.isSafeInteger(value)&&value>0;
  const within=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
  const observed=Date.parse(facts?.capturedAt);
  if(facts?.host!==target.ssh.host||!Number.isFinite(observed)||observed>now+5000||now-observed>120000
    ||!positive(facts.cpuCount)||facts.cpuCount>4096||!Number.isFinite(facts.cpuUsagePercent)||facts.cpuUsagePercent<0||facts.cpuUsagePercent>100
    ||!positive(facts.memory?.totalBytes)||!within(facts.memory?.availableBytes,facts.memory.totalBytes)
    ||!positive(facts.rootFilesystem?.totalBytes)||!within(facts.rootFilesystem?.availableBytes,facts.rootFilesystem.totalBytes)
    ||!within(facts.rootFilesystem?.usedBytes,facts.rootFilesystem.totalBytes)
    ||facts.docker?.serverVersion!==null&&(typeof facts.docker?.serverVersion!=='string'
      ||!(/^[a-zA-Z0-9][a-zA-Z0-9.+_~:-]{0,79}$/).test(facts.docker.serverVersion)))throw invalid('HOST_MONITOR_FACTS_INVALID');
  return {hostId:target.id,targetFingerprint:hostTargetFingerprint(target),observedAt:new Date(observed).toISOString(),
    cpuCount:facts.cpuCount,cpuUsagePercent:Math.round(facts.cpuUsagePercent*100)/100,
    memoryTotalBytes:facts.memory.totalBytes,memoryAvailableBytes:facts.memory.availableBytes,
    diskTotalBytes:facts.rootFilesystem.totalBytes,diskUsedBytes:facts.rootFilesystem.usedBytes,
    diskAvailableBytes:facts.rootFilesystem.availableBytes,dockerServerVersion:facts.docker.serverVersion};
}

export async function recordHostObservation(pool,target,facts,options){
  const observation=validateHostObservation(target,facts,options),client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(`INSERT INTO roomqc_control.hosts(id,name,region,provider_label,environment)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[target.id,target.name,target.region,target.providerLabel,target.environment]);
    const row=(await client.query('SELECT name,region,provider_label,environment,status FROM roomqc_control.hosts WHERE id=$1',[target.id])).rows[0];
    if(!row||row.name!==target.name||row.region!==target.region||row.provider_label!==target.providerLabel
      ||row.environment!==target.environment||row.status==='retired')throw invalid('HOST_MONITOR_HOST_CONFLICT');
    const stored=await client.query(`INSERT INTO roomqc_control.host_resources_current AS current
      (host_id,target_fingerprint,observed_at,cpu_count,cpu_usage_percent,memory_total_bytes,memory_available_bytes,
       disk_total_bytes,disk_used_bytes,disk_available_bytes,docker_server_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT(host_id) DO UPDATE SET observed_at=excluded.observed_at,received_at=clock_timestamp(),
        cpu_count=excluded.cpu_count,cpu_usage_percent=excluded.cpu_usage_percent,memory_total_bytes=excluded.memory_total_bytes,
        memory_available_bytes=excluded.memory_available_bytes,disk_total_bytes=excluded.disk_total_bytes,
        disk_used_bytes=excluded.disk_used_bytes,disk_available_bytes=excluded.disk_available_bytes,docker_server_version=excluded.docker_server_version
      WHERE current.target_fingerprint=excluded.target_fingerprint AND current.observed_at<excluded.observed_at
      RETURNING host_id`,Object.values(observation));
    if(!stored.rowCount){
      const previous=(await client.query('SELECT target_fingerprint FROM roomqc_control.host_resources_current WHERE host_id=$1',[target.id])).rows[0];
      if(previous?.target_fingerprint!==observation.targetFingerprint)throw invalid('HOST_MONITOR_TARGET_CONFLICT');
    }
    await client.query('COMMIT');return {hostId:target.id,recorded:stored.rowCount===1,observedAt:observation.observedAt};
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}

export function hostResourcesView(row,now=Date.now()){
  if(!row)return null;
  const observedAt=new Date(row.observed_at).toISOString(),receivedAt=new Date(row.received_at).toISOString();
  const age=now-Date.parse(observedAt),fresh=age>=-5000&&age<=120000;
  const diskFreePercent=Math.round(Number(row.disk_available_bytes)/Number(row.disk_total_bytes)*10000)/100;
  const reasons=[];if(diskFreePercent<15)reasons.push('DISK_HEADROOM_LOW');if(!row.docker_server_version)reasons.push('DOCKER_UNAVAILABLE');
  return {source:'ssh_readonly',observedAt,receivedAt,validUntil:new Date(Date.parse(observedAt)+120000).toISOString(),fresh,
    cpuCount:Number(row.cpu_count),cpuUsagePercent:Number(row.cpu_usage_percent),
    memoryTotalBytes:Number(row.memory_total_bytes),memoryAvailableBytes:Number(row.memory_available_bytes),
    diskTotalBytes:Number(row.disk_total_bytes),diskAvailableBytes:Number(row.disk_available_bytes),diskFreePercent,
    dockerServerVersion:row.docker_server_version,deploymentAllowed:fresh&&reasons.length===0,reasonCodes:reasons};
}
