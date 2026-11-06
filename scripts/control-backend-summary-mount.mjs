// Exact-owned diagnostic consumer. Only its public config and scoped output
// directories are mounted; issuer DSNs/signers/journals stay in the producer.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
const image='node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
export async function prepareSummaryRuntimeMount({state,repository,cliVolume,ownerLabel,privateRun}){
 assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
 assert.equal(cliVolume,state.projectId+'-cli-source');
 const name=state.projectId+'-summary-consumer',output=state.projectId+'-summary-output',input=state.projectId+'-summary-input';
 const labels=['--label',ownerLabel+'='+state.run,'--label','com.docker.compose.project='+state.projectId];
 for(const volume of [output,input])await privateRun('docker',['volume','create',...labels,volume]);
 const started=await privateRun('docker',['run','-d','--name',name,...labels,
  '--network','container:'+state.projectId+'-api-gw','--user','1000:1000','--read-only','--cap-drop','ALL',
  '--security-opt','no-new-privileges','--memory','128m','--cpus','0.5','--pids-limit','32',
  '--tmpfs','/tmp:rw,noexec,nosuid,nodev,size=2m,mode=0700,uid=1000,gid=1000',
  '--env','ROOMQC_SUMMARY_MOUNT_RUN='+state.run,'--env','ROOMQC_SUMMARY_MOUNT_SOURCE='+state.sourceBinding.sha256,
  '--mount','type=volume,src='+cliVolume+',dst=/repository,readonly',
  '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/repository/node_modules,readonly',
  '--mount','type=bind,src='+join(repository,'server','control','node_modules')+',dst=/repository/server/control/node_modules,readonly',
  '--mount','type=volume,src='+input+',dst=/summary-input,readonly',
  '--mount','type=volume,src='+output+',dst=/run/roomqc/summary,readonly',
  image,'node','/repository/server/control/testing/tenant-summary-mount-consumer.mjs']);
 const id=started.stdout.trim();assert.match(id,/^[a-f0-9]{64}$/);
 const initial=JSON.parse((await privateRun('docker',['inspect',name])).stdout)[0];
 assert.equal(initial.Id,id);assert.equal(initial.State.Running,true);
 return {producerMounts:['--mount','type=volume,src='+input+',dst=/summary-input',
  '--mount','type=volume,src='+output+',dst=/run/roomqc/summary'],
  async finish({success}){
   let waited;try{waited=await privateRun('docker',['wait',name],{timeout:15000})}
   catch{await privateRun('docker',['stop','--time','5',name],{timeout:10000});waited=await privateRun('docker',['wait',name],{timeout:5000})}
   const current=JSON.parse((await privateRun('docker',['inspect',name])).stdout)[0];
   assert.equal(current.Id,id);assert.equal(current.Config.Labels[ownerLabel],state.run);
   assert.equal(current.State.StartedAt,initial.State.StartedAt);assert.equal(current.RestartCount,0);assert.equal(current.State.Running,false);
   const logs=await privateRun('docker',['logs',name]);
   await writeFile(join(state.root,'summary-consumer-private.log'),logs.stdout+'\n'+logs.stderr,{mode:0o600});
   const witnesses=logs.stdout.split('\n').flatMap(line=>{try{const r=JSON.parse(line);return r.type==='summary_mount_identity'?[r]:[]}catch{return []}});
   if(success){
    assert.equal(waited.stdout.trim(),'0');assert.equal(current.State.ExitCode,0);assert.equal(witnesses.length,1);
    const w=witnesses[0];assert.equal(w.sourceSha256,state.sourceBinding.sha256);assert.equal(w.uid,1000);assert.equal(w.capEff,'0');
    assert(w.noNewPrivileges&&w.readOnlyMounts&&w.writeDenied&&w.privateInputsInaccessible);
    for(const target of ['/repository','/summary-input','/run/roomqc/summary'])assert.equal(current.Mounts.find(m=>m.Destination===target)?.RW,false);
   }
   return {verified:success,containerId:id,startedAt:current.State.StartedAt,restartCount:current.RestartCount,exitCode:current.State.ExitCode,
    immutableImage:image,identity:witnesses[0]??null,readOnlyOutputDirectory:true,issuerInputsAbsent:true,fullControlApiE2E:false};
  }};
}
