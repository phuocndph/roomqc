import {isAbsolute,posix} from 'node:path';
import {ControlError} from './errors.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {loadRuntimeResourceContext,resourceMode,runtimeResourceView,resourcePoolObservationMode} from './resource-runtime.mjs';
import {boundedHealthFile,healthConfiguration} from './workers/health-config.mjs';
import {alertConfiguration} from './workers/alert-config.mjs';
import {summaryRotationDeploymentResources} from './resource-summary-deployment.mjs';
import {setupDeploymentResources} from './resource-setup-deployment.mjs';
import {withoutPublicDirectoryCa} from './directory-ca-mount.mjs';

const fail=code=>{throw new ControlError(400,code,'Kiểm tra tài nguyên triển khai chưa đạt. Chi tiết cấu hình đã được ẩn.')};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(v);
const list=(v,max,valid)=>Array.isArray(v)&&v.length<=max&&v.every(valid)&&new Set(v).size===v.length;
const path=v=>typeof v==='string'&&v.length<=4096&&!/[\x00-\x1f]/.test(v)&&isAbsolute(v);
const adapters={
  'control-api':{kind:'directory',command:['node','server.mjs']},
  'health-worker':{kind:'directory',command:['node','workers/health-runtime.mjs'],file:'ROOMQC_HEALTH_CONFIG_FILE'},
  'alert-worker':{kind:'directory',command:['node','workers/alert-runtime.mjs'],file:'ROOMQC_ALERT_CONFIG_FILE'},
  'provisioning-worker':{kind:'directory',command:['node','workers/setup-runtime.mjs']},
  'external-notifications':{kind:'business',command:['node','workers/booking-external-runtime.mjs','--config-file','/etc/roomqc/booking-external.json'],
    metadata:'/etc/roomqc/booking-external.json'},
  'summary-credential-rotation':{kind:'dual',command:['node','workers/summary-rotation-runtime.mjs','--config-file','/etc/roomqc/rotation.json']}
};

/** This manifest contains paths and reviewed image digests, never DSNs or tokens. */
export function resourceDeploymentManifest(raw){
  if(!exact(raw,['schemaVersion','environment','budgetFile','budgetSha256','projects'])||raw.schemaVersion!==1
    ||!['local','staging','production'].includes(raw.environment)||!path(raw.budgetFile)||!sha(raw.budgetSha256)
    ||!Array.isArray(raw.projects)||raw.projects.length<1||raw.projects.length>32)fail('RESOURCE_DEPLOYMENT_MANIFEST_INVALID');
  const seen=new Set();
  for(const project of raw.projects){
    if(!exact(project,['id','files','envFiles','profiles','services'])||!id(project.id)||seen.has(project.id)
      ||!list(project.files,8,path)||project.files.length===0||!list(project.envFiles,8,path)
      ||!list(project.profiles,16,id)||!Array.isArray(project.services)||project.services.length<1||project.services.length>64)
      fail('RESOURCE_DEPLOYMENT_MANIFEST_INVALID');
    seen.add(project.id);const services=new Set();
    for(const service of project.services){
      if(!exact(service,['name','adapter','databaseId','image'])||!id(service.name)||services.has(service.name)
        ||!Object.hasOwn(adapters,service.adapter)||!id(service.databaseId)
        ||!(digest(service.image)||(raw.environment==='local'&&/^sha256:[a-f0-9]{64}$/.test(service.image))))fail('RESOURCE_DEPLOYMENT_MANIFEST_INVALID');
      services.add(service.name);
    }
  }
  return structuredClone(raw);
}
function replicas(service){
  if(service.deploy?.mode&&service.deploy.mode!=='replicated')fail('RESOURCE_DEPLOYMENT_SCALE_INVALID');
  const values=[service.scale,service.deploy?.replicas].filter(v=>v!==undefined);
  if(values.some(v=>!Number.isSafeInteger(v)||v<0||v>1024)||new Set(values).size>1)fail('RESOURCE_DEPLOYMENT_SCALE_INVALID');
  const count=values[0]??1;
  if(count>1&&service.container_name)fail('RESOURCE_DEPLOYMENT_SCALE_INVALID');
  return count;
}
const containerPath=v=>typeof v==='string'&&v.startsWith('/')&&posix.normalize(v)===v&&!/[\x00-\x1f]/.test(v);
function metadataMount(service,target){
  if(!containerPath(target))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  const mounts=service.volumes??[];
  if(!Array.isArray(mounts))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  const matches=mounts.filter(m=>m.target===target),mount=matches[0];
  if(matches.length!==1||mount.type!=='bind'||mount.read_only!==true||!path(mount.source)||mount.bind?.create_host_path!==false)
    fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  // A parent mount would shadow the file even when the file itself is read-only.
  if(mounts.some(m=>m!==mount&&(!containerPath(m.target)||m.target==='/'||target.startsWith(m.target+'/'))))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  return mount.source;
}
function processShape(service,expected){
  const spec=adapters[expected.adapter],env=service.environment;
  if(!env||typeof env!=='object'||Array.isArray(env)||service.image!==expected.image||service.build!==undefined
    ||service.entrypoint!=null||service.env_file!==undefined||service.working_dir!=='/app'||JSON.stringify(service.command)!==JSON.stringify(spec.command))
    fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
  if(service.privileged||service.volumes_from||service.devices||service.configs||service.use_api_socket||service.post_start||service.pre_stop)
    fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
  if(Object.keys(env).some(key=>/^(?:NODE_OPTIONS|NODE_PATH|LD_.+|DYLD_.+|BASH_ENV|ENV)$/.test(key)&&env[key]))
    fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
  if(expected.adapter==='control-api'&&Object.hasOwn(env,'ROOMQC_CONTROL_DATABASE_URL_FILE')){
    const secrets=(service.secrets??[]).filter(s=>(typeof s==='string'?s:s?.source)==='control-dsn');
    const secret=secrets[0],target=typeof secret==='string'?secret:secret?.target??secret?.source;
    if(env.ROOMQC_CONTROL_DATABASE_URL||env.ROOMQC_CONTROL_DATABASE_URL_FILE!=='/run/secrets/control-dsn'
      ||secrets.length!==1||!['control-dsn','/run/secrets/control-dsn'].includes(target))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  }
  // No code, executable or parent-directory overlays for a reviewed native image.
  for(const mount of withoutPublicDirectoryCa(service)){
    if(!containerPath(mount.target)||!/^\/etc\/roomqc\/[a-z0-9-]+\.json$/.test(mount.target))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  }
  for(const secret of service.secrets??[]){
    const target=typeof secret==='string'?secret:secret.target??secret.source;
    if(typeof target!=='string'||!(/^[a-z0-9][a-z0-9-]*$/.test(target)||/^\/run\/secrets\/[a-z0-9][a-z0-9-]*$/.test(target)))
      fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  }
  for(const mount of service.tmpfs??[]){
    if(typeof mount!=='string'||!/^\/tmp(?::[^\r\n]*)?$/.test(mount))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  }
  // Healthcheck code executes outside the application's bounded pools too.
  if(service.healthcheck&&!service.healthcheck.disable){
    const port=expected.adapter==='control-api'?8091:expected.adapter==='health-worker'?8093:8094;
    const prefix=expected.adapter==='control-api'?'/api/control':'';
    const time=expected.adapter==='control-api'?4000:2000;
    const test=['CMD','node','-e',`fetch('http://127.0.0.1:${port}${prefix}/readyz',{signal:AbortSignal.timeout(${time})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`];
    if(JSON.stringify(service.healthcheck.test)!==JSON.stringify(test))fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
  }
  return env;
}
const number=(env,key,fallback,min,max)=>{
  const value=Number(env[key]??fallback);
  if(!Number.isSafeInteger(value)||value<min||value>max)fail('RESOURCE_DEPLOYMENT_POOL_INVALID');return value;
};
async function resourceConfig(service,expected,manifest){
  if(expected.adapter==='provisioning-worker')return setupDeploymentResources(service,expected,manifest);
  if(expected.adapter==='summary-credential-rotation')return summaryRotationDeploymentResources(service,expected,manifest);
  const spec=adapters[expected.adapter],env=processShape(service,expected),mode=resourceMode(env);
  if(mode.environment!==manifest.environment)fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
  const target=env.ROOMQC_RESOURCE_BUDGET_FILE;
  if(env.ROOMQC_CONTROL_RESOURCE_BUDGET_FILE&&env.ROOMQC_CONTROL_RESOURCE_BUDGET_FILE!==target)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
  const budgetFile=metadataMount(service,target),snapshot=loadResourceBudgetSnapshot(budgetFile);
  if(snapshot.sha256!==manifest.budgetSha256)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
  const context=loadRuntimeResourceContext({...env,ROOMQC_RESOURCE_BUDGET_FILE:budgetFile,ROOMQC_CONTROL_RESOURCE_BUDGET_FILE:undefined},{kind:spec.kind});
  // Bind the SAME read even if a file changes during a preflight.
  if(context.budgetSha256!==snapshot.sha256||context.databaseId!==expected.databaseId)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
  let config={production:mode.production,resourceContext:context};
  if(expected.adapter==='control-api'){
    const poolMax=number(env,'ROOMQC_CONTROL_POOL_MAX',5,1,30),poolBudget=number(env,'ROOMQC_CONTROL_POOL_BUDGET',20,2,1000000);
    if(poolMax>=poolBudget)fail('RESOURCE_DEPLOYMENT_POOL_INVALID');
    config={...config,resourceBudget:context.budget,poolMax,poolBudget,apiInstances:number(env,'ROOMQC_CONTROL_API_INSTANCES',1,1,1024)};
  }else{
    const metadata=metadataMount(service,spec.file?env[spec.file]:spec.metadata);
    let raw;try{raw=JSON.parse(await boundedHealthFile(metadata,64*1024))}catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
    // Synthetic unusable endpoints validate NONSECRET resource metadata only.
    // The resolver must never open provider/DSN files or instantiate a pool.
    const databaseUrl='postgresql://unused:unused@db.invalid/unused?sslmode=verify-full';
    if(expected.adapter==='health-worker')config={...healthConfiguration(raw,{databaseUrl,production:mode.production,allowLocal:env.ROOMQC_HEALTH_ALLOW_LOCAL==='true'}),resourceContext:context};
    else if(expected.adapter==='alert-worker')config={...alertConfiguration(raw,{databaseUrl,endpoint:'https://unused.invalid',token:'unused-preflight-token',production:mode.production}),resourceContext:context};
    else config={...config,connectionBudget:raw.connectionBudget};
  }
  return runtimeResourceView(config,expected.adapter);
}

/** Read-only PLAN check. No claim about running replicas, DB identity, host or capacity. */
export async function preflightResourceDeployment(raw,{resolveProject}={}){
  const manifest=resourceDeploymentManifest(raw),snapshot=loadResourceBudgetSnapshot(manifest.budgetFile);
  if(snapshot.sha256!==manifest.budgetSha256)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
  const expectedEnvironment=manifest.environment==='local'?['example','local']:[manifest.environment];
  if(!expectedEnvironment.includes(snapshot.budget.environment))fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
  if(typeof resolveProject!=='function')fail('RESOURCE_DEPLOYMENT_RESOLVER_REQUIRED');
  const services=[],counts=new Map(),summaryInstances=new Set(),summaryLogins=new Set(),setupInstances=new Set();
  for(const project of manifest.projects){
    let resolved;try{resolved=await resolveProject(project)}catch{fail('RESOURCE_DEPLOYMENT_RESOLVE_FAILED')}
    if(!resolved||resolved.name!==project.id||!resolved.services||typeof resolved.services!=='object'||Array.isArray(resolved.services))fail('RESOURCE_DEPLOYMENT_RESOLVE_FAILED');
    const active=Object.entries(resolved.services).filter(([,s])=>{
      if(!s||typeof s!=='object'||Array.isArray(s)||s.profiles!==undefined&&!list(s.profiles,16,id))fail('RESOURCE_DEPLOYMENT_RESOLVE_FAILED');
      return !s.profiles?.length||s.profiles.some(p=>project.profiles.includes(p));
    });
    if(active.length!==project.services.length||active.some(([name])=>!project.services.some(s=>s.name===name)))fail('RESOURCE_DEPLOYMENT_UNCLASSIFIED_SERVICE');
    for(const [name,service] of active){
      const expected=project.services.find(s=>s.name===name),count=replicas(service);
      if(resourcePoolObservationMode(service.environment??{})&&expected.adapter==='summary-credential-rotation')fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
      // Each active rotator has its own issuer/observer logins and instance
      // namespace. Scaling one Compose service would duplicate its inputs.
      if(expected.adapter==='summary-credential-rotation'&&count!==1)fail('RESOURCE_DEPLOYMENT_SCALE_INVALID');
      if(expected.adapter==='provisioning-worker'&&count!==1)fail('RESOURCE_DEPLOYMENT_SCALE_INVALID');
      const evaluated=await resourceConfig(service,expected,manifest),view=evaluated.resources??evaluated;
      if(evaluated.setupInstanceId){
        if(setupInstances.has(evaluated.setupInstanceId))fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
        setupInstances.add(evaluated.setupInstanceId);
      }
      if(evaluated.isolation){
        const {instanceId,logins}=evaluated.isolation;
        if(summaryInstances.has(instanceId)||logins.some(k=>summaryLogins.has(k)))fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
        summaryInstances.add(instanceId);for(const key of logins)summaryLogins.add(key);
      }
      const databases=view.schemaVersion===2?view.databases:[view];
      for(const database of databases)for(const consumer of database.consumers){
        const key=database.databaseId+'/'+consumer.id;counts.set(key,(counts.get(key)??0)+count);
      }
      services.push({project:project.id,service:name,adapter:expected.adapter,image:expected.image,plannedReplicas:count,resources:view});
    }
  }
  const unresolvedConsumers=[];
  for(const db of snapshot.budget.databases)for(const c of db.consumers){
    const key=db.id+'/'+c.id,actual=counts.get(key);
    if(actual!==undefined&&actual!==c.replicas)fail('RESOURCE_DEPLOYMENT_REPLICA_MISMATCH');
    if(actual===undefined&&c.replicas>0)unresolvedConsumers.push({databaseId:db.id,consumerId:c.id,replicas:c.replicas,reason:'adapter_or_inventory_missing'});
  }
  // Catch duplicate native bindings even when they point at the same image/profile.
  const fullyCovered=unresolvedConsumers.length===0;
  return {schemaVersion:1,mode:'plan',nativePlanVerified:true,fullyCovered,environment:manifest.environment,budgetSha256:snapshot.sha256,
    services,unresolvedConsumers,runtimeVerified:false,databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,
    limitations:['Only declared Compose projects and supported native adapters were checked.','Running replicas, cached process fingerprints, DB identity/settings and vendor pools need separate checks.',
      'No host capacity, workload, TLS, provider, backup/restore or release acceptance is implied.'],
    acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}
