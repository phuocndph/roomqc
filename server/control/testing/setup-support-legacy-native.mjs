// Real Linux CLI child processes -> HTTP -> canonical Auth -> directory.
// Owns only its private /tmp leaf and exact labelled fixture command keys.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,chmod,readFile,rm,realpath,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function runSupportLegacyNativeChecks({db,directory,other,legacy,body,apiOrigin,request,check,barrier,until,
 loseAcceptanceResponse,loseControlResponse,restartSupportApi}){
 const parent=await realpath(tmpdir()),root=await mkdtemp(join(parent,'roomqc-support-native-'));await chmod(root,0o700);
 const cli=fileURLToPath(new URL('../support-cli.mjs',import.meta.url)),path='/api/control/support/reconcile';
 let checks=0;const mark=label=>{checks++;check('legacy-support-'+label)};
 const state=async key=>{
  const action=(await directory.query('SELECT * FROM roomqc_control.support_actions WHERE actor_id=$1 AND command_key=$2',[other.id,key])).rows;
  assert.equal(action.length,1);
  const intent=(await directory.query('SELECT * FROM roomqc_control.support_command_intents WHERE actor_id=$1 AND request_key=$2',[other.id,key])).rows;
  assert.equal(intent.length,1);
  return {action:action[0],intent:intent[0],rounds:(await directory.query('SELECT * FROM roomqc_control.support_command_attempts WHERE intent_id=$1 ORDER BY generation',[intent[0].id])).rows,
   closures:(await directory.query('SELECT * FROM roomqc_control.support_attempt_closures WHERE intent_id=$1',[intent[0].id])).rows,
   results:(await directory.query('SELECT * FROM roomqc_control.support_intent_results WHERE intent_id=$1',[intent[0].id])).rows,
   consumption:(await directory.query('SELECT * FROM roomqc_control.support_command_acceptances WHERE support_action_id=$1',[action[0].id])).rows,
   auth:(await db.query('SELECT * FROM private.platform_support_acceptances WHERE actor_id=$1 AND request_key=$2 ORDER BY accepted_at',[other.id,key])).rows};
 };
 const fixture=label=>{
  const file=join(root,label+'.json'),input={...body,reason:'Owned native legacy '+label};
  return {file,input,args:['reconcile','--query',input.query,'--workspace-id',input.workspaceId,'--routing-version',String(input.routingVersion),
   '--reason',input.reason,'--intent-file',file]};
 };
 const child=args=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[cli,...args],{env:{...process.env,ROOMQC_CONTROL_URL:apiOrigin,ROOMQC_PUBLIC_URL:'http://localhost:8082',ROOMQC_SUPPORT_ACCESS_TOKEN:other.token},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timer=setTimeout(()=>p.kill('SIGKILL'),60000);
  p.stdout.on('data',b=>{stdout+=b;if(stdout.length>32768)p.kill('SIGKILL')});p.stderr.on('data',b=>{stderr+=b;if(stderr.length>32768)p.kill('SIGKILL')});
  p.on('error',e=>{clearTimeout(timer);reject(e)});p.on('close',(exit,signal)=>{clearTimeout(timer);
   assert.equal(stdout.includes(other.token)||stderr.includes(other.token),false);let data;try{data=JSON.parse(stdout)}catch{}
   resolve({exit,signal,data,error:stderr});
  });
 });
 try{
  const committed=fixture('commit-loss');
  const lost=await loseControlResponse(path,()=>child(committed.args));assert.equal(lost.exit,1);assert.match(lost.error,/intent-file/);
  const firstFile=await readFile(committed.file,'utf8'),intent=JSON.parse(firstFile),first=await state(intent.key);
  assert.equal(firstFile.includes(other.token),false);assert.equal(first.action.outcome,'reconciled');assert.equal(first.results.length,1);assert.equal(first.auth.length,1);
  await restartSupportApi('api-SIGKILL-after-legacy-commit-and-dropped-cli-response');
  const result=await child(['result','--intent-file',committed.file]);assert.equal(result.exit,0);assert.equal(result.data.actionId,first.action.id);
  const replay=await child(committed.args);assert.equal(replay.exit,0);assert.equal(replay.data.actionId,first.action.id);
  assert.deepEqual(await state(intent.key),first);assert.equal(await readFile(committed.file,'utf8'),firstFile);
  mark('linux-cli-postcommit-response-loss-api-sigkill-new-cli-result-and-replay-one-original-action');

  const expired=fixture('expired-auth');
  const orphaned=await loseAcceptanceResponse(()=>child(expired.args));assert.equal(orphaned.value.exit,1);
  const expiredFile=await readFile(expired.file,'utf8'),expiredIntent=JSON.parse(expiredFile),orphan=await state(expiredIntent.key);
  assert.equal(orphan.action.outcome,'failed');assert.equal(orphan.results.length,0);assert.equal(orphan.auth.length,1);assert.equal(orphan.rounds.length,1);
  await until(async()=>(await db.query('SELECT clock_timestamp()>=$1::timestamptz AS expired',[orphan.auth[0].expires_at])).rows[0].expired,'legacy-actual-auth-expiry',7000);
  barrier('legacy-original-canonical-acceptance-expiry-observed');
  await restartSupportApi('api-SIGKILL-before-legacy-expired-intent-recovery');
  const recovery=await child(expired.args);assert.equal(recovery.exit,0);assert.equal(recovery.data.actionId,orphan.action.id);
  const recovered=await state(expiredIntent.key);assert.equal(recovered.rounds.length,2);assert.equal(recovered.closures.length,1);assert.equal(recovered.results.length,1);
  assert.equal(recovered.auth.length,2);assert.equal(recovered.consumption.length,1);assert.equal(recovered.action.outcome,'reconciled');
  assert.deepEqual(recovered.auth.find(a=>a.id===orphan.auth[0].id),orphan.auth[0]);assert.equal(await readFile(expired.file,'utf8'),expiredFile);
  mark('linux-cli-auth-response-loss-real-expiry-sigkill-same-action-one-linked-recovery-generation');

  const denied=fixture('revoked-recovery'),deniedLoss=await loseAcceptanceResponse(()=>child(denied.args));assert.equal(deniedLoss.value.exit,1);
  const deniedIntent=JSON.parse(await readFile(denied.file,'utf8')),beforeDenied=await state(deniedIntent.key);
  await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='super_admin'",[other.id]);
  try{
   const response=await child(denied.args);assert.equal(response.exit,1);
   assert.ok([401,403].includes((await request('/api/control/support/reconcile-result?workspaceId='+legacy.workspace.id,{token:other.token,key:deniedIntent.key})).status));
   assert.deepEqual(await state(deniedIntent.key),beforeDenied);
  }finally{await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[other.id])}
  mark('canonical-role-revoke-denies-cli-recovery-and-result-without-another-action-or-generation');
  return {verified:true,checks,actualLinuxCliProcesses:true,actualAuth:true,actualHttp:true,actualCanonicalExpiry:true,
   actualApiSigkills:2,originalKeyAndFileUnchanged:true,oneActionAcrossRecovery:true,
   limitations:['One API process at a time; independent concurrent API processes and populated upgrade remain open.',
    'Directory runtime uses its real API LOGIN; operator CLI fixture runs with the owned container UID, not a production UID/ACL certification.',
    'Not a complete signup E2E, worker race, staging, restore or R11/BG02 acceptance.']};
 }finally{
  const actual=await realpath(root);assert.equal(dirname(actual),parent);assert.ok(basename(actual).startsWith('roomqc-support-native-'));
  assert.equal((await lstat(root)).isSymbolicLink(),false);await rm(actual,{recursive:true,force:true});
 }
}
