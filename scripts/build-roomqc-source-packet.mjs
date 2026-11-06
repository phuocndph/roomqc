// Transfer public candidate sources without carrying local credentials or fixtures.
// A source packet is not a runtime installer or a production acceptance receipt.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdir,mkdtemp,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {captureBackendSourceBinding,assertBackendSourceBinding,readBackendBuildReference} from './control-backend-source-binding.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const execute=promisify(execFile),maxFile=4*1024*1024,maxTotal=64*1024*1024;
const extraFiles=['docker-compose.control.yml','deploy/control/compose.yml','deploy/auth/compose.yml',
  'deploy/auth/password-guard/Dockerfile','deploy/auth/password-guard/roomqc_password.go',
  'deploy/auth/password-guard/roomqc_password_test.go','scripts/build-control-image.mjs','scripts/build-auth.mjs',
  'deploy/control/directory.compose.yml','deploy/control/directory-client.compose.yml',
  'deploy/control/directory/postgresql.conf','deploy/control/directory/pg_hba.conf',
  'deploy/control/management-nginx.conf','deploy/control/management.example.json','deploy/control/management-install.example.json','deploy/control/management-bootstrap.example.json',
  ...['api-secrets','health','alert','setup','summary'].map(name=>'deploy/control/directory-clients/'+name+'.compose.yml')];

async function readPublicFile(repository,path){
  assert.match(path,/^[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)*$/,'SOURCE_PACKET_PATH_INVALID');
  assert.ok(!path.split('/').some(part=>!part||part==='.'||part==='..'||part==='node_modules'),'SOURCE_PACKET_PATH_INVALID');
  let current=repository;
  for(const part of path.split('/')){
    current=join(current,part);
    assert.ok(!(await lstat(current)).isSymbolicLink(),'SOURCE_PACKET_LINK_FORBIDDEN');
  }
  const info=await lstat(current);
  assert.ok(info.isFile()&&info.size<=maxFile,'SOURCE_PACKET_FILE_INVALID');
  const bytes=await readFile(current);
  assert.ok(bytes.length<=maxFile,'SOURCE_PACKET_FILE_INVALID');
  assert.ok(!/^-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32,}/m.test(bytes.toString('utf8')),'SOURCE_PACKET_PRIVATE_KEY_FORBIDDEN');
  return bytes;
}

export async function buildRoomqcSourcePacket({repository,fullState}){
  repository=await realpath(repository);
  const binding=await captureBackendSourceBinding(repository);
  const full=await readBackendBuildReference({repository,file:resolve(fullState),sourceBinding:binding});
  const paths=new Set([...binding.files.map(file=>file.path),...extraFiles]);
  const migrations=(await readdir(join(repository,'supabase/migrations'))).filter(name=>name.endsWith('.sql')).sort();
  const migrationHash=createHash('sha256');
  for(const name of migrations){
    assert.match(name,/^\d{14}_[A-Za-z0-9_-]+\.sql$/);
    const path='supabase/migrations/'+name,bytes=await readPublicFile(repository,path);
    migrationHash.update(name+'\0'+bytes.toString('utf8').replace(/\r\n/g,'\n')+'\0');paths.add(path);
  }
  assert.equal(migrations.length,full.applied,'SOURCE_PACKET_MIGRATION_COUNT_DRIFT');
  assert.equal(migrationHash.digest('hex'),full.migrationSetHash,'SOURCE_PACKET_MIGRATION_DRIFT');
  // Only Edge sources individually witnessed in the full reference are added.
  const edgeSources=new Map();
  for(const key of ['emailBuild','lifecycleBuild','providerBuild','staffInvitationBuild','employeeUpdateBuild','workflowDeliveryBuild']){
    assert.ok(Array.isArray(full[key]?.sources),'SOURCE_PACKET_EDGE_REFERENCE_MISSING');
    for(const [name,hash]of full[key].sources){
      const path='supabase/functions/'+name;
      if(edgeSources.has(path))assert.equal(edgeSources.get(path),hash);
      edgeSources.set(path,hash);paths.add(path);
    }
  }
  assert.ok(paths.size<=4096,'SOURCE_PACKET_FILE_LIMIT');
  const input=[];let total=0;
  for(const path of [...paths].sort()){
    const bytes=await readPublicFile(repository,path);total+=bytes.length;
    assert.ok(total<=maxTotal,'SOURCE_PACKET_SIZE_LIMIT');
    const expected=binding.files.find(file=>file.path===path)?.sha256;
    if(expected)assert.equal(sha(bytes.toString('utf8').replace(/\r\n/g,'\n')),expected,'SOURCE_PACKET_BACKEND_DRIFT');
    if(edgeSources.has(path))assert.equal(sha(bytes),edgeSources.get(path),'SOURCE_PACKET_EDGE_DRIFT');
    input.push({path,bytes,sha256:sha(bytes)});
  }
  await mkdir(join(repository,'.local'),{recursive:true});
  const root=await mkdtemp(join(repository,'.local/roomqc-source-packet-')),payload=join(root,'payload');
  const manifest={kind:'roomqc-candidate-source-packet',version:1,createdAt:new Date().toISOString(),
    backendSourceSha256:binding.sha256,backendSourceFiles:binding.files.length,
    fullReference:{run:full.run,phase:full.phase,migrationSetHash:full.migrationSetHash,
      schemaManifestHash:full.schemaManifestHash,releaseTag:full.releaseTag,releaseCommit:full.releaseCommit},
    businessMigrations:migrations.length,edgeSourceFiles:edgeSources.size,
    deploymentInputs:input.filter(file=>extraFiles.includes(file.path)).map(({path,sha256,bytes})=>({path,sha256,bytes:bytes.length})),
    files:input.map(({path,sha256,bytes})=>({path,sha256,bytes:bytes.length})),totalBytes:total,
    rebuildAccepted:false,deploymentReady:false,signupOpened:false,
    limits:['Public sources only; no credentials, database dump, fixture environment or runtime state.',
      'Includes only Edge sources witnessed by the full reference; not every application function.',
      'No upstream vendor checkout, image archives, production configuration or browser build.',
      'Transfer integrity does not establish capacity, installation, email, recovery or product acceptance.']};
  for(const file of input){
    const destination=join(payload,file.path);await mkdir(dirname(destination),{recursive:true});
    await writeFile(destination,file.bytes,{flag:'wx',mode:0o444});
  }
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  await writeFile(join(payload,'packet.json'),manifestBytes,{flag:'wx',mode:0o444});
  const archive=join(root,'sources.tar.gz');
  // Windows bsdtar does not reliably decode Unicode command-line paths.
  await execute('tar',['-czf','sources.tar.gz','-C','payload','.'],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:1024*1024});
  const archiveBytes=await readFile(archive);assert.ok(archiveBytes.length<=maxTotal);
  // Recheck every source, including unbound packaging recipes, before publication.
  for(const file of input)assert.equal(sha(await readPublicFile(repository,file.path)),file.sha256,'SOURCE_PACKET_SOURCE_DRIFT');
  assertBackendSourceBinding(binding,await captureBackendSourceBinding(repository));
  const receipt={kind:'roomqc-candidate-source-packet-build',createdAt:manifest.createdAt,
    backendSourceSha256:binding.sha256,fullRun:full.run,files:input.length,totalBytes:total,
    businessMigrations:migrations.length,edgeSourceFiles:edgeSources.size,
    deploymentInputs:manifest.deploymentInputs,
    archiveSha256:sha(archiveBytes),archiveBytes:archiveBytes.length,manifestSha256:sha(manifestBytes),
    sourceUnchanged:true,rebuildAccepted:false,deploymentReady:false,signupOpened:false};
  await writeFile(join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return {...receipt,root,archive};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),usage='Usage: node scripts/build-roomqc-source-packet.mjs --full-state <completed ownership.json>';
  if(args.length===2&&args[0]==='--full-state'){
    try{console.log(JSON.stringify(await buildRoomqcSourcePacket({repository:fileURLToPath(new URL('../',import.meta.url)),fullState:args[1]})))}
    catch(error){console.error(/^[A-Z][A-Z0-9_]{2,100}$/.test(error.message??'')?error.message:'SOURCE_PACKET_BUILD_FAILED');process.exitCode=1}
  }else{console.log(usage);if(args.length&&args[0]!=='--help')process.exitCode=64}
}
