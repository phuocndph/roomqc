// IF14: actual unprivileged CLI processes, valid private inputs, native RPC and
// real inode/owner/mode faults. Root fixture preparation is not product proof.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile,lstat,rename,symlink,link,unlink,chmod,chown,rm} from 'node:fs/promises';
import {join,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');

export async function runInstallerNonrootPermissions(c){
 const {db,maintenance,directory,config,json,run,until,businessState,names,check,root,cliUid,cliGid}=c;
 assert.equal(cliUid,10001);assert.equal(cliGid,10001);assert.equal(process.getuid(),0);
 const observations=[],cleanups=[],directoryPath=join(root,'nonroot-runtime');
 await mkdir(directoryPath,{mode:0o700});await chown(directoryPath,cliUid,cliGid);
 const output=join(directoryPath,'credential.json'),raw={...config,publisher:{...config.publisher,outputFile:output}};
 const configFile=await json('nonroot-config.json',raw);
 const key=(await db.query(`SELECT c.key FROM private.setup_recovery_commands c JOIN private.setup_recovery_management m
  ON m.singleton AND c.result->>'credentialId'=m.head_credential_id::text WHERE c.request->>'operation'='issue'`)).rows[0].key;
 const commandFile=await json('nonroot-publish.json',{version:1,operation:'publish',key});
 const receipt=(await db.query('SELECT result FROM private.setup_recovery_commands WHERE key=$1',[key])).rows[0].result;
 const canary=join(root,'nonroot-outside-output-canary');await writeFile(canary,'owned-private-canary',{flag:'wx',mode:0o600});await chown(canary,cliUid,cliGid);
 const snap=async path=>{const s=await lstat(path);assert.equal(s.isSymbolicLink(),false);return {dev:s.dev,ino:s.ino,uid:s.uid,gid:s.gid,mode:s.mode&0o777,nlink:s.nlink,size:s.size,sha256:sha(await readFile(path))}};
 const canaryBefore=await snap(canary);
 const effects=async()=>{const row=(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits,
  (SELECT count(*)::int FROM private.setup_recovery_credentials WHERE id=$2) AS credentials`,[key,receipt.credentialId])).rows[0];
  assert.deepEqual(row,{commands:1,audits:1,credentials:1});return row;
 };
 const cleanup=async label=>{
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=ANY($1::text[])',[[names.issuer,names.observer]])).rowCount===0,'nonroot-sessions-'+label,15000);
  for(const [pool,id]of [[maintenance,727012],[directory,727001]]){const client=await pool.connect();try{
   assert.equal((await client.query('SELECT pg_try_advisory_lock($1) AS locked',[id])).rows[0].locked,true);
   assert.equal((await client.query('SELECT pg_advisory_unlock($1) AS unlocked',[id])).rows[0].unlocked,true);
  }finally{client.release()}}
  cleanups.push({label,sessionsEnded:true,businessMutexFree:true,directoryExclusiveFree:true});
 };
 const positive=async()=>{const r=await run(configFile,commandFile);assert.equal(r.exit.code,0);assert.equal(r.exit.signal,null);
  assert.equal(r.value.nativeRpcVerified,true);assert.equal(r.value.credentialId,receipt.credentialId);assert.equal(r.value.expiresAt,receipt.exp*1000);
  const value=JSON.parse(await readFile(output,'utf8')),claims=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
  assert.equal(claims.jti,receipt.credentialId);assert.equal(claims.iat,receipt.iat);assert.equal(claims.exp,receipt.exp);
  const state=await snap(output);assert.equal(state.uid,cliUid);assert.equal(state.gid,cliGid);assert.equal(state.mode,0o600);assert.equal(state.nlink,1);return state;
 };
 const round=async(label,mutate)=>{
  const beforeFile=await positive(),beforeDb=await businessState();await cleanup(label+'-positive');
  let fault;
  try{
   fault=await mutate();const r=await run(fault.configFile??configFile,fault.commandFile??commandFile);
   assert.equal(r.exit.code,1);assert.equal(r.exit.signal,null);assert.equal(r.value.ok,false);
   assert.match(r.value.code,/^(?:SETUP_INSTALLER|SETUP_PUBLICATION)_[A-Z_]+$/);
   if(fault.code)assert.equal(r.value.code,fault.code);
   assert.deepEqual(await businessState(),beforeDb);await effects();await fault.verify();assert.deepEqual(await snap(canary),canaryBefore);
   await cleanup(label+'-denied');
  }finally{await fault?.undo()}
  const afterFile=await positive();assert.equal(afterFile.sha256,beforeFile.sha256);assert.deepEqual(await businessState(),beforeDb);await effects();
  assert.deepEqual(await snap(canary),canaryBefore);await fault.after?.();await cleanup(label+'-recovered');
  observations.push({label,actualCli:true,uid:cliUid,gid:cliGid,positiveBeforeFault:true,denied:true,
   zeroDatabaseEffects:true,sameKeyReceipt:true,sameCredentialIatExp:true,nativeRpcRecovery:true,outsideCanaryUnchanged:true});
  check('nonroot-'+label+'-denied-with-zero-effects-and-same-key-native-recovery');
 };
 const fileFault=async(path,kind)=>{
  const suffix='.fixture-'+randomUUID();let undo;
  if(kind==='symlink'){const backup=path+suffix;await rename(path,backup);await symlink(backup,path);
   const before=await snap(backup);return {verify:async()=>{assert.equal((await lstat(path)).isSymbolicLink(),true);assert.deepEqual(await snap(backup),before)},
    undo:async()=>{await unlink(path);await rename(backup,path)}};
  }
  if(kind==='hardlink'){const alias=path+suffix;await link(path,alias);undo=()=>unlink(alias)}
  else if(kind==='mode'){await chmod(path,0o644);undo=()=>chmod(path,0o600)}
  else if(kind==='owner'){await chown(path,10002,10002);undo=()=>chown(path,cliUid,cliGid)}
  else assert.fail('UNKNOWN_NONROOT_FIXTURE');
  const before=await snap(path);if(kind==='hardlink')assert.equal(before.nlink,2);
  if(kind==='owner'){assert.equal(before.uid,10002);assert.equal(before.mode,0o600)}
  return {verify:async()=>assert.deepEqual(await snap(path),before),undo};
 };
 const inputs=[['config',configFile],['command',commandFile],['business-dsn',config.business.dsnFile],['directory-dsn',config.directory.dsnFile],
  ['budget',config.resourceBudgetFile],['trust',config.releaseTrustFile],['signer',config.publisher.signer.keyFile],['publishable-key',config.publisher.publishableKeyFile]];
 for(const [name,path]of inputs)for(const kind of ['symlink','hardlink','mode','owner'])
  await round('input-'+name+'-'+kind,()=>fileFault(path,kind));
 await round('input-inside-runtime-subtree',async()=>{
  const inside=join(directoryPath,'private-signer');await writeFile(inside,await readFile(config.publisher.signer.keyFile),{flag:'wx',mode:0o600});await chown(inside,cliUid,cliGid);
  const bad=await json('nonroot-input-inside-output.json',{...raw,publisher:{...raw.publisher,signer:{...raw.publisher.signer,keyFile:inside}}});
  const before=await snap(inside);return {configFile:bad,code:'SETUP_INSTALLER_OUTPUT_ISOLATION',verify:async()=>assert.deepEqual(await snap(inside),before),undo:()=>unlink(inside)};
 });
 for(const target of ['output','intent','stage'])for(const kind of ['symlink','hardlink','mode','owner']){
  await round('publication-'+target+'-'+kind,async()=>{
   const path=target==='output'?output:join(directoryPath,'.credential.json.'+key+'.'+target);
   let shadow;
   if(target==='stage'){shadow=join(root,'nonroot-stage-canary-'+randomUUID());await rename(output,shadow);
    await writeFile(path,await readFile(shadow),{flag:'wx',mode:0o600});await chown(path,cliUid,cliGid)}
   const beforeShadow=shadow?await snap(shadow):null,f=await fileFault(path,kind);
   return {...f,verify:async()=>{await f.verify();if(shadow)assert.deepEqual(await snap(shadow),beforeShadow)},
    after:async()=>{if(shadow){assert.deepEqual(await snap(shadow),beforeShadow);await unlink(shadow);await assert.rejects(()=>lstat(path),{code:'ENOENT'})}}};
  });
 }
 await round('runtime-directory-symlink',async()=>{
  const alias=join(root,'nonroot-runtime-link');await symlink(directoryPath,alias);
  const bad=await json('nonroot-runtime-link.json',{...raw,publisher:{...raw.publisher,outputFile:join(alias,'credential.json')}}),before=await snap(output);
  return {configFile:bad,verify:async()=>{assert.equal((await lstat(alias)).isSymbolicLink(),true);assert.deepEqual(await snap(output),before)},undo:()=>unlink(alias)};
 });
 await round('runtime-directory-foreign-owner',async()=>{
  await chown(directoryPath,10002,10002);const before=await snap(output);
  return {verify:async()=>{assert.equal((await lstat(directoryPath)).uid,10002);assert.deepEqual(await snap(output),before)},undo:()=>chown(directoryPath,cliUid,cliGid)};
 });
 await round('unrelated-existing-credential',async()=>{
  const old=await readFile(config.publisher.outputFile),value=JSON.parse(old),claims=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url'));
  assert.notEqual(claims.jti,receipt.credentialId);assert.notEqual(claims.jti,receipt.predecessorId);
  const previous=await readFile(output);await writeFile(output,old);const before=await snap(output);
  return {code:'SETUP_PUBLICATION_OUTPUT_CONFLICT',verify:async()=>assert.deepEqual(await snap(output),before),undo:()=>writeFile(output,previous)};
 });
 const untrusted=await mkdtemp('/tmp/roomqc-installer-untrusted-');assert.equal(dirname(untrusted),'/tmp');
 try{
  await chown(untrusted,cliUid,10002);await chmod(untrusted,0o770);
  const otherMarker=join(untrusted,'other-uid-marker');
  const writer=spawn(process.execPath,['--input-type=module','-e',"import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';assert.equal(process.getuid(),10002);assert.equal(process.getgid(),10002);assert.equal(BigInt('0x'+(await readFile('/proc/self/status','utf8')).match(/^CapEff:\\s+([a-f0-9]+)$/m)[1]),0n);await writeFile(process.argv[1],'other-uid-can-write',{flag:'wx',mode:0o600});",otherMarker],
   {uid:10002,gid:10002,env:{PATH:process.env.PATH},stdio:'ignore'});
  const writerExit=await new Promise((resolve,reject)=>{writer.once('error',reject);writer.once('close',(code,signal)=>resolve({code,signal}))});assert.deepEqual(writerExit,{code:0,signal:null});
  const markerBefore=await snap(otherMarker);
  await round('runtime-directory-writable-by-other-uid',async()=>{
   const bad=await json('nonroot-untrusted-runtime.json',{...raw,publisher:{...raw.publisher,outputFile:join(untrusted,'credential.json')}});
   return {configFile:bad,verify:async()=>{assert.deepEqual(await snap(otherMarker),markerBefore);await assert.rejects(()=>lstat(join(untrusted,'credential.json')),{code:'ENOENT'})},undo:async()=>{}};
  });
 }finally{assert.ok(basename(untrusted).startsWith('roomqc-installer-untrusted-'));assert.equal((await lstat(untrusted)).isSymbolicLink(),false);await rm(untrusted,{recursive:true,force:true})}
 assert.equal(observations.length,49);assert.equal(cleanups.length,147);await effects();
 return {verified:true,groups:['IF14'],cases:['FS05','FS06'],observations,cleanups,actualCliProcesses:true,actualPostgres:true,
  actualRest:true,positivePerFault:true,otherUidWriteWitness:true,credentialIdPreserved:true,expiryPreserved:true,
  realInodesOwnersModes:true,noSyntheticFilesystemResults:true,fixturePreparationParentUid:0,productCliUid:cliUid,productCliGid:cliGid,
  realVolumeFaultsVerified:false,runtimeMountReloadVerified:false};
}
