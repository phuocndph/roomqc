// Owned native probes. Barriers pause original methods, never fabricate SQL,
// alter claims/DB time, widen role permissions or replace installer outcomes.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename,chmod,chown,mkdir,readdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';

export async function runSummaryMountedReadChecks(c){
 const {input,db,config,root,run,json,issuerConfig,installerConfig,base,issue,until,check,cluster}=c;
 const output=config.publisher.outputFile,view=()=>fetch('http://127.0.0.1:8096/observation',{signal:AbortSignal.timeout(1500)}).then(r=>r.json()).catch(()=>null);
 const ready=id=>until(async()=>{const v=await view();return v?.ready===true&&(!id||v.credentialId===id)?v:null},'summary-mounted-ready',20000);
 const closed=()=>until(async()=>{const v=await view();return v?.ready===false&&v.errorCode?.startsWith('TENANT_SUMMARY_')?v:null},'summary-mounted-unavailable',15000);
 const inputFile='/summary-input/ready.json';
 const workspace={id:randomUUID(),tenant_id:randomUUID(),owner_id:randomUUID(),hotel_id:randomUUID(),cluster_id:cluster.id,api_url:cluster.url,routing_version:1};
 await writeFile(inputFile,JSON.stringify({run:input.run,cluster,workspace,outputFile:output,
  privatePaths:[config.business.dsnFile,config.directory.dsnFile,config.publisher.signer.keyFile,join(root,'journal')]}),{flag:'wx',mode:0o600});
 await chown(inputFile,1000,1000);
 const first=await ready(),instanceId=first.instanceId;
 check('separate nonroot reader uses scoped output directory without issuer private inputs');
 const waitOverlap=()=>until(async()=>(await db.query(`SELECT NOT EXISTS(SELECT 1 FROM private.tenant_summary_credentials c
  JOIN private.tenant_summary_management m ON c.id<>m.head_credential_id WHERE c.revoked_at IS NULL AND c.not_before<=clock_timestamp()
   AND c.expires_at>clock_timestamp() AND (c.retire_after IS NULL OR c.retire_after>clock_timestamp())) AS ended`)).rows[0].ended,'summary-mounted-overlap',20000);
 const issueNext=async()=>{
  await waitOverlap();const v=(await db.query('SELECT version,head_credential_id FROM private.tenant_summary_management WHERE singleton')).rows[0];
  const next={...issue,...base('issue',Number(v.version)),predecessorId:v.head_credential_id,ttlSeconds:600};
  const result=await run(issuerConfig,await json('mounted-issue-'+randomUUID()+'.json',next));assert.equal(result.exit.code,0);
  return result.value;
 };
 const before=await lstat(output),next=await issueNext(),after=await lstat(output),second=await ready(next.credentialId);
 assert.notEqual(before.ino,after.ino);assert.equal(second.instanceId,instanceId);assert.notEqual(first.credentialId,second.credentialId);
 check('same separate reader reloads new credential after producer atomic rename');
 const replace=async text=>{const temp=output+'.fixture-'+randomUUID();await writeFile(temp,text,{mode:0o600,flag:'wx'});
  await chown(temp,1000,1000);await rename(temp,output)};
 const good=await readFile(output,'utf8');
 const blocked=async(label,change,restore)=>{
  await ready();await change();const unavailable=await closed();assert.equal(unavailable.instanceId,instanceId);
  assert.equal(unavailable.credentialId,undefined);await restore();assert.equal((await ready(next.credentialId)).instanceId,instanceId);
  check('mounted reader hides previous credential on '+label+' and recovers without restart');
 };
 await blocked('missing file',()=>rename(output,output+'.backup'),()=>rename(output+'.backup',output));
 await blocked('unreadable file',()=>chmod(output,0),()=>chmod(output,0o600));
 await blocked('malformed file',()=>replace('{'),()=>replace(good));
 await blocked('wrong cluster',()=>replace(JSON.stringify({...JSON.parse(good),clusterId:'other-cluster'})),()=>replace(good));
 const current=(await db.query('SELECT version,head_credential_id FROM private.tenant_summary_management WHERE singleton')).rows[0];
 const revoke={...base('revoke',Number(current.version)),credentialId:current.head_credential_id};
 assert.equal((await run(installerConfig,await json('mounted-revoke.json',revoke))).exit.code,0);
 const unavailable=await closed();assert.equal(unavailable.errorCode,'TENANT_SUMMARY_CREDENTIAL_DENIED');assert.equal(unavailable.credentialId,undefined);
 const recovered=await issueNext();assert.equal((await ready(recovered.credentialId)).instanceId,instanceId);
 check('mounted reader observes database revoke and manual recovery without restart');
 return {instanceId};
}

export async function runSummaryContentionChecks(c){
 const {db,maintenance,directory,config,rotationRaw,peerRaw,root,names,wire,child,run,json,text,until,state,check}=c;
 const journal=join(root,'contention-journal');await mkdir(journal,{mode:0o700});
 const issuer=await json('contention-issuer.json',rotationRaw),peerIssuer=await json('contention-peer.json',peerRaw);
 const policy=async(instanceId,installerConfigFile)=>({instanceId,file:await json(instanceId+'.json',{
  version:1,instanceId,installerConfigFile,journalDirectory:journal,ttlSeconds:3600,overlapSeconds:10,rotateBeforeSeconds:3540,intervalMs:1000})});
 const shared=await policy('summary-shared',issuer),separateA=await policy('summary-separate-a',issuer),separateB=await policy('summary-separate-b',peerIssuer);
 const pending=p=>join(journal,p.instanceId,'pending');
 const record=async path=>({command:await readFile(join(path,'command.json'),'utf8'),context:await readFile(join(path,'context.json'),'utf8')});
 const effect=async key=>(await db.query(`SELECT (SELECT count(*)::int FROM private.tenant_summary_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.tenant_summary_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.tenant_summary_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const instrument=async(label,phases)=>{
  const prefix=join(root,'summary-contention-'+label);
  const file=await text('summary-contention-'+label+'-preload.mjs',`import {writeFile} from 'node:fs/promises';
import {SummaryRotationJournal} from '/repository/server/control/tenant-summary-rotation-journal.mjs';
import {SummaryCredentialRotator} from '/repository/server/control/tenant-summary-rotation.mjs';
const phases=${JSON.stringify(phases)},prefix=${JSON.stringify(prefix)},seen=new Set();
async function stop(phase,command){if(!phases.includes(phase)||seen.has(phase))return;seen.add(phase);
 await writeFile(prefix+'-'+phase+'.json',JSON.stringify({phase,pid:process.pid,uid:process.getuid(),commandId:command?.key??null}),{flag:'wx',mode:0o600});
 process.kill(process.pid,'SIGSTOP');}
for(const method of ['prepare','archive']){const original=SummaryRotationJournal.prototype[method];
 SummaryRotationJournal.prototype[method]=async function(...args){const previous=this.onPhase;
  this.onPhase=async phase=>{await previous(phase);await stop(phase,method==='prepare'?args[1]:args[0].command)};
  try{return await original.apply(this,args)}finally{this.onPhase=previous}};}
const dispatch=SummaryCredentialRotator.prototype.dispatch;
SummaryCredentialRotator.prototype.dispatch=async function(p){await stop('dispatch',p.command);return dispatch.call(this,p)};`);
  return {prefix,file};
 };
 const launch=(p,i)=>child(p.file,null,{rotation:true,...(i?{instrument:i.file}:{})});
 const awaitPhase=async(h,i,phase)=>{
  let value;await until(async()=>{try{value=JSON.parse(await readFile(i.prefix+'-'+phase+'.json','utf8'));return value.pid===h.process.pid}catch{
   if(h.exit)throw new Error('SUMMARY_CONTENTION_EXIT_BEFORE_'+phase);return false}},'summary-contention-'+phase);
  await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'summary-contention-stopped',5000);
  assert.equal(value.uid,1000);return value;
 };
 const resume=h=>assert.equal(h.process.kill('SIGCONT'),true);
 const finish=async(h,action)=>{await until(()=>h.exit,'summary-contention-terminal',65000);const result=await h.finish();
  if(action){assert.equal(result.exit.code,0);assert.equal(result.value.action,action)}return result};
 const pair=async(a,b,label)=>{
  const before=await state(),ia=await instrument(label+'-a',['command_synced','pending_synced','dispatch']),ib=await instrument(label+'-b',['command_synced','pending_synced','dispatch']);
  const ha=await launch(a,ia);await awaitPhase(ha,ia,'command_synced');
  const hb=await launch(b,ib);await awaitPhase(hb,ib,'command_synced');assert.equal(await state(),before);
  resume(ha);await awaitPhase(ha,ia,'pending_synced');resume(hb);await awaitPhase(hb,ib,'pending_synced');
  resume(ha);const ca=await awaitPhase(ha,ia,'dispatch');resume(hb);const cb=await awaitPhase(hb,ib,'dispatch');
  assert.equal(await state(),before);return {ha,hb,ca,cb,before};
 };
 const due=label=>until(async()=>{
  const r=(await db.query(`SELECT c.expires_at-clock_timestamp()<=interval '3539 seconds' AS due,
   c.expires_at>clock_timestamp()+interval '120 seconds' AS valid,
   NOT EXISTS(SELECT 1 FROM private.tenant_summary_credentials p WHERE p.id<>c.id AND p.revoked_at IS NULL
    AND p.expires_at>clock_timestamp() AND (p.retire_after IS NULL OR p.retire_after>clock_timestamp())) AS overlap_ended
   FROM private.tenant_summary_management m JOIN private.tenant_summary_credentials c ON c.id=m.head_credential_id`)).rows[0];
  return r.due&&r.valid&&r.overlap_ended;
 },'summary-contention-due-'+label,85000);
 const clean=async()=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',
   [[names.issuer,names.observer,names.otherIssuer,names.otherObserver]])).rowCount===0,'summary-contention-session-clean',15000);
  assert.equal((await maintenance.query('SELECT pg_try_advisory_lock(727013) AS locked')).rows[0].locked,true);
  assert.equal((await maintenance.query('SELECT pg_advisory_unlock(727013) AS unlocked')).rows[0].unlocked,true);
 };
 // Shared active spool: both prepare before either command is published.
 await due('shared');const sharedPair=await pair(shared,shared,'shared');assert.equal(sharedPair.ca.commandId,sharedPair.cb.commandId);
 const keys=(await readdir(pending(shared))).sort();assert.equal(keys.length,2);
 const winner=sharedPair.ca.commandId,unused=keys.find(k=>k!==winner),winningRecord=await record(join(pending(shared),winner)),unusedRecord=await record(join(pending(shared),unused));
 const held=wire.arm('rotate','hold');resume(sharedPair.ha);await until(()=>held.observed,'summary-shared-commit');assert(held.idle);
 sharedPair.ha.process.kill('SIGSTOP');await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+sharedPair.ha.process.pid+'/status','utf8')),'summary-shared-paused',5000);
 const committed=await state();assert.deepEqual(Object.assign({},await effect(winner),{receipt:null}),{commands:1,audits:1,receipt:null});
 resume(sharedPair.hb);const refused=await finish(sharedPair.hb);assert.equal(refused.exit.code,1);
 assert.equal(refused.value.code,'SUMMARY_INSTALLER_CONNECTION_LIMIT');assert.equal(refused.value.sameCommandRequired,true);
 assert.equal(refused.value.commandId,winner);assert.equal(await state(),committed);
 sharedPair.ha.process.kill('SIGKILL');await sharedPair.ha.finish();held.release?.();await clean();
 check('two active shared-journal daemons keep unknown command and enforce per-login connection limit');
 const ia=await instrument('archive-a',['before_archive']),ib=await instrument('archive-b',['before_archive']);
 const a=await launch(shared,ia);await awaitPhase(a,ia,'before_archive');const bytes=await readFile(config.publisher.outputFile,'utf8');
 const b=await launch(shared,ib);await awaitPhase(b,ib,'before_archive');assert.equal(await readFile(config.publisher.outputFile,'utf8'),bytes);
 resume(a);resume(b);await Promise.all([finish(a,'rotated'),finish(b,'rotated')]);assert.equal(await state(),committed);
 assert.deepEqual(await record(join(journal,shared.instanceId,'history','published',winner)),winningRecord);
 const superseded=await run(shared.file,null,{rotation:true});assert.equal(superseded.exit.code,0);assert.equal(superseded.value.action,'superseded');assert.equal(superseded.value.commandId,unused);
 assert.deepEqual(await effect(unused),{commands:0,audits:0,receipt:null});
 assert.deepEqual(await record(join(journal,shared.instanceId,'history','superseded',unused)),unusedRecord);
 assert.equal((await run(shared.file,null,{rotation:true})).value.action,'idle');assert.equal(await state(),committed);
 assert.equal(await readFile(config.publisher.outputFile,'utf8'),bytes);
 check('shared-journal concurrent replays archive one immutable result and supersede unused key without effects');
 // Distinct callers/journals: native mutex denial, then exact CAS disposition.
 await due('separate');const separate=await pair(separateA,separateB,'separate');assert.notEqual(separate.ca.commandId,separate.cb.commandId);
 const loserRecord=await record(join(pending(separateB),separate.cb.commandId)),hold=wire.arm('rotate','hold');
 resume(separate.ha);await until(()=>hold.observed,'summary-separate-commit');assert(hold.idle);
 separate.ha.process.kill('SIGSTOP');await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+separate.ha.process.pid+'/status','utf8')),'summary-separate-paused',5000);
 const after=await state();resume(separate.hb);const loser=await finish(separate.hb);assert.equal(loser.exit.code,1);
 assert.equal(loser.value.code,'SUMMARY_INSTALLER_BUSY');assert.equal(loser.value.sameCommandRequired,true);
 assert.equal(await state(),after);assert.deepEqual(await record(join(pending(separateB),separate.cb.commandId)),loserRecord);
 separate.ha.process.kill('SIGKILL');await separate.ha.finish();hold.release?.();await clean();
 assert.equal((await run(separateA.file,null,{rotation:true})).value.action,'rotated');
 const loserReplay=await run(separateB.file,null,{rotation:true});assert.equal(loserReplay.exit.code,0);assert.equal(loserReplay.value.action,'superseded');
 assert.equal(loserReplay.value.code,'SUMMARY_INSTALLER_VERSION_CONFLICT');
 assert.deepEqual(await effect(separate.cb.commandId),{commands:0,audits:0,receipt:null});
 assert.deepEqual(await record(join(journal,separateB.instanceId,'history','superseded',separate.cb.commandId)),loserRecord);
 assert.equal(await state(),after);await clean();
 check('distinct daemon callers keep pending on actual mutex denial and resolve CAS loser without duplicate credential');
 const live=(await db.query(`SELECT count(*)::int AS n FROM private.tenant_summary_credentials WHERE revoked_at IS NULL
  AND not_before<=clock_timestamp() AND expires_at>clock_timestamp() AND (retire_after IS NULL OR retire_after>clock_timestamp())`)).rows[0].n;
 assert(live>=1&&live<=2);
 assert.deepEqual(await readdir(pending(separateA)),[]);assert.deepEqual(await readdir(pending(separateB)),[]);
 check('two-process rotation leaves bounded live credentials, empty pending spools and released sessions/mutex');
}
