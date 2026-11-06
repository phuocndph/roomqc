// Actual installer CLI SIGSTOP -> /proc witness -> SIGKILL at real fs fences.
// This root-owned tmpfs fixture proves IF12 only; nonroot/volume faults remain.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,lstat,statfs,chown} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {credentialCanonical} from '../setup-credential-signing.mjs';
import {installerFilesystemBarrierPreload} from './setup-installer-fs-preload.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runInstallerFilesystemKills(c){
 const {db,maintenance,directory,config,issue,base,json,text,child,run,until,businessState,names,check,root,cliUid=process.getuid(),cliGid=process.getgid()}=c;
 const observations=[],kills=[],cleanups=[];
 const canary=join(root,'filesystem-outside-output-canary');await writeFile(canary,'owned-outside-output-marker',{flag:'wx',mode:0o600});
 if(cliUid!==process.getuid())await chown(canary,cliUid,cliGid);
 const fileSnapshot=async path=>{const info=await lstat(path);return {sha256:sha(await readFile(path)),dev:info.dev,ino:info.ino,
  mode:info.mode&0o777,nlink:info.nlink,uid:info.uid,gid:info.gid,size:info.size}};
 const canaryBefore=await fileSnapshot(canary);
 const absent=async path=>assert.rejects(()=>lstat(path),{code:'ENOENT'});
 const outputConfig=async label=>{
  const directoryPath=join(root,'filesystem-'+label);await mkdir(directoryPath,{mode:0o700});
  const raw={...config,publisher:{...config.publisher,outputFile:join(directoryPath,'credential.json')}};
  return {raw,path:await json('filesystem-'+label+'-config.json',raw),directoryPath};
 };
 const effects=async key=>{
  const receipt=(await db.query('SELECT result FROM private.setup_recovery_commands WHERE key=$1',[key])).rows[0]?.result;
  assert.ok(receipt?.credentialId);
  const counts=(await db.query(`SELECT
   (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
   (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
   (SELECT count(*)::int FROM private.setup_recovery_credentials WHERE id=$2) AS credentials`,[key,receipt.credentialId])).rows[0];
  assert.deepEqual(counts,{commands:1,audits:1,credentials:1});return receipt;
 };
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,
   'filesystem-'+label+'-sessions-ended',15000);
  const b=await maintenance.connect(),d=await directory.connect();
  try{
   assert.equal((await b.query('SELECT pg_try_advisory_lock(727012) AS locked')).rows[0].locked,true);
   assert.equal((await b.query('SELECT pg_advisory_unlock(727012) AS unlocked')).rows[0].unlocked,true);
   assert.equal((await d.query('SELECT pg_try_advisory_lock(727001) AS locked')).rows[0].locked,true);
   assert.equal((await d.query('SELECT pg_advisory_unlock(727001) AS unlocked')).rows[0].unlocked,true);
  }finally{b.release();d.release()}
  cleanups.push({label,sessionsEnded:true,businessMutexFree:true,directoryExclusiveFree:true});
 };
 const claims=async(file,receipt)=>{
  const value=JSON.parse(await readFile(file,'utf8')),payload=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
  assert.equal(payload.jti,receipt.credentialId);assert.equal(payload.iat,receipt.iat);assert.equal(payload.exp,receipt.exp);
  return fileSnapshot(file);
 };
 for(const [index,phase]of ['intent_synced','stage_synced','before_rename','after_rename'].entries()){
  // A positive actual CLI/native REST publication immediately precedes each
  // fault. It uses a separate output and current immutable receipt.
  const priorKey=(await db.query(`SELECT c.key FROM private.setup_recovery_commands c JOIN private.setup_recovery_management m
   ON m.singleton AND c.result->>'credentialId'=m.head_credential_id::text WHERE c.request->>'operation'='issue'`)).rows[0].key;
  const positive=await outputConfig('positive-'+index),publishFile=await json('filesystem-positive-'+index+'.json',{version:1,operation:'publish',key:priorKey});
  const beforePositive=await businessState(),positiveRun=await run(positive.path,publishFile);
  assert.equal(positiveRun.exit.code,0);assert.equal(positiveRun.value.nativeRpcVerified,true);assert.deepEqual(await businessState(),beforePositive);
  await cleanup('positive-'+phase);check('filesystem-'+phase+'-positive-actual-cli-and-native-rpc-before-fault');
  await until(async()=>(await db.query(`SELECT NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials c
   JOIN private.setup_recovery_management m ON m.singleton WHERE c.id<>m.head_credential_id AND c.revoked_at IS NULL
    AND c.expires_at>clock_timestamp() AND (c.retire_after IS NULL OR c.retire_after>clock_timestamp())) AS ready`)).rows[0].ready,
   'filesystem-'+phase+'-overlap-ended',15000);
  const head=(await db.query('SELECT version,head_credential_id FROM private.setup_recovery_management WHERE singleton')).rows[0];
  // The nonroot matrix replays this immutable receipt through 147 real CLI
  // runs. Use a policy-valid fixture TTL, not renewed expiry during recovery.
  // The dedicated expiry/deadline tests keep their original short TTLs.
  const command={...issue,...base('issue',Number(head.version)),predecessorId:head.head_credential_id,ttlSeconds:cliUid===10001?1800:300};
  const commandFile=await json('filesystem-'+phase+'-issue.json',command),target=await outputConfig(phase),output=target.raw.publisher.outputFile;
  const preload=await text('filesystem-'+phase+'-preload.mjs',installerFilesystemBarrierPreload({outputFile:output,phase}));
  const before=await businessState(),h=child(target.path,commandFile,{preload});let barrier;
  await until(()=>{
   for(const line of h.output.split('\n'))try{const value=JSON.parse(line);
    if(value.event==='installer_cli_file_barrier'&&value.phase===phase)barrier=value;
   }catch{}
   if(h.exit&&!barrier)throw new Error('INSTALLER_FILESYSTEM_CLI_EXITED_BEFORE_BARRIER');return barrier;
  },'filesystem-'+phase+'-actual-builtin-barrier',30000);
  await until(async()=>/^State:\s+T/m.test(await readFile('/proc/'+h.process.pid+'/status','utf8')),'filesystem-'+phase+'-proc-stopped',5000);
  assert.equal(barrier.actualBuiltinCalls,true);assert.equal(barrier.uid,cliUid);assert.equal(barrier.gid,cliGid);
  const expected={intentSync:1,directorySync:1,stageSync:phase==='intent_synced'?0:1,rename:phase==='after_rename'?1:0};
  assert.deepEqual(barrier.observed,expected);
  const receipt=await effects(command.key),committed=await businessState();
  assert.equal(committed.credentials.length,before.credentials.length+1);assert.equal(committed.management[0].version,Number(head.version)+1);
  assert.equal(receipt.predecessorId,head.head_credential_id);assert.equal(receipt.commandId,command.key);
  const intentPath=join(target.directoryPath,'.credential.json.'+command.key+'.intent'),stagePath=join(target.directoryPath,'.credential.json.'+command.key+'.stage');
  const intent=JSON.parse(await readFile(intentPath,'utf8')),intentState=await fileSnapshot(intentPath);
  assert.equal(intent.commandId,command.key);assert.equal(intent.receiptSha256,sha(credentialCanonical(receipt)));
  assert.equal(intent.outputName,'credential.json');assert.equal(intentState.nlink,1);assert.equal(intentState.mode,0o600);
  let stageState=null,outputState=null;
  if(phase==='intent_synced'){await absent(stagePath);await absent(output)}
  else if(phase==='after_rename'){await absent(stagePath);outputState=await claims(output,receipt)}
  else{stageState=await claims(stagePath,receipt);await absent(output)}
  for(const state of [stageState,outputState].filter(Boolean)){assert.equal(state.mode,0o600);assert.equal(state.nlink,1)}
  assert.deepEqual(await fileSnapshot(canary),canaryBefore);
  assert.ok(!h.output.split('\n').some(line=>{try{return JSON.parse(line).ok===true}catch{return false}}));
  check('filesystem-'+phase+'-observes-real-syscalls-stopped-cli-and-exact-db-file-layout');
  assert.equal(h.process.kill('SIGKILL'),true);const exit=await h.done;assert.equal(exit.code,null);assert.equal(exit.signal,'SIGKILL');
  await cleanup('killed-'+phase);assert.deepEqual(await businessState(),committed);
  assert.deepEqual(await fileSnapshot(intentPath),intentState);assert.deepEqual(await fileSnapshot(canary),canaryBefore);
  if(stageState)assert.deepEqual(await fileSnapshot(stagePath),stageState);
  if(outputState)assert.deepEqual(await fileSnapshot(output),outputState);else await absent(output);
  kills.push({phase,signal:'SIGKILL',observedBarrier:true,observedProcStopped:true});
  check('filesystem-'+phase+'-actual-sigkill-keeps-committed-receipt-and-releases-both-mutexes');
  const recovery=await run(target.path,commandFile);assert.equal(recovery.exit.code,0);assert.equal(recovery.value.nativeRpcVerified,true);
  assert.equal(recovery.value.credentialId,receipt.credentialId);assert.equal(recovery.value.expiresAt,receipt.exp*1000);
  assert.deepEqual(await businessState(),committed);assert.deepEqual(await effects(command.key),receipt);
  const final=await claims(output,receipt);assert.equal(final.mode,0o600);assert.equal(final.nlink,1);await absent(stagePath);
  if(outputState)assert.deepEqual(final,outputState);
  await cleanup('recovery-'+phase);check('filesystem-'+phase+'-same-issue-key-recovers-original-credential-expiry-and-native-rpc');
  const replay=await run(target.path,commandFile);assert.equal(replay.exit.code,0);assert.equal(replay.value.nativeRpcVerified,true);
  assert.deepEqual(await fileSnapshot(output),final);assert.deepEqual(await businessState(),committed);assert.deepEqual(await fileSnapshot(canary),canaryBefore);
  await cleanup('replay-'+phase);check('filesystem-'+phase+'-replay-preserves-exact-output-inode-bytes-and-outside-canary');
  observations.push({case:'FS0'+(index+1),phase,actualCli:true,actualBuiltinCalls:true,observedSyscalls:expected,
   observedProcStopped:true,signal:'SIGKILL',singleCommandAuditCredential:true,intentPresent:true,stagePresent:!!stageState,outputPresent:!!outputState,
   noFalseSuccess:true,sameIssueKeyRecovery:true,sameCredentialIatExp:true,nativeRpcVerified:true,exactReplay:true,outsideCanaryUnchanged:true});
 }
 const filesystem=await statfs(root);
 return {verified:true,groups:['IF12'],actualCliProcesses:true,actualBuiltinSyscalls:true,noSyntheticSyscallResults:true,
  preloadOnlyInPrivateHarness:true,positivePerFault:true,kills,observations,cleanups,
  fixture:{uid:process.getuid(),gid:process.getgid(),filesystemType:filesystem.type,blockSize:filesystem.bsize,blocks:filesystem.blocks},
  nonrootPermissionsVerified:false,realVolumeFaultsVerified:false,runtimeReadOnlyMountReloadVerified:false};
}
