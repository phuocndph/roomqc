import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resourceBudget,bindControlBudget,loadResourceBudget} from './resource-budget.mjs';
import {loadConfig} from './config.mjs';

const example=JSON.parse(readFileSync(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const fixture=()=>structuredClone(example);
const invalid=(mutate,code='INVALID_RESOURCE_BUDGET')=>{const raw=fixture();mutate(raw);assert.throws(()=>resourceBudget(raw),{code})};
const environment=()=>({NODE_ENV:'test',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_PUBLIC_URL:'http://localhost:8082',
  ROOMQC_CONTROL_DATABASE_URL:'postgresql://fixture@localhost/owned',ROOMQC_CONTROL_EMAIL_HASH_KEY:'fixture-key-'.repeat(4),
  ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'public',serviceKey:'secret',vapidPublicKey:'vapid',maxWorkspaces:10}])});
const owned=fn=>{const directory=mkdtempSync(join(tmpdir(),'roomqc-resource-test-'));try{return fn(directory)}finally{rmSync(directory,{recursive:true,force:true})}};

test('resource accounting includes every replica, pool, fixed connection and reserved connection',()=>{
  const raw=fixture();raw.databases[0].consumers[0].replicas=2;
  raw.databases[0].consumers[1].replicas=3;
  raw.databases[0].consumers[1].pools.push({id:'other',max:4});
  raw.databases[0].consumers[1].fixedConnectionsPerReplica=2;
  const budget=resourceBudget(raw),directory=budget.databases[0];
  assert.equal(directory.allocatedConnections,41);assert.equal(directory.committedConnections,46);assert.equal(directory.remainingConnections,54);
  assert.equal(directory.consumers[1].connections,24);assert.equal(budget.capacityProven,false);
  const business=budget.databases[1];assert.equal(business.allocatedConnections,32);assert.equal(business.committedConnections,42);
  raw.databases.push({...structuredClone(raw.databases[1]),id:'business-second'});
  assert.equal(resourceBudget(raw).databases.length,3);
});
test('budget accepts an exact boundary and rejects aggregate oversubscription',()=>{
  const raw=fixture();raw.databases[0].maxConnections=17;
  assert.equal(resourceBudget(raw).databases[0].remainingConnections,0);
  raw.databases[0].maxConnections=16;assert.throws(()=>resourceBudget(raw),{code:'RESOURCE_CONNECTION_BUDGET'});
  invalid(r=>{r.databases[1].consumers[0].replicas=20},'RESOURCE_CONNECTION_BUDGET');
  invalid(r=>{r.databases[0].reservedConnections=100},'RESOURCE_CONNECTION_BUDGET');
});
test('missing, duplicated, additional and ambiguous fields cannot hide a connection consumer',()=>{
  for(const mutate of [
    r=>delete r.environment,r=>{r.extra=true},r=>{r.environment='prod'},r=>{r.schemaVersion=2},r=>{r.databases=[]},
    r=>{r.databases.pop()},r=>{r.databases[1].id=r.databases[0].id},r=>{r.databases[0].kind='toString'},
    r=>{r.databases[0].consumers=r.databases[0].consumers.filter(c=>c.id!=='backup')},r=>{r.databases[1].consumers.shift()},r=>{r.databases[0].consumers.push(r.databases[0].consumers[0])},
    r=>{r.databases[0].consumers[0].extraPool=5},r=>{r.databases[0].consumers[0].pools[0].maxConnections=5},
    r=>{r.databases[0].consumers[0].pools.push({id:'main',max:5})},r=>{r.databases[0].consumers[0].pools[0].id='MAIN'},
    r=>{r.databases[0].consumers[0].replicas=0},r=>{r.databases[0].consumers[0].fixedConnectionsPerReplica=1},
    r=>{r.databases[0].consumers[0].pools.push({id:'second',max:1})},r=>{r.databases[0].consumers[1].replicas=1;r.databases[0].consumers[1].pools=[]},
    r=>{r.databases.push({...r.databases[0],id:'directory-second'})}
  ])invalid(mutate);
});
test('budget rejects fractional, string, nonfinite, negative and excessive numbers',()=>{
  for(const value of ['1',null,NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER]){
    invalid(r=>{r.databases[0].consumers[1].replicas=value});
    invalid(r=>{r.databases[0].consumers[1].pools[0].max=value});
    invalid(r=>{r.databases[0].reservedConnections=value});
  }
  invalid(r=>{r.databases[0].consumers[1].replicas=1025});
  invalid(r=>{r.databases[0].consumers[1].fixedConnectionsPerReplica=10001});
  invalid(r=>{r.databases[0].consumers[1].replicas=1024;r.databases[0].consumers[1].pools[0].max=10000});
});
test('runtime binding checks aggregate budget, API pool, replicas and production environment',()=>{
  const budget=resourceBudget(fixture()),config={poolMax:5,poolBudget:20,apiInstances:1,production:false};
  assert.equal(bindControlBudget(budget,config),budget);
  for(const override of [{poolMax:4},{apiInstances:2},{poolBudget:16},{poolBudget:101},{production:true}])
    assert.throws(()=>bindControlBudget(budget,{...config,...override}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  const production=fixture();production.environment='production';
  assert.equal(bindControlBudget(resourceBudget(production),{...config,production:true}).environment,'production');
});
test('bounded loader accepts UTF-8/BOM files and returns safe errors for invalid local input',()=>owned(directory=>{
  const file=join(directory,'budget.json');writeFileSync(file,'\uFEFF'+JSON.stringify(fixture()));
  assert.equal(loadResourceBudget(file).databases.length,2);
  for(const path of ['relative.json','',join(directory,'absent.json'),directory])assert.throws(()=>loadResourceBudget(path),{code:'INVALID_RESOURCE_BUDGET'});
  for(const content of ['', '{','{"unexpected":"private diagnostic"}',Buffer.from([0xff]),' '.repeat(128*1024+1)]){
    writeFileSync(file,content);assert.throws(()=>loadResourceBudget(file),error=>error.code==='INVALID_RESOURCE_BUDGET'&&!error.message.includes('private diagnostic'));
  }
  mkdirSync(join(directory,'folder'));assert.throws(()=>loadResourceBudget(join(directory,'folder')),{code:'INVALID_RESOURCE_BUDGET'});
}));
test('budget loader rejects a symbolic-link leaf',t=>owned(directory=>{
  const target=join(directory,'target.json'),link=join(directory,'link.json');writeFileSync(target,JSON.stringify(fixture()));
  try{symlinkSync(target,link,'file')}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('OS does not permit creating the owned file symlink');return}throw error}
  assert.throws(()=>loadResourceBudget(link),{code:'INVALID_RESOURCE_BUDGET'});
}));
test('API config loads metadata, binds replicas and validates per-process queue parameters',()=>owned(directory=>{
  const file=join(directory,'budget.json');writeFileSync(file,JSON.stringify(fixture()));
  const env={...environment(),ROOMQC_CONTROL_RESOURCE_BUDGET_FILE:file},config=loadConfig(env);
  assert.equal(config.resourceBudget.databases[0].committedConnections,17);assert.equal(config.apiInstances,1);
  assert.deepEqual(config.requestBudget,{maxActive:16,maxQueued:32,queueTimeoutMs:1000});
  assert.equal(loadConfig(environment()).resourceBudget,null,'Compatibility path is not aggregate deployment attestation');
  assert.equal(loadConfig({...env,ROOMQC_CONTROL_MAX_QUEUED_REQUESTS:'0'}).requestBudget.maxQueued,0);
  for(const key of ['ROOMQC_CONTROL_API_INSTANCES','ROOMQC_CONTROL_MAX_ACTIVE_REQUESTS','ROOMQC_CONTROL_QUEUE_TIMEOUT_MS']){
    for(const value of ['0','-1','1.5','Infinity','bad','1000001'])assert.throws(()=>loadConfig({...env,[key]:value}));
  }
  for(const value of ['-1','1.5','1025','bad'])assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_MAX_QUEUED_REQUESTS:value}));
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_API_INSTANCES:'2'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_POOL_MAX:'6'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
}));
