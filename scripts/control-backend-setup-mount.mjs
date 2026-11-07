// Exact-owned sandbox consumer. Never mounts issuer private files or serving data.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';

const image='node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
export async function prepareSetupRuntimeMount({state,repository,cliVolume,ownerLabel,privateRun}){
 assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
 assert.equal(cliVolume,state.projectId+'-cli-source');
 const name=state.projectId+'-setup-consumer',output=state.projectId+'-setup-output',input=state.projectId+'-setup-input';
 const labels=['--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId];
 for(const volume of [output,input])await privateRun('docker',['volume','create',...labels,volume]);
 const mounts=[
  '--mount','type=volume,src='+cliVolume+',dst=/repository,readonly',
  '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/repository/node_modules,readonly',
  '--mount','type=bind,src='+join(repository,'server','control','node_modules')+',dst=/repository/server/control/node_modules,readonly',
  '--mount','type=volume,src='+input+',dst=/worker-input,readonly',
  '--mount','type=volume,src='+output+',dst=/run/roomqc/setup,readonly'
 ];
 const environment={ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_SETUP_ALLOW_LOCAL:'true',
  ROOMQC_SETUP_CONFIG_FILE:'/worker-input/setup.json',ROOMQC_SETUP_DATABASE_URL_FILE:'/worker-input/directory.dsn',
  ROOMQC_SETUP_RELEASE_TRUST_FILE:'/worker-input/trust.json',ROOMQC_RESOURCE_BUDGET_FILE:'/worker-input/budget.json',
  ROOMQC_PRIVATE_MOUNT_RUN:state.run,ROOMQC_PRIVATE_MOUNT_SOURCE:state.sourceBinding.sha256};
 const started=await privateRun('docker',['run','-d','--name',name,...labels,
  '--network','container:'+state.projectId+'-api-gw','--user','10001:10001','--read-only','--cap-drop','ALL',
  '--security-opt','no-new-privileges','--memory','256m','--cpus','0.5','--pids-limit','64',
  '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=8m,mode=0700,uid=10001,gid=10001',
  ...Object.entries(environment).flatMap(([k,v])=>['--env',k+'='+v]),...mounts,image,'node',
  '--import','/repository/server/control/testing/setup-runtime-mount-preload.mjs',
  '/repository/server/control/workers/setup-runtime.mjs']);
 const id=started.stdout.trim();assert.match(id,/^[a-f0-9]{64}$/);
 const initial=JSON.parse((await privateRun('docker',['inspect',name])).stdout)[0];
 assert.equal(initial.Id,id);assert.equal(initial.State.Running,true);assert.equal(initial.RestartCount,0);
 return {
  producerMounts:['--mount','type=volume,src='+input+',dst=/worker-input','--mount','type=volume,src='+output+',dst=/run/roomqc/setup'],
  async finish({success}){
   let waited;
   try{waited=await privateRun('docker',['wait',name],{timeout:35000})}
   catch{await privateRun('docker',['stop','--time','20',name],{timeout:30000});waited=await privateRun('docker',['wait',name],{timeout:5000})}
   const value=JSON.parse((await privateRun('docker',['inspect',name])).stdout)[0];
   assert.equal(value.Id,id);assert.equal(value.Config.Labels[ownerLabel],state.run);
   assert.equal(value.Config.Labels['com.docker.compose.project'],state.projectId);
   assert.equal(value.RestartCount,0);assert.equal(value.State.Running,false);
   assert.equal(value.State.StartedAt,initial.State.StartedAt);
   const captured=await privateRun('docker',['logs',name]),logs=captured.stdout;
   await writeFile(join(state.root,'setup-consumer-private.log'),logs+'\n'+captured.stderr,{mode:0o600});
   const witnesses=logs.split('\n').flatMap(line=>{try{const v=JSON.parse(line);return v.type==='setup_mount_identity'?[v]:[]}catch{return []}});
   if(success){
    assert.equal(waited.stdout.trim(),'0');assert.equal(value.State.ExitCode,0);assert.equal(witnesses.length,1);
    assert.equal(witnesses[0].sourceSha256,state.sourceBinding.sha256);assert.equal(witnesses[0].uid,10001);
    assert.ok(witnesses[0].readOnlyMounts&&witnesses[0].privateInputsInaccessible&&witnesses[0].writeDenied);
    for(const target of ['/repository','/worker-input','/run/roomqc/setup'])assert.equal(value.Mounts.find(m=>m.Destination===target)?.RW,false);
   }
   return {verified:success,containerId:id,startedAt:value.State.StartedAt,restartCount:value.RestartCount,exitCode:value.State.ExitCode,
    immutableImage:image,identity:witnesses[0]??null,readOnlyDirectoryMount:true,issuerPrivateMountsAbsent:true};
  }
 };
}
