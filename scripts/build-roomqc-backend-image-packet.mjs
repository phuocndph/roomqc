// Name and export the exact eight images witnessed by a completed full run.
// Does not rebuild images, start services, pull, change a database or enable signup.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {captureBackendSourceBinding,assertBackendSourceBinding,readBackendBuildReference} from './control-backend-source-binding.mjs';
const execute=promisify(execFile),sha=b=>createHash('sha256').update(b).digest('hex');
const services=['api-gw','auth','db','functions','imgproxy','realtime','rest','storage'];
export async function buildRoomqcBackendImagePacket({repository,fullState,existingPacket}){
  repository=resolve(repository);
  const binding=await captureBackendSourceBinding(repository);
  const full=await readBackendBuildReference({repository,file:resolve(fullState),sourceBinding:binding});
  assert.deepEqual(full.imageLock.map(image=>image.service),services,'BACKEND_PACKET_IMAGE_SET_MISMATCH');
  await mkdir(join(repository,'.local'),{recursive:true});
  const root=existingPacket?resolve(existingPacket):await mkdtemp(join(repository,'.local/roomqc-backend-images-'));
  assert.equal(dirname(root),join(repository,'.local'),'BACKEND_PACKET_PATH_INVALID');
  assert.match(basename(root),/^roomqc-backend-images-[A-Za-z0-9]+$/,'BACKEND_PACKET_PATH_INVALID');
  assert.equal(await realpath(root),root,'BACKEND_PACKET_PATH_INVALID');
  const log=join(root,'private-error.log');
  const run=async(command,args,{cwd=repository,timeout=30000}={})=>{
    try{return await execute(command,args,{cwd,timeout,windowsHide:true,maxBuffer:1024*1024})}
    catch(error){await writeFile(log,String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600});throw new Error('BACKEND_IMAGE_PACKET_COMMAND_FAILED')}
  };
  const images=[];
  for(const locked of full.imageLock){
    assert.match(locked.imageId,/^sha256:[a-f0-9]{64}$/);
    assert.match(locked.tag,/^[a-z0-9][a-z0-9./_-]*:[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
    const info=JSON.parse((await run('docker',['image','inspect',locked.imageId])).stdout)[0];
    assert.equal(info.Id,locked.imageId);assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
    const reviewed=locked.service==='auth'?full.passwordAuthBuild:locked.service==='realtime'?full.realtimeBootstrapBuild:null;
    if(reviewed){assert.equal(info.Id,reviewed.imageId);assert.deepEqual(info.RootFS.Layers,reviewed.rootFsLayers)}
    const repositoryName=locked.tag.slice(0,locked.tag.lastIndexOf(':'));
    const tag=repositoryName+':roomqc-candidate-'+binding.sha256.slice(0,12)+'-'+locked.imageId.slice(7,19);
    const reference=repositoryName+'@'+locked.imageId;
    if(!existingPacket)await run('docker',['tag',locked.imageId,tag]);
    const named=JSON.parse((await run('docker',['image','inspect',reference])).stdout)[0];
    assert.equal(named.Id,locked.imageId,'BACKEND_PACKET_NAMED_DIGEST_MISSING');
    images.push({service:locked.service,tag,reference,imageId:locked.imageId,rootFsLayers:info.RootFS.Layers});
  }
  const packet={kind:'roomqc-backend-image-packet',version:1,createdAt:new Date().toISOString(),
    backendSourceSha256:binding.sha256,backendSourceFiles:binding.files.length,fullRun:full.run,
    upstreamRelease:full.releaseTag,upstreamCommit:full.releaseCommit,images,
    rebuildAccepted:false,deploymentReady:false,signupOpened:false,
    limits:['Exact images and repository bindings only; no credentials, database volumes or runtime configuration.',
      'Archive verification does not approve capacity or a production resource plan.',
      'Auth uses the reviewed RoomQC build. Do not substitute the stock catalog Auth image to bypass resource preflight.']};
  const manifest=join(root,'images.json');
  if(existingPacket){
    const saved=JSON.parse(await readFile(manifest,'utf8'));
    assert.equal(saved.kind,packet.kind);assert.equal(saved.version,packet.version);
    assert.equal(saved.backendSourceSha256,binding.sha256);assert.equal(saved.fullRun,full.run);
    assert.deepEqual(saved.images,images,'BACKEND_PACKET_EXISTING_IMAGES_MISMATCH');packet.createdAt=saved.createdAt;
  }else{
    await writeFile(manifest,JSON.stringify(packet,null,2)+'\n',{mode:0o600,flag:'wx'});
    await run('docker',['image','save','--output','images.tar',...images.map(image=>image.tag)],{cwd:root,timeout:300000});
  }
  const verified=JSON.parse((await run('python',[join(repository,'scripts/verify-roomqc-backend-image-packet.py'),
    '--packet','images.json','--archive','images.tar'],{cwd:root,timeout:300000})).stdout);
  assert.equal(verified.images.length,8);assert.equal(verified.namedRepositoryBindingsVerified,true);
  for(const image of images){
    const actual=JSON.parse((await run('docker',['image','inspect',image.reference])).stdout)[0];assert.equal(actual.Id,image.imageId);
  }
  assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));
  const receipt={...verified,createdAt:packet.createdAt,backendSourceSha256:binding.sha256,fullRun:full.run,
    manifestSha256:sha(await readFile(manifest)),builderSha256:sha(await readFile(fileURLToPath(import.meta.url))),
    verifierSha256:sha(await readFile(join(repository,'scripts/verify-roomqc-backend-image-packet.py'))),
    sourceBindingUnchanged:true,archiveReused:Boolean(existingPacket),runtimeChanged:false,signupOpened:false,
    root,manifest,archive:join(root,'images.tar')};
  await writeFile(join(root,'verification.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===2&&args[0]==='--full-state'||args.length===4&&args[0]==='--full-state'&&args[2]==='--verify-existing'){
    try{console.log(JSON.stringify(await buildRoomqcBackendImagePacket({repository:fileURLToPath(new URL('../',import.meta.url)),fullState:args[1],existingPacket:args[3]})))}
    catch(error){console.error(/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message??'')?error.message:'BACKEND_IMAGE_PACKET_FAILED');process.exitCode=1}
  }else{console.log('Usage: node scripts/build-roomqc-backend-image-packet.mjs --full-state <completed ownership.json> [--verify-existing <owned packet directory>]');if(args.length&&args[0]!=='--help')process.exitCode=64}
}
