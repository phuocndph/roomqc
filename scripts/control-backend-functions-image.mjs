// Optional acceptance wiring for the real deployment image and gateway route.
// Keeps the exact-owned backend and SMTP capture; removes per-handler clones.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
export async function preparePackagedJourneyFunctions({repository,state,bundle,manifestFile,privateRun}){
 assert.equal(state.diagnosticOnly,true);assert.match(state.run,/^[a-f0-9]{12}$/);assert(isAbsolute(manifestFile));
 const raw=JSON.parse(await readFile(manifestFile,'utf8'));
 assert.equal(raw.kind,'roomqc-functions-deployment-image');assert.equal(raw.buildVerified,true);
 assert.match(raw.imageReference,/^roomqc\/functions@sha256:[a-f0-9]{64}$/);
 assert(Array.isArray(raw.sources)&&raw.sources.length>0&&raw.sources.length<1024);
 for(const f of raw.sources){
  assert(typeof f.path==='string'&&!isAbsolute(f.path)&&!f.path.split('/').includes('..')
   &&(/^(?:supabase\/functions|src\/lib\/mcp)\//.test(f.path)||['supabase/config.toml','package-lock.json'].includes(f.path)));
  assert.equal(createHash('sha256').update(await readFile(join(repository,f.path))).digest('hex'),f.sha256,'PACKAGED_FUNCTION_SOURCE_DRIFT');
 }
 const info=JSON.parse((await privateRun('docker',['image','inspect',raw.imageReference])).stdout)[0];
 assert.equal(info.Id,raw.imageId);assert.equal(info.Config.Labels['roomqc.functions.source'],raw.sourceHash);
 assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
 for(const name of Object.keys(bundle.services))if(!['db','auth','rest','realtime','storage','imgproxy','api-gw','functions'].includes(name))delete bundle.services[name];
 const service=bundle.services.functions;service.image=raw.imageReference;service.volumes=[];service.read_only=true;
 service.tmpfs=['/tmp:rw,nosuid,noexec,size=32m'];
 service.command=['start','--user-worker-request-idle-timeout','150000','--main-service','/home/deno/functions/main.eszip'];
 Object.assign(service.environment,{VERIFY_JWT:'true',ROOMQC_EMAIL_PROVIDER:'mailpit',ROOMQC_EMAIL_ENVIRONMENT:'local',
  ROOMQC_MAILPIT_URL:'http://api-gw:2525',ROOMQC_PUBLIC_URL:'http://127.0.0.1:8082'});
 state.imageLock=state.imageLock.filter(i=>i.service!=='functions');state.imageLock.push({service:'functions',tag:raw.tag,digest:raw.imageReference,imageId:raw.imageId,localReviewedBuild:true});
 state.packagedFunctions={imageReference:raw.imageReference,sourceHash:raw.sourceHash,functions:raw.packagedFunctions,
  sourceVerified:true,sourceMounted:false,perHandlerClones:false,normalGatewayRoutes:true};
}
