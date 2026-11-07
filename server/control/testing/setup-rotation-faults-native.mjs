// Actual nonroot daemon and owned PostgreSQL fixture; barriers only observe.
import assert from 'node:assert/strict';
import {readFile,mkdir,readdir,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export async function runSetupRotationFaultsNativeChecks({config,json,text,child,until,businessState,check,root,db,names,seeded}){
 const checks=[],timeline=[];
 const journal=join(root,'rotation-faults-journal');await mkdir(journal,{mode:0o700});
 const issuerFile=await json('rotation-faults-issuer.json',{...config,consumerId:'setup-credential-rotation',replicas:2});
 const policy={version:1,instanceId:'rotation-faults',installerConfigFile:issuerFile,journalDirectory:journal,
  ttlSeconds:180,overlapSeconds:10,rotateBeforeSeconds:120,intervalMs:1000};
 const policyFile=await json('rotation-faults-policy.json',policy);
 const events=h=>h.output.split('\n').slice(0,-1).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
 const finish=async h=>{await until(()=>h.exit,'rotation-fault-process-exit',60000);assert.equal(h.identityError,undefined);return {exit:h.exit,rows:events(h)}};
 const verify=name=>{checks.push(name);check('rotation-fault-'+name)};
 const pendingRoot=join(journal,policy.instanceId,'pending');
 const readPending=async()=>{
  const ids=await readdir(pendingRoot);assert.equal(ids.length,1);
  return {key:ids[0],command:JSON.parse(await readFile(join(pendingRoot,ids[0],'command.json'),'utf8')),
   context:await readFile(join(pendingRoot,ids[0],'context.json'),'utf8')};
 };
 const effect=async key=>(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT result FROM private.setup_recovery_commands WHERE key=$1) AS receipt`,[key])).rows[0];
 const barrier=async(phase,{method='initialize',at='before',file=policyFile,once=false,expectedCode=0}={})=>{
  const marker=join(root,phase+'-marker.json'),release=join(root,phase+'-release');
  const wait=`await writeFile(${JSON.stringify(marker)},JSON.stringify({phase:${JSON.stringify(phase)},pid:process.pid}),{flag:'wx',mode:0o600});
   while(true){try{await access(${JSON.stringify(release)});break}catch{await delay(20)}}`;
  const intercept=method==='config'
   ?`const original=fs.promises.open;fs.promises.open=async function(...args){
     if(!held&&args[0]===${JSON.stringify(file)}){held=true;${wait}}return original.apply(this,args)};syncBuiltinESMExports();`
   :`const original=SetupRotationJournal.prototype[${JSON.stringify(method)}];
    SetupRotationJournal.prototype[${JSON.stringify(method)}]=async function(...args){
     if(held)return original.apply(this,args);held=true;
     ${at==='after'?'const result=await original.apply(this,args);':''}
     ${wait}
     ${at==='after'?'return result;':'return original.apply(this,args);'}
    };`;
  const preload=await text(phase+'-preload.mjs',`import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {SetupRotationJournal} from '/repository/server/control/setup-rotation-journal.mjs';
import {writeFile,access} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';let held=false;
${intercept}`);
  const before=await businessState(),h=child(file,null,{rotation:true,preload,once});
  await until(async()=>{try{return JSON.parse(await readFile(marker,'utf8')).pid===h.process.pid}catch{return false}},phase+'-barrier');
  const sentAt=Date.now();assert.equal(h.process.kill('SIGTERM'),true);
  await until(()=>h.exit||events(h).some(e=>e.type==='setup_rotation_stopping'),phase+'-signal-observed');
  const releaseFile=await text(phase+'-release','release\n');await chmod(releaseFile,0o644);
  const stopped=await finish(h);assert.deepEqual(await businessState(),before);
  const row={phase,exit:stopped.exit,elapsedMs:Date.now()-sentAt,
   stoppingObserved:stopped.rows.some(e=>e.type==='setup_rotation_stopping'),cycles:stopped.rows.filter(e=>e.type==='setup_rotation_cycle').length};
  timeline.push(row);console.error(JSON.stringify({event:'rotation_startup_signal_observation',...row}));
  assert.equal(stopped.exit.signal,null,'SIGTERM during startup must be handled before asynchronous initialization');
  assert.equal(stopped.exit.code,expectedCode);assert.ok(stopped.rows.some(e=>e.type==='setup_rotation_stopped'));
  assert.equal(row.stoppingObserved,true);assert.ok(row.elapsedMs<55000);
  assert.ok(stopped.rows.filter(e=>e.type==='setup_rotation_cycle').every(e=>e.action==='stopping'));
  if(expectedCode===1)assert.ok(stopped.rows.some(e=>e.type==='setup_rotation_unavailable'&&e.code==='SETUP_ROTATION_START_FAILED'));
  else assert.equal(stopped.rows.some(e=>e.type==='setup_rotation_unavailable'),false);
  verify(phase+'-no-new-dispatch-or-effects');return stopped;
 };
 await barrier('startup-initialize-sigterm');
 await barrier('startup-config-sigterm',{method:'config'});
 const invalidFile=await text('rotation-invalid-policy.json','{invalid owned fixture\n');
 await barrier('startup-config-error-and-sigterm',{method:'config',file:invalidFile,expectedCode:1});
 await barrier('cycle-read-pending-sigterm',{method:'readPending'});
 await barrier('durable-prepare-sigterm',{method:'prepare',at:'after'});
 const original=await readPending();assert.equal(original.command.predecessorId,seeded.credentialId);
 assert.equal((await effect(original.key)).commands,0);
 await barrier('pending-replay-once-sigterm',{method:'readPending',at:'after',once:true});
 assert.deepEqual(await readPending(),original);assert.equal((await effect(original.key)).commands,0);
 verify('pending-command-key-body-context-unchanged-through-sigterm');
 // Restart through the actual --once product entrypoint and native installer.
 const resumed=await finish(child(policyFile,null,{rotation:true,once:true}));
 assert.equal(resumed.exit.code,0);assert.equal(resumed.exit.signal,null);
 assert.ok(resumed.rows.some(e=>e.action==='rotated'&&e.commandId===original.key));
 const committed=await effect(original.key);assert.equal(committed.commands,1);assert.equal(committed.audits,1);
 assert.equal(committed.receipt.predecessorId,seeded.credentialId);
 assert.deepEqual(await readdir(pendingRoot),[]);
 const history=join(journal,policy.instanceId,'history','published',original.key);
 assert.deepEqual(JSON.parse(await readFile(join(history,'command.json'),'utf8')),original.command);
 assert.equal(await readFile(join(history,'context.json'),'utf8'),original.context);
 const credential=JSON.parse(await readFile(config.publisher.outputFile,'utf8'));
 const response=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
  headers:{apikey:credential.publishableKey,authorization:'Bearer '+credential.token,'Content-Profile':'roomqc_setup','content-type':'application/json'},
  body:JSON.stringify({p_workspace_id:randomUUID()})});await response.text();assert.equal(response.status,200);
 verify('restart-replays-original-pending-once-and-publishes-native-rpc-credential');
 const state=await businessState(),idle=await finish(child(policyFile,null,{rotation:true,once:true}));
 assert.equal(idle.exit.code,0);assert.ok(idle.rows.some(e=>e.action==='idle'));assert.deepEqual(await businessState(),state);
 assert.deepEqual(await effect(original.key),committed);verify('second-restart-idle-keeps-receipt-and-effects');
 await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.issuer])).rowCount===0,'rotation-fault-sessions-closed');
 verify('native-issuer-sessions-closed-before-fixture-cleanup');
 return {verified:true,checks,timeline,actualDaemonProcesses:true,actualPostgres:true,actualRest:true,
  startupSigtermVerified:true,preDispatchSigtermVerified:true,oncePendingStopVerified:true,startupErrorNotMasked:true,
  fullFaultMatrixVerified:false,publicationArchiveFaultsVerified:false,crossDatabaseActorRevocationVerified:false,productAccepted:false};
}
