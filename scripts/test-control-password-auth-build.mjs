// Two independent, uncached builds. No backend, env file, DB or provider is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePasswordAuth} from './control-backend-password-auth.mjs';

const repository=fileURLToPath(new URL('../',import.meta.url));
const emit=(event,data={})=>process.stdout.write(JSON.stringify({event,...data})+'\n');
async function main(args) {
  if(args.length===0||args.join(' ')==='--help') {
    process.stdout.write('Usage: node scripts/test-control-password-auth-build.mjs --run\n'+
      'Builds pinned Auth twice without cache; retains sources/logs/evidence in .local.\n'+
      'No business/backend/VPS/provider connection; no images or existing resources removed.\n');
    return;
  }
  assert.deepEqual(args,['--run']);
  const id=randomBytes(6).toString('hex');
  await mkdir(join(repository,'.local'),{recursive:true});
  const root=await mkdtemp(join(repository,'.local','roomqc-auth-build-'+id+'-'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>
    !/^(SUPABASE_|GOTRUE_|SMTP_|RESEND_|ROOMQC_|OPENAI_|COMPOSE_|SOURCE_DATE_EPOCH$)/i.test(key)));
  env.GIT_TERMINAL_PROMPT='0';
  let commandCount=0;
  const privateRun=async(command,arguments_,{cwd=repository,timeout=30000}={})=>{
    const count=++commandCount;
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(command,arguments_,{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      const out=[],err=[];let bytes=0,timedOut=false,overflow=false;
      const timer=setTimeout(()=>{timedOut=true;child.kill()},timeout);timer.unref();
      const collect=(target,chunk)=>{bytes+=chunk.length;if(bytes>16*1024*1024){overflow=true;child.kill()}else target.push(chunk)};
      child.stdout.on('data',chunk=>collect(out,chunk));child.stderr.on('data',chunk=>collect(err,chunk));
      child.on('error',error=>{clearTimeout(timer);reject(error)});
      child.on('close',code=>{clearTimeout(timer);resolve({code,timedOut,overflow,
        stdout:Buffer.concat(out).toString(),stderr:Buffer.concat(err).toString()})});
    });
    await writeFile(join(root,'command-'+count+'.log'),result.stdout+'\n'+result.stderr,{mode:0o600,flag:'wx'});
    assert.equal(result.timedOut,false,'Build command exceeded bounded deadline');
    assert.equal(result.overflow,false,'Build command exceeded bounded output');
    assert.equal(result.code,0,'Build command failed; raw output retained privately');
    return result;
  };
  if(process.platform==='win32') {
    const sid=(await privateRun('whoami',['/user','/fo','csv','/nh'])).stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
    assert.ok(sid);
    await privateRun('icacls',[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F']);
  }
  const result={kind:'roomqc-password-auth-uncached-build-repeatability',run:id,
    noCache:true,independentCheckouts:true,backendStarted:false,providerUsed:false,
    existingImagesOrResourcesDeleted:false,builds:[],verified:false};
  const save=()=>writeFile(join(root,'result.json'),JSON.stringify(result,null,2),{mode:0o600});
  try {
    result.buildxVersion=(await privateRun('docker',['buildx','version'])).stdout.trim();
    for(const name of ['A','B']) {
      const buildRoot=join(root,name);await mkdir(buildRoot);
      emit('password_auth_uncached_build_start',{run:id,build:name});
      result.builds.push(await preparePasswordAuth({repository,root:buildRoot,privateRun,noCache:true}));
      // Keep each newly-created evidence image addressable after the next build
      // moves the source-derived tag. Never retag a serving/vendor image.
      await privateRun('docker',['image','tag',result.builds.at(-1).imageId,'roomqc/gotrue:build-proof-'+id+'-'+name.toLowerCase()]);
      await save();
      emit('password_auth_uncached_build_complete',{run:id,build:name,imageId:result.builds.at(-1).imageId});
    }
    const [a,b]=result.builds;
    for(const key of ['imageId','sourceHash','sourceDateEpoch','platform','binarySha256','imageCreated','configSha256',
      'originalUserSourceHash','patchedUserSourceHash'])assert.equal(a[key],b[key],key+' must be reproducible');
    assert.deepEqual(a.rootFsLayers,b.rootFsLayers,'Uncompressed image layers must be reproducible');
    assert.deepEqual(a.sources,b.sources);
    result.verified=true;await save();
    emit('password_auth_uncached_build_verified',result);
  }catch(error) {
    result.errorCode=error?.code==='ERR_ASSERTION'?'BUILD_REPEATABILITY_ASSERTION':'BUILD_REPEATABILITY_FAILED';
    await save();emit('password_auth_uncached_build_failed',{run:id,errorCode:result.errorCode});
    process.exitCode=1;
  }
}
main(process.argv.slice(2)).catch(()=>{emit('password_auth_build_setup_failed');process.exitCode=1});
