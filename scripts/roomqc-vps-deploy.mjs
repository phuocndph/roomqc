import {writeFile,open} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {collectVpsPreflight,preflightArguments} from './roomqc-vps-preflight.mjs';
import {deployArguments,buildReleasePlan,redactedReleasePlan,deploymentCompose,assertDeploymentTarget} from '../server/control/vps-deploy.mjs';
import {openDeploymentJournal,executeJournaledRelease} from '../server/control/deployment-journal.mjs';
import {readHostInventoryDocument} from '../server/control/host-inventory.mjs';
import {releaseRemoteAdapter} from './lib/vps-release-remote.mjs';
import {releaseApprovalEndpointFingerprint} from '../server/control/release-approval.mjs';
import {evidenceHash} from '../server/control/deployment-reconciliation.mjs';

function runSsh({host,user,identityFile},command,input,{timeoutMs=30000}={}){
  const args=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2','-o','StrictHostKeyChecking=yes'];
  if(identityFile)args.push('-i',identityFile);
  args.push(`${user}@${host}`,command);
  return new Promise((resolvePromise,reject)=>{
    const child=spawn('ssh',args,{windowsHide:true});let stdout='',stderr='',limited=false;
    const timer=setTimeout(()=>{limited=true;child.kill('SIGKILL')},timeoutMs);
    const limit=2*1024*1024;
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>limit){limited=true;child.kill('SIGKILL')}});
    child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>limit){limited=true;child.kill('SIGKILL')}});
    child.stdin.on('error',()=>{});
    child.once('error',error=>{clearTimeout(timer);reject(error)});
    child.once('close',(code,signal)=>{clearTimeout(timer);code===0&&!limited?resolvePromise({stdout,stderr}):reject(Object.assign(new Error('VPS_SSH_FAILED'),{code:limited?'VPS_SSH_LIMIT':'VPS_SSH_FAILED',exitCode:code,signal}))});
    if(input!==undefined){child.stdin.end(input)}else child.stdin.end();
  });
}

const remoteAdapter=(target,compose)=>releaseRemoteAdapter((...args)=>runSsh(target,...args),compose);

async function main(args=process.argv.slice(2),output=console){
  let journalRuntime,outputFile;
  const save=async value=>{
    const source=JSON.stringify(value,null,2)+'\n';
    await outputFile.truncate(0);await outputFile.write(source,0,'utf8');await outputFile.sync();
  };
  try{
    const parsed=deployArguments(args);
    if(parsed.help){output.log('Usage: node scripts/roomqc-vps-deploy.mjs --inventory-file ABSOLUTE_JSON --cluster-id CLUSTER_ID --release-id RELEASE_ID --image IMAGE@sha256:DIGEST --compose-file ABSOLUTE_COMPOSE [--mode plan|execute] [--host PUBLIC_IP --user SSH_USER --identity-file ABSOLUTE_KEY] [--spec-id PREPARED_SPEC_UUID] [--output ABSOLUTE_JSON]. Nonlocal execute requires the exact specification prepared by vps:executor.');return 0}
    const document=await readHostInventoryDocument(parsed.inventoryFile);
    if(parsed.mode==='execute')assertDeploymentTarget(document,parsed);
    const raw=await promisify(execFile)('docker',['compose','--project-name',`roomqc-${parsed.clusterId}`,'-f',parsed.composeFile,
      'config','--no-interpolate','--no-env-resolution','--no-path-resolution','--format','json'],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024,windowsHide:true});
    const compose=deploymentCompose(JSON.parse(raw.stdout),parsed);
    let preflight=null;
    if(parsed.mode==='execute'){
      const target=preflightArguments(['--host',parsed.host,'--user',parsed.user,...(parsed.identityFile?['--identity-file',parsed.identityFile]:[])]);
      preflight=await collectVpsPreflight(target);
      if(!preflight.deploymentAllowed)throw Object.assign(new Error('VPS_PREFLIGHT_BLOCKED'),{code:'VPS_PREFLIGHT_BLOCKED'});
    }
    const plan=redactedReleasePlan(buildReleasePlan({document,options:parsed,compose,preflight,host:parsed.host,allowLocal:process.env.NODE_ENV!=='production'&&process.env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true'}));
    let result={plan};
    if(parsed.mode==='execute'){
      if(plan.environment!=='local'&&!parsed.specId)throw Object.assign(new Error('DEPLOYMENT_SPEC_REQUIRED'),{code:'DEPLOYMENT_SPEC_REQUIRED'});
      if(parsed.output){outputFile=await open(resolve(parsed.output),'wx',0o600);await save({plan,status:'prepared'})}
      journalRuntime=await openDeploymentJournal();
      if(parsed.specId){
        const {executorDocument}=await import('./roomqc-vps-executor.mjs');
        const entry=assertDeploymentTarget(document,parsed),fingerprint=releaseApprovalEndpointFingerprint({url:entry.url,
          internalUrl:entry.internalUrl??null,approvedAddresses:entry.approvedAddresses??[],credentialRef:entry.credentialRef??entry.id});
        const found=await journalRuntime.journal.pool.query(`SELECT id FROM roomqc_control.deployment_specs
          WHERE id=$1 AND execution_sha256=$2 AND endpoint_fingerprint=$3 AND expires_at>clock_timestamp()`,
        [parsed.specId,evidenceHash(executorDocument(parsed,compose.sha256,parsed.specId)),fingerprint]);
        if(found.rowCount!==1)throw Object.assign(new Error('DEPLOYMENT_SPEC_CHANGED'),{code:'DEPLOYMENT_SPEC_CHANGED'});
      }
      result={plan,result:await executeJournaledRelease({...plan,specId:parsed.specId},{journal:journalRuntime.journal,
        remote:remoteAdapter({host:parsed.host,user:parsed.user,identityFile:parsed.identityFile},compose),
        onReserved:async runId=>{if(outputFile)await save({plan,runId,status:'awaiting_result'})}})};
    }
    if(outputFile)await save(result);
    else if(parsed.output)await writeFile(resolve(parsed.output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    output.log(JSON.stringify({ok:true,mode:parsed.mode,decision:plan.decision,status:result.result?.status??null,runId:result.result?.runId??null,output:parsed.output??null}));
    return plan.decision==='ready'&&(!result.result||result.result.status==='deployed')?0:2;
  }catch(error){output.error(JSON.stringify({ok:false,code:/^[A-Z][A-Z0-9_]{1,119}$/.test(error?.code??'')?error.code:'VPS_DEPLOY_FAILED'}));return 1}
  finally{await outputFile?.close().catch(()=>{});await journalRuntime?.close().catch(()=>{})}
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await main();
export {main,remoteAdapter,runSsh};
