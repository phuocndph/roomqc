import {ControlError,uuidPattern} from './errors.mjs';

export const clusterCommandOperations=Object.freeze(['close_admission','open_admission','set_draining','set_serving',
  'update_policy','validate','bind_telemetry_target','set_host_maintenance','set_host_active','queue_deployment']);
const clusterIdPattern=/^[a-z][a-z0-9-]{1,39}$/;
export function commandResultLookup(targetId,params,key){
  if(typeof targetId!=='string'||!clusterIdPattern.test(targetId)||typeof key!=='string'||!uuidPattern.test(key)
    ||!(params instanceof URLSearchParams)||[...params.keys()].length!==1
    ||params.getAll('operation').length!==1||![...clusterCommandOperations,'register_cluster'].includes(params.get('operation'))){
    throw new ControlError(400,'INVALID_COMMAND_LOOKUP','Cần đúng cụm, loại thao tác và mã lệnh ban đầu để kiểm tra kết quả.');
  }
  // The existing TEXT receipt key is case-sensitive. Do not normalize keys on a read.
  return {targetId,operation:params.get('operation'),key};
}

const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const integer=(value,min=1)=>Number.isSafeInteger(value)&&value>=min;
const text=(value,max=256)=>typeof value==='string'&&value.length>0&&value.length<=max;
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function requireResult(valid){
  if(!valid)throw new ControlError(409,'COMMAND_RESULT_UNAVAILABLE','Kết quả lệnh chưa thể xác nhận. Giữ nguyên mã lệnh và kiểm tra lại.');
}
function reasonCodes(value){
  requireResult(Array.isArray(value)&&value.length<=128&&value.every(v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(v)));
  return [...value];
}
function admissionSnapshot(value){
  requireResult(record(value)&&['open','blocked','manual_closed'].includes(value.decision)&&integer(value.policyVersion)
    &&time(value.evaluatedAt)&&(value.healthGeneration===null||integer(value.healthGeneration)));
  return {decision:value.decision,reasonCodes:reasonCodes(value.reasonCodes),policyVersion:value.policyVersion,
    healthGeneration:value.healthGeneration,evaluatedAt:value.evaluatedAt};
}
const metricFields=['cpuUsedPercent','memoryAvailableBytes','memoryTotalBytes','dataDiskFreeBytes','dataDiskTotalBytes',
  'dataDiskInodeFreePercent','dbConnectionsUsed','dbConnectionBudget'];
function healthSnapshot(value){
  if(value===null)return null;
  requireResult(record(value)&&['healthy','degraded','unreachable','unknown'].includes(value.status)&&time(value.observedAt)
    &&time(value.receivedAt)&&time(value.validUntil)&&integer(value.generation)&&record(value.metrics));
  const metrics=Object.fromEntries(metricFields.map(key=>{
    const number=value.metrics[key],max=key==='cpuUsedPercent'||key==='dataDiskInodeFreePercent'?100:Number.MAX_SAFE_INTEGER;
    requireResult(number===null||(typeof number==='number'&&Number.isFinite(number)&&number>=0&&number<=max));
    return [key,number];
  }));
  // Older persisted public snapshots predate the optional multi-mount fields.
  const schemaVersion=value.schemaVersion===undefined?1:value.schemaVersion,measurementScope=value.measurementScope??null;
  requireResult([1,2].includes(schemaVersion)&&['linux-host','docker-desktop-vm',null].includes(measurementScope));
  let dataDisks=null;
  if(value.dataDisks!==undefined&&value.dataDisks!==null){
    requireResult(Array.isArray(value.dataDisks)&&value.dataDisks.length>=1&&value.dataDisks.length<=16);
    dataDisks=value.dataDisks.map(d=>{
      requireResult(record(d)&&typeof d.id==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(d.id)&&integer(d.freeBytes,0)
        &&integer(d.totalBytes)&&d.freeBytes<=d.totalBytes&&typeof d.inodeFreePercent==='number'
        &&Number.isFinite(d.inodeFreePercent)&&d.inodeFreePercent>=0&&d.inodeFreePercent<=100);
      return {id:d.id,freeBytes:d.freeBytes,totalBytes:d.totalBytes,inodeFreePercent:d.inodeFreePercent};
    });
  }
  return {status:value.status,observedAt:value.observedAt,receivedAt:value.receivedAt,validUntil:value.validUntil,
    generation:value.generation,metrics,reasonCodes:reasonCodes(value.reasonCodes),schemaVersion,measurementScope,dataDisks};
}
export function commandReceipt(row,targetId){
  const saved=row?.result,value=saved?.result;
  requireResult(row?.status==='succeeded'&&typeof row.id==='string'&&uuidPattern.test(row.id)
    &&row.finished_at!=null&&Number.isFinite(new Date(row.finished_at).getTime())&&record(saved)&&saved.status==='succeeded'
    &&integer(saved.targetVersion)&&record(value)&&value.id===targetId&&value.rowVersion===saved.targetVersion
    &&['active','draining','offline'].includes(value.status)&&['pending','valid','invalid'].includes(value.validationState)
    &&(value.hostId===null||text(value.hostId))&&(value.hostStatus===null||['active','maintenance','retired'].includes(value.hostStatus))&&integer(value.tenantLimit)&&integer(value.allocatedCount,0)
    &&typeof value.credentialConfigured==='boolean'
    &&(value.backendKind===undefined||['self_hosted','managed'].includes(value.backendKind))
    &&(value.releaseId===undefined||value.releaseId===null||text(value.releaseId)));
  // Closed projections, including nested metrics, prevent arbitrary stored extras
  // (reason/body/credentials/paths) from becoming part of the public receipt.
  const result={id:value.id,status:value.status,rowVersion:value.rowVersion,validationState:value.validationState,
    hostId:value.hostId,hostStatus:value.hostStatus??null,tenantLimit:value.tenantLimit,allocatedCount:value.allocatedCount,credentialConfigured:value.credentialConfigured,
    ...(value.backendKind===undefined?{}:{backendKind:value.backendKind}),...(value.releaseId===undefined?{}:{releaseId:value.releaseId}),
    admission:admissionSnapshot(value.admission),health:healthSnapshot(value.health)};
  return {commandId:row.id,status:'succeeded',targetVersion:saved.targetVersion,result};
}
