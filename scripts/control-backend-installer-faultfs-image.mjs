// Builds only an owned test image. No repository/private/env context is sent.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
export async function prepareInstallerFaultFilesystemImage({repository,ownedRoot,run,projectId,privateRun}){
 assert.match(run,/^[a-f0-9]{12}$/);assert.equal(projectId,'roomqc-probe-'+run);
 assert.equal(dirname(await realpath(ownedRoot)),await realpath(join(repository,'.local')));
 assert.ok(ownedRoot.includes('roomqc-backend-'+run+'-'));assert.equal(typeof privateRun,'function');
 const hash=b=>createHash('sha256').update(b).digest('hex'),lf=text=>text.replace(/\r\n/g,'\n');
 const c=lf(await readFile(join(repository,'server/control/testing/setup-installer-faultfs.c'),'utf8'));
 const dockerfile=lf(await readFile(join(repository,'deploy/testing/installer-faultfs.Dockerfile'),'utf8'));
 const sourceSha256=hash(c+'\0'+dockerfile),context=join(ownedRoot,'faultfs-build');
 await mkdir(context,{mode:0o700});
 await writeFile(join(context,'faultfs.c'),c,{flag:'wx',mode:0o600});
 await writeFile(join(context,'Dockerfile'),dockerfile,{flag:'wx',mode:0o600});
 await writeFile(join(context,'.dockerignore'),'*\n!Dockerfile\n!faultfs.c\n',{flag:'wx',mode:0o600});
 assert.deepEqual((await readdir(context)).sort(),['.dockerignore','Dockerfile','faultfs.c']);
 const env=Object.fromEntries(['PATH','SystemRoot','SystemDrive','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','ProgramData','ProgramFiles','ProgramW6432','ProgramFiles(x86)',
  'TEMP','TMP','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','DOCKER_BUILDKIT','DOCKER_CLI_PLUGIN_EXTRA_DIRS']
  .filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
 const tag='roomqc-owned-faultfs:'+sourceSha256.slice(0,20);
 await privateRun('docker',['build','--progress','plain','--label','roomqc.installer-faultfs-source='+sourceSha256,
  '--tag',tag,'--iidfile',join(context,'image.id'),'--file',join(context,'Dockerfile'),context],
  {env,cwd:context,timeout:300000});
 const imageId=(await privateRun('docker',['image','inspect','--format','{{.Id}}',tag],{env})).stdout.trim();
 assert.match(imageId,/^sha256:[a-f0-9]{64}$/);
 const metadataSource="import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';const hash=b=>createHash('sha256').update(b).digest('hex');"+
  "const c=await readFile('/usr/local/share/roomqc-faultfs.c'),binary=await readFile('/usr/local/bin/roomqc-faultfs');"+
  "console.log(JSON.stringify({cSourceSha256:hash(c),binarySha256:hash(binary),runtimePackages:await readFile('/usr/local/share/roomqc-faultfs-runtime-packages.txt','utf8'),buildPackages:await readFile('/usr/local/share/roomqc-faultfs-build-packages.txt','utf8')}));";
 const result=await privateRun('docker',['run','--rm','-i','--name',projectId+'-faultfs-metadata',
  '--label','roomqc.control-backend-test='+run,'--label','com.docker.compose.project='+projectId,
  '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','64m','--cpus','0.5','--pids-limit','16',
  imageId,'node','--input-type=module'],{input:metadataSource,env,timeout:30000});
 const value=JSON.parse(result.stdout);assert.equal(value.cSourceSha256,hash(c));assert.match(value.binarySha256,/^[a-f0-9]{64}$/);
 assert.match(value.runtimePackages,/fuse3-3\.18\.3-r0/);assert.match(value.buildPackages,/fuse3-dev-3\.18\.3-r0/);
 return {version:1,imageId,sourceSha256,cSourceSha256:value.cSourceSha256,binarySha256:value.binarySha256,
  dockerfileSha256:hash(dockerfile),runtimePackagesSha256:hash(value.runtimePackages),buildPackagesSha256:hash(value.buildPackages),
  buildContextOwned:true,buildContextContainsPrivateFiles:false,metadataNetwork:'none',runtimePackages:value.runtimePackages,buildPackages:value.buildPackages};
}
