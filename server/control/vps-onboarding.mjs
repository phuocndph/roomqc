import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {hostPreflightReady} from './registry.mjs';
import {validateHostInventory} from './host-inventory.mjs';

const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const digestPattern=/^[a-z0-9][a-z0-9._/-]{0,127}@sha256:[a-f0-9]{64}$/i;
const invalid=(code='VPS_ONBOARDING_INVALID',message=code)=>Object.assign(new Error(message),{code});

const sha256=value=>createHash('sha256').update(value).digest('hex');

export function pinnedImage(value){
  if(typeof value!=='string'||!digestPattern.test(value.trim()))throw invalid('VPS_ONBOARDING_IMAGE_NOT_PINNED','Image phải dùng digest sha256 cố định.');
  return value.trim();
}

export function onboardingArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw invalid('VPS_ONBOARDING_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values=new Map();
  for(let index=0;index<args.length;index++){
    const key=args[index];
    if(!['--inventory-file','--cluster-id','--release-id','--image','--compose-file','--output','--mode'].includes(key)
      ||values.has(key)||typeof args[index+1]!=='string'||!args[index+1].trim())throw invalid('VPS_ONBOARDING_ARGUMENTS_INVALID');
    values.set(key,args[++index].trim());
  }
  for(const key of ['--inventory-file','--cluster-id','--release-id','--image','--compose-file'])
    if(!values.has(key))throw invalid('VPS_ONBOARDING_ARGUMENTS_INVALID');
  const inventoryFile=values.get('--inventory-file'),composeFile=values.get('--compose-file');
  if(!isAbsolute(inventoryFile)||!isAbsolute(composeFile))throw invalid('VPS_ONBOARDING_PATH_INVALID');
  const clusterId=values.get('--cluster-id'),releaseId=values.get('--release-id');
  if(!idPattern.test(clusterId)||!idPattern.test(releaseId))throw invalid('VPS_ONBOARDING_ID_INVALID');
  const mode=values.get('--mode')??'plan';
  if(!['plan','fixture','execute'].includes(mode))throw invalid('VPS_ONBOARDING_MODE_INVALID');
  const image=pinnedImage(values.get('--image'));
  const output=values.get('--output');
  if(output!==undefined&&!isAbsolute(output))throw invalid('VPS_ONBOARDING_OUTPUT_INVALID');
  return {inventoryFile,clusterId,releaseId,image,composeFile,mode,output};
}

export function summarizeCompose(source,{image}={}){
  if(typeof source!=='string'||source.length<1||source.length>1024*1024)throw invalid('VPS_ONBOARDING_COMPOSE_INVALID');
  if(/(?:service_role|sb_secret_|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s]+)/i.test(source))
    throw invalid('VPS_ONBOARDING_COMPOSE_SECRET','Compose không được chứa khóa hoặc chuỗi kết nối bí mật.');
  const pinned=pinnedImage(image);
  if(!source.includes(pinned))throw invalid('VPS_ONBOARDING_COMPOSE_IMAGE_MISMATCH','Compose chưa ghim đúng image digest.');
  return {sha256:sha256(source),bytes:Buffer.byteLength(source),image:pinned};
}

function candidateFromDocument(document,clusterId,allowLocal){
  if(!document||typeof document!=='object'||!Array.isArray(document.inventory))throw invalid('VPS_ONBOARDING_INVENTORY_INVALID');
  try{validateHostInventory(document,{allowLocal})}catch(error){throw invalid(error.code??'VPS_ONBOARDING_INVENTORY_INVALID');}
  const entry=document.inventory.find(item=>item?.id===clusterId);
  if(!entry)throw invalid('VPS_ONBOARDING_CLUSTER_NOT_FOUND');
  if(!idPattern.test(entry.hostId)||entry.credentialRef===undefined)throw invalid('VPS_ONBOARDING_INVENTORY_INVALID');
  return entry;
}

/**
 * Build a redacted, server-side onboarding plan. It never contains credential
 * values and does not run SSH, Docker, database or provider commands.
 */
export function buildOnboardingPlan(document,options,{now=new Date(),allowLocal=false,compose}={}){
  const candidate=candidateFromDocument(document,options.clusterId,allowLocal);
  const capturedAt=candidate.preflight?.capturedAt??null;
  const ready=candidate.environment==='local'||hostPreflightReady(candidate.preflight,now.getTime());
  const reasons=[];
  if(!ready)reasons.push('HOST_PREFLIGHT_REQUIRED');
  if(candidate.environment!=='local'&&!candidate.frontendReady)reasons.push('FRONTEND_RELEASE_NOT_READY');
  const phaseNames=['preflight','inventory_validation','release_stage','compose_pin','service_start','health_gate','backup_gate'];
  return {
    version:1,
    kind:'roomqc-vps-onboarding-plan',
    generatedAt:now.toISOString(),
    clusterId:candidate.id,
    hostId:candidate.hostId,
    environment:candidate.environment,
    providerLabel:candidate.providerLabel??null,
    region:candidate.region??null,
    releaseId:options.releaseId,
    image:options.image,
    compose:compose??null,
    preflight:{capturedAt,deploymentAllowed:candidate.preflight?.deploymentAllowed??(candidate.environment==='local'),
      diskFreePercent:candidate.preflight?.diskFreePercent??null,dockerServerVersion:candidate.preflight?.dockerServerVersion??null},
    phases:phaseNames,
    decision:reasons.length===0?'ready':'blocked',
    reasons,
    admission:'closed',
    sideEffects:{ssh:false,docker:false,database:false,provider:false,signupOpened:false},
  };
}

/**
 * Run a deterministic local fixture of the onboarding state machine. The
 * fixture is intentionally side-effect free and models both health success
 * and rollback after a failed health gate.
 */
export function runOnboardingFixture(plan,{health=true}={}){
  if(!plan||plan.kind!=='roomqc-vps-onboarding-plan')throw invalid('VPS_ONBOARDING_PLAN_INVALID');
  if(plan.decision!=='ready')return {version:1,kind:'roomqc-vps-onboarding-fixture',status:'blocked',planDecision:plan.decision,completedPhases:[],rollback:null,admission:'closed',sideEffects:plan.sideEffects};
  const completed=[];
  for(const phase of ['preflight','inventory_validation','release_stage','compose_pin','service_start'])completed.push(phase);
  if(!health)return {version:1,kind:'roomqc-vps-onboarding-fixture',status:'rolled_back',planDecision:plan.decision,
    completedPhases:completed,failedPhase:'health_gate',rollback:{performed:true,to:'inventory_validation',serviceStopped:true,stagedReleaseRemoved:true},admission:'closed',sideEffects:plan.sideEffects};
  completed.push('health_gate','backup_gate');
  return {version:1,kind:'roomqc-vps-onboarding-fixture',status:'health_gate_passed',planDecision:plan.decision,
    completedPhases:completed,failedPhase:null,rollback:{performed:false},admission:'closed',sideEffects:plan.sideEffects};
}

export function redactOnboardingPlan(plan){
  const copy=structuredClone(plan);
  if(copy?.credentials)delete copy.credentials;
  return copy;
}

export function inventoryFixture({environment='local',preflight,frontendReady=true}={}){
  return {version:1,credentials:[{ref:'cred-fixture',serviceKey:'fixture-private',publishableKey:'fixture-public',vapidPublicKey:'fixture-vapid'}],inventory:[{
    id:'cluster-fixture',hostId:'host-fixture',hostName:'Fixture host',region:'local',providerLabel:'fixture',environment,
    backendKind:'self_hosted',credentialRef:'cred-fixture',url:environment==='local'?'http://127.0.0.1:54321':'https://cluster-fixture.example.invalid',
    internalUrl:null,approvedAddresses:environment==='local'?['127.0.0.1']:['1.1.1.1'],frontendReady,...(preflight?{preflight}:{})
  }]};
}

export const onboardingContract={version:1,phases:['preflight','inventory_validation','release_stage','compose_pin','service_start','health_gate','backup_gate'],
  noBrowserSecrets:true,admissionClosedUntilHealth:true,rollbackOnHealthFailure:true};
