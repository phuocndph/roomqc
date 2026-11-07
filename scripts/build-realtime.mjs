// Product image builder: context contains only public reviewed sources.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {realtimeBaseImage,realtimeSourceDateEpoch,realtimeImageSources} from '../server/control/realtime-image-contract.mjs';
export {realtimeBaseImage,realtimeSourceDateEpoch,realtimeImageSources};
export async function readRealtimeImageSources(repository){
  const sources=[];
  for(const path of realtimeImageSources){const content=(await readFile(join(repository,path),'utf8')).replace(/\r\n/g,'\n');
    sources.push({path,sha256:createHash('sha256').update(content).digest('hex')})}
  const sourceHash=createHash('sha256').update(JSON.stringify({base:realtimeBaseImage,sourceDateEpoch:realtimeSourceDateEpoch,
    platform:'linux/amd64',rewriteTimestamp:true,sources})).digest('hex');
  return {sources,sourceHash};
}
export async function prepareRealtimeImage({repository,root,privateRun,noCache=false}){
  assert.equal(typeof noCache,'boolean');
  const context=join(root,'roomqc-realtime-image');await mkdir(context,{recursive:false});const sources=[];
  for(const path of realtimeImageSources){
    const content=(await readFile(join(repository,path),'utf8')).replace(/\r\n/g,'\n');
    sources.push({path,sha256:createHash('sha256').update(content).digest('hex')});
    await writeFile(join(context,path.split('/').at(-1)),content,{flag:'wx',mode:0o444});
  }
  const source=await readRealtimeImageSources(repository),{sourceHash}=source;
  assert.deepEqual(source.sources,sources,'Source cannot change while preparing the build context');
  // Concurrent builds of the same source must not race BuildKit's tag export.
  // The private context path is hashed; it never becomes a label/build input.
  const tag='roomqc/realtime:bootstrap-'+sourceHash.slice(0,16)+'-'+createHash('sha256').update(root).digest('hex').slice(0,12);
  await privateRun('docker',['build','--platform','linux/amd64','--provenance=false',
    '--output','type=image,rewrite-timestamp=true,unpack=false','--build-arg','SOURCE_DATE_EPOCH='+realtimeSourceDateEpoch,
    ...(noCache?['--no-cache']:[]),'--tag',tag,
    '--label','roomqc.realtime.source='+sourceHash,context],{timeout:300000});
  const info=JSON.parse((await privateRun('docker',['image','inspect',tag])).stdout)[0];
  assert.equal(info.Config.Labels?.['roomqc.realtime.source'],sourceHash);
  assert.equal(info.Config.User,'nobody');assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
  assert.equal(Date.parse(info.Created),realtimeSourceDateEpoch*1000,'Build clock cannot change the reviewed image');
  assert.deepEqual(info.Config.Entrypoint,['/usr/bin/tini','-s','-g','--','/app/run.sh']);
  assert.deepEqual(info.Config.Cmd,['/app/bin/server']);assert.match(info.Id,/^sha256:[a-f0-9]{64}$/);
  const verification=(await privateRun('docker',['run','--rm','--read-only','--network','none','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--label','roomqc.realtime-image.verify='+sourceHash,
    '--entrypoint','sh',info.Id,'-c',
    'set -eu; set -- /app/lib/realtime-*/priv/repo/seeds.exs; test "$#" -eq 1; sha256sum "$1" /opt/roomqc/bootstrap.exs /opt/roomqc/pool-guard.sql /opt/roomqc/extensions.ex /opt/roomqc/database.ex /app/releases/2.143.3/runtime.exs /opt/roomqc/tenant-migrations.ex'])).stdout;
  const hashes=verification.trim().split(/\r?\n/).map(line=>line.match(/^([a-f0-9]{64})\s+\//)?.[1]);
  const expectedByPath=new Map(sources.map(source=>[source.path,source.sha256]));
  assert.deepEqual(hashes,[expectedByPath.get('deploy/realtime/bootstrap.exs'),expectedByPath.get('deploy/realtime/bootstrap.exs'),
    expectedByPath.get('deploy/realtime/pool-guard.sql'),expectedByPath.get('deploy/realtime/extensions.ex'),expectedByPath.get('deploy/realtime/database.ex'),
    expectedByPath.get('deploy/realtime/runtime.exs'),expectedByPath.get('deploy/realtime/tenant-migrations.ex')]);
  assert.deepEqual(await readRealtimeImageSources(repository),source,'Source cannot change during the image build');
  return {tag,imageId:info.Id,sourceHash,baseImage:realtimeBaseImage,sources,installedSourcesVerified:true,
    sourceDateEpoch:realtimeSourceDateEpoch,rewriteTimestamp:true,imageCreated:info.Created,rootFsLayers:info.RootFS.Layers,
    platform:'linux/amd64',vendorEntrypointPreserved:true,vendorFeaturesDisabled:false};
}
async function run(command,args,{timeout=30000}={}){
  const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});const chunks=[],errors=[];
  child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>errors.push(c));
  const timer=setTimeout(()=>child.kill(),timeout);
  const code=await new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept)});clearTimeout(timer);
  if(code!==0)throw new Error('Realtime image build failed: '+Buffer.concat(errors).toString().slice(-2000));
  return {stdout:Buffer.concat(chunks).toString()};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const repository=fileURLToPath(new URL('../',import.meta.url));await mkdir(join(repository,'.local'),{recursive:true});
  const root=await mkdtemp(join(repository,'.local/roomqc-realtime-image-'));
  console.log(JSON.stringify(await prepareRealtimeImage({repository,root,privateRun:run})));
}
