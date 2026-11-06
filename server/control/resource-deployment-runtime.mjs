import {ControlError} from './errors.mjs';
import {preflightResourceDeployment,resourceDeploymentManifest} from './resource-deployment.mjs';
import {directoryCaTarget,directoryCaVolumeName,withoutPublicDirectoryCa} from './directory-ca-mount.mjs';

const fail=code=>{throw new ControlError(400,code,'Đối chiếu tài nguyên đang chạy chưa đạt. Chi tiết cấu hình đã được ẩn.')};
const canonical=v=>JSON.stringify(v,(_k,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const same=(a,b,code)=>{if(canonical(a)!==canonical(b))fail(code)};
const imageId=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const containerId=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sorted=v=>{if(v==null)return [];if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))fail('RESOURCE_RUNTIME_PROCESS_MISMATCH');return [...v].sort()};
function environment(values){
  if(!Array.isArray(values))fail('RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH');
  const result={};for(const value of values){const at=typeof value==='string'?value.indexOf('='):-1;
    if(at<1||Object.hasOwn(result,value.slice(0,at)))fail('RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH');
    result[value.slice(0,at)]=value.slice(at+1);
  }return result;
}
const injection=env=>Object.keys(env).some(key=>/^(?:NODE_OPTIONS|NODE_PATH|LD_.+|DYLD_.+|BASH_ENV|ENV)$/.test(key)&&env[key]);
function effectiveEnvironment(image,service){
  const values=environment(image.Config?.Env??[]);
  for(const [key,value]of Object.entries(service.environment??{})){
    if(value===null)delete values[key];else if(typeof value!=='string')fail('RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH');else values[key]=value;
  }
  if(injection(values))fail('RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH');
  try{withoutPublicDirectoryCa({...service,environment:values})}catch{fail('RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH')}
  return values;
}
// Windows Docker Desktop reports both drive paths and translated daemon paths.
// No case folding beyond the drive letter and no guessed generic symlink aliases.
export function runtimeMountSource(value,platform=process.platform){
  if(typeof value!=='string'||!value||/[\x00-\x1f]/.test(value))fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
  if(platform!=='win32')return value;
  const normalized=value.replaceAll('\\','/'),drive=normalized.match(/^([a-zA-Z]):\/(.*)$/),desktop=normalized.match(/^\/run\/desktop\/mnt\/host\/([a-z])\/(.*)$/);
  return drive?'$DRIVE/'+drive[1].toLowerCase()+'/'+drive[2]:desktop?'$DRIVE/'+desktop[1]+'/'+desktop[2]:normalized;
}
function expectedMounts(service,resolved,platform){
  const mounts=(service.volumes??[]).map(m=>{
    if(m.type==='volume'&&m.target===directoryCaTarget){
      const definition=resolved.volumes?.[m.source];
      if(definition?.external!==true||!directoryCaVolumeName(definition.name))fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
      return {type:'volume',source:definition.name,target:m.target,readOnly:true,propagation:''};
    }
    if(m.type!=='bind')fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
    return {type:'bind',source:runtimeMountSource(m.source,platform),target:m.target,readOnly:m.read_only===true,propagation:m.bind?.propagation??'rprivate'};
  });
  for(const entry of service.secrets??[]){
    const secret=typeof entry==='string'?{source:entry}:entry,definition=resolved.secrets?.[secret.source];
    if(!definition?.file||definition.external)fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
    let target=secret.target??secret.source;if(!target.startsWith('/'))target='/run/secrets/'+target;
    mounts.push({type:'bind',source:runtimeMountSource(definition.file,platform),target,readOnly:true,propagation:'rprivate'});
  }
  return mounts.sort((a,b)=>a.target.localeCompare(b.target));
}
function networkNames(service,resolved){
  if(service.network_mode!==undefined){
    if(!['none','bridge'].includes(service.network_mode))fail('RESOURCE_RUNTIME_NETWORK_MISMATCH');
    return [service.network_mode];
  }
  const names=Object.keys(service.networks??{}).map(key=>resolved.networks?.[key]?.name);
  if(names.length===0||names.some(n=>typeof n!=='string'||!n))fail('RESOURCE_RUNTIME_NETWORK_MISMATCH');return names.sort();
}
function healthcheck(service,image,actual,adapter){
  const configured=service.healthcheck,defaults=image.Config?.Healthcheck;
  const expected=configured?.disable?['NONE']:configured?.test??defaults?.Test??null;
  const found=actual.Config?.Healthcheck?.Test??null;same(found,expected,'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  if(expected&&expected[0]!=='NONE'){
    const port=adapter==='control-api'?8091:adapter==='health-worker'?8093:adapter==='provisioning-worker'?8095:8094,prefix=adapter==='control-api'?'/api/control':'',time=adapter==='control-api'?4000:2000;
    same(expected,['CMD','node','-e',`fetch('http://127.0.0.1:${port}${prefix}/readyz',{signal:AbortSignal.timeout(${time})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],
      'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  }
}
function verifyContainer(actual,{project,serviceName,service,resolved,image,expected,platform}){
  const labels=actual?.Config?.Labels,host=actual?.HostConfig,state=actual?.State;
  if(!containerId(actual?.Id)||labels?.['com.docker.compose.project']!==project||labels?.['com.docker.compose.service']!==serviceName
    ||String(labels?.['com.docker.compose.oneoff']).toLowerCase()!=='false')fail('RESOURCE_RUNTIME_UNEXPECTED_CONTAINER');
  const ordinal=labels['com.docker.compose.container-number'];if(typeof ordinal!=='string'||!/^[1-9][0-9]{0,3}$/.test(ordinal))fail('RESOURCE_RUNTIME_UNEXPECTED_CONTAINER');
  if(!state||state.Status!=='running'||state.Running!==true||state.Paused||state.Restarting||state.Dead
    ||!Number.isSafeInteger(state.Pid)||state.Pid<1||typeof state.StartedAt!=='string'||!Number.isFinite(Date.parse(state.StartedAt)))fail('RESOURCE_RUNTIME_CONTAINER_UNAVAILABLE');
  if(actual.Image!==image.Id||actual.Config.Image!==expected.image)fail('RESOURCE_RUNTIME_IMAGE_MISMATCH');
  const entrypoint=service.entrypoint??image.Config?.Entrypoint??null,command=service.command;
  same(actual.Config.Entrypoint??null,entrypoint,'RESOURCE_RUNTIME_PROCESS_MISMATCH');same(actual.Config.Cmd,command,'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  const argv=[...(entrypoint??[]),...command];same([actual.Path,...(actual.Args??[])],argv,'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  if(actual.Config.WorkingDir!=='/app'||actual.Config.User!==(service.user??image.Config?.User??'')
    ||!!actual.Config.Tty!==!!service.tty||!!actual.Config.OpenStdin!==!!service.stdin_open)fail('RESOURCE_RUNTIME_PROCESS_MISMATCH');
  same(environment(actual.Config.Env),effectiveEnvironment(image,service),'RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH');
  if(!host||host.Privileged||!!host.ReadonlyRootfs!==!!service.read_only||!!host.Init!==!!service.init
    ||(host.Devices?.length??0)>0||(host.DeviceRequests?.length??0)>0||(host.VolumesFrom?.length??0)>0)fail('RESOURCE_RUNTIME_PROCESS_MISMATCH');
  same(sorted(host.CapAdd),sorted(service.cap_add),'RESOURCE_RUNTIME_PROCESS_MISMATCH');same(sorted(host.CapDrop),sorted(service.cap_drop),'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  same(sorted(host.SecurityOpt),sorted(service.security_opt),'RESOURCE_RUNTIME_PROCESS_MISMATCH');
  const tmpfs={};for(const mount of service.tmpfs??[]){const at=mount.indexOf(':');tmpfs[at<0?mount:mount.slice(0,at)]=at<0?'':mount.slice(at+1)}
  same(host.Tmpfs??{},tmpfs,'RESOURCE_RUNTIME_MOUNT_MISMATCH');
  if(!Array.isArray(actual.Mounts))fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
  const mounts=actual.Mounts.filter(m=>m.Type!=='tmpfs').map(m=>({type:m.Type,source:m.Type==='volume'?m.Name:runtimeMountSource(m.Source,platform),target:m.Destination,
    readOnly:m.RW===false,propagation:m.Propagation})).sort((a,b)=>a.target.localeCompare(b.target));
  // tmpfs entries, when reported in Mounts by the engine, must also be declared.
  for(const mount of actual.Mounts.filter(m=>m.Type==='tmpfs'))if(!Object.hasOwn(tmpfs,mount.Destination))fail('RESOURCE_RUNTIME_MOUNT_MISMATCH');
  same(mounts,expectedMounts(service,resolved,platform),'RESOURCE_RUNTIME_MOUNT_MISMATCH');
  const networks=networkNames(service,resolved);same(Object.keys(actual.NetworkSettings?.Networks??{}).sort(),networks,'RESOURCE_RUNTIME_NETWORK_MISMATCH');
  if(service.network_mode&&host.NetworkMode!==service.network_mode)fail('RESOURCE_RUNTIME_NETWORK_MISMATCH');
  healthcheck(service,image,actual,expected.adapter);
  return Number(ordinal);
}
function stableSnapshot(container){
  const {Id,Image,Path,Args,Config,HostConfig,Mounts}=container,state=container.State;
  // Do not include health logs, transient live metrics or any raw values in reports.
  return canonical({Id,Image,Path,Args,Config,HostConfig,Mounts,state:{status:state.Status,running:state.Running,paused:state.Paused,
    restarting:state.Restarting,dead:state.Dead,pid:state.Pid,startedAt:state.StartedAt},networks:Object.keys(container.NetworkSettings?.Networks??{}).sort()});
}
async function inventory(project,read){
  let containers;try{containers=await read(project)}catch{fail('RESOURCE_RUNTIME_INVENTORY_FAILED')}
  if(!Array.isArray(containers)||containers.length>256||containers.some(c=>!containerId(c?.Id))||new Set(containers.map(c=>c.Id)).size!==containers.length)
    fail('RESOURCE_RUNTIME_INVENTORY_FAILED');return containers;
}

/** Attest supported native containers only. All resolved secrets stay private. */
export async function inspectResourceDeployment(raw,{resolveProject,inventoryProject,inspectImage,probeContainer,platform=process.platform}={}){
  if([resolveProject,inventoryProject,inspectImage,probeContainer].some(fn=>typeof fn!=='function'))fail('RESOURCE_RUNTIME_DEPENDENCY_REQUIRED');
  const manifest=resourceDeploymentManifest(raw),resolvedProjects=new Map(),startedAtUtc=new Date().toISOString();
  const plan=await preflightResourceDeployment(manifest,{resolveProject:async project=>{const resolved=await resolveProject(project);resolvedProjects.set(project.id,resolved);return resolved}});
  if(plan.services.reduce((sum,s)=>sum+s.plannedReplicas,0)>256)fail('RESOURCE_RUNTIME_INVENTORY_LIMIT');
  const images=new Map(),baselines=new Map(),bindings=[];
  for(const project of manifest.projects){
    const resolved=resolvedProjects.get(project.id),containers=await inventory(project,inventoryProject),expectedServices=plan.services.filter(s=>s.project===project.id);
    const byService=new Map(expectedServices.map(s=>[s.service,[]]));
    for(const actual of containers){
      const labels=actual.Config?.Labels,name=labels?.['com.docker.compose.service'];
      if(labels?.['com.docker.compose.project']!==project.id||String(labels?.['com.docker.compose.oneoff']).toLowerCase()!=='false'||!byService.has(name))fail('RESOURCE_RUNTIME_UNEXPECTED_CONTAINER');
      byService.get(name).push(actual);
    }
    baselines.set(project.id,new Map(containers.map(c=>[c.Id,stableSnapshot(c)])));
    for(const expected of expectedServices){
      const actuals=byService.get(expected.service);if(actuals.length!==expected.plannedReplicas)fail('RESOURCE_RUNTIME_REPLICA_MISMATCH');
      if(actuals.length===0)continue;
      let image=images.get(expected.image);
      if(!image){try{image=await inspectImage(expected.image)}catch{fail('RESOURCE_RUNTIME_IMAGE_UNAVAILABLE')}
        if(!imageId(image?.Id)||(!expected.image.startsWith('sha256:')&&!image.RepoDigests?.includes(expected.image))
          ||(expected.image.startsWith('sha256:')&&image.Id!==expected.image))fail('RESOURCE_RUNTIME_IMAGE_MISMATCH');images.set(expected.image,image);}
      const ordinals=new Set(),service=resolved.services[expected.service];
      for(const actual of actuals){
        const ordinal=verifyContainer(actual,{project:project.id,serviceName:expected.service,service,resolved,image,expected,platform});
        if(ordinal>expected.plannedReplicas||ordinals.has(ordinal))fail('RESOURCE_RUNTIME_REPLICA_MISMATCH');ordinals.add(ordinal);
        let projection;try{projection=await probeContainer(actual.Id,{adapter:expected.adapter,port:expected.adapter==='control-api'?Number(service.environment.ROOMQC_CONTROL_PORT??8091)
          :expected.adapter==='health-worker'?8093:expected.adapter==='provisioning-worker'?8095:expected.adapter==='summary-credential-rotation'?8097:8094})}
        catch{fail('RESOURCE_RUNTIME_PROBE_FAILED')}
        same(projection,expected.resources,'RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH');
        bindings.push({project:project.id,service:expected.service,containerId:actual.Id,imageId:image.Id,startedAtUtc:actual.State.StartedAt,
          resources:expected.resources});
      }
    }
  }
  // Re-list and re-inspect: detect a replica/restart/replacement during the probes.
  for(const project of manifest.projects){const after=await inventory(project,inventoryProject),before=baselines.get(project.id);
    if(after.length!==before.size||after.some(c=>!before.has(c.Id)||before.get(c.Id)!==stableSnapshot(c)))fail('RESOURCE_RUNTIME_CHANGED_DURING_CHECK');}
  return {schemaVersion:1,mode:'runtime',environment:plan.environment,budgetSha256:plan.budgetSha256,startedAtUtc,finishedAtUtc:new Date().toISOString(),
    nativeRuntimeVerified:true,fullyCovered:plan.fullyCovered,bindings,unresolvedConsumers:plan.unresolvedConsumers,
    runtimeVerified:false,databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,
    limitations:['Point-in-time native container inventory, process/mount/environment/image identity and cached resource profile only.',
      'Declared projects only. Trusted Docker daemon and reviewed images are assumed; no workload/DB identity/provider/host-capacity proof.',
      'Vendor/pooler and other uncovered consumers, changes after this check and overall release acceptance remain separate.'],
    acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}

/** Closed loopback-only program; no arbitrary URL, command, file or response output. */
export const nativeResourceProbe=String.raw`
const spec={'control-api':'/api/control/livez','health-worker':'/livez','alert-worker':'/livez','external-notifications':'/livez','provisioning-worker':'/livez','summary-credential-rotation':'/livez'};
(async()=>{try{
  const [adapter,rawPort]=process.argv.slice(1),port=Number(rawPort);
  if(!Object.hasOwn(spec,adapter)||!Number.isInteger(port)||port<1||port>65535||process.argv.length!==3)throw 0;
  const response=await fetch('http://127.0.0.1:'+port+spec[adapter],{signal:AbortSignal.timeout(4000),redirect:'error'});
  if(response.status!==200||!response.body)throw 0;
  let length=0;const chunks=[];for await(const chunk of response.body){length+=chunk.length;if(length>16384)throw 0;chunks.push(chunk)}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  if(!body||!body.resources)throw 0;
  const r=body.resources,summary=adapter==='summary-credential-rotation';
  const keys=summary?['schemaVersion','budgetSha256','environment','configurationSha256','databases']:['schemaVersion','budgetSha256','environment','databaseId','consumers'];
  if(typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))
    ||r.schemaVersion!==(summary?2:1)||!/^[a-f0-9]{64}$/.test(r.budgetSha256)||!['local','staging','production'].includes(r.environment))throw 0;
  if(summary&&(!/^[a-f0-9]{64}$/.test(r.configurationSha256)||!Array.isArray(r.databases)||r.databases.length!==2))throw 0;
  const databases=summary?r.databases:[r],seenDatabases=new Set();
  for(const d of databases){
   if(summary&&(!d||Object.keys(d).sort().join(',')!=='consumers,databaseId'))throw 0;
   if(!/^[a-z][a-z0-9-]{0,63}$/.test(d.databaseId)||seenDatabases.has(d.databaseId)||!Array.isArray(d.consumers)
     ||d.consumers.length<1||d.consumers.length>(summary?1:2))throw 0;
   seenDatabases.add(d.databaseId);
  const seen=new Set();for(const c of d.consumers){
    if(!c||Object.keys(c).sort().join(',')!=='fixedConnectionsPerReplica,id,pools,replicas'
      ||!(summary?['summary-credential-rotation']:['control-api','health-worker','probe-catalog','alert-worker','external-notifications','provisioning-worker']).includes(c.id)||seen.has(c.id)
      ||!Number.isInteger(c.replicas)||c.replicas<1||c.replicas>(summary?2:1024)||c.fixedConnectionsPerReplica!==0||!Array.isArray(c.pools)||c.pools.length!==1)throw 0;
    seen.add(c.id);const p=c.pools[0];if(!p||Object.keys(p).sort().join(',')!=='id,max'||!/^[a-z][a-z0-9-]{0,63}$/.test(p.id)
      ||!Number.isInteger(p.max)||p.max<1||p.max>(summary?1:10000))throw 0;
  }}
  process.stdout.write(JSON.stringify({resources:r}));
}catch{process.stdout.write('{"code":"RESOURCE_RUNTIME_PROBE_FAILED"}');process.exitCode=1}})();
`;
