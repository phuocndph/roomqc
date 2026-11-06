import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {summaryResourceProfile,summaryResourceConfigurationHash} from './summary-resource-profile.mjs';
import {startSummaryRotationStatus} from './workers/summary-rotation-status.mjs';
import {nativeResourceProbe} from './resource-deployment-runtime.mjs';
const hash='a'.repeat(64);
const fixture=()=>{
 const config={environment:'staging',consumerId:'summary-credential-rotation',resourceBudgetSha256:hash,businessDatabaseId:'business-main',replicas:2};
 const consumer={id:config.consumerId,replicas:2,poolMax:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0};
 const databases=['directory','business'].map(kind=>({kind,id:kind+'-main',consumers:[structuredClone(consumer)]}));
 const contexts=Object.fromEntries(databases.map(d=>[d.kind,{environment:'staging',budgetSha256:hash,databaseId:d.id,
  budget:{environment:'staging',databases}}]));
 return {config,contexts,policy:{instanceId:'owned-instance'},rotator:{ready:false,stopping:false}};
};
test('immutable dual-DB profile uses canonical configuration hash and isolates startup values from later metadata edits',()=>{
 const f=fixture(),fingerprint=summaryResourceConfigurationHash(f.policy,f.config),r=summaryResourceProfile(f.config,f.contexts,fingerprint);
 assert.equal(r.databases.length,2);assert.equal(r.configurationSha256,fingerprint);assert(Object.isFrozen(r.databases[0].consumers[0].pools));
 f.contexts.business.budget.databases[1].consumers[0].pools[0].max=2;assert.equal(r.databases[1].consumers[0].pools[0].max,1);
 assert.throws(()=>{r.databases[0].databaseId='changed'},TypeError);
 assert.equal(summaryResourceConfigurationHash({b:2,a:1},{d:4,c:3}),summaryResourceConfigurationHash({a:1,b:2},{c:3,d:4}));
 assert.notEqual(summaryResourceConfigurationHash({...f.policy,instanceId:'other'},f.config),fingerprint);
});
test('profile refuses wrong environment, budget hash, DB target, missing consumer and broad pools',()=>{
 for(const mutate of [f=>f.contexts.directory.environment='local',f=>f.contexts.business.budgetSha256='b'.repeat(64),
  f=>f.contexts.business.databaseId='other',f=>f.contexts.directory.budget.databases[0].consumers=[],
  f=>f.contexts.business.budget.databases[1].consumers[0].poolMax=2,f=>f.config.consumerId='summary-credential-issuer']){
  const f=fixture();mutate(f);assert.throws(()=>summaryResourceProfile(f.config,f.contexts,'c'.repeat(64)));
 }
});
test('loopback status serves cached metadata, separates liveness from readiness and strips runtime secrets',async t=>{
 const f=fixture(),resources=summaryResourceProfile(f.config,f.contexts,'c'.repeat(64));
 f.rotator.lastResult={code:'private-dsn',token:'private-token'};
 const status=await startSummaryRotationStatus(f.rotator,resources,{port:0});t.after(()=>status.stop());
 assert.equal(status.server.address().address,'127.0.0.1');const url='http://127.0.0.1:'+status.server.address().port;
 let r=await fetch(url+'/livez');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 let body=await r.json();assert.deepEqual(body.resources,resources);assert.equal(body.ready,false);assert.doesNotMatch(JSON.stringify(body),/private-dsn|private-token/);
 assert.equal((await fetch(url+'/readyz')).status,503);f.rotator.ready=true;assert.equal((await fetch(url+'/readyz')).status,200);
 for(const [path,method]of [['/livez?token=private','GET'],['/livez','POST'],['/unknown','GET']]){
  r=await fetch(url+path,{method});assert.equal(r.status,404);assert.deepEqual(await r.json(),{status:'not_found'});
 }
 f.rotator.stopping=true;assert.equal((await fetch(url+'/livez')).status,503);assert.equal((await fetch(url+'/readyz')).status,503);
 await Promise.all([status.stop(),status.stop()]);
});
test('closed native probe accepts dual-DB profile and refuses malformed, duplicate or extra private fields',async t=>{
 const f=fixture();let resources=summaryResourceProfile(f.config,f.contexts,'c'.repeat(64));
 const status=await startSummaryRotationStatus(f.rotator,resources,{port:0});t.after(()=>status.stop());
 const port=status.server.address().port;
 const probe=()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',nativeResourceProbe,'summary-credential-rotation',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.once('error',reject);
  child.once('close',code=>{assert.equal(error,'');resolve({code,body:JSON.parse(output)})});
 });
 assert.deepEqual(await probe(),{code:0,body:{resources}});
 // Each server owns a fresh immutable copy; injecting a broken snapshot here
 // tests the allowlist at the external probe boundary, not the product loader.
 await status.stop();
 for(const mutate of [r=>r.token='private-secret',r=>r.databases.push(r.databases[0]),r=>r.databases[1].databaseId=r.databases[0].databaseId,
  r=>r.databases[0].consumers[0].pools[0].max=2,r=>r.configurationSha256='invalid',r=>r.databases[1].dsn='private-secret']){
  resources=structuredClone(summaryResourceProfile(f.config,f.contexts,'c'.repeat(64)));mutate(resources);
  const broken=await startSummaryRotationStatus(f.rotator,resources,{port});
  try{const got=await probe();assert.equal(got.code,1);assert.deepEqual(got.body,{code:'RESOURCE_RUNTIME_PROBE_FAILED'})}finally{await broken.stop()}
 }
});
