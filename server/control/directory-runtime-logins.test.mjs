import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resourceBudget} from './resource-budget.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials,validateDirectoryRuntimeCredentials} from './directory-runtime-logins.mjs';
import {directoryRuntimeLoginsMain} from './directory-runtime-logins-cli.mjs';
function fixture(raw){
 raw.environment='production';raw.databases[0].consumers.find(c=>c.id==='control-api').replicas=2;
 const snapshot={budget:resourceBudget(raw),sha256:'a'.repeat(64)};
 const input={version:1,environment:'production',deploymentId:'prod-a',budgetSha256:snapshot.sha256,
  expected:{databaseName:'roomqc_control',databaseOid:'16384',systemIdentifier:'123456789'}};
 return {snapshot,input,plan:directoryRuntimePlan(input,snapshot)};
}
const example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
test('runtime plan derives separate bounded LOGINs from every active supported consumer and replica',()=>{
 const f=fixture(structuredClone(example));
 assert.equal(f.plan.roles.length,5);
 assert.deepEqual(f.plan.roles.filter(r=>r.consumerId==='control-api').map(r=>[r.name,r.connectionLimit]),[['rq_prod_a_api_1',5],['rq_prod_a_api_2',5]]);
 assert(!f.plan.roles.some(r=>r.consumerId==='provisioning-worker'));
 assert.deepEqual(f.plan.otherConsumers,['db-exporter','migration','backup']);
 assert(f.plan.roles.every(r=>!r.group.endsWith('_writer')&&r.group!=='roomqc_control_worker'));
});
test('wrong target identity, environment/hash, injected fields and excessive role plans are refused',()=>{
 const f=fixture(structuredClone(example));
 for(const change of [r=>r.expected.databaseName='postgres',r=>r.expected.databaseOid='0',r=>r.expected.systemIdentifier='123;DROP',
  r=>r.environment='staging',r=>r.budgetSha256='b'.repeat(64),r=>r.deploymentId='bad_name',r=>r.roles=[],r=>r.group='postgres']){
  const r=structuredClone(f.input);change(r);assert.throws(()=>directoryRuntimePlan(r,f.snapshot),{code:'DIRECTORY_LOGIN_PLAN_INVALID'});
 }
 const other=structuredClone(f.snapshot);other.budget.databases[0].consumers[0].replicas=129;
 assert.throws(()=>directoryRuntimePlan(f.input,other),{code:'DIRECTORY_LOGIN_PLAN_INVALID'});
});
test('private credentials have independent random passwords, valid SCRAM verifiers and only verified-TLS DSNs',()=>{
 const f=fixture(structuredClone(example)),bundle=createDirectoryRuntimeCredentials(f.plan);
 assert.equal(validateDirectoryRuntimeCredentials(f.plan,bundle).size,5);
 assert.equal(new Set(bundle.credentials.map(c=>new URL(c.databaseUrl).password)).size,5);
 for(const change of [b=>b.planSha256='b'.repeat(64),b=>b.credentials[0].verifier=b.credentials[1].verifier,
  b=>b.credentials[0].databaseUrl+='&options=private',b=>b.credentials[0].databaseUrl=b.credentials[0].databaseUrl.replace('verify-full','disable'),
  b=>b.credentials[0].databaseUrl=b.credentials[0].databaseUrl.replace('roomqc-directory:','other:'),
  b=>b.credentials[0].login='postgres',b=>b.credentials.push(b.credentials[0]),b=>b.credentials[0].extra='unapproved']){
  const b=structuredClone(bundle);change(b);assert.throws(()=>validateDirectoryRuntimeCredentials(f.plan,b),{code:'DIRECTORY_LOGIN_CREDENTIALS_INVALID'});
 }
 const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),before=hash(bundle);
 validateDirectoryRuntimeCredentials(f.plan,bundle);assert.equal(hash(bundle),before);
});
test('operator help and argument failures do not open a pool or reveal input values',async()=>{
 let output='';const options={output:{write:s=>output+=s},poolFactory:()=>assert.fail('pool must not open')};
 assert.equal(await directoryRuntimeLoginsMain(['--help'],options),0);assert.match(output,/Never rotates passwords/);
 output='';assert.equal(await directoryRuntimeLoginsMain(['--dsn','SENTINEL-PRIVATE-INPUT'],options),1);
 assert.doesNotMatch(output,/SENTINEL|postgresql/);assert.equal(JSON.parse(output).code,'DIRECTORY_LOGIN_ARGUMENTS_INVALID');
});

test('optional executor LOGINs are independent per replica and cannot hide extra connection pools',()=>{
 const raw=structuredClone(example);raw.databases[0].consumers.find(c=>c.id==='deployment-executor').replicas=2;
 const f=fixture(raw),executors=f.plan.roles.filter(r=>r.consumerId==='deployment-executor');
 assert.deepEqual(executors.map(r=>[r.name,r.group,r.connectionLimit]),[
  ['rq_prod_a_deploy_1','roomqc_control_deployer',1],['rq_prod_a_deploy_2','roomqc_control_deployer',1]]);
 for(const change of [c=>c.pools[0].max=2,c=>c.fixedConnectionsPerReplica=1,c=>c.pools.push({id:'extra',max:1})]){
  const snapshot=structuredClone(f.snapshot);change(snapshot.budget.databases[0].consumers.find(c=>c.id==='deployment-executor'));
  assert.throws(()=>directoryRuntimePlan(f.input,snapshot),{code:'DIRECTORY_LOGIN_PLAN_INVALID'});
 }
 const previous=structuredClone(example);previous.databases[0].consumers=previous.databases[0].consumers.filter(c=>c.id!=='deployment-executor');
 assert.equal(fixture(previous).plan.roles.length,5);
});
