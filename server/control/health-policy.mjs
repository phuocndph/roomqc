import {ControlError} from './errors.mjs';

export const defaultThresholds=Object.freeze({cpuBlockPercent:85,cpuWarnPercent:70,memoryBlockPercent:15,memoryWarnPercent:25,
  diskBlockPercent:15,diskWarnPercent:25,diskBlockBytes:10*1024**3,diskWarnBytes:20*1024**3,
  inodeBlockPercent:10,inodeWarnPercent:20,connectionBlockPercent:85,connectionWarnPercent:70});
const ranges={cpuBlockPercent:[75,90],cpuWarnPercent:[50,75],memoryBlockPercent:[10,20],memoryWarnPercent:[25,40],
  diskBlockPercent:[10,20],diskWarnPercent:[25,40],diskBlockBytes:[5*1024**3,50*1024**3],diskWarnBytes:[20*1024**3,100*1024**3],
  inodeBlockPercent:[10,15],inodeWarnPercent:[20,40],connectionBlockPercent:[75,90],connectionWarnPercent:[50,75]};
export function policyThresholds(overrides={}){
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new ControlError(400,'INVALID_POLICY','Chính sách tài nguyên không hợp lệ.');
  for(const[key,value]of Object.entries(overrides))if(!Object.hasOwn(ranges,key)||!Number.isFinite(value)||(key.endsWith('Bytes')&&!Number.isSafeInteger(value))||value<ranges[key][0]||value>ranges[key][1]){
    throw new ControlError(400,'INVALID_POLICY','Ngưỡng tài nguyên không hợp lệ hoặc ngoài giới hạn cho phép.');
  }
  const result={...defaultThresholds,...overrides};
  if(result.cpuWarnPercent>=result.cpuBlockPercent||result.connectionWarnPercent>=result.connectionBlockPercent
    ||result.memoryWarnPercent<=result.memoryBlockPercent||result.diskWarnPercent<=result.diskBlockPercent
    ||result.diskWarnBytes<=result.diskBlockBytes||result.inodeWarnPercent<=result.inodeBlockPercent)throw new ControlError(400,'INVALID_POLICY','Ngưỡng cảnh báo và ngưỡng chặn bị chồng lấn.');
  return result;
}

export function normalizeSample(sample,now=Date.now()){
  const observed=Date.parse(sample?.observedAt);
  if(typeof sample?.observedAt!=='string'||!Number.isFinite(observed)||observed>now+5000||observed<now-120000)throw new ControlError(422,'INVALID_SAMPLE_TIME','Số đo quá cũ hoặc có thời gian không hợp lệ.');
  const m=sample?.metrics;
  const names=['cpuUsedPercent','memoryAvailableBytes','memoryTotalBytes','dataDiskFreeBytes','dataDiskTotalBytes',
    'dataDiskInodeFreePercent','dbConnectionsUsed','dbConnectionBudget'];
  if(!m||names.some(key=>!Number.isFinite(m[key])||m[key]<0)||m.cpuUsedPercent>100||m.dataDiskInodeFreePercent>100
    ||names.filter(k=>!k.endsWith('Percent')).some(k=>!Number.isSafeInteger(m[k]))
    ||m.memoryTotalBytes<=0||m.memoryAvailableBytes>m.memoryTotalBytes||m.dataDiskTotalBytes<=0||m.dataDiskFreeBytes>m.dataDiskTotalBytes
    ||m.dbConnectionBudget<=0)throw new ControlError(422,'INVALID_SAMPLE','Số đo thiếu, sai đơn vị hoặc ngoài phạm vi.');
  const probes=sample.probes;
  const probeNames=['auth','rest','storage','realtime','functions'];
  if(!probes||Object.keys(probes).length!==probeNames.length||probeNames.some(key=>typeof probes[key]!=='boolean'))throw new ControlError(422,'INVALID_PROBES','Thiếu kết quả kiểm tra dịch vụ.');
  return {observedAt:new Date(observed).toISOString(),metrics:Object.fromEntries(names.map(k=>[k,m[k]])),probes:{...probes}};
}

// Window state is persisted with the sample. A restart never erases a sustained fault.
export function evaluateSample(sample,previous={},thresholds={},policyVersion=1,now=Date.now()){
  const clean=normalizeSample(sample,now),m=clean.metrics,t=policyThresholds(thresholds),at=Date.parse(clean.observedAt);
  if(previous.lastObservedAt!=null&&at<=previous.lastObservedAt)throw new ControlError(409,'SAMPLE_NOT_NEWER','Số đo không mới hơn snapshot hiện tại.');
  const since={...(previous.since||{})},state={since,firstValidAt:previous.firstValidAt??at,policyVersion};
  const continued=previous.lastObservedAt!=null&&previous.policyVersion===policyVersion&&at-previous.lastObservedAt<=120000;
  if(!continued){state.firstValidAt=at;for(const key of Object.keys(since))delete since[key]}
  state.lastObservedAt=at;
  const block=[],warning=[];
  const sustained=(code,bad,window,list)=>{if(!bad){delete since[code];return}since[code]??=at;if(at-since[code]>=window)list.push(code)};
  const memory=m.memoryAvailableBytes/m.memoryTotalBytes*100,disk=m.dataDiskFreeBytes/m.dataDiskTotalBytes*100,connections=m.dbConnectionsUsed/m.dbConnectionBudget*100;
  sustained('CPU_CRITICAL',m.cpuUsedPercent>=t.cpuBlockPercent,300000,block);
  sustained('CPU_HIGH',m.cpuUsedPercent>=t.cpuWarnPercent,300000,warning);
  sustained('MEMORY_CRITICAL',memory<t.memoryBlockPercent,120000,block);
  sustained('MEMORY_LOW',memory<t.memoryWarnPercent,300000,warning);
  sustained('DISK_CRITICAL',disk<t.diskBlockPercent||m.dataDiskFreeBytes<t.diskBlockBytes,0,block);
  sustained('DISK_LOW',disk<t.diskWarnPercent||m.dataDiskFreeBytes<t.diskWarnBytes,0,warning);
  sustained('INODE_CRITICAL',m.dataDiskInodeFreePercent<t.inodeBlockPercent,0,block);
  sustained('INODE_LOW',m.dataDiskInodeFreePercent<t.inodeWarnPercent,0,warning);
  sustained('DB_CONNECTIONS_CRITICAL',connections>=t.connectionBlockPercent,120000,block);
  sustained('DB_CONNECTIONS_HIGH',connections>=t.connectionWarnPercent,300000,warning);
  const probesOk=Object.values(clean.probes).every(Boolean);
  state.probeFailures=probesOk?0:(continued?previous.probeFailures??0:0)+1;
  sustained('BACKEND_UNREACHABLE',!probesOk,60000,block);
  if(state.probeFailures<3){const index=block.indexOf('BACKEND_UNREACHABLE');if(index>=0)block.splice(index,1)}
  if(!probesOk)warning.push('BACKEND_PROBE_FAILED');
  const recovering=m.cpuUsedPercent<65&&memory>25&&disk>25&&m.dataDiskFreeBytes>20*1024**3
    &&m.dataDiskInodeFreePercent>20&&connections<65&&probesOk;
  if(recovering)state.recoverySince=continued?(previous.recoverySince??at):at;
  else state.recoverySince=null;
  const latched=previous.latchedReasons||[];
  state.latchedReasons=block.length?[...new Set([...latched,...block])]:latched;
  if(state.recoverySince!=null&&at-state.recoverySince>=600000)state.latchedReasons=[];
  state.warming=at-state.firstValidAt<300000;
  state.blockedReasons=[...new Set([...block,...state.latchedReasons,...(state.warming?['METRICS_WARMING']:[])])];
  state.warningReasons=warning;
  return {...clean,state,status:state.blockedReasons.some(r=>r==='BACKEND_UNREACHABLE')?'unreachable':state.blockedReasons.length||warning.length?'degraded':'healthy',
    reasonCodes:[...new Set([...state.blockedReasons,...warning])]};
}

export function admissionDecision(row,{now=Date.now(),ignoreManual=false,ignoreReopen=false,ignoreCapacity=false}={}){
  const reasons=[];
  if(row.status!=='active')reasons.push(row.status==='draining'?'CLUSTER_DRAINING':'CLUSTER_OFFLINE');
  if(!row.credential_configured)reasons.push('CREDENTIAL_MISSING');
  if(row.validation_state!=='valid'||!row.release_id||!row.schema_manifest_hash||row.release_compatible!==true)reasons.push('RELEASE_UNVERIFIED');
  if(!row.frontend_ready||row.frontend_current!==true)reasons.push('FRONTEND_NOT_READY');
  if(!ignoreManual&&row.manual_closed)reasons.push('MANUAL_CLOSED');
  const expiry=Date.parse(row.health_valid_until),observed=Date.parse(row.health_observed_at);
  if(!Number.isFinite(expiry)||expiry<=now||!Number.isFinite(observed)||observed>now+5000)reasons.push('METRICS_STALE');
  else{
    const state=row.evaluator_state??{};
    if(Number(state.policyVersion)!==Number(row.policy_version))reasons.push('METRICS_POLICY_CHANGED');
    if(!Array.isArray(state.blockedReasons))reasons.push('METRICS_UNVERIFIED');else reasons.push(...state.blockedReasons);
    if(['unknown','unreachable'].includes(row.metric_status))reasons.push('METRICS_UNAVAILABLE');
  }
  if(!ignoreReopen&&row.operator_reopen_required)reasons.push('OPERATOR_REOPEN_REQUIRED');
  const completed=Date.parse(row.backup_completed_at),restore=Date.parse(row.backup_restore_test_at);
  if(!Number.isFinite(completed)||completed>now+5000||now-completed>86400000||!Number.isFinite(restore)||restore>now+5000
    ||now-restore>30*86400000||!(/^[a-f0-9]{64}$/).test(row.backup_manifest_hash||''))reasons.push('BACKUP_UNVERIFIED');
  if(!ignoreCapacity&&Number(row.allocated_count)>=Number(row.tenant_limit))reasons.push('NO_CAPACITY');
  return {decision:!ignoreManual&&row.manual_closed?'manual_closed':reasons.length?'blocked':'open',reasonCodes:[...new Set(reasons)],
    policyVersion:Number(row.policy_version),healthGeneration:row.source_generation?Number(row.source_generation):null,evaluatedAt:new Date(now).toISOString()};
}
