import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {inspectResourceDeployment,nativeResourceProbe} from '../server/control/resource-deployment-runtime.mjs';
import {composePreflightEnvironment,resolveResourceCompose} from './control-backend-resource-preflight.mjs';

function dockerJson(args,maxBuffer=8*1024*1024){
  try{return JSON.parse(execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer,
    env:composePreflightEnvironment(),stdio:['ignore','pipe','pipe']}))}catch{throw new Error('RESOURCE_RUNTIME_DOCKER_FAILED')}
}
export function inventoryResourceProject(project){
  let ids;try{ids=execFileSync('docker',['container','ls','--all','--no-trunc','--filter','label=com.docker.compose.project='+project.id,'--format','{{.ID}}'],{
    encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:128*1024,env:composePreflightEnvironment(),stdio:['ignore','pipe','pipe']}).split(/\r?\n/).filter(Boolean)}
  catch{throw new Error('RESOURCE_RUNTIME_INVENTORY_FAILED')}
  if(ids.length>256||ids.some(id=>!/^[a-f0-9]{64}$/.test(id))||new Set(ids).size!==ids.length)throw new Error('RESOURCE_RUNTIME_INVENTORY_FAILED');
  return ids.length?dockerJson(['container','inspect',...ids]):[];
}
export function inspectResourceImage(reference){const list=dockerJson(['image','inspect',reference],2*1024*1024);if(!Array.isArray(list)||list.length!==1)throw 0;return list[0]}
export function probeResourceContainer(id,{adapter,port}){
  if(!/^[a-f0-9]{64}$/.test(id)||!['control-api','health-worker','alert-worker','external-notifications','provisioning-worker','summary-credential-rotation'].includes(adapter)
    ||!Number.isInteger(port)||port<1||port>65535)throw new Error('RESOURCE_RUNTIME_PROBE_FAILED');
  return dockerJson(['exec',id,'/usr/local/bin/node','-e',nativeResourceProbe,adapter,String(port)],32768).resources;
}
export async function resourceRuntimeMain(args=process.argv.slice(2),{output=process.stdout,dependencies={resolveProject:resolveResourceCompose,
  inventoryProject:inventoryResourceProject,inspectImage:inspectResourceImage,probeContainer:probeResourceContainer}}={}){
  if(args.length===1&&args[0]==='--help'){
    output.write('RoomQC read-only native runtime resource inventory\nUsage: node scripts/control-backend-resource-runtime-check.mjs --manifest ABSOLUTE_JSON\nUses compose config, container list/inspect, image inspect and a fixed loopback-only Node probe via exec.\nNo start/stop/build/pull, DB connection or provider call. Exit0 native runtime complete in supplied budget; exit2 native verified but uncovered consumers; exit1 failure.\n');return 0;
  }
  try{
    if(args.length!==2||args[0]!=='--manifest'||!isAbsolute(args[1]))throw 0;
    const report=await inspectResourceDeployment(JSON.parse(await boundedHealthFile(args[1],128*1024)),dependencies);
    output.write(JSON.stringify(report)+'\n');return report.fullyCovered?0:2;
  }catch(error){
    const codes=['RESOURCE_RUNTIME_DEPENDENCY_REQUIRED','RESOURCE_RUNTIME_ADAPTER_UNSUPPORTED','RESOURCE_RUNTIME_INVENTORY_FAILED','RESOURCE_RUNTIME_INVENTORY_LIMIT',
      'RESOURCE_RUNTIME_UNEXPECTED_CONTAINER','RESOURCE_RUNTIME_CONTAINER_UNAVAILABLE','RESOURCE_RUNTIME_IMAGE_UNAVAILABLE','RESOURCE_RUNTIME_IMAGE_MISMATCH',
      'RESOURCE_RUNTIME_PROCESS_MISMATCH','RESOURCE_RUNTIME_ENVIRONMENT_MISMATCH','RESOURCE_RUNTIME_MOUNT_MISMATCH','RESOURCE_RUNTIME_NETWORK_MISMATCH',
      'RESOURCE_RUNTIME_REPLICA_MISMATCH','RESOURCE_RUNTIME_PROBE_FAILED','RESOURCE_RUNTIME_LOADED_PROFILE_MISMATCH','RESOURCE_RUNTIME_CHANGED_DURING_CHECK'];
    output.write(JSON.stringify({schemaVersion:1,mode:'runtime',nativeRuntimeVerified:false,deploymentReady:false,
      code:codes.includes(error?.code)?error.code:'RESOURCE_RUNTIME_CHECK_FAILED'})+'\n');return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourceRuntimeMain();
