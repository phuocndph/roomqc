import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {resourceDeploymentManifest} from './resource-deployment.mjs';
import {inspectResourceDeployment} from './resource-deployment-runtime.mjs';
import {resourceDatabaseManifest,attestResourceDatabases,resourceDatabaseObservationDigests} from './resource-database.mjs';
import {resourcePoolObservationMode} from './resource-runtime.mjs';
import {validateResourcePoolSample} from './resource-pool-observation.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const canonical=v=>JSON.stringify(v,(_k,o)=>o&&typeof o==='object'&&!Array.isArray(o)?Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]])):o);
const sha=v=>createHash('sha256').update(v).digest('hex');
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const selector=v=>[v.project,v.service,v.databaseId,v.consumerId].join('/');
const role=v=>typeof v==='string'&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=63&&!/[\x00-\x1f\x7f]/.test(v);
export function resourcePoolInventoryManifest(raw){
 if(!exact(raw,['schemaVersion','nativeManifest','databaseManifest','bindings'])||raw.schemaVersion!==1||!Array.isArray(raw.bindings)||raw.bindings.length>128)
  fail('RESOURCE_POOL_MANIFEST_INVALID');
 const native=resourceDeploymentManifest(raw.nativeManifest),database=resourceDatabaseManifest(raw.databaseManifest);
 if(native.environment!==database.environment||resolve(native.budgetFile)!==resolve(database.budgetFile)||native.budgetSha256!==database.budgetSha256)
  fail('RESOURCE_POOL_MANIFEST_INVALID');
 const seen=new Set();for(const b of raw.bindings){
  if(!exact(b,['project','service','databaseId','consumerId','role'])||![b.project,b.service,b.databaseId,b.consumerId].every(id)||!role(b.role)||seen.has(selector(b)))
   fail('RESOURCE_POOL_MANIFEST_INVALID');seen.add(selector(b));
 }
 return {schemaVersion:1,nativeManifest:native,databaseManifest:database,bindings:structuredClone(raw.bindings)};
}
export async function inspectResourcePoolTargets(raw,{attestDatabases=attestResourceDatabases,probePoolContainer,...dependencies}={}){
 const manifest=resourcePoolInventoryManifest(raw),projects=new Map(),resolveProject=dependencies.resolveProject;
 if(typeof resolveProject!=='function'||typeof probePoolContainer!=='function')fail('RESOURCE_POOL_DEPENDENCY_REQUIRED');
 const runtime=await inspectResourceDeployment(manifest.nativeManifest,{...dependencies,resolveProject:async p=>{const r=await resolveProject(p);projects.set(p.id,r);return r}});
 const targets=[],unresolvedTargets=[],known=new Set();
 for(const container of runtime.bindings){
  const r=container.resources,service=projects.get(container.project).services[container.service];
  for(const database of r.schemaVersion===2?r.databases:[r])for(const consumer of database.consumers){
   const identity={project:container.project,service:container.service,databaseId:database.databaseId,consumerId:consumer.id};known.add(selector(identity));
   const expected=manifest.bindings.find(b=>selector(b)===selector(identity));
   const reason=r.schemaVersion!==1?'pool_adapter_unavailable':!resourcePoolObservationMode(service.environment)?'pool_observation_not_enabled':!expected?'expected_login_missing':null;
   if(reason){unresolvedTargets.push({...identity,containerId:container.containerId,reason});continue}
   const entry=manifest.databaseManifest.databases.find(d=>d.databaseId===database.databaseId);
   if(!entry)fail('RESOURCE_POOL_MAPPING_MISMATCH');
   targets.push({...identity,container,expected:resourceDatabaseObservationDigests({...entry.expected,role:expected.role}),pool:consumer.pools[0]});
  }
 }
 if(manifest.bindings.some(b=>!known.has(selector(b))))fail('RESOURCE_POOL_MAPPING_MISMATCH');
 let reference,finalReference;const observed=new Map(),bindings=[];
 if(targets.length){
  reference=await attestDatabases(manifest.databaseManifest);
  if(!reference.databaseTargetsVerified||!Array.isArray(reference.targets))fail('RESOURCE_POOL_REFERENCE_INVALID');
  const unique=[...new Map(targets.map(t=>[t.container.containerId,t.container])).values()];
  for(let pass=0;pass<2;pass++)for(const container of unique){
   let sample;try{sample=validateResourcePoolSample(await probePoolContainer(container.containerId))}catch{fail('RESOURCE_POOL_PROBE_FAILED')}
   if(canonical(sample.resources)!==canonical(container.resources))fail('RESOURCE_POOL_PROFILE_MISMATCH');
   const previous=observed.get(container.containerId);
   if(previous&&(previous.processNonce!==sample.processNonce||canonical(previous.bindings)!==canonical(sample.bindings)))fail('RESOURCE_POOL_OBSERVATION_DRIFT');
   for(const target of targets.filter(t=>t.container.containerId===container.containerId)){
    const actual=sample.bindings.find(b=>b.consumerId===target.consumerId),ref=reference.targets.find(d=>d.databaseId===target.databaseId);
    if(!actual||!ref)fail('RESOURCE_POOL_REFERENCE_INVALID');
    for(const key of ['roleSha256','lineageSha256','databaseIdentitySha256'])if(actual[key]!==target.expected[key])fail('RESOURCE_POOL_TARGET_MISMATCH');
    if(actual.lineageSha256!==ref.lineageSha256||actual.databaseIdentitySha256!==ref.databaseIdentitySha256||actual.serverSettingsSha256!==ref.serverSettingsSha256)
     fail('RESOURCE_POOL_REFERENCE_MISMATCH');
    if(pass===1)bindings.push({project:target.project,service:target.service,containerId:container.containerId,databaseId:target.databaseId,
      consumerId:target.consumerId,poolId:actual.poolId,poolMax:actual.poolMax,processNonce:sample.processNonce,roleSha256:actual.roleSha256,
      lineageSha256:actual.lineageSha256,databaseIdentitySha256:actual.databaseIdentitySha256,serverSettingsSha256:actual.serverSettingsSha256});
   }
   observed.set(container.containerId,sample);
  }
  finalReference=await attestDatabases(manifest.databaseManifest);
  if(canonical(reference.targets)!==canonical(finalReference.targets)||canonical(reference.servers)!==canonical(finalReference.servers))fail('RESOURCE_POOL_REFERENCE_DRIFT');
 }
 const after=await inspectResourceDeployment(manifest.nativeManifest,dependencies);
 if(canonical(runtime.bindings)!==canonical(after.bindings))fail('RESOURCE_POOL_RUNTIME_DRIFT');
 return {schemaVersion:1,mode:'native-loaded-pool-targets',environment:runtime.environment,budgetSha256:runtime.budgetSha256,
  nativeRuntimeVerified:true,loadedPoolSamplesVerified:bindings.length>0&&unresolvedTargets.length===0,bindings,unresolvedTargets,
  fullyCovered:runtime.fullyCovered,unresolvedConsumers:runtime.unresolvedConsumers,servers:reference?.servers??[],observationsPerPool:2,
  sampleExecutedInApplicationProcess:bindings.length>0,allPoolConnectionsVerified:false,endpointDirectnessVerified:false,sourceToImageProvenanceVerified:false,
  runtimeVerified:false,databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,
  limitations:['Only sampled sessions leased from the actual supported native pool objects are observed, inside their application process and network namespace.',
   'Two samples per pool do not inspect every existing/future pool connection or exclude LOGIN/transaction-dependent routing proxies.',
   'Reference catalog sessions use separately restricted attestors and an explicitly budgeted slot; app samples borrow existing runtime pool capacity.',
   'Native inventory is rechecked, but trusted Docker/images are assumed. Vendor/maintenance/summary ephemeral clients and source-to-image provenance remain separate.',
   'No host capacity, provider, full signup, release acceptance or post-check stability is implied.'],
  acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}

export const nativePoolResourceProbe=String.raw`
(async()=>{try{
 const port=Number(process.argv[1]);if(process.argv.length!==2||!Number.isInteger(port)||port<1||port>65535)throw 0;
 const response=await fetch('http://127.0.0.1:'+port+'/resource-targets',{signal:AbortSignal.timeout(5500),redirect:'error'});
 if(response.status!==200||!response.body)throw 0;
 let length=0;const chunks=[];for await(const chunk of response.body){length+=chunk.length;if(length>16384)throw 0;chunks.push(chunk)}
 const {validateResourcePoolSample}=await import('/app/resource-pool-observation.mjs');
 const sample=validateResourcePoolSample(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
 process.stdout.write(JSON.stringify(sample));
}catch{process.stdout.write('{"code":"RESOURCE_POOL_PROBE_FAILED"}');process.exitCode=1}})();
`;
