import {createHash} from 'node:crypto';
import {releasePaths,assertDeploymentTarget} from './vps-deploy.mjs';
import {pinnedImage} from './vps-onboarding.mjs';
import {uuidPattern} from './errors.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const idPattern=/^[a-z][a-z0-9-]{1,39}$/;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const evidenceHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function reconciliationPlan(row,document,host){
  if(!row||!uuidPattern.test(row.id)||!idPattern.test(row.cluster_id)||!idPattern.test(row.release_id)
    ||!/^[a-f0-9]{64}$/.test(row.compose_sha256))throw fail('DEPLOYMENT_RECONCILIATION_INVALID');
  const entry=assertDeploymentTarget(document,{clusterId:row.cluster_id,host});
  if(entry.hostId!==row.host_id||entry.environment!==row.environment)throw fail('DEPLOYMENT_RECONCILIATION_TARGET_CHANGED');
  return {clusterId:row.cluster_id,hostId:row.host_id,environment:row.environment,releaseId:row.release_id,
    journalRunId:row.id,phaseIndex:row.phase_index,project:`roomqc-${row.cluster_id}`,compose:{sha256:row.compose_sha256},paths:releasePaths(row.cluster_id,row.release_id)};
}
export function checkedManifest(value,plan,releaseId){
  if(!value||value.version!==1||value.clusterId!==plan.clusterId||value.project!==plan.project||value.releaseId!==releaseId
    ||!/^[a-f0-9]{64}$/.test(value.composeSha256)||!Array.isArray(value.services)||value.services.length<1||value.services.length>32
    ||new Set(value.services.map(s=>s?.name)).size!==value.services.length
    ||value.services.some(s=>!s||!/^[a-z][a-z0-9_-]{0,62}$/.test(s.name)))throw fail('DEPLOYMENT_RECONCILIATION_MANIFEST_INVALID');
  for(const s of value.services)pinnedImage(s.image);
  if(value.previousRelease!==null&&!idPattern.test(value.previousRelease??''))throw fail('DEPLOYMENT_RECONCILIATION_MANIFEST_INVALID');
  return {version:1,clusterId:value.clusterId,project:value.project,releaseId:value.releaseId,composeSha256:value.composeSha256,
    services:value.services.map(s=>({name:s.name,image:s.image})),previousRelease:value.previousRelease};
}
export function reconciliationEvidence(plan,{currentRelease,candidate,current,containers,observedAt=new Date().toISOString()}){
  if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))||!Array.isArray(containers)||containers.length>32)throw fail('DEPLOYMENT_RECONCILIATION_INVALID');
  if(candidate){
    if(candidate.partial){
      if(plan.phaseIndex!==1)throw fail('DEPLOYMENT_RECONCILIATION_MANIFEST_INVALID');
    }else{
      const manifest=checkedManifest(candidate.manifest,plan,plan.releaseId);
      if(candidate.composeSha256!==plan.compose.sha256||manifest.composeSha256!==plan.compose.sha256)throw fail('DEPLOYMENT_RECONCILIATION_HASH_MISMATCH');
    }
  }
  let outcome='empty',manifest=null;
  if(currentRelease){
    if(!idPattern.test(currentRelease)||!current)throw fail('DEPLOYMENT_RECONCILIATION_CURRENT_INVALID');
    manifest=checkedManifest(current.manifest,plan,currentRelease);
    if(current.composeSha256!==manifest.composeSha256)throw fail('DEPLOYMENT_RECONCILIATION_HASH_MISMATCH');
    if(currentRelease===plan.releaseId){
      if(!candidate||candidate.partial||manifest.composeSha256!==plan.compose.sha256)throw fail('DEPLOYMENT_RECONCILIATION_HASH_MISMATCH');
      outcome='candidate_healthy';
    }else{
      if(candidate&&!candidate.partial&&candidate.manifest.previousRelease!==currentRelease)throw fail('DEPLOYMENT_RECONCILIATION_CURRENT_INVALID');
      outcome='previous_healthy';
    }
  }else if(current||containers.length)throw fail('DEPLOYMENT_RECONCILIATION_CURRENT_INVALID');
  const expected=new Map(manifest?.services.map(s=>[s.name,s])??[]),safe=[];
  for(const c of containers){
    const labels=c.Config?.Labels??{},service=labels['com.docker.compose.service'],wanted=expected.get(service);
    if(!wanted||!/^[a-f0-9]{64}$/.test(c.Id)||labels['com.docker.compose.project']!==plan.project
      ||labels['com.roomqc.cluster']!==plan.clusterId||labels['com.roomqc.release']!==currentRelease
      ||c.Config.Image!==wanted.image||!c.State?.Running||c.State?.Health?.Status!=='healthy'
      ||c.Config.Env?.some(v=>v.startsWith('ROOMQC_CONTROL_SIGNUP_ENABLED=')&&v!=='ROOMQC_CONTROL_SIGNUP_ENABLED=false'))
      throw fail('DEPLOYMENT_RECONCILIATION_CONTAINERS_INVALID');
    safe.push({id:c.Id,service,image:wanted.image,healthy:true});expected.delete(service);
  }
  if(expected.size)throw fail('DEPLOYMENT_RECONCILIATION_CONTAINERS_INVALID');
  safe.sort((a,b)=>a.service.localeCompare(b.service));
  const evidence={version:1,runId:plan.journalRunId,clusterId:plan.clusterId,hostId:plan.hostId,environment:plan.environment,
    releaseId:plan.releaseId,composeSha256:plan.compose.sha256,currentRelease:currentRelease??null,outcome,
    currentComposeSha256:manifest?.composeSha256??null,candidateIncomplete:candidate?.partial===true,containers:safe,observedAt};
  return {...evidence,evidenceSha256:evidenceHash(evidence)};
}
export async function reconcileDeployment({journal,runId,document,host,remote}){
  const row=await journal.read(runId),plan=reconciliationPlan(row,document,host);
  if(!remote||typeof remote.observe!=='function'||typeof remote.release!=='function')throw fail('DEPLOYMENT_RECONCILIATION_REMOTE_INVALID');
  // A saved resolution can safely retry only its own remote lock cleanup.
  const proof=row.resolution?null:await remote.observe(plan);
  const resolution=row.resolution??await journal.resolve(row,proof);
  let lockReleased=true;
  try{await remote.release(plan)}catch{lockReleased=false}
  return {runId,status:'resolved',resolution,lockReleased};
}
