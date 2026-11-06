import {createHash} from 'node:crypto';
import {posix} from 'node:path';
import {ControlError} from './errors.mjs';
import {normalizeSample} from './health-policy.mjs';
import {createClusterFetch} from './safe-http.mjs';

const invalid=()=>new ControlError(503,'TELEMETRY_SOURCE_INVALID','Nguồn giám sát thiếu dữ liệu hợp lệ hoặc mapping chưa được xác minh.');
const unavailable=()=>new ControlError(503,'TELEMETRY_SOURCE_UNAVAILABLE','Không thu thập được số đo trong thời gian cho phép.');
const id=/^[a-z][a-z0-9-]{1,39}$/;
const number=/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const label=value=>JSON.stringify(value);
const exact=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>fields.includes(key));
export function validateTelemetryTarget(target){
  if(!exact(target,['clusterId','hostId','environment','dbConnectionBudget','measurementScope','dataMounts'])
    ||typeof target.clusterId!=='string'||typeof target.hostId!=='string'||!id.test(target.clusterId)||!id.test(target.hostId)
    ||!['local','staging','production'].includes(target.environment)||!Array.isArray(target.dataMounts)||!target.dataMounts.length||target.dataMounts.length>16
    ||!Number.isSafeInteger(target.dbConnectionBudget)||target.dbConnectionBudget<1||!['linux-host','docker-desktop-vm'].includes(target.measurementScope)
    ||(target.environment!=='local'&&target.measurementScope!=='linux-host'))throw invalid();
  const mountIds=new Set(),paths=new Set();
  const mounts=target.dataMounts.map(mount=>{
    if(!exact(mount,['id','mountpoint','device','fstype'])||typeof mount.id!=='string'||!/^[a-z][a-z0-9-]{0,39}$/.test(mount.id)
      ||mountIds.has(mount.id)||paths.has(mount.mountpoint)||typeof mount.mountpoint!=='string'||!mount.mountpoint.startsWith('/')
      ||mount.mountpoint.length>256||/[\x00-\x1f]/.test(mount.mountpoint)||posix.normalize(mount.mountpoint)!==mount.mountpoint
      ||(mount.mountpoint!=='/'&&mount.mountpoint.endsWith('/'))||typeof mount.device!=='string'
      ||!/^\/dev\/[a-zA-Z0-9._/-]+$/.test(mount.device)||mount.device.length>128||posix.normalize(mount.device)!==mount.device
      ||!['ext4','xfs','btrfs'].includes(mount.fstype))throw invalid();
    mountIds.add(mount.id);paths.add(mount.mountpoint);
    return Object.freeze({id:mount.id,mountpoint:mount.mountpoint,device:mount.device,fstype:mount.fstype});
  }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  // A caller cannot change configuration halfway through a collection.
  return Object.freeze({clusterId:target.clusterId,hostId:target.hostId,environment:target.environment,
    dbConnectionBudget:target.dbConnectionBudget,measurementScope:target.measurementScope,dataMounts:Object.freeze(mounts)});
}
export function telemetryTargetFingerprint(input){
  return createHash('sha256').update(JSON.stringify(validateTelemetryTarget(input))).digest('hex');
}
export function queryTemplates(input){
  const target=validateTelemetryTarget(input),base=`host_id=${label(target.hostId)},cluster_id=${label(target.clusterId)},environment=${label(target.environment)}`;
  const host=`job="roomqc-node",${base}`,db=`job="roomqc-postgres",${base}`;
  const queries={cpuUsedPercent:`100 * (1 - avg(rate(node_cpu_seconds_total{${host},mode="idle"}[1m])))`,
    memoryAvailableBytes:`node_memory_MemAvailable_bytes{${host}}`,memoryTotalBytes:`node_memory_MemTotal_bytes{${host}}`,
    dbConnectionsUsed:`roomqc_connections_used{${db}}`};
  const healthQueries={nodeUp:`up{${host}}`,postgresUp:`up{${db}}`,databaseUp:`pg_up{${db}}`,
    databaseScrapeError:`pg_exporter_last_scrape_error{${db}}`,monitorPermission:`roomqc_connections_monitor_permission{${db}}`,
    cpuCollector:`node_scrape_collector_success{${host},collector="cpu"}`,
    memoryCollector:`node_scrape_collector_success{${host},collector="meminfo"}`,
    filesystemCollector:`node_scrape_collector_success{${host},collector="filesystem"}`};
  Object.assign(queries,healthQueries);
  // timestamp() removes __name__. Distinct synthetic labels prevent union from
  // discarding an older metric that has the same labels as a fresh metric.
  const freshness=[`timestamp(node_memory_MemAvailable_bytes{${host}})`,`timestamp(node_memory_MemTotal_bytes{${host}})`,
    `min(timestamp(node_cpu_seconds_total{${host},mode="idle"}))`,`timestamp(roomqc_connections_used{${db}})`];
  for(const query of Object.values(healthQueries))freshness.push(`timestamp(${query})`);
  for(const mount of target.dataMounts){
    const selector=`${host},mountpoint=${label(mount.mountpoint)},device=${label(mount.device)},fstype=${label(mount.fstype)}`;
    for(const [field,metric]of [['freeBytes','node_filesystem_avail_bytes'],['totalBytes','node_filesystem_size_bytes'],
      ['inodeFree','node_filesystem_files_free'],['inodeTotal','node_filesystem_files'],['readonly','node_filesystem_readonly']]){
      queries['disk:'+mount.id+':'+field]=`${metric}{${selector}}`;freshness.push(`timestamp(${metric}{${selector}})`);
    }
  }
  queries.sourceObservedAt=`min(${freshness.map((query,index)=>`label_replace(${query}, "roomqc_source", "s${index}", "__name__", ".*")`).join(' or ')})`;
  return Object.freeze(queries);
}
async function withSignal(run,signal){
  signal.throwIfAborted();let listener;
  const aborted=new Promise((resolve,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true})});
  try{return await Promise.race([Promise.resolve().then(run),aborted])}finally{signal.removeEventListener('abort',listener)}
}
export class PrometheusSource {
  constructor({url,approvedAddresses=[],allowLocal=false,fetcher,clock=Date.now,deadlineMs=12000}){
    let origin;try{origin=new URL(url)}catch{throw invalid()}
    if(origin.origin!==url||!Array.isArray(approvedAddresses)||approvedAddresses.length>32
      ||(origin.protocol!=='https:'&&!(allowLocal&&origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(origin.hostname)))
      ||!Number.isInteger(deadlineMs)||deadlineMs<10||deadlineMs>12000)throw invalid();
    const entry=Object.freeze({id:'prometheus',url,approvedAddresses:Object.freeze([...approvedAddresses])});
    this.cluster=entry;this.url=url;this.clock=clock;this.deadlineMs=deadlineMs;
    this.fetcher=fetcher??createClusterFetch({allowLocal,inventory:new Map([['prometheus',entry]])},{maxResponseBytes:128*1024});
  }
  async scalar(query,signal,queryAt=this.clock()){
    const url=new URL('/api/v1/query',this.url);url.searchParams.set('query',query);url.searchParams.set('timeout','3s');
    url.searchParams.set('time',String(queryAt/1000));
    try{
      const response=await withSignal(()=>this.fetcher(url.href,{method:'GET',redirect:'error',signal},this.cluster),signal);
      if(!response?.ok)throw unavailable();
      let data;try{data=await withSignal(()=>response.json(),signal)}catch{if(signal.aborted)throw unavailable();throw invalid()}
      const results=data?.data?.result;
      if(data?.status!=='success'||data?.data?.resultType!=='vector'||!Array.isArray(results)||results.length!==1
        ||!Array.isArray(results[0]?.value)||results[0].value.length!==2||typeof results[0].value[1]!=='string'
        ||!number.test(results[0].value[1])||!Number.isFinite(results[0].value[0])
        ||Math.abs(results[0].value[0]*1000-queryAt)>1)throw invalid();
      const value=Number(results[0].value[1]);if(!Number.isFinite(value))throw invalid();return value;
    }catch(error){if(signal.aborted||!(error instanceof ControlError))throw unavailable();throw error}
  }
  async collect(input,probes,signal){
    const target=validateTelemetryTarget(input),queryAt=this.clock(),templates=queryTemplates(target),items=Object.entries(templates),values={};
    if(!Number.isFinite(queryAt)||!Number.isFinite(new Date(queryAt).getTime()))throw invalid();
    const controller=new AbortController();
    const bounded=AbortSignal.any([AbortSignal.timeout(this.deadlineMs),controller.signal,...(signal?[signal]:[])]);
    try{
      // Every query shares one evaluation time; fanout is bounded per target.
      for(let at=0;at<items.length;at+=4){
        bounded.throwIfAborted();
        const batch=await Promise.all(items.slice(at,at+4).map(async([key,query])=>[key,await this.scalar(query,bounded,queryAt)]));
        for(const [key,value]of batch)values[key]=value;
      }
      for(const key of ['nodeUp','postgresUp','databaseUp','monitorPermission','cpuCollector','memoryCollector','filesystemCollector']){
        if(values[key]!==1)throw invalid();
      }
      if(values.databaseScrapeError!==0)throw invalid();
      const disks=target.dataMounts.map(mount=>{
        const read=field=>values['disk:'+mount.id+':'+field],inodeFree=read('inodeFree'),inodeTotal=read('inodeTotal');
        if(read('readonly')!==0||!Number.isSafeInteger(inodeFree)||!Number.isSafeInteger(inodeTotal)||inodeTotal<=0||inodeFree<0||inodeFree>inodeTotal)throw invalid();
        return {id:mount.id,freeBytes:read('freeBytes'),totalBytes:read('totalBytes'),inodeFreePercent:inodeFree/inodeTotal*100};
      });
      const first=disks[0],at=values.sourceObservedAt*1000;
      if(!Number.isFinite(at)||!Number.isFinite(new Date(at).getTime()))throw invalid();
      return normalizeSample({schemaVersion:2,targetFingerprint:telemetryTargetFingerprint(target),measurementScope:target.measurementScope,
        requiredMountIds:target.dataMounts.map(m=>m.id),dataDisks:disks,observedAt:new Date(at).toISOString(),
        metrics:{cpuUsedPercent:values.cpuUsedPercent,memoryAvailableBytes:values.memoryAvailableBytes,memoryTotalBytes:values.memoryTotalBytes,
          dataDiskFreeBytes:first.freeBytes,dataDiskTotalBytes:first.totalBytes,dataDiskInodeFreePercent:first.inodeFreePercent,
          dbConnectionsUsed:values.dbConnectionsUsed,dbConnectionBudget:target.dbConnectionBudget},probes},this.clock());
    }catch(error){if(bounded.aborted||!(error instanceof ControlError))throw unavailable();throw error}
    finally{controller.abort()}
  }
}
