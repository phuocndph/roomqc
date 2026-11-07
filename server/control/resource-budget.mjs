import {openSync,closeSync,fstatSync,lstatSync,readSync,constants} from 'node:fs';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {ControlError} from './errors.mjs';

const invalid=()=>new ControlError(400,'INVALID_RESOURCE_BUDGET','Cấu hình tổng ngân sách kết nối chưa hợp lệ.');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const id=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);
const integer=(value,min,max=1000000)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const required={directory:['control-api','provisioning-worker','health-worker','alert-worker','probe-catalog','db-exporter','migration','backup'],
  business:['auth','rest','realtime','storage','functions','inapp-notifications','external-notifications','reports','db-exporter','migration','backup']};

/** Server connection maxima, never an estimate of concurrent people. Every
 * required consumer is explicit, including disabled/planned workers at zero replicas. */
export function resourceBudget(raw){
  if(!exact(raw,['schemaVersion','environment','databases'])||raw.schemaVersion!==1
    ||!['example','local','staging','production'].includes(raw.environment)||!Array.isArray(raw.databases)||raw.databases.length<2||raw.databases.length>32)throw invalid();
  const ids=new Set(),kinds=new Set(),databases=[];
  for(const database of raw.databases){
    if(!exact(database,['id','kind','maxConnections','reservedConnections','consumers'])||!id(database.id)||ids.has(database.id)
      ||!Object.hasOwn(required,database.kind)||!integer(database.maxConnections,5)||!integer(database.reservedConnections,1)
      ||!Array.isArray(database.consumers)||database.consumers.length<1||database.consumers.length>64)throw invalid();
    ids.add(database.id);kinds.add(database.kind);const consumers=[],seen=new Set();let allocated=0;
    for(const consumer of database.consumers){
      if(!exact(consumer,['id','replicas','pools','fixedConnectionsPerReplica'])||!id(consumer.id)||seen.has(consumer.id)||!integer(consumer.replicas,0,1024)
        ||!integer(consumer.fixedConnectionsPerReplica,0,10000)||!Array.isArray(consumer.pools)||consumer.pools.length>8)throw invalid();
      seen.add(consumer.id);let poolMax=0;const pools=new Set();
      for(const pool of consumer.pools){
        if(!exact(pool,['id','max'])||!id(pool.id)||pools.has(pool.id)||!integer(pool.max,1,10000))throw invalid();
        pools.add(pool.id);poolMax+=pool.max;
      }
      const perReplica=poolMax+consumer.fixedConnectionsPerReplica,connections=consumer.replicas*perReplica;
      if((consumer.replicas>0&&perReplica===0)||!integer(connections,0))throw invalid();
      if(database.kind==='directory'&&consumer.id==='control-api'&&(consumer.replicas<1||consumer.pools.length!==1||consumer.fixedConnectionsPerReplica!==0))throw invalid();
      allocated+=connections;consumers.push({id:consumer.id,replicas:consumer.replicas,poolMax,pools:consumer.pools.map(pool=>({...pool})),fixedConnectionsPerReplica:consumer.fixedConnectionsPerReplica,connections});
    }
    if(required[database.kind].some(key=>!seen.has(key)))throw invalid();
    const committed=allocated+database.reservedConnections;
    if(!integer(committed,1)||committed>database.maxConnections)throw new ControlError(400,'RESOURCE_CONNECTION_BUDGET','Tổng pool, replica và dự phòng vượt ngân sách database.');
    databases.push({id:database.id,kind:database.kind,maxConnections:database.maxConnections,reservedConnections:database.reservedConnections,
      allocatedConnections:allocated,committedConnections:committed,remainingConnections:database.maxConnections-committed,consumers});
  }
  if(kinds.size!==2||databases.filter(d=>d.kind==='directory').length!==1)throw invalid();
  return {schemaVersion:1,environment:raw.environment,databases,capacityProven:false};
}
export function bindControlBudget(budget,{poolMax,poolBudget,apiInstances,production}){
  const directory=budget.databases.find(d=>d.kind==='directory'),api=directory.consumers.find(c=>c.id==='control-api');
  if(api.poolMax!==poolMax||api.replicas!==apiInstances||directory.committedConnections>poolBudget||poolBudget>directory.maxConnections
    ||(production&&budget.environment!=='production'))throw new ControlError(400,'RESOURCE_RUNTIME_MISMATCH','Pool, số replica hoặc môi trường API không khớp ngân sách đã cấu hình.');
  return budget;
}
export function loadResourceBudgetSnapshot(path){
  let fd;
  try{
    if(typeof path!=='string'||!isAbsolute(path))throw invalid();
    const entry=lstatSync(path);if(!entry.isFile()||entry.isSymbolicLink()||entry.size<1||entry.size>128*1024)throw invalid();
    fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=fstatSync(fd);
    if(!info.isFile()||info.dev!==entry.dev||info.ino!==entry.ino||info.size<1||info.size>128*1024)throw invalid();
    const bytes=Buffer.alloc(128*1024+1);let length=0;
    while(length<bytes.length){const read=readSync(fd,bytes,length,bytes.length-length,null);if(!read)break;length+=read}
    if(length>128*1024)throw invalid();
    const content=bytes.subarray(0,length);
    return {budget:resourceBudget(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content).replace(/^\uFEFF/,''))),
      sha256:createHash('sha256').update(content).digest('hex')};
  }catch(error){if(error instanceof ControlError)throw error;throw invalid()}finally{if(fd!==undefined)closeSync(fd)}
}
export function loadResourceBudget(path){return loadResourceBudgetSnapshot(path).budget}
