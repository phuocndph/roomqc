import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {ControlError} from '../errors.mjs';
import {validateTelemetryTarget} from '../telemetry-source.mjs';
import {normalizeAddress} from '../safe-http.mjs';
import {resourceMode,loadRuntimeResourceContext,assertHealthResources} from '../resource-runtime.mjs';

const invalid=()=>new ControlError(400,'INVALID_HEALTH_CONFIG','Cấu hình worker giám sát chưa hợp lệ.');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const budgetKeys=['maxConnections','reservedConnections','apiInstances','apiPoolMax','reconcileInstances','reconcilePoolMax',
  'healthInstances','healthPoolMax','exporterConnections','migrationConnections'];
export function healthDatabaseUrl(databaseUrl,{production=true,allowLocal=false}={}){
  let db;try{db=new URL(databaseUrl)}catch{throw invalid()}
  if(!['postgres:','postgresql:'].includes(db.protocol)||!db.username||!db.password||!db.pathname||db.pathname==='/'||db.hash)throw invalid();
  const local=!production&&allowLocal===true;
  if(!local&&db.searchParams.get('sslmode')!=='verify-full')throw invalid();
  if(local&&db.searchParams.get('sslmode')!=='verify-full'
    &&!['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(db.hostname))throw invalid();
  // Do not let URL options override role/TLS/session settings of the bounded pool.
  if([...db.searchParams.keys()].some(key=>key!=='sslmode')||db.searchParams.getAll('sslmode').length>1)throw invalid();
  return db;
}
export function healthConfiguration(raw,{databaseUrl,production=true,allowLocal=false}={}){
  if(!exact(raw,['schemaVersion','instanceId','targets','connectionBudget'])||![1,2].includes(raw.schemaVersion)
    ||typeof raw.instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(raw.instanceId)
    ||!Array.isArray(raw.targets)||raw.targets.length<1||raw.targets.length>4)throw invalid();
  const keys=raw.schemaVersion===2?[...budgetKeys,'probeInstances','probePoolMax']:budgetKeys;
  if(!exact(raw.connectionBudget,keys))throw invalid();
  const b=raw.connectionBudget;
  for(const key of keys)if(!Number.isSafeInteger(b[key])||b[key]<0||b[key]>10000)throw invalid();
  if(b.maxConnections<5||b.reservedConnections<1||b.healthInstances<1||b.healthPoolMax<1||b.healthPoolMax>4
    ||b.migrationConnections<1||b.exporterConnections<1||b.apiInstances<1||b.apiPoolMax<1
    ||(b.reconcileInstances>0&&b.reconcilePoolMax<1))throw invalid();
  if(raw.schemaVersion===2&&(b.probeInstances!==b.healthInstances||b.probePoolMax<1||b.probePoolMax>4))throw invalid();
  const allocated=b.apiInstances*b.apiPoolMax+b.reconcileInstances*b.reconcilePoolMax+b.healthInstances*b.healthPoolMax
    +b.exporterConnections+b.migrationConnections+b.reservedConnections+(raw.schemaVersion===2?b.probeInstances*b.probePoolMax:0);
  if(allocated>b.maxConnections)throw new ControlError(400,'HEALTH_CONNECTION_BUDGET','Tổng pool vượt budget database điều phối.');
  healthDatabaseUrl(databaseUrl,{production,allowLocal});
  const local=!production&&allowLocal===true;
  const targets=raw.targets.map(entry=>{
    if(!exact(entry,['target','prometheus'])||!exact(entry.prometheus,['url','approvedAddresses']))throw invalid();
    const target=validateTelemetryTarget(entry.target),p=entry.prometheus;
    if(!local&&target.environment==='local')throw invalid();
    let origin;try{origin=new URL(p.url)}catch{throw invalid()}
    if(origin.origin!==p.url||origin.username||origin.password||!Array.isArray(p.approvedAddresses)||p.approvedAddresses.length>32
      ||(origin.protocol!=='https:'&&!(local&&origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(origin.hostname))))throw invalid();
    const addresses=p.approvedAddresses.map(normalizeAddress);
    if(new Set(addresses).size!==addresses.length)throw invalid();
    return Object.freeze({target,prometheus:Object.freeze({url:p.url,approvedAddresses:Object.freeze(addresses)})});
  });
  if(new Set(targets.map(e=>e.target.clusterId)).size!==targets.length)throw invalid();
  return Object.freeze({schemaVersion:raw.schemaVersion,instanceId:raw.instanceId,targets:Object.freeze(targets),databaseUrl,production,allowLocal:local,
    poolMax:b.healthPoolMax,concurrency:targets.length,intervalMs:30000,targetTimeoutMs:25000,shutdownTimeoutMs:10000,
    connectionBudget:Object.freeze({...b,allocatedConnections:allocated})});
}
export function validateHealthSecretAccess({uid,gid,mode},{runtimeUid=1000,runtimeGid=1000}={}){
  const owner=uid===runtimeUid&&(mode&0o400)!==0,group=gid===runtimeGid&&(mode&0o040)!==0;
  if((!owner&&!group)||(mode&0o007)!==0||(mode&0o022)!==0||((mode&0o040)!==0&&gid!==runtimeGid))throw invalid();
}
export async function boundedHealthFile(path,max,{sensitive=false,allowEmpty=false}={}){
  let file;
  try{
    if(typeof path!=='string'||!isAbsolute(path))throw invalid();
    // Only a publisher's owned intent prefix may be empty after a failed
    // first write. Operator secrets/configuration retain the nonempty default.
    const minimumSize=allowEmpty===true?0:1;
    const entry=await lstat(path);
    if(!entry.isFile()||entry.isSymbolicLink()||entry.size<minimumSize||entry.size>max)throw invalid();
    if(sensitive&&entry.nlink!==1)throw invalid();
    file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=await file.stat();
    if(!info.isFile()||info.dev!==entry.dev||info.ino!==entry.ino||info.size<minimumSize||info.size>max)throw invalid();
    if(sensitive&&info.nlink!==1)throw invalid();
    if(sensitive&&process.platform!=='win32')validateHealthSecretAccess(info,{runtimeUid:process.getuid(),runtimeGid:process.getgid()});
    const bytes=Buffer.alloc(max+1);let count=0;
    try{
      while(count<bytes.length){const {bytesRead}=await file.read(bytes,count,bytes.length-count,null);if(!bytesRead)break;count+=bytesRead}
      if(count>max)throw invalid();
      if(sensitive){
        // Recheck the opened inode before returning private bytes after a real read.
        const after=await file.stat();if(after.nlink!==1)throw invalid();
        if(process.platform!=='win32')validateHealthSecretAccess(after,{runtimeUid:process.getuid(),runtimeGid:process.getgid()});
      }
      return bytes.subarray(0,count).toString('utf8');
    }finally{bytes.fill(0)}
  }catch{throw invalid()}finally{await file?.close()}
}
export async function loadHealthConfiguration(env=process.env){
  // Secret file only: do not reuse API config, email secrets or service_role keys.
  try{
    const {production}=resourceMode(env),resourceContext=loadRuntimeResourceContext(env,{kind:'directory'});
    const raw=JSON.parse(await boundedHealthFile(env.ROOMQC_HEALTH_CONFIG_FILE,64*1024));
    const databaseUrl=(await boundedHealthFile(env.ROOMQC_HEALTH_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    const config={...healthConfiguration(raw,{databaseUrl,production,allowLocal:env.ROOMQC_HEALTH_ALLOW_LOCAL==='true'}),resourceContext};
    assertHealthResources(config);return Object.freeze(config);
  }catch(error){if(error instanceof ControlError)throw error;throw invalid()}
}
