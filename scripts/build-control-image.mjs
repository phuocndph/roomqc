// Build the existing control Dockerfile from a public, allowlisted context.
// This does not initialize databases, start services or enable signup.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdir,mkdtemp,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
import {businessMigrationManifest} from '../server/control/business-migrate.mjs';

const execute=promisify(execFile),sha=data=>createHash('sha256').update(data).digest('hex');
const usage='Usage: node scripts/build-control-image.mjs --build [--no-cache]';
const prefix='server/control/';
const imageVerification=String.raw`
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {files:manifest,migrations}=JSON.parse(await readFile('/verification.json','utf8'));
assert.notEqual(process.getuid(),0);
for(const file of manifest){
  const actual=createHash('sha256').update(await readFile(file.path)).digest('hex');
  assert.equal(actual,file.sha256,'Packaged file differs: '+file.path);
}
const names=await readdir('/app');
assert.deepEqual(names.sort(),[...new Set(manifest.filter(file=>file.path.startsWith('/app/')).map(file=>file.path.slice(5).split('/')[0])),'node_modules'].sort());
const {businessMigrationManifest}=await import('/app/business-migrate.mjs');
const shipped=await businessMigrationManifest();
assert.equal(shipped.count,migrations.count);assert.equal(shipped.sha256,migrations.sha256);
await import('/app/server.mjs');
await import('/app/workers/setup-worker.mjs');
for(const dependency of ['pg','jose','web-push','ws'])await import(dependency);
console.log(JSON.stringify({files:manifest.length,importsVerified:true,unprivileged:true,network:'none',businessMigrations:{count:shipped.count,sha256:shipped.sha256}}));
`;

async function collectRuntimeFiles(repository,migrations){
  const paths=['server/control/Dockerfile','server/control/package.json','server/control/package-lock.json','server/control/schema.sql'];
  const walk=async(directory)=>{
    for(const entry of await readdir(join(repository,directory),{withFileTypes:true})){
      assert.ok(!entry.isSymbolicLink(),'CONTROL_IMAGE_INPUT_LINK_FORBIDDEN');
      const path=directory+'/'+entry.name;
      if(entry.isDirectory())await walk(path);else paths.push(path);
    }
  };
  for(const entry of await readdir(join(repository,prefix),{withFileTypes:true})){
    if(entry.name.endsWith('.mjs'))paths.push(prefix+entry.name);
  }
  await walk(prefix+'migrations');await walk(prefix+'workers');
  for(const migration of migrations.migrations)paths.push('supabase/migrations/'+migration.file);
  const values=[];
  for(const path of paths.sort()){
    let current=repository;
    for(const part of path.split('/')){
      current=join(current,part);
      assert.ok(!(await lstat(current)).isSymbolicLink(),'CONTROL_IMAGE_INPUT_LINK_FORBIDDEN');
    }
    const stat=await lstat(current);
    assert.ok(stat.isFile()&&stat.size<=4*1024*1024,'CONTROL_IMAGE_INPUT_INVALID');
    const bytes=await readFile(current);
    values.push({path,bytes,sha256:sha(bytes)});
  }
  return values;
}

export async function buildControlImage({repository,noCache=false}){
  assert.equal(typeof noCache,'boolean');repository=await realpath(repository);
  const migrationDirectory=pathToFileURL(join(repository,'supabase','migrations')+'/');
  const binding=await captureBackendSourceBinding(repository),migrations=await businessMigrationManifest(migrationDirectory);
  const inputs=await collectRuntimeFiles(repository,migrations);
  for(const file of inputs){
    if(file.path.startsWith('supabase/migrations/')){
      const migration=migrations.migrations.find(m=>file.path==='supabase/migrations/'+m.file);
      assert.equal(migration?.checksum,sha(file.bytes.toString('utf8').replace(/\r\n/g,'\n')),'CONTROL_IMAGE_MIGRATION_DRIFT');
      continue;
    }
    const bound=binding.files.find(entry=>entry.path===file.path);
    assert.ok(bound,'CONTROL_IMAGE_INPUT_NOT_BACKEND_BOUND');
    assert.equal(bound.sha256,sha(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes).replace(/\r\n/g,'\n')),
      'CONTROL_IMAGE_INPUT_DRIFT');
  }
  const recipe=inputs.find(file=>file.path===prefix+'Dockerfile').bytes.toString('utf8').replace(/\r\n/g,'\n');
  assert.match(recipe,/^FROM node:22-alpine@sha256:[a-f0-9]{64}\n/);
  assert.deepEqual(recipe.split('\n').filter(line=>/^COPY\b/.test(line)),[
    'COPY server/control/package.json server/control/package-lock.json ./',
    'COPY server/control/*.mjs server/control/schema.sql ./',
    'COPY server/control/migrations ./migrations','COPY server/control/workers ./workers',
    'COPY supabase/migrations /supabase/migrations'
  ],'CONTROL_IMAGE_RECIPE_CHANGED');
  assert.ok(!/^ADD\b/m.test(recipe),'CONTROL_IMAGE_RECIPE_CHANGED');
  const sources=inputs.map(({path,sha256})=>({path,sha256}));
  const sourceHash=sha(JSON.stringify(sources));
  await mkdir(join(repository,'.local'),{recursive:true});
  const root=await mkdtemp(join(repository,'.local/roomqc-control-image-')),context=join(root,'context');
  const log=join(root,'build.private.log');await writeFile(log,'',{flag:'wx',mode:0o600});
  for(const input of inputs){
    const destination=join(context,input.path);await mkdir(dirname(destination),{recursive:true});
    await writeFile(destination,input.bytes,{flag:'wx'});
  }
  const run=async(args,timeout=30000)=>{
    try{return await execute('docker',args,{cwd:repository,timeout,windowsHide:true,maxBuffer:16*1024*1024})}
    catch(error){
      await writeFile(log,String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600});
      throw Object.assign(new Error('CONTROL_IMAGE_BUILD_FAILED; inspect '+log),{code:'CONTROL_IMAGE_BUILD_FAILED'});
    }
  };
  const tag='roomqc/control:source-'+sourceHash.slice(0,20);
  await run(['build','--platform','linux/amd64','--provenance=false',...(noCache?['--no-cache']:[]),
    '--file',join(context,prefix+'Dockerfile'),'--tag',tag,
    '--label','roomqc.control.inputs='+sourceHash,'--label','roomqc.control.backend='+binding.sha256,context],600000);
  const info=JSON.parse((await run(['image','inspect',tag])).stdout)[0];
  assert.match(info.Id,/^sha256:[a-f0-9]{64}$/);
  assert.equal(info.Os,'linux');assert.equal(info.Architecture,'amd64');assert.equal(info.Config.User,'node');
  assert.equal(info.Config.Labels['roomqc.control.inputs'],sourceHash);
  assert.equal(info.Config.Labels['roomqc.control.backend'],binding.sha256);
  assert.deepEqual(info.Config.Cmd,['node','server.mjs']);
  const imageReference=info.RepoDigests?.find(ref=>ref.startsWith('roomqc/control@sha256:'));
  assert.equal(imageReference,'roomqc/control@'+info.Id,'Named immutable control reference required');
  const verification=join(root,'verification.json');
  const packaged=sources.filter(file=>file.path!==prefix+'Dockerfile').map(file=>({...file,
    path:file.path.startsWith(prefix)?'/app/'+file.path.slice(prefix.length):'/'+file.path}));
  await writeFile(verification,JSON.stringify({files:packaged,migrations:{count:migrations.count,sha256:migrations.sha256}}),{flag:'wx'});
  const check=JSON.parse((await run(['run','--rm','--read-only','--network','none','--cap-drop','ALL',
    '--security-opt','no-new-privileges','--memory','128m','--cpus','0.5','--pids-limit','64',
    '--label','roomqc.control-image-check='+sourceHash,
    '--mount','type=bind,source='+verification+',target=/verification.json,readonly',
    info.Id,'node','--input-type=module','-e',imageVerification])).stdout);
  assert.equal(check.files,packaged.length);assert.equal(check.importsVerified,true);
  assert.equal(check.unprivileged,true);assert.equal(check.network,'none');
  const after=await collectRuntimeFiles(repository,await businessMigrationManifest(migrationDirectory));
  assert.deepEqual(after.map(({path,sha256})=>({path,sha256})),sources,'CONTROL_IMAGE_INPUT_DRIFT');
  assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));
  const receipt={kind:'roomqc-control-deployment-image',version:1,recordedAt:new Date().toISOString(),
    tag,imageId:info.Id,imageReference,platform:'linux/amd64',imageBytes:info.Size,sourceHash,
    backendSourceSha256:binding.sha256,backendSourceFiles:binding.files.length,sources,
    businessMigrations:check.businessMigrations,
    builderSha256:sha(await readFile(fileURLToPath(import.meta.url))),verification:check,
    buildVerified:true,sourceUnchanged:true,runtimeVerified:false,signupOpened:false};
  const manifest=join(root,'image.json');await writeFile(manifest,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return {imageId:info.Id,imageReference,imageBytes:info.Size,sourceHash,manifest,runtimeVerified:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length===0||(args.length===1&&args[0]==='--help'))console.log(usage);
  else if(args[0]!=='--build'||args.length>2||(args.length===2&&args[1]!=='--no-cache')){
    console.error(usage);process.exitCode=64;
  }else{
    try{console.log(JSON.stringify(await buildControlImage({repository:fileURLToPath(new URL('../',import.meta.url)),noCache:args.includes('--no-cache')})))}
    catch(error){console.error(error.code??error.message);process.exitCode=1}
  }
}
