// Exercise the packaged continuous daemon against the restored databases and
// durable volumes. No once-mode substitute, expiry edits or source credentials.
import assert from 'node:assert/strict';
export function restoredRotationEvents(logs,instanceId){
 const events=[];let stopping=false;
 for(const line of logs.split(/\r?\n/)){
  if(!line.trim())continue;
  let event;try{event=JSON.parse(line)}catch{assert.fail('RECOVERY_ROTATION_INVALID_LOG')}
  assert.equal(event.instanceId,instanceId);
  assert(['setup_rotation_cycle','setup_rotation_stopping','setup_rotation_stopped'].includes(event.type));
  if(event.type==='setup_rotation_stopping')stopping=true;
  if(event.type==='setup_rotation_stopped'){assert(stopping,'RECOVERY_ROTATION_UNEXPECTED_STOP');stopping=false}
  if(event.type==='setup_rotation_cycle'){
   assert(['rotated','idle'].includes(event.action)||event.action==='stopping'&&stopping,'RECOVERY_ROTATION_CYCLE_NOT_READY');
   if(event.action==='rotated'){
    assert.match(event.commandId,/^[0-9a-f-]{36}$/);assert.match(event.credentialId,/^[0-9a-f-]{36}$/);
    assert(Number.isSafeInteger(event.expiresAt));
   }
  }
  events.push(event);
 }
 return events;
}
export const rotationJournalProgram=instanceId=>`import assert from 'node:assert/strict';
 import {readdir,readFile,lstat} from 'node:fs/promises';import {createHash} from 'node:crypto';
 const root='/journal/'+${JSON.stringify(instanceId)},hash=createHash('sha256');
 const pending=await readdir(root+'/pending'),published=await readdir(root+'/history/published'),superseded=await readdir(root+'/history/superseded');
 assert.equal(pending.length,0);assert.equal(published.length,1);assert.equal(superseded.length,0);
 const key=published[0];assert.match(key,/^[0-9a-f-]{36}$/);
 for(const name of ['command.json','context.json']){
  const path=root+'/history/published/'+key+'/'+name,info=await lstat(path);
  assert(info.isFile()&&!info.isSymbolicLink()&&info.uid===1000&&(info.mode&0o077)===0);
  hash.update(name+'\\n');hash.update(await readFile(path));
 }
 console.log(JSON.stringify({pending:0,published:1,superseded:0,commandId:key,sha256:hash.digest('hex')}));`;

export async function runRestoredRotationWorker({project,run,label,image,volumes,mount,docker,names,operator,credential,ready,emit}){
 const name=project+'-credential-rotation',instanceId='recovery-rotation-'+run;names.push(name);
 await docker(['run','-d','--name',name,'--label',label,'--network','container:'+project+'-api-gw',
  '--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','256m','--cpus','0.5','--pids-limit','96','--restart','unless-stopped',
  '-e','NODE_ENV=development',...mount(volumes['worker-operator'],'/ops',true),
  ...mount(volumes['worker-runtime'],'/run/roomqc/setup'),...mount(volumes['worker-journal'],'/journal'),
  image,'node','workers/setup-rotation-runtime.mjs','--config-file','/ops/rotation-policy.json','--allow-local']);
 const events=async()=>restoredRotationEvents(await docker(['logs',name]),instanceId);
 const wait=async predicate=>{
  for(let i=0;i<60;i++){
   const current=await events();if(predicate(current))return current;
   const info=JSON.parse(await docker(['inspect',name]))[0];assert(info.State.Running,'RECOVERY_ROTATION_NOT_RUNNING');
   await new Promise(r=>setTimeout(r,500));
  }
  assert.fail('RECOVERY_ROTATION_CYCLE_TIMEOUT');
 };
 const first=await wait(es=>es.some(e=>e.action==='rotated')&&es.filter(e=>e.action==='idle').length>=2);
 const rotations=first.filter(e=>e.action==='rotated');assert.equal(rotations.length,1);
 const rotated=rotations[0],publishedCredential=await credential();
 assert.equal(JSON.parse(Buffer.from(publishedCredential.token.split('.')[1],'base64url')).jti,rotated.credentialId);
 const journal=await operator(rotationJournalProgram(instanceId));assert.equal(journal.commandId,rotated.commandId);
 await ready();
 const before=JSON.parse(await docker(['inspect',name]))[0];
 await docker(['restart',name]);
 const after=await wait(es=>es.filter(e=>e.action==='idle').length>=first.filter(e=>e.action==='idle').length+2);
 assert.equal(after.filter(e=>e.action==='rotated').length,1,'RECOVERY_ROTATION_UNNECESSARY_REISSUE');
 assert.deepEqual(await operator(rotationJournalProgram(instanceId)),journal);
 assert.deepEqual(await credential(),publishedCredential);await ready();
 const info=JSON.parse(await docker(['inspect',name]))[0];assert.notEqual(info.State.StartedAt,before.State.StartedAt);
 assert.equal(info.Config.User,'1000:1000');assert(info.HostConfig.ReadonlyRootfs&&info.HostConfig.CapDrop.includes('ALL'));
 assert(info.HostConfig.SecurityOpt.includes('no-new-privileges'));assert.equal(info.HostConfig.RestartPolicy.Name,'unless-stopped');
 assert(!Object.values(info.NetworkSettings.Ports??{}).some(bindings=>bindings?.length));
 assert.deepEqual(info.Mounts.map(m=>[m.Destination,m.RW]).sort(),[['/journal',true],['/ops',false],['/run/roomqc/setup',true]]);
 emit('continuous_rotation_restart_verified',{actualDaemon:true,journalPreserved:true,workerReady:true});
 return {credential:publishedCredential,credentialId:rotated.credentialId,async finish(){
  const current=await events();assert.equal(current.filter(e=>e.action==='rotated').length,1);
  await docker(['stop','--time','55',name],undefined,60000);
  const stopped=JSON.parse(await docker(['inspect',name]))[0];assert.equal(stopped.State.ExitCode,0);
  assert((await events()).some(e=>e.type==='setup_rotation_stopped'));
  assert.deepEqual(await operator(rotationJournalProgram(instanceId)),journal);await ready();
  const result={actualContinuousDaemon:true,initialRotationVerified:true,subsequentIdleCycles:true,
   restarted:true,journalPreserved:true,noUnnecessaryReissue:true,workerReadyAfterRestart:true,
   gracefulStop:true,nonroot:true,operatorInputReadOnly:true,hostPorts:0,productionAdmissionChanged:false};
  emit('restored_continuous_rotation_verified',result);return result;
 }};
}
