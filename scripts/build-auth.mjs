// Deployment entry point for the same pinned Auth image used by backend checks.
// Build inputs are public source only; no running service or database is changed.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {preparePasswordAuth} from './control-backend-password-auth.mjs';

const execute=promisify(execFile);
const usage='Usage: node scripts/build-auth.mjs --build [--no-cache]';
const sourceDigest=async(repository,path)=>createHash('sha256').update(await readFile(join(repository,path))).digest('hex');

export async function buildAuthImage({repository,noCache=false}){
  assert.equal(typeof noCache,'boolean');
  await mkdir(join(repository,'.local'),{recursive:true});
  const root=await mkdtemp(join(repository,'.local/roomqc-auth-image-'));
  const log=join(root,'build.local.log');
  await writeFile(log,'',{flag:'wx',mode:0o600});
  const privateRun=async(command,args,{timeout=30000,cwd=repository}={})=>{
    try{return await execute(command,args,{cwd,timeout,windowsHide:true,maxBuffer:16*1024*1024})}
    catch(error){
      // Keep build diagnostics local. The public failure does not dump process
      // arguments, inherited environment, or arbitrary child output into chat.
      await writeFile(log,String(error.stdout||'')+'\n'+String(error.stderr||''),{mode:0o600});
      throw Object.assign(new Error('AUTH_IMAGE_BUILD_FAILED; inspect '+log),{code:'AUTH_IMAGE_BUILD_FAILED'});
    }
  };
  const helper='scripts/control-backend-password-auth.mjs';
  const helperSha256=await sourceDigest(repository,helper);
  const result=await preparePasswordAuth({repository,root,privateRun,noCache});
  assert.equal(await sourceDigest(repository,helper),helperSha256,'Auth builder changed during build');
  for(const source of result.sources){
    assert.equal(await sourceDigest(repository,source.path),source.sha256,'Auth source changed during build');
  }
  const receipt={kind:'roomqc-auth-deployment-image',version:1,recordedAt:new Date().toISOString(),
    ...result,helperSha256,noCache,buildVerified:true,runtimeVerified:false};
  const manifest=join(root,'image.json');
  await writeFile(manifest,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return {imageId:result.imageId,sourceHash:result.sourceHash,manifest,runtimeVerified:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===0||(args.length===1&&args[0]==='--help')){
    console.log(usage);
  }else if(args[0]!=='--build'||args.length>2||(args.length===2&&args[1]!=='--no-cache')){
    console.error(usage);process.exitCode=64;
  }else{
    try{
      const repository=fileURLToPath(new URL('../',import.meta.url));
      console.log(JSON.stringify(await buildAuthImage({repository,noCache:args.includes('--no-cache')})));
    }catch(error){console.error(error.message);process.exitCode=1}
  }
}
