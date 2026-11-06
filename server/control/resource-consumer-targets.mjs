// A separate opt-in read-only check. Unlike PLAN, this reads configured app
// credentials and opens bounded catalog sessions. It never proves that an
// already running process has loaded these same credentials or uses a direct
// endpoint for every future transaction.
import {createHash} from 'node:crypto';
import {isAbsolute,posix,join,resolve} from 'node:path';
import {resourceConsumerManifest,preflightResourceConsumers} from './resource-vendor.mjs';
import {resourceDatabaseManifest,resourceDatabaseConnection,readResourceDatabaseTarget,
 validateResourceDatabaseObservation,accountResourceDatabaseServers} from './resource-database.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const role=v=>typeof v==='string'&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=63&&!/[\x00-\x1f\x7f]/.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>JSON.stringify(v,(_k,o)=>o&&typeof o==='object'&&!Array.isArray(o)?Object.fromEntries(Object.keys(o).sort().map(k=>[k,o[k]])):o);
const key=v=>[v.project,v.service,v.databaseId,v.consumerId].join('/');
const invalid=()=>fail('RESOURCE_CONSUMER_TARGET_MANIFEST_INVALID');
const namespaceKeys=['systemIdentifier','databaseOid','databaseName','maxConnections','reservedConnections','postmasterStartedAt'];

export function resourceConsumerTargetManifest(raw){
 if(!exact(raw,['schemaVersion','consumerManifest','databaseManifest','bindings'])||raw.schemaVersion!==1
  ||!Array.isArray(raw.bindings)||raw.bindings.length>128)invalid();
 const consumer=resourceConsumerManifest(raw.consumerManifest),database=resourceDatabaseManifest(raw.databaseManifest);
 if(consumer.environment!==database.environment||resolve(consumer.budgetFile)!==resolve(database.budgetFile)
  ||consumer.budgetSha256!==database.budgetSha256)invalid();
 const seen=new Set();for(const binding of raw.bindings){
  if(!exact(binding,['project','service','databaseId','consumerId','role'])||![binding.project,binding.service,binding.databaseId,binding.consumerId].every(id)
   ||!role(binding.role)||seen.has(key(binding)))invalid();seen.add(key(binding));
 }
 return {schemaVersion:1,consumerManifest:consumer,databaseManifest:database,bindings:structuredClone(raw.bindings)};
}

function fileSource(target,service,project,{directory=false}={}){
 if(typeof target!=='string'||!target.startsWith('/')||posix.normalize(target)!==target||/[\\\x00-\x1f]/.test(target))
  fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
 const matches=[];
 for(const mount of service.volumes??[]){
  if(mount.target!==target&&!(directory&&target.startsWith(mount.target+'/')))continue;
  if(mount.type!=='bind'||mount.read_only!==true||mount.bind?.create_host_path!==false||!isAbsolute(mount.source))
   fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
  const suffix=target.slice(mount.target.length+1);
  if(mount.target!==target&&(suffix.includes('/')||!suffix))fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
  matches.push(mount.target===target?mount.source:join(mount.source,suffix));
 }
 for(const entry of service.secrets??[]){
  const secret=typeof entry==='string'?{source:entry}:entry;
  let destination=secret.target??secret.source;if(typeof destination!=='string')fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
  if(!destination.startsWith('/'))destination='/run/secrets/'+destination;
  if(destination!==target)continue;
  const definition=project.secrets?.[secret.source];
  if(!definition||definition.external||typeof definition.file!=='string'||!isAbsolute(definition.file))fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
  matches.push(definition.file);
 }
 if(matches.length!==1)fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');return matches[0];
}

async function configuredDsn(s,target,service,project,read){
 const env=service.environment??{};
 if(Object.keys(env).some(k=>/^PG(?!RST_)[A-Z_]+$/.test(k)&&env[k]))fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
 if(s.scope==='vendor'){
  if(!['auth','rest'].includes(s.adapter))return null;
  const uri=env[s.adapter==='auth'?'GOTRUE_DB_DATABASE_URL':'PGRST_DB_URI'];
  if(typeof uri!=='string')fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');return uri;
 }
 if(s.adapter==='control-api'){
  if(typeof env.ROOMQC_CONTROL_DATABASE_URL!=='string')fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');return env.ROOMQC_CONTROL_DATABASE_URL;
 }
 const fileEnv={'health-worker':'ROOMQC_HEALTH_DATABASE_URL_FILE','probe-catalog':'ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE',
  'alert-worker':'ROOMQC_ALERT_DATABASE_URL_FILE','provisioning-worker':'ROOMQC_SETUP_DATABASE_URL_FILE'};
 if(fileEnv[target.consumerId])return read(fileSource(env[fileEnv[target.consumerId]],service,project),8192,true);
 if(s.adapter==='external-notifications'){
  const raw=JSON.parse(await read(fileSource('/etc/roomqc/booking-external.json',service,project),65536,false));
  // The attestor's TLS path does not load a provider-specific CA. Never ignore
  // a configured CA and claim its connection semantics were reproduced.
  if(raw.databaseCaFile)return null;
  return read(fileSource(raw.databaseUrlFile,service,project),8192,true);
 }
 if(s.adapter==='summary-credential-rotation'){
  const policy=JSON.parse(await read(fileSource('/etc/roomqc/rotation.json',service,project),32768,false));
  const raw=JSON.parse(await read(fileSource(policy.installerConfigFile,service,project,{directory:true}),131072,false));
  const kind=target.kind;
  if(raw[kind]?.expected?.role!==target.role)fail('RESOURCE_CONSUMER_TARGET_ROLE_MISMATCH');
  return read(fileSource(raw[kind]?.dsnFile,service,project,{directory:true}),8192,true);
 }
 return null;
}

export async function attestResourceConsumerTargets(raw,{resolveProject,readTarget=readResourceDatabaseTarget,
 readFile=(file,max,sensitive)=>boundedHealthFile(file,max,{sensitive})}={}){
 const manifest=resourceConsumerTargetManifest(raw),cm=manifest.consumerManifest,dm=manifest.databaseManifest;
 if(typeof resolveProject!=='function')fail('RESOURCE_CONSUMER_TARGET_RESOLVER_REQUIRED');
 const snapshot=loadResourceBudgetSnapshot(cm.budgetFile),budget=snapshot.budget;
 if(snapshot.sha256!==cm.budgetSha256)fail('RESOURCE_CONSUMER_TARGET_PROFILE_MISMATCH');
 if(dm.databases.length!==budget.databases.length||budget.databases.some(d=>!dm.databases.some(e=>e.databaseId===d.id)))
  fail('RESOURCE_CONSUMER_TARGET_MAPPING_MISMATCH');
 for(const d of budget.databases){const c=d.consumers.find(c=>c.id==='resource-attestor');
  if(!c||c.replicas!==1||c.pools.length!==1||c.pools[0].max!==1||c.fixedConnectionsPerReplica!==0)
   fail('RESOURCE_DATABASE_ATTESTOR_UNACCOUNTED');
 }
 const projects=new Map(),files=new Map();
 const read=async(file,max,sensitive)=>{
  let text;try{text=await readFile(file,max,sensitive)}catch{fail('RESOURCE_CONSUMER_TARGET_FILE_INVALID')}
  if(typeof text!=='string')fail('RESOURCE_CONSUMER_TARGET_FILE_INVALID');
  const digest=hash(text),previous=files.get(file);
  if(previous&&previous.digest!==digest)fail('RESOURCE_CONSUMER_TARGET_FILE_DRIFT');
  files.set(file,{digest,max:Math.max(max,previous?.max??0),sensitive:sensitive||previous?.sensitive===true});return text;
 };
 const resolver=async project=>{
  const resolved=await resolveProject(project);projects.set(project.id,{input:project,resolved:structuredClone(resolved),digest:hash(canonical(resolved))});return resolved;
 };
 const plan=await preflightResourceConsumers(cm,{resolveProject:resolver}),targets=[],unresolvedTargets=[],known=new Set();
 for(const service of plan.services){
  if(service.plannedReplicas===0)continue;
  if(service.scope==='vendor'&&!service.poolPlanVerified){
   unresolvedTargets.push({project:service.project,service:service.service,reason:'consumer_recipe_unresolved'});continue;
  }
  const databases=service.scope==='vendor'?[{databaseId:service.databaseId,consumers:[{id:service.resources.consumerId}]}]
   :service.resources.schemaVersion===2?service.resources.databases:[service.resources];
  for(const database of databases)for(const consumer of database.consumers){
   const identity={project:service.project,service:service.service,databaseId:database.databaseId,consumerId:consumer.id};known.add(key(identity));
   const binding=manifest.bindings.find(b=>key(b)===key(identity));
   if(!binding){unresolvedTargets.push({...identity,reason:'expected_login_missing'});continue}
   const entry=dm.databases.find(d=>d.databaseId===binding.databaseId),db=budget.databases.find(d=>d.id===binding.databaseId);
   if(!entry||!db)fail('RESOURCE_CONSUMER_TARGET_MAPPING_MISMATCH');
   const project=projects.get(service.project).resolved,configured=project.services[service.service];
   let dsn;try{dsn=await configuredDsn(service,{...binding,kind:db.kind},configured,project,read)}catch(error){
    if(/^RESOURCE_/.test(error?.code??''))throw error;fail('RESOURCE_CONSUMER_TARGET_SOURCE_INVALID');
   }
   if(dsn===null){unresolvedTargets.push({...identity,reason:'connection_recipe_unresolved'});continue}
   const expected={...entry.expected,role:binding.role};
   targets.push({...identity,expected,config:resourceDatabaseConnection(dsn,{expected},cm.environment)});
  }
 }
 if(manifest.bindings.some(b=>!known.has(key(b))))fail('RESOURCE_CONSUMER_TARGET_MAPPING_MISMATCH');
 if(targets.length>128)fail('RESOURCE_CONSUMER_TARGET_LIMIT');
 // Prepare all credentials before opening any session. App credentials are
 // read from the validated service configuration, never from a convenient
 // second caller-supplied DSN file.
 const attestors=[];for(const entry of dm.databases){
  const secret=await read(entry.dsnFile,8192,true);
  attestors.push({...entry,config:resourceDatabaseConnection(secret,entry,cm.environment)});
 }
 const first=new Map(),observations=new Map();
 async function observe(config){try{return await readTarget(config)}catch{fail('RESOURCE_CONSUMER_TARGET_READ_FAILED')}}
 for(let pass=0;pass<2;pass++){
  for(const entry of attestors){
   const observed=await observe(entry.config),database=budget.databases.find(d=>d.id===entry.databaseId);
   validateResourceDatabaseObservation(observed,entry,database);
   if(pass===0)observations.set(entry.databaseId,observed);
   else if(canonical(observed)!==canonical(observations.get(entry.databaseId)))fail('RESOURCE_CONSUMER_TARGET_OBSERVATION_DRIFT');
  }
  for(const target of targets){
   const observed=await observe(target.config),database=budget.databases.find(d=>d.id===target.databaseId),reference=observations.get(target.databaseId);
   validateResourceDatabaseObservation(observed,{expected:target.expected},database,{application:true});
   if(namespaceKeys.some(k=>observed[k]!==reference[k]))fail('RESOURCE_CONSUMER_TARGET_SERVER_MISMATCH');
   if(pass===0)first.set(key(target),observed);
   else if(canonical(observed)!==canonical(first.get(key(target))))fail('RESOURCE_CONSUMER_TARGET_OBSERVATION_DRIFT');
  }
 }
 const servers=accountResourceDatabaseServers(budget,dm.databases,observations);
 for(const [file,version]of files){const text=await read(file,version.max,version.sensitive);if(hash(text)!==version.digest)fail('RESOURCE_CONSUMER_TARGET_FILE_DRIFT')}
 let composeDrift=false;
 const finalPlan=await preflightResourceConsumers(cm,{resolveProject:async project=>{
  const resolved=await resolveProject(project);
  if(hash(canonical(resolved))!==projects.get(project.id).digest)composeDrift=true;return resolved;
 }});
 if(composeDrift)fail('RESOURCE_CONSUMER_TARGET_COMPOSE_DRIFT');
 if(canonical(finalPlan)!==canonical(plan)||loadResourceBudgetSnapshot(cm.budgetFile).sha256!==snapshot.sha256)
  fail('RESOURCE_CONSUMER_TARGET_PROFILE_MISMATCH');
 const bindings=targets.map(target=>{const o=first.get(key(target));return {project:target.project,service:target.service,
  databaseId:target.databaseId,consumerId:target.consumerId,roleSha256:hash(o.role),lineageSha256:hash(o.systemIdentifier),
  databaseIdentitySha256:hash(canonical({systemIdentifier:o.systemIdentifier,databaseOid:o.databaseOid,databaseName:o.databaseName}))}});
 return {schemaVersion:1,mode:'configured-consumer-targets',environment:cm.environment,budgetSha256:snapshot.sha256,
  configuredTargetsChecked:true,allConfiguredTargetsVerified:bindings.length>0&&unresolvedTargets.length===0,bindings,unresolvedTargets,
  unresolvedServices:plan.unresolvedServices,unresolvedConsumers:plan.unresolvedConsumers,servers,
  observationsPerTarget:2,maxSimultaneousCheckerConnections:1,checkerConnectionsAccounted:true,
  configuredPlanFullyCovered:plan.fullyCovered,applicationConnectionNamespaceVerified:false,sourceToImageProvenanceVerified:false,runtimeVerified:false,databaseIdentityVerified:false,
  capacityProven:false,deploymentReady:false,
  limitations:['Configured DSNs were read from the validated Compose service and queried using their declared application LOGIN, plus separately restricted attestor sessions.',
   'One read-only catalog session at a time uses the explicitly reserved resource-attestor slot. Do not run this checker concurrently or borrow runtime pool slots.',
   'Application role memberships may be legitimate and are not a complete indirect-rights review. Elevated role attributes and role/session mismatch are rejected.',
   'This does not inspect loaded application pools, prove endpoint directness or exclude role/transaction-dependent proxies. Running-process and topology binding remain separate.',
   'DNS and loopback resolve from the checker network namespace. Sharing the intended application namespace must be reviewed and verified separately; it is not inferred from matching URL text.',
   'Only supplied projects and supported connection recipes are covered; unresolved paths, host resources, workload capacity and release acceptance remain open.'],
  acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}
