import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {deploymentRuntimeConfiguration} from './deployment-runtime.mjs';
import {directoryRuntimePlan} from './directory-runtime-plan.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {assertDeploymentResources} from './resource-runtime.mjs';

const example=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
async function fixture(t,environment='staging',replicas=2){
  const root=await mkdtemp(join(tmpdir(),'roomqc-deployment-runtime-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,value)=>{const file=join(root,name);await writeFile(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});return file};
  const budget=structuredClone(example);budget.environment=environment;
  budget.databases[0].consumers.find(c=>c.id==='deployment-executor').replicas=replicas;
  const budgetFile=await put('budget.json',budget),snapshot=loadResourceBudgetSnapshot(budgetFile);
  const plan=directoryRuntimePlan({version:1,environment,deploymentId:'executor-test',budgetSha256:snapshot.sha256,
    expected:{databaseName:'roomqc_control',databaseOid:'16384',systemIdentifier:'12345'}},snapshot);
  const login=plan.roles.find(r=>r.consumerId==='deployment-executor');
  const env={NODE_ENV:environment==='local'?'test':'production',ROOMQC_RESOURCE_ENVIRONMENT:environment,
    ROOMQC_RESOURCE_BUDGET_FILE:budgetFile,ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES:String(replicas),
    ROOMQC_DEPLOY_DATABASE_URL_FILE:await put('directory.dsn','postgresql://'+login.name+':synthetic@db.invalid/roomqc_control?sslmode=verify-full'),
    ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE:await put('plan.json',plan)};
  return {env,budget,plan,put};
}
test('executor binds every replica to its own bounded LOGIN and exact shared budget',async t=>{
  const f=await fixture(t),first=await deploymentRuntimeConfiguration(f.env);
  assert.equal(first.poolMax,1);assert.equal(first.login.name,'rq_executor_test_deploy_1');
  assert.deepEqual(first.resources.consumers,[{id:'deployment-executor',replicas:2,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0}]);
  assert.ok(Object.isFrozen(first.resources));assert.doesNotMatch(JSON.stringify(first.resources),/synthetic|postgresql|databaseOid/);
  await f.put('directory.dsn','postgresql://rq_executor_test_deploy_2:synthetic@db.invalid/roomqc_control?sslmode=verify-full');
  const second=await deploymentRuntimeConfiguration({...f.env,ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL:'2'});
  assert.equal(second.login.ordinal,2);
  for(const mutate of [c=>c.poolMax=2,c=>c.executorInstances=1,c=>c.resourceContext=null]){
    const config={...first};mutate(config);assert.throws(()=>assertDeploymentResources(config));
  }
});
test('executor requires exact metadata, replica identity and private file configuration before connecting',async t=>{
  const f=await fixture(t);
  for(const value of ['0','3','-1','1.5','','129'])await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL:value}),{code:'DEPLOYMENT_REPLICA_INVALID'});
  await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES:'1'}),{code:'RESOURCE_RUNTIME_MISMATCH'});
  await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE:undefined}),{code:'DEPLOYMENT_LOGIN_PLAN_REQUIRED'});
  for(const mutate of [p=>p.budgetSha256='b'.repeat(64),p=>p.environment='production',p=>p.roles.at(-1).connectionLimit=2,
    p=>p.expected.databaseName='postgres',p=>p.planSha256='b'.repeat(64),p=>p.unapproved=true]){
    const plan=structuredClone(f.plan);mutate(plan);await f.put('plan.json',plan);
    await assert.rejects(()=>deploymentRuntimeConfiguration(f.env),{code:'DEPLOYMENT_LOGIN_PLAN_INVALID'});
  }
  await f.put('plan.json',f.plan);await f.put('directory.dsn','postgresql://postgres:synthetic@db.invalid/roomqc_control?sslmode=verify-full');
  await assert.rejects(()=>deploymentRuntimeConfiguration(f.env),{code:'DEPLOYMENT_LOGIN_PLAN_INVALID'});
  await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_DEPLOY_DATABASE_URL_FILE:undefined}),{code:'DEPLOYMENT_DATABASE_FILE_REQUIRED'});
  await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,NODE_TLS_REJECT_UNAUTHORIZED:'0'}),{code:'DEPLOYMENT_DATABASE_FILE_REQUIRED'});
});
test('staging and production cannot omit the shared budget or verified TLS',async t=>{
  for(const environment of ['staging','production']){
    const f=await fixture(t,environment,1);
    await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_RESOURCE_BUDGET_FILE:undefined}),{code:'RESOURCE_BUDGET_REQUIRED'});
    await f.put('directory.dsn','postgresql://rq_executor_test_deploy_1:synthetic@127.0.0.1/roomqc_control?sslmode=disable');
    await assert.rejects(()=>deploymentRuntimeConfiguration({...f.env,ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true'}),{code:'DEPLOYMENT_DATABASE_FILE_INVALID'});
  }
});
test('local test mode permits explicit loopback only and still refuses TLS bypass URL options',async t=>{
  const f=await fixture(t,'local',1),env={NODE_ENV:'test',ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true',ROOMQC_DEPLOY_DATABASE_URL_FILE:f.env.ROOMQC_DEPLOY_DATABASE_URL_FILE};
  await f.put('directory.dsn','postgresql://fixture:synthetic@127.0.0.1/roomqc_control');
  assert.equal((await deploymentRuntimeConfiguration(env)).resources,null);
  await assert.rejects(()=>deploymentRuntimeConfiguration({...env,ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:undefined}),{code:'DEPLOYMENT_DATABASE_FILE_INVALID'});
  for(const url of ['postgresql://fixture:synthetic@remote.invalid/roomqc_control',
    'postgresql://fixture:synthetic@127.0.0.1/roomqc_control?options=-csearch_path=public',
    'postgresql://fixture:synthetic@127.0.0.1/roomqc_control?sslmode=verify-full&sslmode=disable']){
    await f.put('directory.dsn',url);await assert.rejects(()=>deploymentRuntimeConfiguration(env),{code:'DEPLOYMENT_DATABASE_FILE_INVALID'});
  }
});
