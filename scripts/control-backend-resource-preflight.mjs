import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isAbsolute,dirname} from 'node:path';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {preflightResourceDeployment} from '../server/control/resource-deployment.mjs';

// Host interpolation is supplied only by the explicitly selected --env-file(s).
// Never inherit ROOMQC_*, COMPOSE_*, NODE_OPTIONS or an arbitrary process environment.
export function composePreflightEnvironment(env=process.env){
  const keys=['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','HOME','USERPROFILE','LOCALAPPDATA',
    'ProgramData','PROGRAMDATA','ProgramFiles','PROGRAMFILES','ProgramFiles(x86)','ALLUSERSPROFILE',
    'APPDATA','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_CERT_PATH','DOCKER_TLS_VERIFY'];
  return {...Object.fromEntries(keys.filter(k=>typeof env[k]==='string').map(k=>[k,env[k]])),COMPOSE_DISABLE_ENV_FILE:'true'};
}
export function resolveResourceCompose(project){
  const args=['compose','--project-name',project.id,'--project-directory',dirname(project.files[0])];
  for(const file of project.files)args.push('--file',file);
  for(const file of project.envFiles)args.push('--env-file',file);
  for(const profile of project.profiles)args.push('--profile',profile);
  args.push('config','--format','json');
  // The resolved document can contain credentials. Keep both stdout/stderr private.
  try{return JSON.parse(execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024,
    env:composePreflightEnvironment(),stdio:['ignore','pipe','pipe']}))}catch{throw new Error('RESOURCE_DEPLOYMENT_RESOLVE_FAILED')}
}
export async function resourcePreflightMain(args=process.argv.slice(2),{resolveProject=resolveResourceCompose,output=process.stdout}={}){
  if(args.length===1&&args[0]==='--help'){
    output.write('RoomQC read-only resource PLAN preflight\nUsage: node scripts/control-backend-resource-preflight.mjs --manifest ABSOLUTE_JSON\nExit 0: native plan fully covered; 2: valid native plan with uncovered consumers; 1: invalid/mismatch.\nNo start, build, pull, exec, deploy, DB connection, provider call or release acceptance.\n');return 0;
  }
  try{
    if(args.length!==2||args[0]!=='--manifest'||!isAbsolute(args[1]))throw new Error('RESOURCE_DEPLOYMENT_ARGUMENTS_INVALID');
    const manifest=JSON.parse(await boundedHealthFile(args[1],128*1024)),report=await preflightResourceDeployment(manifest,{resolveProject});
    output.write(JSON.stringify(report)+'\n');return report.fullyCovered?0:2;
  }catch(error){
    // Never print a caught Error: Docker/JSON errors may include DSNs or tokens.
    const safeCodes=['INVALID_RESOURCE_BUDGET','RESOURCE_CONNECTION_BUDGET','RESOURCE_RUNTIME_MISMATCH','RESOURCE_BUDGET_REQUIRED',
      'INVALID_HEALTH_CONFIG','INVALID_ALERT_CONFIG','HEALTH_CONNECTION_BUDGET',
      'RESOURCE_DEPLOYMENT_ARGUMENTS_INVALID','RESOURCE_DEPLOYMENT_MANIFEST_INVALID','RESOURCE_DEPLOYMENT_SCALE_INVALID',
      'RESOURCE_DEPLOYMENT_MOUNT_INVALID','RESOURCE_DEPLOYMENT_PROCESS_MISMATCH','RESOURCE_DEPLOYMENT_POOL_INVALID',
      'RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH','RESOURCE_DEPLOYMENT_PROFILE_MISMATCH','RESOURCE_DEPLOYMENT_METADATA_INVALID',
      'RESOURCE_DEPLOYMENT_RESOLVER_REQUIRED','RESOURCE_DEPLOYMENT_RESOLVE_FAILED','RESOURCE_DEPLOYMENT_UNCLASSIFIED_SERVICE','RESOURCE_DEPLOYMENT_REPLICA_MISMATCH'];
    const code=safeCodes.includes(error?.code)?error.code:'RESOURCE_DEPLOYMENT_PREFLIGHT_FAILED';
    output.write(JSON.stringify({schemaVersion:1,mode:'plan',nativePlanVerified:false,deploymentReady:false,code})+'\n');return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourcePreflightMain();
