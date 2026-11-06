import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resourceTargetFixture} from './testing/resource-target-fixtures.mjs';
import {preflightResourceDeployment} from './resource-deployment.mjs';
import {inspectResourcePoolTargets,resourcePoolInventoryManifest} from './resource-pool-inventory.mjs';
import {resourceDatabaseObservationDigests} from './resource-database.mjs';
import {resourcePoolCheckMain} from '../../scripts/control-backend-resource-pool-check.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'roomqc-pool-inventory-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const f=await resourceTargetFixture(root),image='sha256:'+'a'.repeat(64),project=f.consumerManifest.nativeProjects[0];
 const native={schemaVersion:1,environment:'local',budgetFile:f.budgetFile,budgetSha256:f.consumerManifest.budgetSha256,projects:[project]};
 for(const service of Object.values(f.resolved.native.services)){service.environment.ROOMQC_RESOURCE_POOL_OBSERVATIONS='true';service.networks={default:{}}}
 f.resolved.native.networks={default:{name:'pool-fixture'}};
 const manifest={schemaVersion:1,nativeManifest:native,databaseManifest:f.databaseManifest,bindings:f.manifest.bindings.filter(b=>b.project==='native')};
 const plan=await preflightResourceDeployment(native,{resolveProject:f.resolveProject});
 const imageInfo={Id:image,RepoDigests:[f.api.image],Config:{Env:['PATH=/usr/local/bin'],Entrypoint:null,User:'node'}};
 const containers=plan.services.map((expected,i)=>{const service=f.resolved.native.services[expected.service];return {
  Id:String(i+1).repeat(64),Image:image,Path:'node',Args:service.command.slice(1),
  Config:{Image:f.api.image,Cmd:service.command,Entrypoint:null,WorkingDir:'/app',User:'node',Tty:false,OpenStdin:false,
   Env:Object.entries({PATH:'/usr/local/bin',...service.environment}).map(([k,v])=>k+'='+v),Labels:{'com.docker.compose.project':'native','com.docker.compose.service':expected.service,
    'com.docker.compose.oneoff':'False','com.docker.compose.container-number':'1'}},
  HostConfig:{Privileged:false,ReadonlyRootfs:false,Init:false,Devices:[],DeviceRequests:[],VolumesFrom:[],CapAdd:null,CapDrop:null,SecurityOpt:[],Tmpfs:{}},
  Mounts:[...service.volumes.map(m=>({Type:'bind',Source:m.source,Destination:m.target,RW:false,Propagation:'rprivate'})),
   ...(service.secrets??[]).map(s=>({Type:'bind',Source:f.resolved.native.secrets[s].file,Destination:'/run/secrets/'+s,RW:false,Propagation:'rprivate'}))],
  NetworkSettings:{Networks:{'pool-fixture':{}}},State:{Status:'running',Running:true,Paused:false,Restarting:false,Dead:false,Pid:100+i,StartedAt:'2026-10-30T00:00:00Z'}}});
 const samples=new Map();
 for(const [i,expected]of plan.services.entries()){
  const bindings=[];for(const c of expected.resources.consumers){
   const mapping=manifest.bindings.find(b=>b.consumerId===c.id),o=await f.readTarget({database:f.endpoints[0].databaseName,user:mapping.role});
   bindings.push({consumerId:c.id,poolId:c.pools[0].id,poolMax:c.pools[0].max,...resourceDatabaseObservationDigests(o)});
  }
  samples.set(containers[i].Id,{schemaVersion:1,mode:'loaded-pool-sample',processNonce:randomUUID(),observedAtUtc:new Date().toISOString(),resources:expected.resources,bindings});
 }
 const reference={databaseTargetsVerified:true,targets:[],servers:[]};for(const [i,d]of f.databaseManifest.databases.entries()){
  reference.targets.push({databaseId:d.databaseId,...resourceDatabaseObservationDigests(await f.readTarget({database:f.endpoints[i].databaseName,user:f.attestor}))});
 }
 const calls={samples:0,reference:0};const dependencies={resolveProject:f.resolveProject,inventoryProject:async()=>structuredClone(containers),inspectImage:async()=>imageInfo,
  probeContainer:async id=>samples.get(id).resources,probePoolContainer:async id=>{calls.samples++;const s=structuredClone(samples.get(id));s.observedAtUtc=new Date().toISOString();return s},
  attestDatabases:async()=>{calls.reference++;return structuredClone(reference)}};
 return {...f,manifest,containers,samples,reference,dependencies,calls,run:changes=>inspectResourcePoolTargets(manifest,{...dependencies,...changes})};
}
test('loaded pool inventory joins actual-process samples to independently approved identities and stable native inventory',async t=>{
 const f=await fixture(t),r=await f.run();assert.equal(r.loadedPoolSamplesVerified,true);assert.equal(r.bindings.length,2);assert.equal(f.calls.samples,4);assert.equal(f.calls.reference,2);
 for(const key of ['allPoolConnectionsVerified','runtimeVerified','databaseIdentityVerified','capacityProven','deploymentReady'])assert.equal(r[key],false);
 assert.doesNotMatch(JSON.stringify(r),/postgresql|owned-private-password|fixture_0|api_role|alert_role/);
});
test('pool manifest is closed and cannot substitute credentials or mismatched profile/selector',async t=>{
 const f=await fixture(t);assert.deepEqual(resourcePoolInventoryManifest(f.manifest),f.manifest);
 for(const change of [m=>m.dsn='private',m=>m.bindings.push(m.bindings[0]),m=>m.bindings[0].role='bad\nrole',m=>m.databaseManifest.budgetSha256='0'.repeat(64)]){
  const raw=structuredClone(f.manifest);change(raw);assert.throws(()=>resourcePoolInventoryManifest(raw));
 }
 f.manifest.bindings[0].service='other';await assert.rejects(()=>f.run(),{code:'RESOURCE_POOL_MAPPING_MISMATCH'});assert.equal(f.calls.reference,0);
});
test('missing login mappings and disabled observers stay unresolved rather than using another identity',async t=>{
 const f=await fixture(t);f.manifest.bindings=[];const r=await f.run();assert.equal(r.loadedPoolSamplesVerified,false);assert.equal(r.bindings.length,0);assert.equal(f.calls.samples,0);
 assert(r.unresolvedTargets.every(t=>t.reason==='expected_login_missing'));assert.equal(r.sampleExecutedInApplicationProcess,false);
});
test('wrong loaded database/role or stale profile is rejected even when native budget projection matches',async t=>{
 for(const [field,code]of [['databaseIdentitySha256','RESOURCE_POOL_TARGET_MISMATCH'],['roleSha256','RESOURCE_POOL_TARGET_MISMATCH'],['serverSettingsSha256','RESOURCE_POOL_REFERENCE_MISMATCH']]){
  const f=await fixture(t);f.samples.values().next().value.bindings[0][field]='0'.repeat(64);await assert.rejects(()=>f.run(),{code});
 }
 const f=await fixture(t);f.samples.values().next().value.resources=structuredClone(f.samples.values().next().value.resources);f.samples.values().next().value.resources.budgetSha256='0'.repeat(64);
 await assert.rejects(()=>f.run({probeContainer:async id=>{const s=f.samples.get(id);return {...s.resources,budgetSha256:f.manifest.nativeManifest.budgetSha256}}}),{code:'RESOURCE_POOL_PROFILE_MISMATCH'});
});
test('process replacement between samples and database reference restart cannot be accepted',async t=>{
 const f=await fixture(t);let calls=0;
 await assert.rejects(()=>f.run({probePoolContainer:async id=>{const s=structuredClone(f.samples.get(id));s.observedAtUtc=new Date().toISOString();if(++calls===3)s.processNonce=randomUUID();return s}}),{code:'RESOURCE_POOL_OBSERVATION_DRIFT'});
 let references=0;await assert.rejects(()=>f.run({attestDatabases:async()=>{const r=structuredClone(f.reference);if(++references===2)r.targets[0].serverSettingsSha256='0'.repeat(64);return r}}),{code:'RESOURCE_POOL_REFERENCE_DRIFT'});
});
test('private extras, stale samples and probe failures are rejected and CLI hides raw errors',async t=>{
 const f=await fixture(t);await assert.rejects(()=>f.run({probePoolContainer:async()=>({password:'PRIVATE'})}),{code:'RESOURCE_POOL_PROBE_FAILED'});
 const file=await f.put('manifest.json',f.manifest);let output='';const out={write:s=>output+=s};
 assert.equal(await resourcePoolCheckMain(['--manifest',file],{output:out,dependencies:f.dependencies}),0);assert.equal(JSON.parse(output).loadedPoolSamplesVerified,true);
 output='';assert.equal(await resourcePoolCheckMain(['--manifest',file],{output:out,inspect:async()=>{throw Error('postgresql://PRIVATE:PASSWORD')}}),1);
 assert.doesNotMatch(output,/PRIVATE|PASSWORD|postgresql/);assert.equal(JSON.parse(output).code,'RESOURCE_POOL_CHECK_FAILED');
 f.manifest.bindings=[];await f.put('manifest.json',f.manifest);output='';assert.equal(await resourcePoolCheckMain(['--manifest',file],{output:out,dependencies:f.dependencies}),2);
});
