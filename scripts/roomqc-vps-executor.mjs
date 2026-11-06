import {randomUUID} from 'node:crypto';
import {open,mkdir} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {deployArguments,assertDeploymentTarget,deploymentCompose,buildReleasePlan,redactedReleasePlan} from '../server/control/vps-deploy.mjs';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {readHostInventoryDocument} from '../server/control/host-inventory.mjs';
import {openDeploymentJournal} from '../server/control/deployment-journal.mjs';
import {DeploymentQueue,executeDeploymentJob,deploymentSpecView} from '../server/control/deployment-queue.mjs';
import {evidenceHash} from '../server/control/deployment-reconciliation.mjs';
import {uuidPattern} from '../server/control/errors.mjs';
import {preflightArguments,collectVpsPreflight} from './roomqc-vps-preflight.mjs';
import {remoteAdapter} from './roomqc-vps-deploy.mjs';
import {releaseApprovalEndpointFingerprint} from '../server/control/release-approval.mjs';

const invalid=code=>Object.assign(new Error(code),{code});
const allowLocal=()=>process.env.NODE_ENV!=='production'&&process.env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true';
function optionsArguments(value){
  return ['--inventory-file',value.inventoryFile,'--cluster-id',value.clusterId,'--release-id',value.releaseId,
    '--image',value.image,'--compose-file',value.composeFile,'--mode','execute','--host',value.host,'--user',value.user,
    ...(value.identityFile?['--identity-file',value.identityFile]:[])];
}
export function executorDocument(options,composeSha256,specId=randomUUID()){
  const normalized=deployArguments(optionsArguments(options));
  preflightArguments(['--host',normalized.host,'--user',normalized.user,...(normalized.identityFile?['--identity-file',normalized.identityFile]:[])]);
  if(!uuidPattern.test(specId)||!/^[a-f0-9]{64}$/.test(composeSha256))throw invalid('DEPLOYMENT_SPEC_INVALID');
  return {version:1,specId,options:normalized,composeSha256};
}
async function normalizedCompose(options){
  const result=await promisify(execFile)('docker',['compose','--project-name',`roomqc-${options.clusterId}`,'-f',options.composeFile,
    'config','--no-interpolate','--no-env-resolution','--no-path-resolution','--format','json'],
  {encoding:'utf8',timeout:15000,maxBuffer:1024*1024,windowsHide:true});
  return deploymentCompose(JSON.parse(result.stdout),options);
}
export async function prepareExecutorRelease(options,{probe=null,composeReader=normalizedCompose,local=allowLocal()}={}){
  const document=await readHostInventoryDocument(options.inventoryFile),entry=assertDeploymentTarget(document,options);
  const endpointFingerprint=releaseApprovalEndpointFingerprint({url:entry.url,internalUrl:entry.internalUrl??null,
    approvedAddresses:entry.approvedAddresses??[],credentialRef:entry.credentialRef??entry.id});
  const compose=await composeReader(options);
  const preflight=probe?await probe(preflightArguments(['--host',options.host,'--user',options.user,
    ...(options.identityFile?['--identity-file',options.identityFile]:[])])):null;
  const plan=redactedReleasePlan(buildReleasePlan({document,options,compose,preflight,host:options.host,allowLocal:local}));
  if(!plan.executeAllowed||plan.environment==='production')throw invalid('DEPLOYMENT_TARGET_NOT_READY');
  return {plan,compose,endpointFingerprint};
}
export async function publishExecutorSpec(pool,directory,options,deps){
  if(!isAbsolute(directory))throw invalid('DEPLOYMENT_SPEC_DIRECTORY_INVALID');
  const {plan,compose,endpointFingerprint}=await prepareExecutorRelease(options,deps),document=executorDocument(options,compose.sha256);
  await mkdir(directory,{recursive:true,mode:0o700});
  const file=await open(join(directory,document.specId+'.json'),'wx',0o600);
  try{await file.writeFile(JSON.stringify(document)+'\n');await file.sync()}finally{await file.close()}
  const result=await pool.query(`INSERT INTO roomqc_control.deployment_specs
    (id,cluster_id,host_id,environment,release_id,compose_sha256,execution_sha256,primary_image,service_images,endpoint_fingerprint,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,clock_timestamp()+interval '23 hours') RETURNING *`,
  [document.specId,plan.clusterId,plan.hostId,plan.environment,plan.releaseId,compose.sha256,evidenceHash(document),compose.image,JSON.stringify(compose.services.map(item=>item.image)),endpointFingerprint]);
  return deploymentSpecView(result.rows[0]);
}
export async function loadExecutorRelease(job,directory,deps={}){
  if(!isAbsolute(directory)||!uuidPattern.test(job.spec_id??''))throw invalid('DEPLOYMENT_SPEC_INVALID');
  let raw,document;
  try{
    raw=JSON.parse(await boundedHealthFile(join(directory,job.spec_id+'.json'),16384,{sensitive:true}));
    document=executorDocument(raw.options,raw.composeSha256,raw.specId);
    if(evidenceHash(raw)!==evidenceHash(document)||raw.specId!==job.spec_id||evidenceHash(document)!==job.execution_sha256)
      throw invalid('DEPLOYMENT_SPEC_CHANGED');
  }catch{throw invalid('DEPLOYMENT_SPEC_CHANGED')}
  const {plan,compose,endpointFingerprint}=await prepareExecutorRelease(document.options,{probe:collectVpsPreflight,...deps});
  if(compose.sha256!==job.compose_sha256||compose.sha256!==document.composeSha256)throw invalid('DEPLOYMENT_SPEC_CHANGED');
  if(job.endpoint_fingerprint!==endpointFingerprint)throw invalid('DEPLOYMENT_SPEC_CHANGED');
  return {plan,compose,remote:deps.remote??remoteAdapter(document.options,compose)};
}
export async function main(args=process.argv.slice(2),output=console){
  let runtime;
  try{
    if(args.length===1&&args[0]==='--help'){
      output.log('Usage: vps:executor check | prepare --spec-directory ABSOLUTE_DIR [vps:deploy target/release arguments] | run --spec-directory ABSOLUTE_DIR [--once]. Requires a bounded deployer LOGIN in private ROOMQC_DEPLOY_DATABASE_URL_FILE; nonlocal requires shared budget and LOGIN plan. No SSH in the API.');return 0;
    }
    if(args.length===1&&args[0]==='check'){
      runtime=await openDeploymentJournal();output.log(JSON.stringify({ok:true,mode:'readiness',readiness:runtime.readiness,resources:runtime.resources}));return 0;
    }
    const [action,...rest]=args,position=rest.indexOf('--spec-directory');
    if(!['prepare','run'].includes(action)||position<0||rest.lastIndexOf('--spec-directory')!==position||!isAbsolute(rest[position+1]??''))
      throw invalid('DEPLOYMENT_EXECUTOR_ARGUMENTS_INVALID');
    const directory=rest[position+1],remaining=rest.filter((_,index)=>index!==position&&index!==position+1);
    runtime=await openDeploymentJournal();
    if(action==='prepare'){
      const options=deployArguments(remaining);const spec=await publishExecutorSpec(runtime.journal.pool,directory,options);
      output.log(JSON.stringify({ok:true,spec}));return 0;
    }
    if(remaining.length>1||remaining.some(value=>value!=='--once'))throw invalid('DEPLOYMENT_EXECUTOR_ARGUMENTS_INVALID');
    const queue=new DeploymentQueue(runtime.journal.pool);let stopping=false;
    const stop=()=>{stopping=true};process.once('SIGTERM',stop);process.once('SIGINT',stop);
    try{
      do{
        const result=await executeDeploymentJob(queue,job=>loadExecutorRelease(job,directory));
        if(result)output.log(JSON.stringify({ok:true,jobId:result.id,runId:result.runId??null}));
        if(remaining.includes('--once')||stopping)break;
        await new Promise(resolve=>setTimeout(resolve,3000));
      }while(!stopping);
    }finally{process.off('SIGTERM',stop);process.off('SIGINT',stop)}
    return 0;
  }catch(error){output.error(JSON.stringify({ok:false,code:/^[A-Z][A-Z0-9_]{1,119}$/.test(error.code??'')?error.code:'DEPLOYMENT_EXECUTOR_FAILED'}));return 1}
  finally{await runtime?.close().catch(()=>{})}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await main();
