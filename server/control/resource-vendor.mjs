import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {preflightResourceDeployment,resourceDeploymentManifest} from './resource-deployment.mjs';
import {vendorResourceCatalog} from './resource-vendor-catalog.mjs';
import {storageResourcePlan} from './resource-vendor-storage.mjs';
import {realtimeResourceInventory} from './resource-vendor-realtime.mjs';
import {immutableRealtimeImage,managedRealtimeProof} from './realtime-image-contract.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const path=v=>typeof v==='string'&&v.length<=4096&&!/[\x00-\x1f\x7f]/.test(v)&&isAbsolute(v);
const digest=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(v);
const list=(v,max,valid)=>Array.isArray(v)&&v.length<=max&&v.every(valid)&&new Set(v).size===v.length;
const adapters=['auth','rest','realtime','realtime-managed','storage','meta','supavisor','functions','studio','gateway','imgproxy','database'];
const invalid=()=>fail('RESOURCE_VENDOR_MANIFEST_INVALID');
export function resourceConsumerManifest(raw){
  if(!exact(raw,['schemaVersion','environment','budgetFile','budgetSha256','vendorCatalogId','nativeProjects','vendorProjects'])||raw.schemaVersion!==1
    ||!['local','staging','production'].includes(raw.environment)||!path(raw.budgetFile)||!/^[a-f0-9]{64}$/.test(raw.budgetSha256??'')
    ||raw.vendorCatalogId!==vendorResourceCatalog.id||!Array.isArray(raw.nativeProjects)||raw.nativeProjects.length>32
    ||!Array.isArray(raw.vendorProjects)||raw.vendorProjects.length>32||raw.nativeProjects.length+raw.vendorProjects.length<1
    ||raw.nativeProjects.length+raw.vendorProjects.length>32)invalid();
  if(raw.nativeProjects.length)resourceDeploymentManifest({schemaVersion:1,environment:raw.environment,budgetFile:raw.budgetFile,budgetSha256:raw.budgetSha256,projects:raw.nativeProjects});
  const projects=new Set(raw.nativeProjects.map(p=>p.id));
  for(const p of raw.vendorProjects){
    if(!exact(p,['id','files','envFiles','profiles','services'])||!id(p.id)||projects.has(p.id)||!list(p.files,8,path)||p.files.length===0
      ||!list(p.envFiles,8,path)||!list(p.profiles,16,id)||!Array.isArray(p.services)||p.services.length<1||p.services.length>64)invalid();
    projects.add(p.id);const services=new Set();
    for(const s of p.services){
      if(!exact(s,['name','adapter','databaseId','image'])||!id(s.name)||services.has(s.name)||!adapters.includes(s.adapter)||!id(s.databaseId)
        ||!(s.adapter==='realtime-managed'?immutableRealtimeImage(s.image):digest(s.image)))invalid();
      services.add(s.name);
    }
  }
  return structuredClone(raw);
}
function replicas(service){
  if(service.deploy?.mode&&service.deploy.mode!=='replicated')fail('RESOURCE_VENDOR_REPLICA_MISMATCH');
  const values=[service.scale,service.deploy?.replicas].filter(v=>v!==undefined);
  if(values.some(v=>!Number.isSafeInteger(v)||v<0||v>1024)||new Set(values).size>1)fail('RESOURCE_VENDOR_REPLICA_MISMATCH');
  const count=values[0]??1;if(count>1&&service.container_name)fail('RESOURCE_VENDOR_REPLICA_MISMATCH');return count;
}
const integer=(env,key,{min=1,max=10000}={})=>{
  const raw=env[key];if(typeof raw!=='string'||!/^(0|[1-9][0-9]{0,5})$/.test(raw))fail('RESOURCE_VENDOR_POOL_UNBOUNDED');
  const n=Number(raw);if(n<min||n>max)fail('RESOURCE_VENDOR_POOL_UNBOUNDED');return n;
};
function configuredTarget(uri,environment){
  let u;try{u=new URL(uri)}catch{fail('RESOURCE_VENDOR_TARGET_INVALID')}
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.username||!u.password||u.pathname.length<2||u.hash
    ||[...u.searchParams.keys()].some(k=>k!=='sslmode')||u.searchParams.getAll('sslmode').length!==1
    ||!(environment==='local'?['disable','verify-full']:['verify-full']).includes(u.searchParams.get('sslmode')))
    fail('RESOURCE_VENDOR_TARGET_INVALID');
  let target;try{target=[u.hostname,u.port||'5432',decodeURIComponent(u.pathname.slice(1)),decodeURIComponent(u.username),u.searchParams.get('sslmode')];
    const port=Number(target[1]),password=decodeURIComponent(u.password);
    if(!Number.isInteger(port)||port<1||port>65535||target.some(s=>/[\x00-\x1f\x7f]/.test(s))||/[\x00-\x1f\x7f]/.test(password))throw new Error()}catch{fail('RESOURCE_VENDOR_TARGET_INVALID')}
  return hash(JSON.stringify(target));
}
function supportedShape(service,expected){
  const env=service.environment,recipe=vendorResourceCatalog.entries.find(e=>e.id===expected.adapter);
  const managedAuth=expected.adapter==='auth'&&expected.image===vendorResourceCatalog.managedAuth.image;
  const reviewedImage=managedAuth?vendorResourceCatalog.managedAuth.image:recipe?.image;
  if(!env||typeof env!=='object'||Array.isArray(env)||Object.values(env).some(v=>typeof v!=='string')
    ||service.image!==reviewedImage||expected.image!==reviewedImage||service.build!==undefined||service.env_file!==undefined
    ||service.entrypoint!=null||service.privileged||service.volumes_from||service.devices||service.configs||service.use_api_socket
    ||service.post_start||service.pre_stop||(service.volumes?.length??0)>0||(service.secrets?.length??0)>0||(service.tmpfs?.length??0)>0)
    fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
  const allowed=expected.adapter==='auth'?[null,['auth']]:[null,['postgrest'],['/bin/postgrest']];
  if(!allowed.some(c=>JSON.stringify(c)===JSON.stringify(service.command??null)))fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
  if(Object.keys(env).some(k=>/^(?:PG(?!RST_)[A-Z_]+|NODE_OPTIONS|NODE_PATH|LD_.+|DYLD_.+|BASH_ENV|ENV|DATABASE_URL)$/.test(k)&&env[k]))
    fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
  if(managedAuth&&(env.GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD!=='true'||env.GOTRUE_AUDIT_LOG_DISABLE_POSTGRES!=='false'))
    fail('RESOURCE_VENDOR_PASSWORD_GUARD_REQUIRED');
  return env;
}
function supportedPool(service,expected,manifest){
  if(expected.adapter==='storage')return storageResourcePlan(service,{image:vendorResourceCatalog.entries.find(e=>e.id==='storage').image,
    environment:manifest.environment,integer,configuredTarget});
  const env=supportedShape(service,expected);let poolMax,fixedConnectionsPerReplica,target;
  if(expected.adapter==='auth'){
    if(env.GOTRUE_DB_DRIVER!=='postgres'||env.GOTRUE_DB_CONN_PERCENTAGE!=='0')fail('RESOURCE_VENDOR_POOL_UNBOUNDED');
    poolMax=integer(env,'GOTRUE_DB_MAX_POOL_SIZE');integer(env,'GOTRUE_DB_MAX_IDLE_POOL_SIZE',{min:0,max:poolMax});
    fixedConnectionsPerReplica=0;target=configuredTarget(env.GOTRUE_DB_DATABASE_URL,manifest.environment);
  }else{
    if(env.PGRST_DB_CONFIG!=='false'||!['true','false'].includes(env.PGRST_DB_CHANNEL_ENABLED))fail('RESOURCE_VENDOR_POOL_UNBOUNDED');
    poolMax=integer(env,'PGRST_DB_POOL');fixedConnectionsPerReplica=env.PGRST_DB_CHANNEL_ENABLED==='true'?1:0;
    target=configuredTarget(env.PGRST_DB_URI,manifest.environment);
  }
  return {consumerId:expected.adapter,pools:[{id:'main',max:poolMax}],fixedConnectionsPerReplica,configuredTargetSha256:target};
}
const pendingReasons={
  realtime:['control_and_persisted_tenant_pools_require_separate_inventory','maintenance_replication_and_cross_node_concurrency_not_bound'],
  storage:['image_or_runtime_outside_reviewed_fixed_project_recipe','tenant_worker_queue_migration_and_retiring_sessions_require_separate_inventory'],
  meta:['pool_max_one_is_per_request_not_global','http_admission_and_dynamic_database_headers_not_bound'],
  supavisor:['metadata_database_pool_is_separate','tenant_role_database_mode_pools_auth_queries_and_overflow_not_bound','bootstrap_environment_does_not_update_existing_tenant_rows'],
  functions:['immutable_function_code_and_direct_database_connections_not_bound'],
  studio:['administrative_database_paths_and_admission_not_bound'],
  gateway:['reviewed_gateway_process_and_hooks_not_yet_classified'],
  imgproxy:['reviewed_process_and_hooks_not_yet_classified'],
  database:['database_instance_inventory_and_non_application_consumers_need_separate_binding']
};

/** Combines existing native PLAN validation with release-specific vendor pool recipes.
 * Unsupported services stay unresolved; no guessed/default bound is accepted. */
export async function preflightResourceConsumers(raw,{resolveProject,verifyManagedImage}={}){
  const manifest=resourceConsumerManifest(raw),snapshot=loadResourceBudgetSnapshot(manifest.budgetFile),budget=snapshot.budget;
  if(snapshot.sha256!==manifest.budgetSha256)fail('RESOURCE_VENDOR_PROFILE_MISMATCH');
  if(manifest.environment==='local'?!['example','local'].includes(budget.environment):budget.environment!==manifest.environment)
    fail('RESOURCE_VENDOR_ENVIRONMENT_MISMATCH');
  if(typeof resolveProject!=='function')fail('RESOURCE_VENDOR_RESOLVER_REQUIRED');
  let native=null;const services=[],counts=new Map(),unresolvedServices=[];
  const count=(databaseId,consumerId,replicas)=>{const key=databaseId+'/'+consumerId;counts.set(key,(counts.get(key)??0)+replicas)};
  if(manifest.nativeProjects.length){
    native=await preflightResourceDeployment({schemaVersion:1,environment:manifest.environment,budgetFile:manifest.budgetFile,
      budgetSha256:manifest.budgetSha256,projects:manifest.nativeProjects},{resolveProject});
    for(const s of native.services){
      services.push({...s,scope:'native'});
      const databases=s.resources.schemaVersion===2?s.resources.databases:[s.resources];
      for(const database of databases)for(const c of database.consumers)count(database.databaseId,c.id,s.plannedReplicas);
    }
  }
  for(const project of manifest.vendorProjects){
    let resolved;try{resolved=await resolveProject(project)}catch{fail('RESOURCE_VENDOR_RESOLVE_FAILED')}
    if(!resolved||resolved.name!==project.id||!resolved.services||typeof resolved.services!=='object'||Array.isArray(resolved.services))fail('RESOURCE_VENDOR_RESOLVE_FAILED');
    const active=Object.entries(resolved.services).filter(([,s])=>{
      if(!s||typeof s!=='object'||Array.isArray(s)||s.profiles!==undefined&&!list(s.profiles,16,id))fail('RESOURCE_VENDOR_RESOLVE_FAILED');
      return !s.profiles?.length||s.profiles.some(p=>project.profiles.includes(p));
    });
    if(active.length!==project.services.length||active.some(([name])=>!project.services.some(s=>s.name===name)))fail('RESOURCE_VENDOR_UNCLASSIFIED_SERVICE');
    for(const [name,service]of active){
      const expected=project.services.find(s=>s.name===name),database=budget.databases.find(d=>d.id===expected.databaseId);
      if(!database||database.kind!=='business'||service.image!==expected.image||service.build!==undefined)fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
      const n=replicas(service),base={scope:'vendor',project:project.id,service:name,adapter:expected.adapter,databaseId:expected.databaseId,image:expected.image,plannedReplicas:n};
      if(n===0){services.push({...base,poolPlanVerified:false,inactive:true});continue}
      if(expected.adapter==='realtime-managed'){
        if(typeof verifyManagedImage!=='function'){
          const reasons=['managed_realtime_independent_image_rebuild_required'];
          services.push({...base,poolPlanVerified:false,plannedServerConnections:null,reasons});
          unresolvedServices.push({project:project.id,service:name,adapter:expected.adapter,replicas:n,reasons});continue;
        }
        const imageProof=managedRealtimeProof(await verifyManagedImage(expected.image),expected.image);
        const inventory=realtimeResourceInventory(service,{image:expected.image,managedBootstrapVerified:true}),reasons=inventory.unresolvedReasons;
        if(manifest.environment!=='local'&&!inventory.tenantTlsPeerVerificationSupportedByReviewedPath)
          fail('RESOURCE_VENDOR_TARGET_INVALID');
        services.push({...base,poolPlanVerified:false,plannedServerConnections:null,inventory,imageProof,
          imageRebuildVerified:true,sourceCommit:vendorResourceCatalog.entries.find(e=>e.id==='realtime').commit,reasons});
        unresolvedServices.push({project:project.id,service:name,adapter:expected.adapter,replicas:n,reasons});continue;
      }
      const storageRecipe=expected.adapter==='storage'&&expected.image===vendorResourceCatalog.entries.find(e=>e.id==='storage').image;
      if(expected.adapter==='realtime'&&expected.image===vendorResourceCatalog.entries.find(e=>e.id==='realtime').image){
        const inventory=realtimeResourceInventory(service,{image:expected.image}),reasons=inventory.unresolvedReasons;
        services.push({...base,poolPlanVerified:false,plannedServerConnections:null,inventory,
          sourceCommit:vendorResourceCatalog.entries.find(e=>e.id==='realtime').commit,reasons});
        unresolvedServices.push({project:project.id,service:name,adapter:expected.adapter,replicas:n,reasons});continue;
      }
      if(!['auth','rest'].includes(expected.adapter)&&!storageRecipe){
        const reasons=pendingReasons[expected.adapter];services.push({...base,poolPlanVerified:false,plannedServerConnections:null,reasons});
        unresolvedServices.push({project:project.id,service:name,adapter:expected.adapter,replicas:n,reasons});continue;
      }
      const pool=supportedPool(service,expected,manifest),consumer=database.consumers.find(c=>c.id===pool.consumerId);
      if(!consumer||JSON.stringify(consumer.pools)!==JSON.stringify(pool.pools)||consumer.fixedConnectionsPerReplica!==pool.fixedConnectionsPerReplica)
        fail('RESOURCE_VENDOR_BUDGET_MISMATCH');
      count(database.id,consumer.id,n);
      services.push({...base,poolPlanVerified:true,resources:pool,plannedServerConnections:n*(consumer.poolMax+consumer.fixedConnectionsPerReplica),
        ...(expected.adapter==='auth'&&expected.image===vendorResourceCatalog.managedAuth.image?{imageRecipe:vendorResourceCatalog.managedAuth.id}:{}),
        sourceCommit:vendorResourceCatalog.entries.find(e=>e.id===expected.adapter).commit});
    }
  }
  const unresolvedConsumers=[];
  for(const db of budget.databases)for(const c of db.consumers){
    const actual=counts.get(db.id+'/'+c.id);
    if(actual!==undefined&&actual!==c.replicas)fail('RESOURCE_VENDOR_REPLICA_MISMATCH');
    if(actual===undefined&&c.replicas>0)unresolvedConsumers.push({databaseId:db.id,consumerId:c.id,replicas:c.replicas,reason:'consumer_plan_not_bound'});
  }
  if(loadResourceBudgetSnapshot(manifest.budgetFile).sha256!==snapshot.sha256)fail('RESOURCE_VENDOR_PROFILE_MISMATCH');
  const fullyCovered=unresolvedServices.length===0&&unresolvedConsumers.length===0;
  return {schemaVersion:1,mode:'consumer-plan',consumerPlanChecked:true,fullyCovered,environment:manifest.environment,budgetSha256:snapshot.sha256,
    manifestObjectSha256:hash(JSON.stringify(manifest)),vendorCatalogId:vendorResourceCatalog.id,vendorCatalogSha256:hash(JSON.stringify(vendorResourceCatalog)),
    services,unresolvedServices,unresolvedConsumers,nativePlanChecked:native!==null,
    sourceToImageProvenanceVerified:false,runtimeVerified:false,databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,
    limitations:['Only declared Compose projects and reviewed native/Auth/PostgREST/Storage PLAN recipes were checked. Realtime has partial inventory only; unresolved services and consumers are not treated as zero.',
      'PostgREST listener adds a separate planned connection. Auth requires an explicit finite pool and disabled percentage overrides.',
      'Configured target fingerprints are not live database identity, loaded runtime settings, provider pool inventories, or physical server capacity.',
      'Registry digests bind recipe images; independent source-to-image provenance, full-stack runtime, upgrade/restart overlap and workload acceptance remain separate.'],
    acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}
