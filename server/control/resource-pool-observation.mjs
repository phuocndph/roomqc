// Opt-in private status. Sample actual application pools; never create a second
// pool/Client from a file, change LOGIN, or run caller-supplied SQL.
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {readResourceDatabaseCatalog,validateResourceDatabaseObservation,resourceDatabaseObservationDigests} from './resource-database.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const consumers=['control-api','health-worker','probe-catalog','alert-worker','provisioning-worker','external-notifications'];
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hashKeys=['roleSha256','lineageSha256','databaseIdentitySha256','serverSettingsSha256'];
export function validateResourcePoolSample(v,{now=Date.now()}={}){
 const invalid=()=>fail('RESOURCE_POOL_SAMPLE_INVALID');
 if(!exact(v,['schemaVersion','mode','processNonce','observedAtUtc','resources','bindings'])||v.schemaVersion!==1||v.mode!=='loaded-pool-sample'
  ||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.processNonce??'')||typeof v.observedAtUtc!=='string'
  ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.observedAtUtc)||!Number.isFinite(Date.parse(v.observedAtUtc))
  ||Date.parse(v.observedAtUtc)<now-10000||Date.parse(v.observedAtUtc)>now+2000)invalid();
 const r=v.resources;
 if(!exact(r,['schemaVersion','budgetSha256','environment','databaseId','consumers'])||r.schemaVersion!==1||!id(r.databaseId)
  ||!/^[a-f0-9]{64}$/.test(r.budgetSha256??'')||!['local','staging','production'].includes(r.environment)
  ||!Array.isArray(r.consumers)||r.consumers.length<1||r.consumers.length>2||!Array.isArray(v.bindings)||v.bindings.length!==r.consumers.length)invalid();
 const seen=new Set();for(const c of r.consumers){
  if(!exact(c,['id','replicas','pools','fixedConnectionsPerReplica'])||!consumers.includes(c.id)||seen.has(c.id)||c.fixedConnectionsPerReplica!==0
   ||!Number.isInteger(c.replicas)||c.replicas<1||c.replicas>1024||!Array.isArray(c.pools)||c.pools.length!==1)invalid();seen.add(c.id);
  const p=c.pools[0];if(!exact(p,['id','max'])||!id(p.id)||!Number.isInteger(p.max)||p.max<1||p.max>10000)invalid();
  const b=v.bindings.filter(b=>b?.consumerId===c.id);
  if(b.length!==1||!exact(b[0],['consumerId','poolId','poolMax',...hashKeys])||b[0].poolId!==p.id||b[0].poolMax!==p.max
   ||hashKeys.some(k=>typeof b[0][k]!=='string'||!/^[a-f0-9]{64}$/.test(b[0][k])))invalid();
 }
 return structuredClone(v);
}

export function createResourcePoolSampler({resources,budget,pools,timeoutMs=4000}){
 if(!resources||resources.schemaVersion!==1||!Array.isArray(resources.consumers)||!budget
  ||!Array.isArray(pools)||pools.length!==resources.consumers.length||!Number.isInteger(timeoutMs)||timeoutMs<20||timeoutMs>5000)
  fail('RESOURCE_POOL_CONFIGURATION_INVALID');
 const profile=structuredClone(resources),database=budget.databases.find(d=>d.id===profile.databaseId);
 if(!database||!id(profile.databaseId)||!/^[a-f0-9]{64}$/.test(profile.budgetSha256)||!['local','staging','production'].includes(profile.environment)
  ||new Set(pools.map(p=>p.consumerId)).size!==pools.length)fail('RESOURCE_POOL_CONFIGURATION_INVALID');
 const descriptors=profile.consumers.map(c=>{
  const descriptor=pools.find(p=>p.consumerId===c.id);
  if(!consumers.includes(c.id)||!descriptor||typeof descriptor.getPool!=='function'||c.pools.length!==1||!id(c.pools[0].id))fail('RESOURCE_POOL_CONFIGURATION_INVALID');
  return {consumerId:c.id,poolId:c.pools[0].id,max:c.pools[0].max,getPool:descriptor.getPool};
 });
 function configuredPool(d){const pool=d.getPool();
  if(!pool||typeof pool.connect!=='function'||pool.options?.max!==d.max)fail('RESOURCE_POOL_CONFIGURATION_INVALID');return pool;
 }
 for(const d of descriptors)configuredPool(d);
 const processNonce=randomUUID();let pending,controller,closed=false;
 async function observe(d,signal){
  const pool=configuredPool(d);let client,released=false,completed=false;
  const release=destroy=>{if(client&&!released){released=true;client.release(destroy)}};
  const abort=()=>release(true);signal.addEventListener('abort',abort,{once:true});
  try{
   client=await pool.connect();
   if(signal.aborted){release(true);fail('RESOURCE_POOL_UNAVAILABLE')}
   await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const observed=await readResourceDatabaseCatalog(client);
   // Shape, session and role-attribute checks only. Approved identity/LOGIN
   // comparison is performed independently by the external inspector.
   validateResourceDatabaseObservation(observed,{expected:{role:observed.role}},database,{application:true});
   await client.query('ROLLBACK');
   if(signal.aborted||closed||configuredPool(d)!==pool)fail('RESOURCE_POOL_UNAVAILABLE');
   const result={consumerId:d.consumerId,poolId:d.poolId,poolMax:d.max,...resourceDatabaseObservationDigests(observed)};
   completed=true;return result;
  }finally{signal.removeEventListener('abort',abort);release(!completed)}
 }
 async function sample(){
  if(closed)fail('RESOURCE_POOL_UNAVAILABLE');if(pending)fail('RESOURCE_POOL_BUSY');
  controller=new AbortController();const current=controller;
  let timer,rejectDeadline;
  const deadline=new Promise((_,reject)=>{rejectDeadline=()=>reject(Object.assign(new Error('RESOURCE_POOL_UNAVAILABLE'),{code:'RESOURCE_POOL_UNAVAILABLE'}));
   current.signal.addEventListener('abort',rejectDeadline,{once:true});timer=setTimeout(()=>current.abort(),timeoutMs)});
  const work=(async()=>{const bindings=[];for(const d of descriptors){if(current.signal.aborted)fail('RESOURCE_POOL_UNAVAILABLE');bindings.push(await observe(d,current.signal))}
   return {schemaVersion:1,mode:'loaded-pool-sample',processNonce,observedAtUtc:new Date().toISOString(),resources:structuredClone(profile),bindings};})();
  // Keep the busy latch until a late pool acquisition has really settled and
  // released. HTTP timeout must not enqueue an unbounded series of waiters.
  pending=work;void work.finally(()=>{if(pending===work){pending=null;controller=null}}).catch(()=>{});
  try{return await Promise.race([work,deadline])}
  catch(error){if(error?.code==='RESOURCE_POOL_BUSY')throw error;fail('RESOURCE_POOL_UNAVAILABLE')}
  finally{clearTimeout(timer);current.signal.removeEventListener('abort',rejectDeadline)}
 }
 async function stop(){closed=true;controller?.abort();let timer;
  try{return await Promise.race([Promise.resolve(pending).then(()=>({timedOut:false}),()=>({timedOut:false})),
   new Promise(resolve=>{timer=setTimeout(()=>resolve({timedOut:true}),timeoutMs)})])}finally{clearTimeout(timer)}
 }
 return {sample,stop};
}

export async function startResourcePoolStatus(options,{port=8098}={}){
 if(!Number.isInteger(port)||port<0||port>65535)fail('RESOURCE_POOL_CONFIGURATION_INVALID');
 const sampler=createResourcePoolSampler(options);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  if(req.method!=='GET'||req.url!=='/resource-targets'){res.writeHead(404);res.end('{"code":"NOT_FOUND"}');return}
  try{const result=await sampler.sample();if(!res.destroyed&&!res.writableEnded){res.writeHead(200);res.end(JSON.stringify(result))}}
  catch(error){if(!res.destroyed&&!res.writableEnded){res.writeHead(503);res.end(JSON.stringify({code:error?.code==='RESOURCE_POOL_BUSY'?'RESOURCE_POOL_BUSY':'RESOURCE_POOL_UNAVAILABLE'}))}}
 });
 server.requestTimeout=6000;server.headersTimeout=5000;server.keepAliveTimeout=1000;server.maxConnections=4;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}
 catch{await sampler.stop();fail('RESOURCE_POOL_STATUS_UNAVAILABLE')}
 let stopping;return {server,stop:()=>stopping??=(async()=>{const drained=sampler.stop();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));return drained})()};
}
