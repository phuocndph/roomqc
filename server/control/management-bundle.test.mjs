import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderManagementBundle,managementDirectoryImage} from './management-bundle.mjs';
const baseBudget=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
export function managementBundleFixture(){
 const budget=structuredClone(baseBudget);budget.environment='local';
 for(const c of budget.databases[0].consumers)c.replicas=['control-api','migration','backup'].includes(c.id)?1:0;
 const root='/opt/RoomQC/management/test-main';
 const raw={version:1,deploymentId:'test-main',environment:'local',listenPort:18082,
  images:{directory:managementDirectoryImage,control:'roomqc/control@sha256:'+'a'.repeat(64),frontend:'roomqc/web@sha256:'+'b'.repeat(64)},
  resources:{directory:{memoryBytes:512*1024*1024,cpus:1,sharedBuffersBytes:64*1024*1024,shmBytes:64*1024*1024},
   control:{memoryBytes:256*1024*1024,cpus:0.5},frontend:{memoryBytes:128*1024*1024,cpus:0.5}},
  networks:{directory:'test-directory',egress:'test-egress',web:'test-web',metrics:'test-metrics'},
  volumes:{data:'test-data',private:'test-private',ca:'test-ca'},
  files:{budget:root+'/budget.json',apiEnvironment:root+'/api.env',apiDsn:root+'/api.dsn',postgresConfig:root+'/postgresql.conf',hbaConfig:root+'/pg_hba.conf',webConfig:root+'/nginx.conf'},workers:{}};
 return {raw,budget};
}
function workers(f){
 for(const [kind,id]of [['health','health-worker'],['setup','provisioning-worker'],['alert','alert-worker']]){
  f.budget.databases[0].consumers.find(c=>c.id===id).replicas=1;
  f.raw.workers[kind]={configFile:'/private/'+kind+'.json',dsnFile:'/private/'+kind+'.dsn',resources:{memoryBytes:256*1024*1024,cpus:0.5}};
 }
 Object.assign(f.raw.workers.setup,{trustFile:'/private/trust.json',credentialsDirectory:'/private/setup'});
 Object.assign(f.raw.workers.alert,{endpointFile:'/private/alert.endpoint',tokenFile:'/private/alert.token'});return f;
}
test('management project isolates the directory and exposes only loopback frontend',()=>{
 const f=managementBundleFixture(),{compose,report}=renderManagementBundle(f.raw,f.budget);
 assert.deepEqual(Object.keys(compose.services),['roomqc-directory','roomqc-control','roomqc-web']);
 for(const [name,s]of Object.entries(compose.services)){
  assert(s.read_only);assert.deepEqual(s.cap_drop,['ALL']);assert(s.security_opt.includes('no-new-privileges:true'));
  assert.equal(s.mem_limit,s.memswap_limit);assert.equal(s.labels['roomqc.management'],'test-main');
  if(name!=='roomqc-web')assert.equal(s.ports,undefined);
 }
 assert.equal(compose.services['roomqc-web'].ports[0].host_ip,'127.0.0.1');
 assert.deepEqual(compose.services['roomqc-web'].networks,['web']);
 assert.deepEqual(Object.keys(compose.services['roomqc-directory'].networks),['directory']);
 assert.equal(compose.services['roomqc-control'].environment.ROOMQC_CONTROL_SIGNUP_ENABLED,'false');
 assert.equal(compose.services['roomqc-control'].environment.ROOMQC_CONTROL_MIGRATION_DATABASE_URL,'');
 assert.equal(report.deploymentReady,false);assert.deepEqual(report.externalConsumers,['migration','backup']);
});
test('all worker roles have separate file DSNs and only a public directory CA',()=>{
 const f=workers(managementBundleFixture()),{compose}=renderManagementBundle(f.raw,f.budget);
 assert.equal(Object.keys(compose.services).length,6);
 assert.equal(new Set(Object.values(compose.secrets).map(s=>s.file)).size,Object.keys(compose.secrets).length);
 for(const name of ['roomqc-control','health-worker','setup-worker','alert-worker']){
  const s=compose.services[name];assert(!s.volumes.some(v=>v.source==='directory-private'));
  assert(s.volumes.some(v=>v.source==='directory-ca'&&v.read_only));
  assert(s.volumes.every(v=>v.read_only));
 }
 assert.deepEqual(compose.services['setup-worker'].command,['node','workers/setup-runtime.mjs']);
 assert.deepEqual(compose.services['alert-worker'].secrets,['alert-dsn','alert-endpoint','alert-token']);
});
test('allocated worker cannot disappear from the deployment',()=>{
 const f=workers(managementBundleFixture());delete f.raw.workers.setup;
 assert.throws(()=>renderManagementBundle(f.raw,f.budget),{code:'MANAGEMENT_BUNDLE_INVALID'});
});
test('managed health retains its catalog capability and trust files',()=>{
 const f=workers(managementBundleFixture());f.budget.databases[0].consumers.find(c=>c.id==='probe-catalog').replicas=1;
 assert.throws(()=>renderManagementBundle(f.raw,f.budget),{code:'MANAGEMENT_BUNDLE_INVALID'});
 f.raw.workers.health.managed={configFile:'/private/probes.json',dsnFile:'/private/probe.dsn',keyringFile:'/private/probe.keyring',trustFile:'/private/trust.json',maximumValidityMs:86400000};
 const {compose,report}=renderManagementBundle(f.raw,f.budget);
 assert(compose.services['health-worker'].secrets.includes('probe-dsn'));assert(report.directoryConsumers.includes('probe-catalog'));
});
test('capabilities cannot share a DSN file',()=>{
 const f=workers(managementBundleFixture());f.raw.workers.setup.dsnFile=f.raw.files.apiDsn;
 assert.throws(()=>renderManagementBundle(f.raw,f.budget),{code:'MANAGEMENT_BUNDLE_INVALID'});
});
test('environment, replica and connection budget mismatches stop rendering',()=>{
 for(const mutate of [f=>f.raw.environment='production',f=>f.budget.databases[0].consumers[0].replicas=2,
  f=>f.budget.databases[0].maxConnections=5]){
  const f=managementBundleFixture();mutate(f);assert.throws(()=>renderManagementBundle(f.raw,f.budget));
 }
});
test('mutable images, path interpolation and shared private/public volumes are refused',()=>{
 for(const mutate of [f=>f.raw.images.control='roomqc/control:latest',f=>f.raw.files.apiEnvironment='/private/${PASSWORD}',
  f=>f.raw.files.budget='/private/../budget.json',f=>f.raw.volumes.ca=f.raw.volumes.private,
  f=>f.raw.networks.web=f.raw.networks.directory,f=>f.raw.resources.control.memoryBytes=0]){
  const f=managementBundleFixture();mutate(f);assert.throws(()=>renderManagementBundle(f.raw,f.budget),{code:'MANAGEMENT_BUNDLE_INVALID'});
 }
});
test('bundle descriptors reject inline environment credentials',()=>{
 const f=managementBundleFixture();f.raw.environmentVariables={PASSWORD:'must-not-be-rendered'};
 assert.throws(()=>renderManagementBundle(f.raw,f.budget),{code:'MANAGEMENT_BUNDLE_INVALID'});
});
