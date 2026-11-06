// Opt-in local build verification. Never accepts a label or caller-authored
// receipt as proof: recreate the exact image from current reviewed sources.
import {mkdtemp,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {prepareRealtimeImage,readRealtimeImageSources,realtimeBaseImage,realtimeSourceDateEpoch} from './build-realtime.mjs';
import {immutableRealtimeImage} from '../server/control/realtime-image-contract.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
async function run(command,args,{timeout=30000}={}){
  return new Promise((resolve,reject)=>execFile(command,args,{windowsHide:true,timeout,maxBuffer:8*1024*1024},
    (error,stdout)=>error?reject(new Error('REVIEWED_IMAGE_COMMAND_FAILED')):resolve({stdout})));
}
export function createManagedRealtimeVerifier({repository=fileURLToPath(new URL('../',import.meta.url)),privateRun=run}={}){
  let expectedBuild;
  return async image=>{
    if(!immutableRealtimeImage(image))fail('RESOURCE_MANAGED_REALTIME_IMAGE_INVALID');
    const before=await readRealtimeImageSources(repository);
    let actual;try{actual=JSON.parse((await privateRun('docker',['image','inspect',image])).stdout)[0]}
    catch{fail('RESOURCE_MANAGED_REALTIME_IMAGE_UNAVAILABLE')}
    if(!expectedBuild){
      expectedBuild=(async()=>{
        await mkdir(join(repository,'.local'),{recursive:true});
        const root=await mkdtemp(join(repository,'.local/realtime-plan-rebuild-'));
        return prepareRealtimeImage({repository,root,privateRun,noCache:true});
      })();
    }
    let build;try{build=await expectedBuild}catch{fail('RESOURCE_MANAGED_REALTIME_REBUILD_FAILED')}
    if(actual?.Id!==build.imageId||before.sourceHash!==build.sourceHash
      ||(await readRealtimeImageSources(repository)).sourceHash!==build.sourceHash)
      fail('RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH');
    const proof={schemaVersion:1,kind:'roomqc-realtime-build',imageRef:image,imageId:build.imageId,
      sourceHash:build.sourceHash,baseImage:realtimeBaseImage,sourceDateEpoch:realtimeSourceDateEpoch,
      rebuiltWithoutCache:true,deterministicImageMatch:true};
    return structuredClone(proof);
  };
}
