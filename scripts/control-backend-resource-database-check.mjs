import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {attestResourceDatabases} from '../server/control/resource-database.mjs';

const codes=new Set(['RESOURCE_DATABASE_MANIFEST_INVALID','RESOURCE_DATABASE_DSN_INVALID','RESOURCE_DATABASE_PROFILE_MISMATCH',
  'RESOURCE_DATABASE_ENVIRONMENT_MISMATCH','RESOURCE_DATABASE_MAPPING_MISMATCH','RESOURCE_DATABASE_ATTESTOR_UNACCOUNTED',
  'RESOURCE_DATABASE_OBSERVATION_INVALID','RESOURCE_DATABASE_IDENTITY_MISMATCH','RESOURCE_DATABASE_ROLE_MISMATCH',
  'RESOURCE_DATABASE_SETTINGS_MISMATCH','RESOURCE_DATABASE_DUPLICATE_TARGET','RESOURCE_DATABASE_LINEAGE_AMBIGUOUS',
  'RESOURCE_DATABASE_SERVER_OVERCOMMITTED','RESOURCE_DATABASE_SECRET_INVALID','RESOURCE_DATABASE_SECRET_DRIFT',
  'RESOURCE_DATABASE_READ_FAILED','RESOURCE_DATABASE_OBSERVATION_DRIFT','RESOURCE_DATABASE_ARGUMENTS_INVALID']);
export async function resourceDatabaseMain(args=process.argv.slice(2),{attest=attestResourceDatabases,output=process.stdout}={}){
  if(args.length===1&&args[0]==='--help'){
    output.write('RoomQC read-only database-target resource check\nUsage: node scripts/control-backend-resource-database-check.mjs --manifest ABSOLUTE_JSON\nUses explicitly mapped restricted attestor DSN files, one session at a time, two observations.\nExit 0: target identities/settings and conservative server accounting match; 1: failed.\nNo DDL, business writes, native/vendor DSN binding, capacity claim or release acceptance.\n');return 0;
  }
  try{
    if(args.length!==2||args[0]!=='--manifest'||!isAbsolute(args[1]))throw Object.assign(new Error(),{code:'RESOURCE_DATABASE_ARGUMENTS_INVALID'});
    const manifest=JSON.parse(await boundedHealthFile(args[1],128*1024));
    output.write(JSON.stringify(await attest(manifest))+'\n');return 0;
  }catch(error){
    const code=codes.has(error?.code)?error.code:'RESOURCE_DATABASE_CHECK_FAILED';
    output.write(JSON.stringify({schemaVersion:1,mode:'database-targets',databaseTargetsVerified:false,databaseIdentityVerified:false,
      observedServerBudgetsVerified:false,runtimeVerified:false,capacityProven:false,deploymentReady:false,code})+'\n');return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await resourceDatabaseMain();
