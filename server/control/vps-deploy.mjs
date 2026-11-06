import {createHash} from 'node:crypto';
import {buildOnboardingPlan, onboardingArguments, pinnedImage} from './vps-onboarding.mjs';
import {deploymentEnvironmentFiles} from './deployment-environment.mjs';

const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const invalid=(code='VPS_DEPLOY_INVALID',message=code)=>Object.assign(new Error(message),{code});
const shellQuote=value=>{
  if(typeof value!=='string'||!value||/[\u0000\r\n]/.test(value))throw invalid('VPS_DEPLOY_SHELL_VALUE_INVALID');
  return `'${value.replaceAll("'","'\\''")}'`;
};

export function deployArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw invalid('VPS_DEPLOY_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  const filtered=[],values=new Map();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(['--host','--user','--identity-file','--spec-id'].includes(key)){
      if(values.has(key)||typeof args[i+1]!=='string'||!args[i+1].trim())throw invalid('VPS_DEPLOY_ARGUMENTS_INVALID');
      values.set(key,args[++i]);
    }else filtered.push(key);
  }
  const parsed=onboardingArguments(filtered);
  if(parsed.help)return parsed;
  if(parsed.mode!=='plan'&&parsed.mode!=='execute')throw invalid('VPS_DEPLOY_MODE_INVALID');
  if(parsed.mode==='execute'&&(!values.has('--host')||!values.has('--user')))throw invalid('VPS_DEPLOY_EXECUTION_TARGET_REQUIRED');
  const specId=values.get('--spec-id')??null;
  if(specId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(specId))throw invalid('VPS_DEPLOY_ARGUMENTS_INVALID');
  return {...parsed,host:values.get('--host')??null,user:values.get('--user')??null,identityFile:values.get('--identity-file')??null,...(specId?{specId}:{})};
}

export function releasePaths(clusterId,releaseId){
  if(![clusterId,releaseId].every(value=>typeof value==='string'&&idPattern.test(value)))throw invalid('VPS_DEPLOY_RELEASE_INVALID');
  const clusterRoot=`/opt/RoomQC/clusters/${clusterId}`,root=`${clusterRoot}/releases`;
  return {clusterRoot,root,releaseDir:`${root}/${releaseId}`,composeFile:`${root}/${releaseId}/compose.json`,
    current:`${clusterRoot}/current`,lock:`${clusterRoot}/deploy.lock`,previousFile:`${clusterRoot}/current/compose.json`};
}

/** Bind a remote mutation to an inventory address before even probing SSH. */
export function assertDeploymentTarget(document,options){
  const entry=document?.inventory?.find(item=>item?.id===options.clusterId);
  if(!entry||!options.host||!Array.isArray(entry.approvedAddresses)
    ||entry.approvedAddresses.some(value=>typeof value!=='string')
    ||!entry.approvedAddresses.some(value=>value===options.host))throw invalid('VPS_DEPLOY_TARGET_MISMATCH');
  return entry;
}

/** A normalized Compose model, never a substring match on a YAML comment.
 * All services must be pinned, health checked and owned by this cluster. */
export function deploymentCompose(model,{clusterId,releaseId,image}){
  releasePaths(clusterId,releaseId);pinnedImage(image);
  if(!model||typeof model!=='object'||!model.services||Array.isArray(model.services)
    ||Object.keys(model.services).length<1||Object.keys(model.services).length>32
    ||model.include||model.models||model.secrets||model.configs)throw invalid('VPS_DEPLOY_COMPOSE_INVALID');
  const copy=structuredClone(model);delete copy.name;
  let found=false;
  for(const [name,service] of Object.entries(copy.services)){
    if(!/^[a-z][a-z0-9_-]{0,62}$/.test(name)||!service||typeof service!=='object')throw invalid('VPS_DEPLOY_COMPOSE_INVALID');
    pinnedImage(service.image);found ||= service.image===image;
    if(['build','extends','container_name','profiles','volumes_from','devices','device_cgroup_rules','provider','develop','post_start','pre_stop'].some(key=>Object.hasOwn(service,key))
      ||service.privileged||service.network_mode||service.pid||service.ipc||service.userns_mode||service.cgroup||service.use_api_socket
      ||service.cap_add?.length||service.deploy?.replicas>1||service.scale>1
      ||!service.healthcheck||service.healthcheck.disable||!Array.isArray(service.healthcheck.test)
      ||!['CMD','CMD-SHELL'].includes(service.healthcheck.test[0]))throw invalid('VPS_DEPLOY_SERVICE_UNSAFE');
    // Host files are prepared outside the release transaction, scoped to this
    // cluster and read-only. No Docker socket, host root or relative paths.
    for(const volume of service.volumes??[]){
      if(typeof volume!=='object'||!['bind','volume'].includes(volume.type))throw invalid('VPS_DEPLOY_VOLUME_UNSAFE');
      if(volume.type==='bind'&&(!volume.read_only||typeof volume.source!=='string'
        ||!volume.source.startsWith(`/opt/RoomQC/clusters/${clusterId}/config/`)||volume.source.split('/').includes('..')))
        throw invalid('VPS_DEPLOY_VOLUME_UNSAFE');
    }
    for(const [key,value] of Object.entries(service.environment??{})){
      if(value===null||value==='')continue;
      if(/_FILE$/i.test(key)){
        if(typeof value!=='string'||!value.startsWith('/run/')||value.split('/').includes('..'))throw invalid('VPS_DEPLOY_SECRET_FILE_INVALID');
      }else if(/(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY|SERVICE_KEY|DATABASE_URL|CONNECTION_STRING)/i.test(key))
        throw invalid('VPS_DEPLOY_COMPOSE_SECRET');
    }
    if(service.environment?.ROOMQC_CONTROL_SIGNUP_ENABLED!==undefined&&String(service.environment.ROOMQC_CONTROL_SIGNUP_ENABLED)!=='false')
      throw invalid('VPS_DEPLOY_SIGNUP_MUST_STAY_CLOSED');
    service.labels={...service.labels,'com.roomqc.cluster':clusterId,'com.roomqc.release':releaseId};
  }
  const environmentFiles=deploymentEnvironmentFiles(copy,clusterId);
  if(!found)throw invalid('VPS_DEPLOY_COMPOSE_IMAGE_MISMATCH');
  for(const entries of [copy.volumes,copy.networks])for(const [name,value] of Object.entries(entries??{})){
    if(value&&(value.external||(value.name&&value.name!==`roomqc-${clusterId}_${name}`)||value.driver_opts||value.driver&&value.driver!=='local'&&value.driver!=='bridge'))
      throw invalid('VPS_DEPLOY_SHARED_RESOURCE_UNSAFE');
    // Compose config materializes default names. Strip only an exact name
    // scoped to this project; an explicitly shared name remains forbidden.
    if(value)delete value.name;
  }
  const source=JSON.stringify(copy)+'\n';
  if(/\$\{|-----BEGIN [A-Z ]*PRIVATE KEY-----|sb_secret_|postgres(?:ql)?:\/\//i.test(source))throw invalid('VPS_DEPLOY_COMPOSE_SECRET');
  return {model:copy,source,sha256:createHash('sha256').update(source).digest('hex'),bytes:Buffer.byteLength(source),image,environmentFiles,
    services:Object.entries(copy.services).map(([name,service])=>({name,image:service.image}))};
}

export function buildReleasePlan({document,options,compose,preflight=null,host=null,now=new Date(),allowLocal=false}){
  if(!document||!Array.isArray(document.inventory))throw invalid('VPS_DEPLOY_INVENTORY_INVALID');
  const candidateDocument=preflight?structuredClone(document):document;
  const entry=candidateDocument.inventory.find(item=>item?.id===options.clusterId);
  if(!entry)throw invalid('VPS_DEPLOY_CLUSTER_NOT_FOUND');
  if(host)assertDeploymentTarget(candidateDocument,{...options,host});
  if(preflight&&(preflight.host!==host||!preflight.deploymentAllowed))throw invalid('VPS_DEPLOY_PREFLIGHT_MISMATCH');
  if(preflight)entry.preflight={capturedAt:preflight.capturedAt,deploymentAllowed:preflight.deploymentAllowed,
    diskFreePercent:preflight.rootFilesystem?.freePercent??null,dockerServerVersion:preflight.docker?.serverVersion??null};
  if(!compose?.services?.length||!compose.sha256||compose.image!==options.image)throw invalid('VPS_DEPLOY_COMPOSE_INVALID');
  const summary={sha256:compose.sha256,bytes:compose.bytes,image:compose.image};
  const base=buildOnboardingPlan(candidateDocument,options,{now,allowLocal,compose:summary});
  if(base.environment==='production'){
    base.decision='blocked';base.reasons.push('VPS_DEPLOY_PRODUCTION_GATES_REQUIRED');
  }
  const paths=releasePaths(options.clusterId,options.releaseId),project=`roomqc-${options.clusterId}`;
  const phases=['preflight','stage_release','validate_compose','start_release','health_gate','commit_release'];
  const commands=[
    `mkdir -p ${shellQuote(paths.releaseDir)}`,
    `docker compose --project-name ${shellQuote(project)} -f ${shellQuote(paths.composeFile)} config --quiet`,
    `docker compose --project-name ${shellQuote(project)} -f ${shellQuote(paths.composeFile)} up -d --wait --wait-timeout 90`,
  ];
  return {...base,kind:'roomqc-vps-release-plan',host:host??entry.approvedAddresses?.[0]??null,paths,project,services:compose.services,phases,commands,
    rollback:{previousCompose:paths.previousFile,stopNewRelease:true,restorePrevious:true,admission:'closed'},
    executeAllowed:base.decision==='ready',admission:'closed'};
}

/** Execute only through an injected remote adapter; the production adapter is
 * intentionally kept outside this pure state machine so tests cannot touch SSH. */
export async function executeReleasePlan(plan,{remote,health=true,onPhase=async()=>{}}={}){
  if(!plan||plan.kind!=='roomqc-vps-release-plan')throw invalid('VPS_DEPLOY_PLAN_INVALID');
  // The remote installer cannot independently close admission, validate the
  // full backup/restore or approve a business-schema upgrade. Production must
  // be wired to those authoritative gates before enabling its execute path.
  if(plan.environment==='production')return {status:'blocked',completedPhases:[],admission:'unchanged',rollback:null,errorCode:'VPS_DEPLOY_PRODUCTION_GATES_REQUIRED'};
  if(plan.decision!=='ready')return {status:'blocked',completedPhases:[],admission:'unchanged',rollback:null};
  if(!remote||typeof remote.stage!=='function'||typeof remote.validate!=='function'||typeof remote.start!=='function'||typeof remote.health!=='function'||typeof remote.rollback!=='function'||typeof remote.commit!=='function')throw invalid('VPS_DEPLOY_REMOTE_INVALID');
  const completed=[];let phase='stage_release',staged=false,started=false,committing=false,retainLock=false,committed=false;
  try{
    await onPhase(phase);await remote.stage(plan);staged=true;completed.push('stage_release');phase='validate_compose';
    await onPhase(phase);await remote.validate(plan);completed.push('validate_compose');
    phase='start_release';await onPhase(phase);started=true;await remote.start(plan);completed.push('start_release');phase='health_gate';
    await onPhase(phase);
    const healthy=health&&await remote.health(plan);
    if(!healthy)throw invalid('VPS_DEPLOY_HEALTH_FAILED');
    completed.push('health_gate');phase='commit_release';await onPhase(phase);committing=true;await remote.commit(plan);committed=true;completed.push('commit_release');
    return {status:'deployed',completedPhases:completed,failedPhase:null,admission:'unchanged',rollback:{performed:false}};
  }catch(error){
    // A lost commit reply is not proof that the commit failed. Preserve the
    // lock for operator reconciliation rather than rolling back a live release.
    if(committing)return {status:'outcome_unknown',completedPhases:completed,failedPhase:phase,admission:'unchanged',rollback:{performed:false},errorCode:'VPS_DEPLOY_COMMIT_RESULT_UNKNOWN'};
    let rollbackError=null;if(started)try{await remote.rollback(plan)}catch(value){rollbackError=value?.code??'ROLLBACK_FAILED';retainLock=true}
    return {status:rollbackError?'rollback_failed':started?'rolled_back':'not_started',completedPhases:completed,failedPhase:phase,admission:'unchanged',rollback:{performed:started&&!rollbackError,error:rollbackError},errorCode:error?.code??'VPS_DEPLOY_FAILED'};
  }finally{
    if(staged&&!retainLock&&(!committing||committed))await remote.release?.(plan).catch(()=>{});
    // Uncertain commits and failed rollbacks retain the lock for reconciliation.
  }
}

export function redactedReleasePlan(plan){
  const copy=structuredClone(plan);delete copy.credentials;delete copy.secrets;return copy;
}

export {shellQuote};
