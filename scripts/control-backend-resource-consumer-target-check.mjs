import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {attestResourceConsumerTargets} from '../server/control/resource-consumer-targets.mjs';
import {resolveResourceCompose} from './control-backend-resource-preflight.mjs';

export async function resourceConsumerTargetMain(args=process.argv.slice(2),{attest=attestResourceConsumerTargets,resolveProject=resolveResourceCompose,output=process.stdout}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC configured consumer database-target check\nUsage: node scripts/control-backend-resource-consumer-target-check.mjs --manifest ABSOLUTE_JSON\nReads app DSNs from reviewed Compose configuration; opens sequential read-only catalog sessions with those LOGINs and restricted attestors.\nNo DDL/business writes, grants, deployment or provider calls. Does not prove loaded runtime pools or direct endpoint topology.\nExit0 all declared configured targets verified; exit2 checked with missing/unsupported targets; exit1 failure. Consumer inventory/capacity/release remain separate.\n');return 0;
 }
 try{
  if(args.length!==2||args[0]!=='--manifest'||!isAbsolute(args[1]))throw Object.assign(new Error(),{code:'RESOURCE_CONSUMER_TARGET_ARGUMENTS_INVALID'});
  const report=await attest(JSON.parse(await boundedHealthFile(args[1],256*1024)),{resolveProject});
  output.write(JSON.stringify(report)+'\n');return report.allConfiguredTargetsVerified?0:2;
 }catch(error){
  const safe=/^RESOURCE_(?:CONSUMER_TARGET_(?:MANIFEST_INVALID|RESOLVER_REQUIRED|PROFILE_MISMATCH|MAPPING_MISMATCH|SOURCE_INVALID|ROLE_MISMATCH|FILE_INVALID|FILE_DRIFT|LIMIT|READ_FAILED|OBSERVATION_DRIFT|SERVER_MISMATCH|COMPOSE_DRIFT|ARGUMENTS_INVALID)|DATABASE_(?:ATTESTOR_UNACCOUNTED|DSN_INVALID|OBSERVATION_INVALID|IDENTITY_MISMATCH|ROLE_MISMATCH|SETTINGS_MISMATCH|DUPLICATE_TARGET|LINEAGE_AMBIGUOUS|SERVER_OVERCOMMITTED))$/;
  output.write(JSON.stringify({schemaVersion:1,mode:'configured-consumer-targets',configuredTargetsChecked:false,allConfiguredTargetsVerified:false,
   runtimeVerified:false,databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,
   code:safe.test(error?.code??'')?error.code:'RESOURCE_CONSUMER_TARGET_CHECK_FAILED'})+'\n');return 1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourceConsumerTargetMain();
