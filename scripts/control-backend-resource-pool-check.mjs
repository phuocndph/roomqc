import {execFileSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {inspectResourcePoolTargets,nativePoolResourceProbe} from '../server/control/resource-pool-inventory.mjs';
import {composePreflightEnvironment,resolveResourceCompose} from './control-backend-resource-preflight.mjs';
import {inventoryResourceProject,inspectResourceImage,probeResourceContainer} from './control-backend-resource-runtime-check.mjs';
export function probeResourcePoolContainer(id){
 if(!/^[a-f0-9]{64}$/.test(id))throw new Error('RESOURCE_POOL_PROBE_FAILED');
 try{return JSON.parse(execFileSync('docker',['exec',id,'/usr/local/bin/node','-e',nativePoolResourceProbe,'8098'],{
  encoding:'utf8',windowsHide:true,timeout:7000,maxBuffer:32768,env:composePreflightEnvironment(),stdio:['ignore','pipe','pipe']}))}
 catch{throw new Error('RESOURCE_POOL_PROBE_FAILED')}
}
export async function resourcePoolCheckMain(args=process.argv.slice(2),{output=process.stdout,inspect=inspectResourcePoolTargets,
 dependencies={resolveProject:resolveResourceCompose,inventoryProject:inventoryResourceProject,inspectImage:inspectResourceImage,
  probeContainer:probeResourceContainer,probePoolContainer:probeResourcePoolContainer}}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC native loaded-pool target samples\nUsage: node scripts/control-backend-resource-pool-check.mjs --manifest ABSOLUTE_JSON\nRequires opt-in ROOMQC_RESOURCE_POOL_OBSERVATIONS=true; private loopback8098. Samples actual runtime pools and restricted attestors.\nNo DDL/grants/start/stop/deploy/provider calls. Does not prove every pooled session, proxy directness, host capacity or release acceptance.\nExit0 mapped native pool samples verified; exit2 uncovered/disabled targets; exit1 failure.\n');return 0;
 }
 try{
  if(args.length!==2||args[0]!=='--manifest'||!isAbsolute(args[1]))throw Object.assign(new Error(),{code:'RESOURCE_POOL_ARGUMENTS_INVALID'});
  const report=await inspect(JSON.parse(await boundedHealthFile(args[1],256*1024)),dependencies);
  output.write(JSON.stringify(report)+'\n');return report.loadedPoolSamplesVerified?0:2;
 }catch(error){
  const code=/^RESOURCE_POOL_(?:ARGUMENTS_INVALID|MANIFEST_INVALID|DEPENDENCY_REQUIRED|MAPPING_MISMATCH|REFERENCE_INVALID|PROBE_FAILED|PROFILE_MISMATCH|OBSERVATION_DRIFT|TARGET_MISMATCH|REFERENCE_MISMATCH|REFERENCE_DRIFT|RUNTIME_DRIFT)$/.test(error?.code??'')?error.code:'RESOURCE_POOL_CHECK_FAILED';
  output.write(JSON.stringify({schemaVersion:1,mode:'native-loaded-pool-targets',loadedPoolSamplesVerified:false,runtimeVerified:false,
   databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,code})+'\n');return 1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourcePoolCheckMain();
