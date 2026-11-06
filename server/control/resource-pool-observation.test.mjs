import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadRuntimeResourceContext,runtimeResourceView,resourcePoolObservationMode} from './resource-runtime.mjs';
import {createResourcePoolSampler,startResourcePoolStatus,validateResourcePoolSample} from './resource-pool-observation.mjs';
import {resourceDatabaseObservationDigests} from './resource-database.mjs';
const raw=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
import {resourceBudget} from './resource-budget.mjs';
const budget=resourceBudget(raw),directory=budget.databases.find(d=>d.kind==='directory');
const resources={schemaVersion:1,budgetSha256:'a'.repeat(64),environment:'local',databaseId:directory.id,
 consumers:[{id:'control-api',replicas:1,pools:[{id:'main',max:5}],fixedConnectionsPerReplica:0}]};
const observation={systemIdentifier:'123456789',databaseOid:'100',databaseName:'owned_db',role:'app_role',sessionRole:'app_role',
 maxConnections:100,reservedConnections:3,inRecovery:false,postmasterStartedAt:'2026-10-30 01:00:00+00',readOnly:true,
 superuser:false,createDatabase:false,createRole:false,replication:false,bypassRls:false,canLogin:true,roleConnectionLimit:20,memberships:0};
function fixture({mutate,connect}={}){
 const queries=[],releases=[];const client={query:async sql=>{queries.push(sql);return sql.startsWith('SELECT')?{rows:[mutate?mutate({...observation}):observation]}:{rows:[]}},release:destroy=>releases.push(destroy)};
 const pool={options:{max:5},connect:connect??(async()=>client)};
 const options={resources,budget,pools:[{consumerId:'control-api',getPool:()=>pool}],timeoutMs:100};
 return {pool,client,options,queries,releases};
}
test('pool observer is explicitly enabled and samples an existing pool without new connection configuration',async()=>{
 assert.equal(resourcePoolObservationMode({}),false);assert.equal(resourcePoolObservationMode({ROOMQC_RESOURCE_POOL_OBSERVATIONS:'true'}),true);
 assert.throws(()=>resourcePoolObservationMode({ROOMQC_RESOURCE_POOL_OBSERVATIONS:'1'}));
 const f=fixture(),sampler=createResourcePoolSampler(f.options);const sample=await sampler.sample();
 assert.deepEqual(validateResourcePoolSample(sample),sample);assert.equal(f.queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(f.queries.at(-1),'ROLLBACK');assert.equal(f.queries.length,3);assert.deepEqual(f.releases,[false]);
 assert.deepEqual(sample.bindings[0],{consumerId:'control-api',poolId:'main',poolMax:5,...resourceDatabaseObservationDigests(observation)});
 assert.doesNotMatch(JSON.stringify(sample),/owned_db|app_role|postgresql|password|postmaster/);
 sample.resources.databaseId='tampered';assert.equal((await sampler.sample()).resources.databaseId,resources.databaseId);await sampler.stop();
});
test('role escalation, wrong session and query errors destroy the leased client and redact private errors',async()=>{
 for(const change of [{createDatabase:true},{bypassRls:true},{sessionRole:'other'},{readOnly:false}]){
  const f=fixture({mutate:o=>({...o,...change})}),sampler=createResourcePoolSampler(f.options);
  await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});assert.deepEqual(f.releases,[true]);await sampler.stop();
 }
 const f=fixture();f.client.query=async()=>{throw Error('postgresql://secret:password')};
 const sampler=createResourcePoolSampler(f.options);await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});assert.deepEqual(f.releases,[true]);await sampler.stop();
});
test('timeout retains a single busy waiter and late acquisition is destroyed before another sample',async()=>{
 let finish,calls=0;const f=fixture({connect:()=>{calls++;return new Promise(r=>{finish=r})}});
 const sampler=createResourcePoolSampler({...f.options,timeoutMs:25});await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});
 await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_BUSY'});assert.equal(calls,1);
 finish(f.client);await new Promise(r=>setImmediate(r));assert.deepEqual(f.releases,[true]);
 f.pool.connect=async()=>f.client;assert.equal((await sampler.sample()).bindings.length,1);assert.equal(calls,1);await sampler.stop();
});
test('shutdown aborts an active query, clears readiness and destroys client once',async()=>{
 const f=fixture();let rejectQuery,started;const ready=new Promise(r=>started=r);
 f.client.query=()=>{started();return new Promise((_,reject)=>{rejectQuery=reject})};
 f.client.release=destroy=>{f.releases.push(destroy);rejectQuery(Error('socket closed'))};
 const sampler=createResourcePoolSampler(f.options),sample=sampler.sample();await ready;
 const stopped=await sampler.stop();assert.equal(stopped.timedOut,false);await assert.rejects(()=>sample,{code:'RESOURCE_POOL_UNAVAILABLE'});
 assert.deepEqual(f.releases,[true]);await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});
});
test('pool replacement while sampled, wrong configured size and missing pool cannot attest',async()=>{
 const f=fixture();let current=f.pool;f.options.pools[0].getPool=()=>current;
 const original=f.client.query;f.client.query=async sql=>{const v=await original(sql);if(sql==='ROLLBACK')current={...f.pool};return v};
 const sampler=createResourcePoolSampler(f.options);await assert.rejects(()=>sampler.sample(),{code:'RESOURCE_POOL_UNAVAILABLE'});assert.deepEqual(f.releases,[true]);
 await sampler.stop();assert.throws(()=>createResourcePoolSampler({...f.options,pools:[]}));
 current.options={max:1};assert.throws(()=>createResourcePoolSampler(f.options));
});
test('sample schema rejects private extras, duplicates, stale time and malformed fingerprints',async()=>{
 const f=fixture(),sampler=createResourcePoolSampler(f.options),sample=await sampler.sample();
 for(const change of [s=>s.password='secret',s=>s.bindings.push(s.bindings[0]),s=>s.bindings[0].dsn='secret',
  s=>s.bindings[0].roleSha256='not-a-hash',s=>s.resources.consumers[0].pools[0].max=1,s=>s.processNonce='____',
  s=>s.observedAtUtc=new Date(Date.now()-30000).toISOString()]){
  const copy=structuredClone(sample);change(copy);assert.throws(()=>validateResourcePoolSample(copy));
 }await sampler.stop();
});
test('private status is loopback-only, has no arbitrary route/query or raw failure and closes on stop',async()=>{
 const f=fixture(),status=await startResourcePoolStatus(f.options,{port:0});
 try{
  assert.equal(status.server.address().address,'127.0.0.1');const url='http://127.0.0.1:'+status.server.address().port;
  const response=await fetch(url+'/resource-targets');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  validateResourcePoolSample(await response.json());
  for(const path of ['/','/resource-targets?sql=secret'])assert.equal((await fetch(url+path)).status,404);
  assert.equal((await fetch(url+'/resource-targets',{method:'POST'})).status,404);
  f.pool.connect=async()=>{throw Error('PRIVATE PASSWORD')};const bad=await fetch(url+'/resource-targets');assert.equal(bad.status,503);
  assert.deepEqual(await bad.json(),{code:'RESOURCE_POOL_UNAVAILABLE'});
 }finally{await status.stop()}
 assert.equal(status.server.listening,false);
});
