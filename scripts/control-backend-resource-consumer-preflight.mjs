import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {preflightResourceConsumers} from '../server/control/resource-vendor.mjs';
import {resolveResourceCompose} from './control-backend-resource-preflight.mjs';
import {createManagedRealtimeVerifier} from './control-backend-realtime-image.mjs';
export async function resourceConsumerMain(args=process.argv.slice(2),{resolveProject=resolveResourceCompose,verifyManagedImage,output=process.stdout}={}){
  if(args.length===1&&args[0]==='--help'){
    output.write('RoomQC native + vendor consumer PLAN preflight\nUsage: node scripts/control-backend-resource-consumer-preflight.mjs --manifest ABSOLUTE_JSON [--verify-managed-builds]\nExit 0: declared native/vendor plan fully mapped to the supplied budget; 2: checked with unresolved services/consumers; 1: invalid.\nAuth, PostgREST and fixed-project file Storage require exact reviewed images and explicit settings. Storage reserves pubsub and startup migration separately. Realtime reports partial metadata/maintenance inventory and remains unresolved until persisted tenant/runtime/concurrency/slot/TLS paths are covered.\nDefault: Compose config only; no start/build/pull/exec or database connection. Opt-in --verify-managed-builds rebuilds the reviewed Realtime image without cache, may fetch its immutable base, and verifies installed public sources in a read-only network-none container. No deployment, provider call, capacity claim or release acceptance.\n');return 0;
  }
  try{
    if(![2,3].includes(args.length)||args[0]!=='--manifest'||!isAbsolute(args[1])
      ||args.length===3&&args[2]!=='--verify-managed-builds')throw Object.assign(new Error(),{code:'RESOURCE_VENDOR_ARGUMENTS_INVALID'});
    const raw=JSON.parse(await boundedHealthFile(args[1],128*1024)),report=await preflightResourceConsumers(raw,{resolveProject,
      verifyManagedImage:args.length===3?(verifyManagedImage??createManagedRealtimeVerifier()):undefined});
    output.write(JSON.stringify(report)+'\n');return report.fullyCovered?0:2;
  }catch(error){
    const allowed=new Set(['RESOURCE_VENDOR_MANIFEST_INVALID','RESOURCE_VENDOR_ARGUMENTS_INVALID','RESOURCE_VENDOR_REPLICA_MISMATCH',
      'RESOURCE_VENDOR_POOL_UNBOUNDED','RESOURCE_VENDOR_TARGET_INVALID','RESOURCE_VENDOR_PROCESS_MISMATCH','RESOURCE_VENDOR_BUDGET_MISMATCH',
      'RESOURCE_VENDOR_PASSWORD_GUARD_REQUIRED',
      'RESOURCE_VENDOR_PROFILE_MISMATCH','RESOURCE_VENDOR_ENVIRONMENT_MISMATCH','RESOURCE_VENDOR_RESOLVER_REQUIRED','RESOURCE_VENDOR_RESOLVE_FAILED','RESOURCE_VENDOR_UNCLASSIFIED_SERVICE',
      'RESOURCE_MANAGED_REALTIME_IMAGE_INVALID','RESOURCE_MANAGED_REALTIME_IMAGE_UNAVAILABLE','RESOURCE_MANAGED_REALTIME_REBUILD_FAILED',
      'RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH','RESOURCE_MANAGED_REALTIME_PROOF_INVALID']);
    output.write(JSON.stringify({schemaVersion:1,mode:'consumer-plan',consumerPlanChecked:false,fullyCovered:false,runtimeVerified:false,
      databaseIdentityVerified:false,capacityProven:false,deploymentReady:false,code:allowed.has(error?.code)?error.code:'RESOURCE_CONSUMER_PREFLIGHT_FAILED'})+'\n');return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourceConsumerMain();
