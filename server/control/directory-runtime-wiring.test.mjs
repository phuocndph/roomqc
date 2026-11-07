import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {resourceBudget} from './resource-budget.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials} from './directory-runtime-logins.mjs';
import {renderDirectoryRuntimeWiring} from './directory-runtime-wiring.mjs';
import {directoryRuntimeWiringMain} from './directory-runtime-wiring-cli.mjs';
const raw=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
raw.environment='production';raw.databases[0].consumers.find(c=>c.id==='provisioning-worker').replicas=1;
raw.databases[0].consumers.push({id:'summary-credential-rotation',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
const plan=directoryRuntimePlan({version:1,environment:'production',deploymentId:'wiring-a',budgetSha256:'a'.repeat(64),
 expected:{databaseName:'roomqc_control',databaseOid:'16384',systemIdentifier:'12345'}},{budget:resourceBudget(raw),sha256:'a'.repeat(64)});
const bundle=createDirectoryRuntimeCredentials(plan);
const installer=JSON.parse(await readFile(new URL('../../deploy/monitoring/summary-installer.template.json',import.meta.url),'utf8'));
installer.environment='production';installer.directory.expected={...plan.expected,role:'previous-observer'};
installer.business.expected={systemIdentifier:'999',databaseOid:'16385',databaseName:'postgres',role:'business-issuer'};
installer.resourceBudgetSha256=plan.budgetSha256;installer.businessDatabaseId='business-example';
installer.target.cluster={id:'cluster-a',hostId:'host-a',inventoryRef:'cluster-a',credentialRef:'cluster-a',url:'https://fixture.invalid',internalUrl:null,approvedAddresses:[]};
installer.target.expected={clusterId:'cluster-a',releaseId:'fixture-release',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
installer.target.approval={testOnly:'not-approved'};installer.publisher.signer.fingerprint='5'.repeat(64);
const options=()=>({credentialsDirectory:resolve('/owned/credentials'),outputDirectory:resolve('/owned/wiring'),summaryInputs:[{ordinal:1,installer:structuredClone(installer)}]});
test('wiring connects six capabilities to five exact services without credential values or administrator mounts',()=>{
 const r=renderDirectoryRuntimeWiring(plan,bundle,options());assert.equal(r.services.length,5);assert.equal(r.files.length,11);
 const all=JSON.stringify(r);
 for(const c of bundle.credentials)assert(!all.includes(new URL(c.databaseUrl).password));
 assert.doesNotMatch(all,/runtime-credentials\.json|administrator\.dsn|postgresql:\/\//);
 const api=JSON.parse(r.files.find(f=>f.name==='control-api-1.compose.json').content);
 assert.equal(api.services['roomqc-control'].environment.ROOMQC_CONTROL_DATABASE_URL,'');
 assert.equal(api.services['roomqc-control'].environment.ROOMQC_CONTROL_DATABASE_URL_FILE,'/run/secrets/control-dsn');
 const health=JSON.parse(r.files.find(f=>f.name==='health-worker-1.compose.json').content);assert.deepEqual(Object.keys(health.secrets),['metrics-dsn','probe-dsn']);
 const summary=JSON.parse(r.files.find(f=>f.name.endsWith('.installer.json')).content);
 assert.equal(summary.directory.expected.role,plan.roles.at(-1).name);assert.deepEqual(summary.business,installer.business);
 assert.deepEqual(summary.target,installer.target);assert.deepEqual(summary.publisher,installer.publisher);
 assert.equal(r.deploymentReady,false);assert.equal(r.signupOpened,false);
});
test('missing summary inputs, cross-database bindings and wrong environments cannot silently hide a service',()=>{
 for(const change of [o=>o.summaryInputs=[],o=>o.summaryInputs[0].ordinal=2,o=>o.summaryInputs.push(o.summaryInputs[0]),
  o=>o.summaryInputs[0].installer.directory.expected.databaseOid='7',o=>o.summaryInputs[0].installer.environment='staging',
  o=>o.summaryInputs[0].installer.resourceBudgetSha256='b'.repeat(64),o=>o.credentialsDirectory='relative',
  o=>o.credentialsDirectory=resolve('/owned/$INTERPOLATED'),o=>o.outputDirectory=resolve('/owned/bad\npath')]){
  const o=options();change(o);assert.throws(()=>renderDirectoryRuntimeWiring(plan,bundle,o),{code:'DIRECTORY_WIRING_INPUT_INVALID'});
 }
});
test('renderer CLI help and malformed arguments do not read credentials or connect to a provider',async()=>{
 let text='';const output={write:s=>text+=s};assert.equal(await directoryRuntimeWiringMain(['--help'],{output}),0);
 text='';assert.equal(await directoryRuntimeWiringMain(['--secret','SENTINEL'],{output}),1);assert(!text.includes('SENTINEL'));
});

function executorFixture(){
 const budget=structuredClone(raw);budget.databases[0].consumers.find(c=>c.id==='deployment-executor').replicas=2;
 const p=directoryRuntimePlan({version:1,environment:'production',deploymentId:'executor-a',budgetSha256:'a'.repeat(64),expected:plan.expected},
  {budget:resourceBudget(budget),sha256:'a'.repeat(64)});
 return {plan:p,bundle:createDirectoryRuntimeCredentials(p)};
}
test('executor overlays bind one private DSN per replica and expose only shared plan metadata',()=>{
 const f=executorFixture(),o=options(),r=renderDirectoryRuntimeWiring(f.plan,f.bundle,o);
 assert.equal(r.services.filter(s=>s.consumerId==='deployment-executor').length,2);
 assert.deepEqual(JSON.parse(r.files.find(f=>f.name==='deployment-login-plan.json').content),f.plan);
 for(const ordinal of [1,2]){
  const overlay=JSON.parse(r.files.find(f=>f.name==='deployment-executor-'+ordinal+'.compose.json').content),service=overlay.services['deployment-executor'];
  assert.equal(service.environment.ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES,'2');
  assert.equal(service.environment.ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL,String(ordinal));
  assert.equal(service.environment.ROOMQC_RESOURCE_ENVIRONMENT,'production');
  assert.deepEqual(service.secrets,['deployment-dsn']);
  assert.equal(overlay.secrets['deployment-dsn'].file,join(o.credentialsDirectory,'rq_executor_a_deploy_'+ordinal+'.dsn'));
  assert.equal(service.volumes[0].read_only,true);assert.equal(service.volumes[0].bind.create_host_path,false);
  const env=r.files.find(f=>f.name==='deployment-executor-'+ordinal+'.env').content;
  assert.match(env,/ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE=/);
  const all=JSON.stringify({overlay,env});assert(!all.includes('rq_executor_a_deploy_'+(3-ordinal)+'.dsn'));
 }
 const serialized=JSON.stringify(r);for(const c of f.bundle.credentials)assert(!serialized.includes(new URL(c.databaseUrl).password));
 assert.doesNotMatch(serialized,/administrator\.dsn|runtime-credentials\.json/);
});
test('real Compose merges the executor overlay and requires all referenced read-only inputs',{skip:process.env.ROOMQC_CONTROL_DB_TEST!=='true'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'roomqc-executor-compose-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const configDir=join(root,'operator');await mkdir(configDir);const credentialsDirectory=join(root,'credentials');await mkdir(credentialsDirectory);
 const f=executorFixture(),r=renderDirectoryRuntimeWiring(f.plan,f.bundle,{...options(),credentialsDirectory,outputDirectory:root});
 for(const file of r.files)await writeFile(join(root,file.name),file.content);
 const envFile=join(root,'deployment-executor-1.env');
 const extra={ROOMQC_EXECUTOR_IMAGE:'roomqc/executor@sha256:'+'a'.repeat(64),ROOMQC_EXECUTOR_CONFIG_DIR:configDir,
  ROOMQC_RESOURCE_BUDGET_FILE:join(root,'budget.json'),ROOMQC_EXECUTOR_KNOWN_HOSTS:join(root,'known_hosts')};
 const normalized=JSON.parse(execFileSync('docker',['compose','--env-file',envFile,'-f',resolve('deploy/executor/compose.yml'),
  '-f',join(root,'deployment-executor-1.compose.json'),'config','--format','json'],{env:{...process.env,...extra},encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}));
 const service=normalized.services['deployment-executor'];
 assert.equal(service.environment.ROOMQC_DEPLOY_DATABASE_URL_FILE,'/run/secrets/deployment-dsn');
 assert.equal(service.environment.ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL,'1');
 assert.equal(service.volumes.filter(v=>v.target==='/etc/roomqc/deployment-login-plan.json').length,1);
 assert(service.volumes.every(v=>v.read_only&&v.bind.create_host_path===false));
 assert.equal(service.secrets.length,1);assert.equal(service.secrets[0].source,'deployment-dsn');
 assert.equal(service.environment.ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE,'/etc/roomqc/deployment-login-plan.json');
 assert(!service.volumes.some(v=>v.target.includes('docker.sock')));
});
