// Native worker and native RPCs in separate owned containers, fixture-only keys.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,rename,chmod,chown,stat} from 'node:fs/promises';
import {resourceBudget} from '../resource-budget.mjs';
import {fixtureReleaseApproval,fixtureReleaseTrustRaw} from '../release-test-fixtures.mjs';

export async function setupMountRpcRelay(){
 let unavailable=false;
 const server=http.createServer((req,res)=>{
  if(unavailable){req.socket.destroy();return}
  const upstream=http.request({host:'127.0.0.1',port:8000,path:req.url,method:req.method,headers:req.headers},reply=>{
   res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });upstream.on('error',()=>res.destroy());req.pipe(upstream);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {url:'http://127.0.0.1:'+server.address().port,setUnavailable:value=>{unavailable=value},
  close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))}};
}

export async function runSetupRuntimeMountNativeChecks({input,db,directory,config,context,budget,dsn,names,
 seeded,issue,base,json,run,issuerConfig,installerConfig,until,root,check,relay}){
 assert.equal(input.runtimeMountOnly,true);assert.equal(config.publisher.outputFile,'/run/roomqc/setup/credential.json');
 const output=config.publisher.outputFile,shared='/worker-input',checks=[],timeline=[],owned=[];
 const verify=name=>{check('runtime-mount-'+name);checks.push(name)};
 const writeInput=async(name,value)=>{
  const path=shared+'/'+name;await writeFile(path,value,{flag:'wx',mode:0o600});await chown(path,10001,10001);return path;
 };
 const view=async()=>{
  try{const r=await fetch('http://127.0.0.1:8095/readyz',{signal:AbortSignal.timeout(1000)});return {status:r.status,body:await r.json()}}
  catch{return null}
 };
 const ready=()=>until(async()=>{const v=await view();return v?.status===200?v:null},'mount-ready',35000);
 const unready=(timeout=15000)=>until(async()=>{const v=await view();return v?.status===503&&v.body.lastErrorCode==='SETUP_DEPENDENCY_FAILED'?v:null},'mount-unready',timeout);
 const jobState=async id=>(await directory.query(`SELECT to_jsonb(j) AS job,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY attempt),'[]'::jsonb) FROM roomqc_control.setup_recovery_attempts a WHERE a.job_id=j.id) AS attempts,
  (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM roomqc_control.attempts a WHERE a.workspace_id=j.workspace_id) AS history
  FROM roomqc_control.provisioning_jobs j WHERE id=$1`,[id])).rows[0];
 const seed=async label=>{
  const workspace=randomUUID(),dispatch=randomUUID(),owner=randomUUID(),job=randomUUID();owned.push({workspace,dispatch,job});
  await directory.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status)
   VALUES($1,$2,'Owned mount fixture',$3,$4,$5,'provisioning')`,[workspace,'mount-'+input.run+'-'+label,createHash('sha256').update('mount-fixture:'+workspace).digest('hex'),config.target.cluster.id,owner]);
  await directory.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
   VALUES($1,$2,$3,$4,1,$5)`,[dispatch,workspace,config.target.cluster.id,owner,'2'.repeat(64)]);
  await directory.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id)
   VALUES($1,$2,1,$3)`,[job,workspace,dispatch]);return job;
 };
 const settled=async id=>{
  await until(async()=>{const s=await jobState(id);return s?.job.state==='waiting_owner'?s:null},'mount-job-settled',20000);
  const state=await jobState(id);assert.equal(state.job.attempts,1);assert.equal(state.attempts.length,1);
  assert.equal(state.attempts[0].outcome,'waiting_owner');
  const tombstone=(await db.query('SELECT state FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[owned.find(v=>v.job===id).dispatch])).rows;
  assert.deepEqual(tombstone,[{state:'closed'}]);return state;
 };
 const blocked=async(label,mutate,restore)=>{
  await ready();await mutate();await unready();
  const job=await seed(label),before=await jobState(job),start=Date.now();
  await new Promise(r=>setTimeout(r,900));assert.equal((await view())?.status,503);
  assert.deepEqual(await jobState(job),before);
  timeline.push({phase:label,preBatchBlockedMs:Date.now()-start,attemptsUnchanged:true});verify(label+'-prebatch-keeps-job-attempt-deadline-history');
  await restore();await ready();await settled(job);verify(label+'-restores-without-restart-and-settles-once');
 };
 let current=seeded;
 const issueNext=async()=>{
  const version=Number((await db.query('SELECT version FROM private.setup_recovery_management WHERE singleton')).rows[0].version);
  const command={...issue,...base('issue',version),predecessorId:current.credentialId,ttlSeconds:180};
  const next=await run(issuerConfig,await json('mount-issue-'+randomUUID()+'.json',command));assert.equal(next.exit.code,0);
  current=next.value;return next.value;
 };
 const rpc=async value=>{
  const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),
   headers:{apikey:value.publishableKey,authorization:'Bearer '+value.token,'content-type':'application/json','Content-Profile':'roomqc_setup'},
   body:JSON.stringify({p_workspace_id:randomUUID()})});await r.text();return r.status;
 };
 try{
  const normalized=resourceBudget(budget),database=normalized.databases.find(d=>d.kind==='directory'),consumer=database.consumers.find(c=>c.id==='provisioning-worker');
  const raw={schemaVersion:1,instanceId:'mount-'+input.run,poolMax:1,concurrency:1,intervalMs:200,requestTimeoutMs:1500,
   leaseMs:20000,retryBaseMs:100,shutdownTimeoutMs:5000,
   targets:[{cluster:config.target.cluster,approval:fixtureReleaseApproval(context),credentialFile:output}],
   connectionBudget:{maxConnections:database.maxConnections,otherAllocatedConnections:database.allocatedConnections-consumer.connections,
    instances:1,reservedConnections:database.reservedConnections}};
  await writeInput('setup.json',JSON.stringify(raw));await writeInput('directory.dsn',dsn(names.worker,'roomqc_installer_'+input.run));
  await writeInput('trust.json',JSON.stringify(fixtureReleaseTrustRaw));await writeInput('budget.json',JSON.stringify(budget));
  const privateJournal=root+'/mount-issuer-journal';await writeFile(privateJournal,JSON.stringify({run:input.run,fixture:true}),{flag:'wx',mode:0o600});
  const privatePaths=[config.publisher.signer.keyFile,config.business.dsnFile,privateJournal];
  for(const path of privatePaths)assert.ok((await stat(path)).isFile());
  await writeInput('ready.json',JSON.stringify({run:input.run,privatePaths}));
  const first=await ready();const instance=first.body.instanceId;
  verify('actual-worker-entrypoint-ready-with-restricted-directory-role');
  await settled(await seed('positive'));verify('actual-job-closes-owned-dispatch-without-creating-business-tenant');
  const original=JSON.parse(await readFile(output,'utf8')),before=await stat(output),oldId=current.credentialId;
  await issueNext();const after=await stat(output),rotated=JSON.parse(await readFile(output,'utf8'));
  assert.notEqual(before.ino,after.ino);assert.notEqual(original.token,rotated.token);assert.equal(await rpc(rotated),200);await ready();
  await settled(await seed('rotated'));verify('issuer-rename-live-reloads-in-same-worker-container');
  const retirement=(await db.query('SELECT retire_after FROM private.setup_recovery_credentials WHERE id=$1',[oldId])).rows[0];
  // Native expiry uses the DB's own cutoff, independent of a live rotator.
  await until(async()=>{
   const row=(await db.query('SELECT clock_timestamp() AS now,clock_timestamp()>=$1::timestamptz AS passed',[retirement.retire_after])).rows[0];
   if(row.passed){timeline.push({phase:'predecessor-cutoff',databaseObservedAt:row.now.toISOString()});return true}return false;
  },'mount-retirement',20000);
  assert.equal(await rpc(original),403);assert.equal(await rpc(rotated),200);verify('retired-predecessor-denied-while-live-worker-remains-ready');
  const backup=output+'.owned-backup';
  await blocked('missing',()=>rename(output,backup),()=>rename(backup,output));
  await blocked('unreadable',()=>chmod(output,0),()=>chmod(output,0o600));
  const replace=async value=>{const temp=output+'.fixture-'+randomUUID();await writeFile(temp,value,{mode:0o600,flag:'wx'});await chown(temp,10001,10001);await rename(temp,output)};
  const valid=await readFile(output,'utf8');
  await blocked('malformed',()=>replace('{'),()=>replace(valid));
  await blocked('wrong-cluster',()=>replace(JSON.stringify({...JSON.parse(valid),clusterId:'wrong-cluster'})),()=>replace(valid));
  const wrongIssuer=JSON.parse(valid),parts=wrongIssuer.token.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),iss:'wrong-issuer'})).toString('base64url');wrongIssuer.token=parts.join('.');
  await blocked('wrong-issuer',()=>replace(JSON.stringify(wrongIssuer)),()=>replace(valid));
  await blocked('rpc-unavailable',async()=>relay.setUnavailable(true),async()=>relay.setUnavailable(false));
  // Expiry is not simulated by editing a signed token or using a client clock.
  await ready();const exp=JSON.parse(Buffer.from(JSON.parse(await readFile(output,'utf8')).token.split('.')[1],'base64url')).exp;
  await unready(200000);const expiredJob=await seed('expired'),expiredBefore=await jobState(expiredJob);
  await until(async()=>{
   const row=(await db.query('SELECT clock_timestamp() AS now,clock_timestamp()>=to_timestamp($1) AS passed',[exp])).rows[0];
   if(row.passed){timeline.push({phase:'head-expiry',databaseObservedAt:row.now.toISOString(),expiryEpoch:exp});return true}return false;
  },'mount-expiry',200000);
  assert.equal(await rpc(JSON.parse(await readFile(output,'utf8'))),403);assert.deepEqual(await jobState(expiredJob),expiredBefore);
  verify('expired-head-native-rpc-denied-and-prebatch-does-not-consume-job');
  await issueNext();await ready();await settled(expiredJob);verify('manual-expiry-recovery-reloads-without-restart');
  const revoke={...base('revoke',current.stateVersion),credentialId:current.credentialId};
  await blocked('revoked',async()=>{
   const v=Number((await db.query('SELECT version FROM private.setup_recovery_management WHERE singleton')).rows[0].version);revoke.expectedVersion=v;
   const r=await run(installerConfig,await json('mount-revoke.json',revoke));assert.equal(r.exit.code,0);
   assert.equal(await rpc(JSON.parse(await readFile(output,'utf8'))),403);
  },issueNext);
  assert.equal((await ready()).body.instanceId,instance);verify('worker-instance-stays-identical-across-all-faults-and-recovery');
  return {verified:true,checks,timeline,actualEntrypoint:true,actualPostgres:true,actualRest:true,
   outputReloadVerified:true,preBatchNoClaimsVerified:true,fixtureClosedDispatchOnly:true,
   ownerSignupE2EVerified:false,crossDatabaseActorRevocationVerified:false,productAccepted:false};
 }finally{
  relay.setUnavailable(false);
  await writeFile(shared+'/stop','stop',{mode:0o600});
  await until(async()=>!(await view())&&(await directory.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.worker])).rowCount===0,'mount-worker-stop-before-drop',30000);
  for(const v of owned)await db.query('DELETE FROM private.workspace_setup_dispatches WHERE dispatch_id=$1',[v.dispatch]);
 }
}
