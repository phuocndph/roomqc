// Image transport for a fresh, closed installation. Its separate kind and
// verifier mode cannot satisfy the existing full-run production packet gate.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backendServices} from './roomqc-backend-bundle.mjs';
const exec=promisify(execFile),sha=x=>createHash('sha256').update(x).digest('hex');
export async function exportBackendImages(bundleFile){
 const bundle=JSON.parse(await readFile(bundleFile,'utf8')),{specSha256,...body}=bundle;
 assert.equal(sha(JSON.stringify(body)),specSha256);assert.equal(bundle.kind,'roomqc-fresh-backend-install');
 const root=dirname(bundleFile),run=(args,timeout=30000)=>exec('docker',args,{windowsHide:true,timeout,maxBuffer:1024*1024});
 const images=[];
 for(const service of [...backendServices,'control']){
  const ref=service==='control'?bundle.controlImage:bundle.images[service].reference;
  const info=JSON.parse((await run(['image','inspect',ref])).stdout)[0];
  assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');
  const repo=service==='control'?'roomqc/control':'roomqc/backend-'+service,tag=repo+':transfer-'+info.Id.slice(7,27);
  await run(['image','tag',info.Id,tag]);
  images.push({service,tag,reference:repo+'@'+info.Id,imageId:info.Id,rootFsLayers:info.RootFS.Layers});
 }
 const manifest={kind:'roomqc-fresh-backend-image-transport',version:1,backendSourceSha256:bundle.sourceSha256,
  specSha256,images,deploymentReady:false,signupOpened:false,productionReady:false};
 await writeFile(join(root,'images.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 await run(['image','save','--output',join(root,'images.tar'),...images.map(x=>x.tag)],300000);
 const verified=JSON.parse((await exec('python',[fileURLToPath(new URL('./verify-roomqc-backend-image-packet.py',import.meta.url)),
  '--packet',join(root,'images.json'),'--archive',join(root,'images.tar'),'--fresh-install'],{windowsHide:true,timeout:300000,maxBuffer:1024*1024})).stdout);
 await writeFile(join(root,'image-verification.json'),JSON.stringify(verified,null,2)+'\n',{flag:'wx',mode:0o600});
 return {root,images:images.length,archiveBytes:verified.archiveBytes,expandedLayerTarBytes:verified.expandedLayerTarBytes,archiveSha256:verified.archiveSha256,productionReady:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);
 if(a.length===1&&a[0]==='--help')console.log('Usage: --bundle ABSOLUTE_PRIVATE_BACKEND_JSON. Exports nine images for a closed fresh installation; does not grant production admission.');
 else if(a.length!==2||a[0]!=='--bundle')process.exitCode=64;
 else try{console.log(JSON.stringify(await exportBackendImages(resolve(a[1]))));}catch{console.error('BACKEND_IMAGE_TRANSPORT_FAILED');process.exitCode=1;}
}
